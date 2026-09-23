// Marking a group's exercises (practical work watched in class).
//
// GET    — the course's exercises, the group's participants, and the marks so far
// POST   { enrollment_id, module_id, passed?, ratings?, comment? }
//          Passed / Not passed, or rubric points per criterion (passed at the
//          exercise's threshold). Re-marking replaces the mark.
// DELETE ?enrollment_id=&module_id= — clear a mark
//
// Admins and this group's instructors. A mark can complete the course under
// its pass rule, so each change re-checks the participant.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff, forbidden } from "@/lib/staff-access"
import { loadGroup, isUuid, SEAT_STATUSES, groupLabel } from "@/lib/lms-groups"
import { checkCourseCompletion, syncEnrollmentProgress } from "@/lib/lms-completion"

export const dynamic = "force-dynamic"
type Params = { params: Promise<{ id: string }> }

async function access(id: string) {
  const g = await guardStaff()
  if (!g.ok) return { ok: false as const, res: g.res }
  const group = await loadGroup(id)
  if (!group) return { ok: false as const, res: NextResponse.json({ error: "Group not found" }, { status: 404 }) }
  if (!g.scope.isAdmin && !g.scope.instructorGroupIds.includes(id)) return { ok: false as const, res: forbidden() }
  return { ok: true as const, g, group }
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const a = await access(id)
  if (!a.ok) return a.res

  const [{ data: mods }, { data: people }] = await Promise.all([
    db.from("lms_modules").select("id, title, order_index, is_mandatory, parent_module_id, assignment_brief_html, assignment_rubric, activity_settings")
      .eq("course_id", a.group.course_id).eq("module_type", "exercise").order("order_index"),
    db.from("lms_enrollments").select("id, student_id, lms_students(id, name, email)").eq("group_id", id).in("status", SEAT_STATUSES),
  ])
  const enrIds = ((people ?? []) as any[]).map(p => p.id)
  const { data: marks } = enrIds.length
    ? await db.from("lms_exercise_results").select("enrollment_id, module_id, passed, score_pct, ratings, comment, marked_at, marked_by").in("enrollment_id", enrIds)
    : { data: [] as any[] }
  // Who marked each (marked_by has no foreign key, so no embed).
  const markerIds = [...new Set(((marks ?? []) as any[]).map(m => m.marked_by).filter(Boolean))] as string[]
  const { data: markers } = markerIds.length ? await db.from("admin_users").select("id, name").in("id", markerIds) : { data: [] as any[] }
  const markerName = new Map(((markers ?? []) as any[]).map(u => [u.id, u.name]))

  return NextResponse.json({
    group: { id, label: groupLabel(a.group) },
    exercises: ((mods ?? []) as any[]).map(m => ({
      id: m.id, title: m.title, required: m.is_mandatory !== false, instructions: m.assignment_brief_html ?? null,
      marking: m.activity_settings?.marking === "rubric" && Array.isArray(m.assignment_rubric) && m.assignment_rubric.length ? "rubric" : "pass_fail",
      rubric: Array.isArray(m.assignment_rubric) ? m.assignment_rubric : [],
      pass_pct: Number(m.activity_settings?.pass_pct ?? 60),
    })),
    participants: ((people ?? []) as any[]).map(p => ({ enrollment_id: p.id, student: p.lms_students }))
      .sort((x, y) => (x.student?.name ?? "").localeCompare(y.student?.name ?? "")),
    marks: ((marks ?? []) as any[]).map(m => ({ ...m, marked_by: markerName.get(m.marked_by) ?? null })),
  })
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const a = await access(id)
  if (!a.ok) return a.res
  const actor = { user: { id: a.g.session.id, name: a.g.session.name, role: a.g.session.role } } as any

  const body = await req.json().catch(() => ({}))
  if (!isUuid(body.enrollment_id) || !isUuid(body.module_id)) return NextResponse.json({ error: "enrollment_id and module_id required" }, { status: 400 })
  const [{ data: enr }, { data: mod }] = await Promise.all([
    db.from("lms_enrollments").select("id, student_id, course_id, status").eq("id", body.enrollment_id).eq("group_id", id).maybeSingle(),
    db.from("lms_modules").select("id, title, course_id, module_type, assignment_rubric, activity_settings").eq("id", body.module_id).maybeSingle(),
  ])
  if (!enr || !SEAT_STATUSES.includes((enr as any).status)) return NextResponse.json({ error: "Not a participant of this group" }, { status: 400 })
  if (!mod || (mod as any).module_type !== "exercise" || (mod as any).course_id !== a.group.course_id)
    return NextResponse.json({ error: "Not an exercise of this course" }, { status: 400 })

  const m = mod as any
  const rubric: { id: string; title: string; maxScore: number }[] = m.activity_settings?.marking === "rubric" && Array.isArray(m.assignment_rubric) ? m.assignment_rubric : []
  let passed: boolean, scorePct: number, ratings: Record<string, number> | null = null
  if (rubric.length) {
    // Rubric: points per criterion, each between 0 and its maximum.
    const given = body.ratings && typeof body.ratings === "object" ? body.ratings : null
    if (!given) return NextResponse.json({ error: "Give points for each criterion" }, { status: 400 })
    ratings = {}
    let got = 0, max = 0
    for (const c of rubric) {
      const v = Number(given[c.id])
      if (!Number.isFinite(v) || v < 0 || v > c.maxScore) return NextResponse.json({ error: `"${c.title}": points must be 0–${c.maxScore}` }, { status: 400 })
      ratings[c.id] = v; got += v; max += c.maxScore
    }
    scorePct = max > 0 ? Math.round((got / max) * 100) : 0
    passed = scorePct >= Number(m.activity_settings?.pass_pct ?? 60)
  } else {
    if (typeof body.passed !== "boolean") return NextResponse.json({ error: "Passed or not passed?" }, { status: 400 })
    passed = body.passed; scorePct = passed ? 100 : 0
  }
  const comment = typeof body.comment === "string" && body.comment.trim() ? body.comment.trim().slice(0, 2000) : null

  const { error } = await db.from("lms_exercise_results").upsert({
    enrollment_id: (enr as any).id, student_id: (enr as any).student_id, module_id: m.id,
    passed, score_pct: scorePct, ratings, comment, marked_by: a.g.session.id, marked_at: new Date().toISOString(),
  }, { onConflict: "enrollment_id,module_id" })
  if (error) return NextResponse.json({ error: "Could not save the mark" }, { status: 500 })

  await auditLog(actor, "lms.exercise.mark", "lms_module", m.id, m.title, { enrollment_id: (enr as any).id, passed, score_pct: scorePct })
  await syncEnrollmentProgress((enr as any).student_id, (enr as any).course_id, (enr as any).id)
  await checkCourseCompletion((enr as any).student_id, (enr as any).course_id, (enr as any).id).catch(() => {})
  return NextResponse.json({ ok: true, passed, score_pct: scorePct })
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params
  const a = await access(id)
  if (!a.ok) return a.res
  const sp = new URL(req.url).searchParams
  const enrollmentId = sp.get("enrollment_id"), moduleId = sp.get("module_id")
  if (!isUuid(enrollmentId) || !isUuid(moduleId)) return NextResponse.json({ error: "enrollment_id and module_id required" }, { status: 400 })
  const { data: enr } = await db.from("lms_enrollments").select("id, student_id, course_id").eq("id", enrollmentId).eq("group_id", id).maybeSingle()
  if (!enr) return NextResponse.json({ error: "Not a participant of this group" }, { status: 400 })
  await db.from("lms_exercise_results").delete().eq("enrollment_id", enrollmentId).eq("module_id", moduleId)
  await syncEnrollmentProgress((enr as any).student_id, (enr as any).course_id, (enr as any).id)
  return NextResponse.json({ ok: true })
}
