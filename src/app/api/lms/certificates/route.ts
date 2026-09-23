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

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function guard() {
  const session = await auth()
  if (!session) return { ok: false as const, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (session.user.role !== "admin")
    return { ok: false as const, res: NextResponse.json({ error: "Admin only" }, { status: 403 }) }
  return { ok: true as const, session }
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
  const g = await guard()
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
  return NextResponse.json(rows.map((c: any) => {
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
  const g = await guard()
  if (!g.ok) return g.res

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const id = typeof body.id === "string" && UUID_RE.test(body.id) ? body.id : null
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: existing } = await db.from("lms_certificates")
    .select("id, verification_code, released_at, revoked_at").eq("id", id).maybeSingle()
  if (!existing) return NextResponse.json({ error: "Certificate not found" }, { status: 404 })

  const action = String(body.action ?? "edit")
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
