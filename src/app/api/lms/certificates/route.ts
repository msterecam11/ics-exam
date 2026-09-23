// Certificate Manager — every certificate in the system, admin-side.
//
// The tree the UI draws is Company → Program → Course → participant, so this
// returns flat rows carrying those four names and lets the client group them:
// the whole estate is small enough that paging it would cost more than it saves.

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { selectAll } from "@/lib/lms-report-cache"
import { pageScope, type StaffScope } from "@/lib/staff-access"
import { generateCertificateNumber } from "@/lib/lms-completion"

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function guard() {
  const session = await auth()
  if (!session) return { ok: false as const, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (session.user.role !== "admin")
    return { ok: false as const, res: NextResponse.json({ error: "Admin only" }, { status: 403 }) }
  return { ok: true as const, session }
}

/**
 * Reading is wider than editing: an instructor who may release certificates
 * (IR-9) sees the Manager too, limited to the programs they teach. Everything
 * that changes a certificate beyond releasing it stays with admins.
 */
async function readGuard(): Promise<
  { ok: true; session: any; scope: StaffScope } | { ok: false; res: NextResponse }> {
  const session = await auth()
  if (!session) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const scope = await pageScope()
  if (!scope) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (!scope.isAdmin && scope.permissions?.release_certificates !== true)
    return { ok: false, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  return { ok: true, session, scope }
}

async function record(session: any, certificateId: string, action: string, detail?: Record<string, unknown>) {
  await db.from("lms_certificate_events").insert({
    certificate_id: certificateId, action,
    actor_id: session.user.id, actor_name: session.user.name ?? null,
    detail: detail ?? null,
  })
}

// GET — every certificate, with where it belongs
export async function GET() {
  const g = await readGuard()
  if (!g.ok) return g.res

  const rows = await selectAll<any>((from, to) => db.from("lms_certificates")
    .select(`id, student_id, course_id, enrollment_id, verification_code, provider_ref, type, source_title,
             issuer, provider_id, visible_to_student, pdf_url, expires_at,
             issued_at, released_at, revoked_at, revoked_reason,
             lms_students(id, name, email, company_id),
             lms_courses(id, title),
             lms_service_providers(id, name),
             lms_enrollments(id, program_id, lms_programs(id, name, is_individual, lms_companies(id, name)))`)
    .order("issued_at", { ascending: false }).range(from, to))

  const now = Date.now()
  // An instructor sees only their own programs' certificates.
  const mine = g.scope.isAdmin ? null : new Set(g.scope.programIds)
  const visible = mine ? rows.filter((c: any) => mine.has(c.lms_enrollments?.program_id)) : rows

  return NextResponse.json(visible.map((c: any) => {
    const program = c.lms_enrollments?.lms_programs ?? null
    const company = program?.lms_companies ?? null
    return {
      id: c.id,
      student: { id: c.lms_students?.id ?? c.student_id, name: c.lms_students?.name ?? "Unknown", email: c.lms_students?.email ?? null },
      course: { id: c.lms_courses?.id ?? c.course_id, title: c.lms_courses?.title ?? c.source_title ?? "—" },
      program: program ? { id: program.id, name: program.name, individual: !!program.is_individual } : null,
      company: company ? { id: company.id, name: company.name } : null,
      number: c.verification_code,
      provider_ref: c.provider_ref,
      issuer: c.issuer,
      provider: c.lms_service_providers ? { id: c.lms_service_providers.id, name: c.lms_service_providers.name } : null,
      visible_to_student: c.visible_to_student,
      has_file: !!c.pdf_url,
      issued_at: c.issued_at,
      released_at: c.released_at,
      revoked_at: c.revoked_at,
      revoked_reason: c.revoked_reason,
      expires_at: c.expires_at,
      status: c.revoked_at ? "revoked"
        : c.expires_at && new Date(c.expires_at).getTime() < now ? "expired"
        : c.released_at ? "released" : "held",
    }
  }))
}

// PATCH — edit, release, revoke or restore one certificate
export async function PATCH(req: Request) {
  const g = await readGuard()
  if (!g.ok) return g.res

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const id = typeof body.id === "string" && UUID_RE.test(body.id) ? body.id : null
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: existing } = await db.from("lms_certificates")
    .select("id, verification_code, released_at, revoked_at, lms_enrollments(program_id)")
    .eq("id", id).maybeSingle()
  if (!existing) return NextResponse.json({ error: "Certificate not found" }, { status: 404 })

  const action = String(body.action ?? "edit")

  // IR-9 — an instructor may release, and only in their own programs.
  if (!g.scope.isAdmin) {
    if (action !== "release")
      return NextResponse.json({ error: "Only an admin can change a certificate" }, { status: 403 })
    const programId = (existing as any).lms_enrollments?.program_id
    if (!programId || !g.scope.programIds.includes(programId))
      return NextResponse.json({ error: "That certificate isn't in one of your programs" }, { status: 403 })
  }
  const updates: Record<string, unknown> = {}

  if (action === "release") {
    if ((existing as any).revoked_at) return NextResponse.json({ error: "That certificate is revoked" }, { status: 409 })
    updates.released_at = new Date().toISOString()
    updates.released_by = g.session.user.id
  } else if (action === "revoke") {
    const reason = typeof body.reason === "string" ? body.reason.trim() : ""
    if (!reason) return NextResponse.json({ error: "Give a reason for revoking it" }, { status: 400 })
    updates.revoked_at = new Date().toISOString()
    updates.revoked_reason = reason.slice(0, 1000)
    updates.revoked_by = g.session.user.id
  } else if (action === "restore") {
    updates.revoked_at = null
    updates.revoked_reason = null
    updates.revoked_by = null
  } else {
    // A plain edit — the fields an admin may correct.
    if ("issued_at" in body) updates.issued_at = body.issued_at || null
    if ("expires_at" in body) updates.expires_at = body.expires_at || null
    if ("provider_ref" in body) updates.provider_ref = typeof body.provider_ref === "string" && body.provider_ref.trim() ? body.provider_ref.trim().slice(0, 100) : null
    if ("visible_to_student" in body) updates.visible_to_student = body.visible_to_student === true
    if (!Object.keys(updates).length) return NextResponse.json({ error: "Nothing to change" }, { status: 400 })
  }

  const { data, error } = await db.from("lms_certificates").update(updates).eq("id", id).select("id").single()
  if (error || !data) return NextResponse.json({ error: "Could not save the certificate" }, { status: 500 })

  await record(g.session, id, action, updates)
  await auditLog(g.session, `lms.certificate.${action}`, "lms_certificate", id, (existing as any).verification_code, updates)
  return NextResponse.json({ ok: true })
}

// POST — issue one by hand: training done before the LMS, a program-level
// certificate, or a partner's that arrived on paper.
export async function POST(req: Request) {
  const g = await guard()
  if (!g.ok) return g.res

  const body = await req.json().catch(() => ({})) as Record<string, any>
  const studentId = typeof body.student_id === "string" && UUID_RE.test(body.student_id) ? body.student_id : null
  if (!studentId) return NextResponse.json({ error: "Choose who it is for" }, { status: 400 })

  const { data: student } = await db.from("lms_students").select("id, name").eq("id", studentId).maybeSingle()
  if (!student) return NextResponse.json({ error: "That student no longer exists" }, { status: 404 })

  const kind = body.kind === "program" || body.kind === "external" ? body.kind : "course"
  const issuer = body.issuer === "provider" ? "provider" : "ics"
  const providerId = issuer === "provider" && typeof body.provider_id === "string" && UUID_RE.test(body.provider_id)
    ? body.provider_id : null
  if (issuer === "provider" && !providerId)
    return NextResponse.json({ error: "Choose which provider issued it" }, { status: 400 })

  const row: Record<string, unknown> = {
    student_id: studentId,
    type: kind === "course" ? "course" : kind,
    issuer,
    provider_id: providerId,
    provider_ref: typeof body.provider_ref === "string" && body.provider_ref.trim() ? body.provider_ref.trim().slice(0, 100) : null,
    visible_to_student: body.visible_to_student !== false,
    issued_at: body.issued_at || new Date().toISOString(),
    expires_at: body.expires_at || null,
    released_at: body.release === false ? null : new Date().toISOString(),
    released_by: body.release === false ? null : g.session.user.id,
  }

  if (kind === "course") {
    // A course certificate belongs to a run, so it needs the enrolment.
    const enrollmentId = typeof body.enrollment_id === "string" && UUID_RE.test(body.enrollment_id) ? body.enrollment_id : null
    if (!enrollmentId) return NextResponse.json({ error: "Choose which course run it is for" }, { status: 400 })
    const { data: enr } = await db.from("lms_enrollments").select("id, student_id, course_id").eq("id", enrollmentId).maybeSingle()
    if (!enr || (enr as any).student_id !== studentId)
      return NextResponse.json({ error: "That course run isn't theirs" }, { status: 400 })
    row.enrollment_id = enrollmentId
    row.course_id = (enr as any).course_id
  } else if (kind === "program") {
    const programId = typeof body.program_id === "string" && UUID_RE.test(body.program_id) ? body.program_id : null
    if (!programId) return NextResponse.json({ error: "Choose the program" }, { status: 400 })
    const { data: program } = await db.from("lms_programs").select("id, name").eq("id", programId).maybeSingle()
    if (!program) return NextResponse.json({ error: "That program no longer exists" }, { status: 404 })
    row.source_id = programId
    row.source_title = (program as any).name
  } else {
    const title = typeof body.title === "string" ? body.title.trim() : ""
    if (!title) return NextResponse.json({ error: "Give the certificate a title" }, { status: 400 })
    row.source_title = title.slice(0, 300)
  }

  // Retry on the (astronomically unlikely) number collision, as issuing does.
  for (let i = 0; i < 5; i++) {
    const verification_code = generateCertificateNumber()
    const { data, error } = await db.from("lms_certificates").insert({ ...row, verification_code }).select("id").single()
    if (!error && data) {
      const id = (data as any).id
      await record(g.session, id, "issued by hand", { kind, issuer, student: (student as any).name })
      await auditLog(g.session, "lms.certificate.manual", "lms_certificate", id, verification_code, { kind, issuer })
      return NextResponse.json({ id, verification_code }, { status: 201 })
    }
    if (!error?.message?.includes("unique") && !error?.message?.includes("duplicate")) {
      if (error?.message?.includes("lms_certificates_course_per_enrollment_issuer"))
        return NextResponse.json({ error: "That run already has a certificate from this issuer" }, { status: 409 })
      return NextResponse.json({ error: "Could not issue the certificate" }, { status: 500 })
    }
    if (error?.message?.includes("lms_certificates_course_per_enrollment_issuer"))
      return NextResponse.json({ error: "That run already has a certificate from this issuer" }, { status: 409 })
  }
  return NextResponse.json({ error: "Could not issue the certificate" }, { status: 500 })
}
