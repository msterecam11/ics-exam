// External courses (e.g. ICAO): the result is entered by hand, per participant.
//
// GET — the group's participants, their entered result and their certificates
// PUT { enrollment_ids, passed: true | false | null, score?, date?, note? }
//     — enter (or clear) the result for one or several participants. Passed
//       completes the course and issues the certificates; anything else
//       re-opens a completed course (certificates already issued are kept).
//
// Admins, and the instructors of this group.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff, forbidden } from "@/lib/staff-access"
import { loadGroup, isUuid, SEAT_STATUSES } from "@/lib/lms-groups"
import { checkCourseCompletion } from "@/lib/lms-completion"

export const dynamic = "force-dynamic"
type Params = { params: Promise<{ id: string }> }

async function access(id: string) {
  const g = await guardStaff()
  if (!g.ok) return { ok: false as const, res: g.res }
  const group = await loadGroup(id)
  if (!group) return { ok: false as const, res: NextResponse.json({ error: "Group not found" }, { status: 404 }) }
  if (!g.scope.isAdmin && !g.scope.instructorGroupIds.includes(id)) return { ok: false as const, res: forbidden() }
  const { data: course } = await db.from("lms_courses").select("id, title, delivery_mode, provider_id").eq("id", (group as any).course_id).single()
  if ((course as any)?.delivery_mode !== "external")
    return { ok: false as const, res: NextResponse.json({ error: "Results are entered by hand only for external courses" }, { status: 400 }) }
  return { ok: true as const, g, group: group as any, course: course as any }
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const a = await access(id)
  if (!a.ok) return a.res
  const { data: enr } = await db.from("lms_enrollments")
    .select("id, status, manual_result, lms_students(id, name, email)")
    .eq("group_id", id).in("status", SEAT_STATUSES)
  const ids = ((enr ?? []) as any[]).map(e => e.id)
  const { data: certs } = ids.length
    ? await db.from("lms_certificates").select("id, enrollment_id, issuer, verification_code, pdf_url, released_at, revoked_at, visible_to_student").in("enrollment_id", ids).is("revoked_at", null)
    : { data: [] as any[] }
  const rows = ((enr ?? []) as any[]).map(e => ({
    enrollment_id: e.id, status: e.status, student: e.lms_students, result: e.manual_result ?? null,
    certificates: ((certs ?? []) as any[]).filter(c => c.enrollment_id === e.id).map(c => ({
      id: c.id, issuer: c.issuer, code: c.verification_code, has_file: !!c.pdf_url, released: !!c.released_at, visible: c.visible_to_student,
    })),
  })).sort((x, y) => (x.student?.name ?? "").localeCompare(y.student?.name ?? ""))
  return NextResponse.json({ rows, provider_set: !!(a.group.provider_id ?? a.course.provider_id) })
}

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params
  const a = await access(id)
  if (!a.ok) return a.res
  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.enrollment_ids) ? body.enrollment_ids.filter(isUuid) : []
  if (!ids.length) return NextResponse.json({ error: "Choose at least one participant" }, { status: 400 })
  if (![true, false, null].includes(body.passed)) return NextResponse.json({ error: "passed must be true, false or null" }, { status: 400 })
  let score: number | null = null
  if (body.score !== undefined && body.score !== null && body.score !== "") {
    const n = Number(body.score)
    if (!Number.isFinite(n) || n < 0 || n > 100) return NextResponse.json({ error: "The score must be 0–100" }, { status: 400 })
    score = Math.round(n * 10) / 10
  }
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : null

  const { data: enr } = await db.from("lms_enrollments").select("id, student_id, status").eq("group_id", id).in("id", ids).in("status", SEAT_STATUSES)
  const rows = (enr ?? []) as any[]
  if (rows.length !== ids.length) return NextResponse.json({ error: "Someone chosen isn't in this group" }, { status: 400 })

  const result = body.passed === null && score === null && !note ? null : {
    passed: body.passed, score, date: date ?? (body.passed !== null ? new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10) : null), note,
    by: a.g.session.id, by_name: a.g.session.name ?? null, at: new Date().toISOString(),
  }
  for (const e of rows) {
    const patch: Record<string, unknown> = { manual_result: result }
    // Not passed (or cleared): a course completed earlier opens again.
    if (body.passed !== true && e.status === "completed") Object.assign(patch, { status: "active", completed_at: null, progress_pct: 0 })
    const { error } = await db.from("lms_enrollments").update(patch).eq("id", e.id)
    if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 })
    if (body.passed === true) await checkCourseCompletion(e.student_id, a.course.id, e.id)
  }
  await auditLog({ user: { id: a.g.session.id, name: a.g.session.name, role: a.g.session.role } } as any,
    "lms.external.result", "lms_course_group", id, a.course.title, { enrollment_ids: ids, passed: body.passed, score })
  return NextResponse.json({ ok: true, updated: rows.length })
}
