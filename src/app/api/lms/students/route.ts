import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { sendStudentCredentialsEmail } from "@/lib/email"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// Makes a free-text search term safe to place inside a PostgREST .or() filter.
//
// This used to backslash-escape % _ , ( ) — but PostgREST does not treat a
// backslash as escaping a comma in an unquoted value. Verified: searching
// "x,email.ilike.*@*" still split into a second condition and returned EVERY
// user. Injected conditions could only reach column names without an
// underscore (the escaped "_" broke e.g. password_hash, by accident), and those
// columns are already shown to the managers who can search, so nothing hidden
// leaked — but the protection was not working. PostgREST's reserved characters
// in a logic tree are , . : ( ) " \ and * is its wildcard; a person's name or
// email never needs them for a substring search, so they are replaced with
// spaces instead of escaped. "." stays so email fragments like "gmail.com" still
// match — without a "," or "(" it cannot start a new condition.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const STUDENT_COLUMNS = "id, name, email, job_title, company, company_id, employee_number, phone, department, language, created_at, lms_companies(id, name, code, status)"

// Resolves the company a student is being linked to. `undefined` = not being
// changed; `null` = individual (no company). Only an ACTIVE company can be
// newly assigned. The free-text `company` field is no longer written here — a
// database trigger keeps it equal to the linked company's name.
async function resolveCompanyId(v: unknown): Promise<{ ok: true; id: string | null | undefined } | { ok: false; error: string }> {
  if (v === undefined) return { ok: true, id: undefined }
  if (v === null || v === "") return { ok: true, id: null }
  if (typeof v !== "string" || !UUID_RE.test(v)) return { ok: false, error: "Invalid company" }
  const { data } = await db.from("lms_companies").select("id, status").eq("id", v).maybeSingle()
  if (!data) return { ok: false, error: "Company not found" }
  if ((data as any).status !== "active") return { ok: false, error: "This company is inactive — reactivate it before adding students" }
  return { ok: true, id: v }
}

const optText = (v: unknown, max: number) =>
  v === undefined ? undefined : (typeof v === "string" ? (v.trim().slice(0, max) || null) : null)

function escapeFilterValue(v: string) {
  return v.replace(/[,:()"\\*%]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100)
}

// GET — list all students (with optional search + pagination)
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const search    = searchParams.get("q") ?? ""
  const page      = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1)
  const limit     = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "50") || 50))
  const offset    = (page - 1) * limit
  const companyId = searchParams.get("company_id")
  const type      = searchParams.get("type")   // "company" | "individual"

  let query = db
    .from("lms_students")
    .select(`id, name, email, job_title, company, company_id, employee_number, phone, department, language, last_login, created_at,
             lms_companies(id, name, code, status)`, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (companyId && UUID_RE.test(companyId)) query = query.eq("company_id", companyId)
  if (type === "company")    query = query.not("company_id", "is", null)
  if (type === "individual") query = query.is("company_id", null)

  if (search) {
    const s = escapeFilterValue(search)
    query = query.or(`name.ilike.%${s}%,email.ilike.%${s}%,company.ilike.%${s}%`)
  }

  const { data, count, error } = await query
  // Generic message: the raw PostgREST error echoes the internal filter string.
  if (error) {
    console.error("[students] list query failed", error)
    return NextResponse.json({ error: "Could not load students" }, { status: 500 })
  }

  return NextResponse.json({ students: data ?? [], total: count ?? 0, page, limit })
}

// POST — create a student
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { name, email, password, job_title, department, language, sendEmail } = body

  if (!name?.trim())  return NextResponse.json({ error: "Name required" },  { status: 400 })
  if (!email?.trim()) return NextResponse.json({ error: "Email required" }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
  if (typeof password !== "string" || password.length < 8)
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })

  // Cost 10 like every other student password — see PATCH below for why a
  // different cost reopens the login timing leak.
  const companyRes = await resolveCompanyId(body.company_id)
  if (!companyRes.ok) return NextResponse.json({ error: companyRes.error }, { status: 400 })

  const password_hash = await bcrypt.hash(password, 10)

  const { data, error } = await db
    .from("lms_students")
    .insert({
      name:       name.trim(),
      email:      email.trim().toLowerCase(),
      password_hash,
      job_title:  job_title?.trim()  || null,
      company_id: companyRes.id ?? null,
      department: department?.trim() || null,
      employee_number: optText(body.employee_number, 50) ?? null,
      phone:           optText(body.phone, 50) ?? null,
      language:   language ?? "en",
    })
    .select(STUDENT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "23505")
      return NextResponse.json({ error: "Email already registered" }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let emailSent = false
  let emailError: string | null = null
  if (sendEmail) {
    try {
      await sendStudentCredentialsEmail({
        studentName:  name.trim(),
        studentEmail: email.trim().toLowerCase(),
        password,
      })
      emailSent = true
    } catch (err: any) {
      emailError = err?.message ?? "Unknown email error"
      console.error("[LMS student email] failed:", emailError)
    }
  }

  return NextResponse.json({ ...data, emailSent, emailError }, { status: 201 })
}

// PATCH — update student
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { id, name, email, password, job_title, department, language } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (name?.trim())       updates.name       = name.trim()
  if (email?.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
    updates.email = email.trim().toLowerCase()
  }
  if (job_title !== undefined) updates.job_title  = job_title?.trim() || null
  const companyRes = await resolveCompanyId(body.company_id)
  if (!companyRes.ok) return NextResponse.json({ error: companyRes.error }, { status: 400 })
  if (companyRes.id !== undefined) updates.company_id = companyRes.id
  const empNo = optText(body.employee_number, 50), phone = optText(body.phone, 50)
  if (empNo !== undefined) updates.employee_number = empNo
  if (phone !== undefined) updates.phone = phone
  if (department !== undefined) updates.department = department?.trim() || null
  if (language)           updates.language   = language
  if (password) {
    if (typeof password !== "string" || password.length < 8)
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    // Cost 10, like every other student password. This used 12, and the student
    // login compares unknown emails against a cost-10 dummy hash so response time
    // can't reveal which emails exist — a cost-12 hash on an admin-reset account
    // takes ~270ms against the dummy's ~76ms, reopening exactly that leak.
    updates.password_hash   = await bcrypt.hash(password, 10)
    updates.failed_attempts = 0
    updates.locked_until    = null
  }

  if (!Object.keys(updates).length)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  const { data, error } = await db
    .from("lms_students")
    .update(updates)
    .eq("id", id)
    .select(STUDENT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "23505")
      return NextResponse.json({ error: "Email already in use" }, { status: 409 })
    return NextResponse.json({ error: "Could not update student" }, { status: 500 })
  }

  // A staff password reset is usually because the account may be compromised,
  // yet it left every existing session valid — whoever was signed in stayed
  // signed in for up to 30 days. End them all, as the student's own reset does.
  if (password) {
    await db.from("lms_student_sessions").delete().eq("student_id", id)
  }

  return NextResponse.json(data)
}

// DELETE — remove student
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Deleting a student cascades (ON DELETE CASCADE) to their certificates,
  // exam attempts, package progress, attendance, enrollments, feedback, saved
  // expert reports and more — one click erased a learner's whole record and the
  // evidence behind any certificate they hold, with no check at all. Refuse
  // while any of that exists; an admin who genuinely needs the record gone must
  // first remove it deliberately (e.g. the per-course reset).
  const checks = [
    ["lms_certificates",     "certificate"],
    ["lms_module_attempts",  "exam/assignment attempt"],
    ["lms_package_progress", "course progress record"],
    ["lms_enrollments",      "enrollment"],
    ["lms_attendance",       "attendance record"],
  ] as const
  const results = await Promise.all(checks.map(([table]) =>
    db.from(table).select("*", { count: "exact", head: true }).eq("student_id", id)
  ))
  if (results.some(r => r.error))
    return NextResponse.json({ error: "Could not verify this student is safe to delete" }, { status: 500 })

  const blockers = checks
    .map(([, label], i) => ({ label, n: results[i].count ?? 0 }))
    .filter(b => b.n > 0)
    .map(b => `${b.n} ${b.label}${b.n === 1 ? "" : "s"}`)
  if (blockers.length)
    return NextResponse.json(
      { error: `Cannot delete — this student has ${blockers.join(", ")}. Deleting would erase them permanently.` },
      { status: 409 }
    )

  const { error } = await db.from("lms_students").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
