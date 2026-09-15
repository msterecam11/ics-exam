import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { randomString } from "@/lib/utils"
import { sendEmail, buildEnrollmentEmail, sendStudentCredentialsEmail } from "@/lib/email"

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
  const sendEmails     = (formData.get("send_emails") as string) !== "false"  // default true

  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 })
  if (!file.name.endsWith(".csv"))
    return NextResponse.json({ error: "File must be a .csv" }, { status: 400 })

  const text = await file.text()
  const rows = parseCsv(text)
  if (rows.length < 2)
    return NextResponse.json({ error: "CSV must have a header row and at least one data row" }, { status: 400 })

  // Parse header — support flexible column order
  // Required columns: name, email
  // Optional: password, job_title, company, department, language
  const header = rows[0].map(h => h.trim().toLowerCase())
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
  // Track the raw (unhashed) password per created student so we can email
  // them their login. Never persisted — used only for the credentials email.
  const created: { id: string; name: string; email: string; rawPass: string }[] = []

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i]
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
    created.push({ id: data.id, name, email, rawPass })
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

  // Emails — mirror the individual flow: every new student gets their login
  // credentials; if enrolled into a course, they also get the enrollment
  // email. Fire-and-forget (same pattern as the enroll endpoint).
  if (sendEmails && created.length) {
    let courseTitle = ""
    if (enrollCourseId) {
      const { data: c } = await db.from("lms_courses").select("title").eq("id", enrollCourseId).single()
      courseTitle = c?.title ?? ""
    }
    for (const c of created) {
      sendStudentCredentialsEmail({ studentName: c.name, studentEmail: c.email, password: c.rawPass }).catch(() => {})
      if (enrollCourseId && courseTitle) {
        const { subject, html } = buildEnrollmentEmail({ studentName: c.name, courseTitle, courseId: enrollCourseId })
        sendEmail({ type: "enrollment", to: c.email, subject, html, studentId: c.id, courseId: enrollCourseId }).catch(() => {})
      }
    }
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
/**
 * Parse a whole CSV into rows of fields.
 *
 * This replaces a split(/\r?\n/) followed by per-line parsing. Splitting on
 * newlines FIRST is wrong: a quoted field may legally contain a line break
 * (spreadsheet exports produce these routinely for addresses, job titles and
 * notes), and splitting first tears such a record in half, silently importing
 * two corrupt rows instead of one good one. Newlines can only be decided while
 * tracking whether we are inside quotes, so it has to be a single pass over the
 * whole text.
 *
 * Also handles "" as an escaped quote. The previous parser toggled its quote
 * flag on every " and appended none of them, so "O""Brien" came out as OBrien —
 * a silent character loss with no error.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }  // escaped quote
        else inQuotes = false
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"')       { inQuotes = true }
    else if (ch === ",")  { row.push(field.trim()); field = "" }
    else if (ch === "\n") { row.push(field.trim()); rows.push(row); row = []; field = "" }
    else if (ch !== "\r") { field += ch }
  }

  // Trailing field/row (file not ending in a newline)
  row.push(field.trim())
  rows.push(row)

  // Drop blank rows — a trailing newline, or blank lines between records
  return rows.filter(r => r.some(f => f !== ""))
}

// Was Math.random. A bulk import generates every password in one unbroken
// sequence from the same PRNG stream, so anyone holding one issued password
// holds a window into the stream that produced all the others. Same alphabet
// and length as before — only the source of randomness changed.
function generatePassword(): string {
  return randomString(10, "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789")
}
