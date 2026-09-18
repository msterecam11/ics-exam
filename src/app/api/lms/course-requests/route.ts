// CV-7 — the admin's side of catalogue requests (Program Manager → Requests).
// Admin only: approving creates enrolments and can create programs, which is
// IR-15 territory.
//
// GET  ?status=pending|approved|rejected|all  → the list, with where each could go
// POST { id, action: "approve", program_id?, track_id?, create_name? }
// POST { id, action: "reject", reason }

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff } from "@/lib/staff-access"
import { programOptions, approveRequest, rejectRequest } from "@/lib/lms-course-requests"

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res

  const status = new URL(req.url).searchParams.get("status") ?? "pending"
  let q = db.from("lms_course_requests")
    .select(`id, status, note, decision_note, created_at, decided_at, program_id,
             lms_students(id, name, email, company_id, lms_companies(name)),
             lms_courses(id, title, delivery_mode),
             lms_programs(id, name)`)
    .order("created_at", { ascending: status === "pending" })
    .limit(300)
  if (status !== "all") q = q.eq("status", status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: "Could not load requests" }, { status: 500 })

  const rows = (data ?? []) as any[]
  // Where each pending request could go, worked out once per student/course pair.
  const optionsCache = new Map<string, Awaited<ReturnType<typeof programOptions>>>()
  const out = []
  for (const r of rows) {
    let options: Awaited<ReturnType<typeof programOptions>> = []
    if (r.status === "pending" && r.lms_courses) {
      const key = `${r.lms_students?.company_id ?? "none"}|${r.lms_courses.id}`
      if (!optionsCache.has(key)) optionsCache.set(key, await programOptions(r.lms_students?.company_id ?? null, r.lms_courses.id))
      options = optionsCache.get(key)!
    }
    out.push({
      id: r.id, status: r.status, note: r.note, reason: r.decision_note,
      created_at: r.created_at, decided_at: r.decided_at,
      student: r.lms_students ? {
        id: r.lms_students.id, name: r.lms_students.name, email: r.lms_students.email,
        company: r.lms_students.lms_companies?.name ?? null, individual: !r.lms_students.company_id,
      } : null,
      course: r.lms_courses ? { id: r.lms_courses.id, title: r.lms_courses.title, delivery_mode: r.lms_courses.delivery_mode } : null,
      program: r.lms_programs ? { id: r.lms_programs.id, name: r.lms_programs.name } : null,
      options,
    })
  }

  const { count: pending } = await db.from("lms_course_requests").select("id", { count: "exact", head: true }).eq("status", "pending")
  return NextResponse.json({ requests: out, pending: pending ?? 0 })
}

export async function POST(req: Request) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const actor = { user: { id: g.session.id, name: g.session.name } } as any

  const body = await req.json().catch(() => ({}))
  const id = body?.id
  if (typeof id !== "string" || !UUID_RE.test(id)) return NextResponse.json({ error: "id required" }, { status: 400 })

  if (body.action === "approve") {
    const programId = typeof body.program_id === "string" && UUID_RE.test(body.program_id) ? body.program_id : null
    const trackId = typeof body.track_id === "string" && UUID_RE.test(body.track_id) ? body.track_id : null
    const createName = typeof body.create_name === "string" && body.create_name.trim() ? body.create_name : null
    const r = await approveRequest({ requestId: id, adminId: g.session.id, programId, trackId, createName })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    await auditLog(actor, "lms.course_request.approve", "lms_course_request", id, null,
      { program_id: r.programId, created_program: r.created })
    return NextResponse.json(r)
  }

  if (body.action === "reject") {
    const r = await rejectRequest({ requestId: id, adminId: g.session.id, reason: String(body.reason ?? "") })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    await auditLog(actor, "lms.course_request.reject", "lms_course_request", id, null)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
