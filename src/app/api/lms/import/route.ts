import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// POST /api/lms/import
// multipart/form-data: file (CSV), enroll_course_id? (optional)
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: "Form data required" }, { status: 400 })

  const file          = formData.get("file") as File | null
  const enrollCourseId = (formData.get("enroll_course_id") as string) || null

  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 })
  if (!file.name.endsWith(".csv"))
    return NextResponse.json({ error: "File must be a .csv" }, { status: 400 })

  const text = await file.text()
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2)
    return NextResponse.json({ error: "CSV must have a header row and at least one data row" }, { status: 400 })

  // Parse header — support flexible column order
  // Required columns: name, email
  // Optional: password, job_title, company, department, language
  const header = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g, ""))
  const nameIdx    = header.indexOf("name")
  const emailIdx   = header.indexOf("email")
  const passIdx    = header.indexOf("password")
  const titleIdx   = header.indexOf("job_title")
  const companyIdx = header.indexOf("company")
  const deptIdx    = header.indexOf("department")
  const langIdx    = header.indexOf("language")

  if (nameIdx  === -1) return NextResponse.json({ error: "CSV missing 'name' column" },  { status: 400 })
  if (emailIdx === -1) return NextResponse.json({ error: "CSV missing 'email' column" }, { status: 400 })

  const results: { row: number; email: string; status: "created" | "exists" | "error"; error?: string }[] = []
  const createdIds: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    const name    = cols[nameIdx]?.trim()
    const email   = cols[emailIdx]?.trim().toLowerCase()

    if (!name || !email) {
      results.push({ row: i + 1, email: email ?? "", status: "error", error: "Missing name or email" })
      continue
    }

    // Generate password if not in CSV
    const rawPass = cols[passIdx]?.trim() || generatePassword()
    const password_hash = await bcrypt.hash(rawPass, 10)

    const { data, error } = await db
      .from("lms_students")
      .insert({
        name,
        email,
        password_hash,
        job_title:  cols[titleIdx]?.trim()   || null,
        company:    cols[companyIdx]?.trim()  || null,
        department: cols[deptIdx]?.trim()     || null,
        language:   (cols[langIdx]?.trim() as any) || "en",
      })
      .select("id")
      .single()

    if (error) {
      if (error.code === "23505") {
        results.push({ row: i + 1, email, status: "exists" })
      } else {
        results.push({ row: i + 1, email, status: "error", error: error.message })
      }
      continue
    }

    results.push({ row: i + 1, email, status: "created" })
    createdIds.push(data.id)
  }

  // Enroll newly created students if course_id provided
  if (enrollCourseId && createdIds.length) {
    const rows = createdIds.map(sid => ({
      student_id:  sid,
      course_id:   enrollCourseId,
      enrolled_by: session.user.id,
      status:      "active",
    }))
    await db
      .from("lms_enrollments")
      .upsert(rows, { onConflict: "student_id,course_id", ignoreDuplicates: true })
  }

  const total   = results.length
  const success = results.filter(r => r.status === "created").length
  const errors  = results.filter(r => r.status === "error").length
  const skipped = results.filter(r => r.status === "exists").length

  // Log the import
  await db.from("lms_import_logs").insert({
    imported_by: session.user.id,
    filename:    file.name,
    total,
    success,
    errors,
    results,
  })

  return NextResponse.json({ total, success, errors, skipped, results })
}

// ── Helpers ───────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ""))
      current = ""
    } else {
      current += ch
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ""))
  return result
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}
