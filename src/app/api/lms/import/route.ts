import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { randomString } from "@/lib/utils"
import { sendEmail, buildEnrollmentEmail, sendStudentCredentialsEmail } from "@/lib/email"
import { syncMemberEnrollments } from "@/lib/lms-programs"
import { isMgr } from "@/lib/staff-roles"

// POST /api/lms/import
// multipart/form-data:
//   file (CSV), enroll_course_id?, send_emails?
//   mode = "preview"  → no writes; returns how each company value in the file
//                       matches an existing company
//   company_id?       → assign EVERY row to this company (company column ignored)
//   company_actions?  → JSON { "<company value, lower-cased>": "create" | "none" | "skip" }
//                       for values that match no company. A value with no
//                       action is an error row — a typo never silently creates
//                       a company (or silently drops the link).
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: "Form data required" }, { status: 400 })

  const file          = formData.get("file") as File | null
  const enrollCourseId = (formData.get("enroll_course_id") as string) || null
  const sendEmails     = (formData.get("send_emails") as string) !== "false"  // default true
  const preview        = formData.get("mode") === "preview"
  const fixedCompanyId = (formData.get("company_id") as string) || null
  // Optional: add every newly created student to a program (and track).
  const programId      = (formData.get("program_id") as string) || null
  const programTrackId = (formData.get("track_id") as string) || null
  let companyActions: Record<string, "create" | "none" | "skip"> = {}
  try { companyActions = JSON.parse((formData.get("company_actions") as string) || "{}") ?? {} } catch {
    return NextResponse.json({ error: "Invalid company_actions" }, { status: 400 })
  }

  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 })

  let program: { id: string; name: string; status: string; structure: string } | null = null
  if (programId) {
    if (session.user.role !== "admin") return NextResponse.json({ error: "Only an admin can import into a program" }, { status: 403 })
    if (enrollCourseId) return NextResponse.json({ error: "Choose a program or a course to enroll in, not both" }, { status: 400 })
    const { data: prog } = await db.from("lms_programs").select("id, name, status, structure").eq("id", programId).maybeSingle()
    if (!prog) return NextResponse.json({ error: "Program not found" }, { status: 400 })
    program = prog as any
    if (program!.status === "completed" || program!.status === "archived")
      return NextResponse.json({ error: `Students can't be added to a ${program!.status} program` }, { status: 400 })
    if (program!.structure === "tracks") {
      const { data: track } = programTrackId
        ? await db.from("lms_program_tracks").select("id").eq("id", programTrackId).eq("program_id", programId).maybeSingle()
        : { data: null }
      if (!track) return NextResponse.json({ error: "Choose a track in that program" }, { status: 400 })
    }
  }
  if (!file.name.toLowerCase().endsWith(".csv"))
    return NextResponse.json({ error: "File must be a .csv" }, { status: 400 })

  const text = await file.text()
  const rows = parseCsv(text)
  if (rows.length < 2)
    return NextResponse.json({ error: "CSV must have a header row and at least one data row" }, { status: 400 })

  // Parse header — support flexible column order
  // Required columns: name, email
  // Optional: password, job_title, company (code or name), department, language, employee_number, phone
  const header = rows[0].map(h => h.trim().toLowerCase())
  const nameIdx    = header.indexOf("name")
  const emailIdx   = header.indexOf("email")
  const passIdx    = header.indexOf("password")
  const titleIdx   = header.indexOf("job_title")
  const companyIdx = header.indexOf("company")
  const deptIdx    = header.indexOf("department")
  const langIdx    = header.indexOf("language")
  const empIdx     = header.indexOf("employee_number")
  const phoneIdx   = header.indexOf("phone")

  if (nameIdx  === -1) return NextResponse.json({ error: "CSV missing 'name' column" },  { status: 400 })
  if (emailIdx === -1) return NextResponse.json({ error: "CSV missing 'email' column" }, { status: 400 })

  // ── Companies ────────────────────────────────────────────────
  const { data: allCompanies, error: coErr } = await db.from("lms_companies").select("id, name, code, status")
  if (coErr) return NextResponse.json({ error: "Could not load companies" }, { status: 500 })
  type Co = { id: string; name: string; code: string; status: string }
  const companies = (allCompanies ?? []) as Co[]
  const byKey = new Map<string, Co>()
  for (const c of companies) { byKey.set(c.code.toLowerCase(), c); byKey.set(c.name.trim().toLowerCase(), c) }

  let fixedCompany: Co | null = null
  if (fixedCompanyId) {
    fixedCompany = companies.find(c => c.id === fixedCompanyId) ?? null
    if (!fixedCompany) return NextResponse.json({ error: "Company not found" }, { status: 400 })
    if (fixedCompany.status !== "active") return NextResponse.json({ error: "This company is inactive" }, { status: 400 })
  }

  const companyValues = new Map<string, { value: string; rows: number }>()
  if (!fixedCompany && companyIdx !== -1) {
    for (let i = 1; i < rows.length; i++) {
      const v = rows[i][companyIdx]?.trim()
      if (!v) continue
      const k = v.toLowerCase()
      const cur = companyValues.get(k) ?? { value: v, rows: 0 }
      cur.rows++
      companyValues.set(k, cur)
    }
  }

  if (preview) {
    return NextResponse.json({
      rows: rows.length - 1,
      fixed_company: fixedCompany,
      companies: [...companyValues.entries()].map(([k, v]) => {
        const m = byKey.get(k)
        return { key: k, value: v.value, rows: v.rows, match: m ? { id: m.id, name: m.name, code: m.code, status: m.status } : null }
      }),
    })
  }

  // Resolve every company value to an id (or null = individual, or "skip").
  const resolved = new Map<string, string | null | "skip" | { error: string }>()
  for (const [k, v] of companyValues) {
    const m = byKey.get(k)
    if (m) { resolved.set(k, m.status === "active" ? m.id : { error: `Company "${m.name}" is inactive` }); continue }
    const action = companyActions[k]
    if (action === "none") resolved.set(k, null)
    else if (action === "skip") resolved.set(k, "skip")
    else if (action === "create") {
      if (session.user.role !== "admin") { resolved.set(k, { error: "Only an admin can create companies" }); continue }
      const created = await createCompanyFromImport(v.value, companies, session.user.id)
      if ("error" in created) resolved.set(k, created)
      else { companies.push(created); byKey.set(created.code.toLowerCase(), created); byKey.set(k, created); resolved.set(k, created.id) }
    } else {
      resolved.set(k, { error: `Unknown company "${v.value}"` })
    }
  }

  const results: { row: number; email: string; status: "created" | "exists" | "error" | "skipped"; error?: string }[] = []
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

    let companyId: string | null = fixedCompany?.id ?? null
    if (!fixedCompany && companyIdx !== -1) {
      const v = cols[companyIdx]?.trim()
      if (v) {
        const r = resolved.get(v.toLowerCase())
        if (r === "skip") { results.push({ row: i + 1, email, status: "skipped", error: `Skipped: company "${v}"` }); continue }
        if (r && typeof r === "object") { results.push({ row: i + 1, email, status: "error", error: r.error }); continue }
        companyId = (r as string | null | undefined) ?? null
      }
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
        // The free-text company is set from company_id by a database trigger.
        company_id: companyId,
        department: cols[deptIdx]?.trim()     || null,
        employee_number: cols[empIdx]?.trim().slice(0, 50) || null,
        phone:           cols[phoneIdx]?.trim().slice(0, 50) || null,
        language:   (cols[langIdx]?.trim() as any) || "en",
      })
      .select("id")
      .single()

    if (error) {
      if (error.code === "23505") {
        results.push({ row: i + 1, email, status: "exists" })
      } else {
        results.push({ row: i + 1, email, status: "error", error: "Could not create this student" })
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
    // Newly created students have no enrollments yet, so a plain insert.
    await db.from("lms_enrollments").insert(rows)
  }

  // Add the new students to the chosen program (enrollments per its structure).
  const programIssues: string[] = []
  if (program && created.length) {
    for (const c of created) {
      const { data: member, error: mErr } = await db.from("lms_program_members")
        .insert({ program_id: program.id, student_id: c.id, track_id: program.structure === "tracks" ? programTrackId : null, added_by: session.user.id })
        .select("id").single()
      if (mErr || !member) { programIssues.push(`${c.email}: could not add to the program`); continue }
      const r = await syncMemberEnrollments((member as any).id, session.user.id)
      programIssues.push(...r.issues.map(i => `${c.email}: ${i.reason}`))
    }
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
      if (program && program.status === "active") {
        const { data: enr } = await db.from("lms_enrollments").select("course_id, lms_courses(title)").eq("student_id", c.id).eq("program_id", program.id).eq("status", "active")
        for (const e of (enr ?? []) as any[]) {
          const { subject, html } = buildEnrollmentEmail({ studentName: c.name, courseTitle: e.lms_courses?.title ?? "your course", courseId: e.course_id })
          sendEmail({ type: "enrollment", to: c.email, subject, html, studentId: c.id, courseId: e.course_id }).catch(() => {})
        }
      }
      if (enrollCourseId && courseTitle) {
        const { subject, html } = buildEnrollmentEmail({ studentName: c.name, courseTitle, courseId: enrollCourseId })
        sendEmail({ type: "enrollment", to: c.email, subject, html, studentId: c.id, courseId: enrollCourseId }).catch(() => {})
      }
    }
  }

  const total   = results.length
  const success = results.filter(r => r.status === "created").length
  const errors  = results.filter(r => r.status === "error").length
  const skipped = results.filter(r => r.status === "exists" || r.status === "skipped").length

  // Log the import
  await db.from("lms_import_logs").insert({
    imported_by: session.user.id,
    filename:    file.name,
    total,
    success,
    errors,
    results,
  })

  return NextResponse.json({ total, success, errors, skipped, results, program_issues: programIssues })
}

// Creates a company chosen as "create" in the import preview. The code is
// derived from the name (e.g. "Riyadh Air Company" → "RIYADH-AIR-COMPANY", cut
// to 20) and made unique with a numeric suffix.
async function createCompanyFromImport(
  name: string, existing: { code: string }[], userId: string,
): Promise<{ id: string; name: string; code: string; status: string } | { error: string }> {
  const base = (name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "COMPANY").slice(0, 20)
  const taken = new Set(existing.map(c => c.code))
  let code = base
  for (let n = 2; taken.has(code); n++) code = `${base.slice(0, 20 - String(n).length - 1)}-${n}`

  const { data, error } = await db
    .from("lms_companies")
    .insert({ name: name.slice(0, 200), code, created_by: userId })
    .select("id, name, code, status")
    .single()
  if (error) return { error: `Could not create company "${name}"` }
  return data as any
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
