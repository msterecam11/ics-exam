// GET /api/lms/groups/[id]/assignments — the course's assignments against the
// group's participants: who submitted, what (text / a short-lived file link),
// the AI's suggestion, and the mark. Grading itself goes through
// /api/lms/module-assignment (PATCH) and the AI helper /api/lms/grade-assignment-ai.
//
// Admins and this group's instructors.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardStaff, forbidden } from "@/lib/staff-access"
import { loadGroup, SEAT_STATUSES, groupLabel } from "@/lib/lms-groups"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardStaff()
  if (!g.ok) return g.res
  const { id } = await params
  const group = await loadGroup(id)
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })
  if (!g.scope.isAdmin && !g.scope.instructorGroupIds.includes(id)) return forbidden()

  const [{ data: mods }, { data: people }] = await Promise.all([
    db.from("lms_modules").select("id, title, order_index, is_mandatory, assignment_rubric, activity_settings, assignment_due_date")
      .eq("course_id", group.course_id).eq("module_type", "assignment").order("order_index"),
    db.from("lms_enrollments").select("id, student_id, team_id, lms_students(id, name, email), lms_group_teams(name)").eq("group_id", id).in("status", SEAT_STATUSES),
  ])
  const enrIds = ((people ?? []) as any[]).map(p => p.id)
  const modIds = ((mods ?? []) as any[]).map(m => m.id)
  const { data: attempts } = enrIds.length && modIds.length
    ? await db.from("lms_module_attempts").select("id, enrollment_id, module_id, attempt_no, status, score, max_score, passed, answers, ai_feedback, submitted_at")
        .in("enrollment_id", enrIds).in("module_id", modIds).order("attempt_no", { ascending: false })
    : { data: [] as any[] }

  // Latest submission per participant per assignment, with a 1-hour file link.
  const latest = new Map<string, any>()
  for (const a of (attempts ?? []) as any[]) {
    const k = `${a.enrollment_id}:${a.module_id}`
    if (!latest.has(k)) latest.set(k, a)
  }
  const paths = [...latest.values()].map(a => a.answers?.file_path).filter(Boolean) as string[]
  const { data: signed } = paths.length ? await db.storage.from("lms-submissions").createSignedUrls(paths, 3600) : { data: [] as any[] }
  const urlOf = new Map(((signed ?? []) as any[]).map(s => [s.path, s.signedUrl]))

  return NextResponse.json({
    group: { id, label: groupLabel(group) },
    assignments: ((mods ?? []) as any[]).map(m => ({
      id: m.id, title: m.title, required: m.is_mandatory !== false,
      pass_mark: Number(m.activity_settings?.pass_mark ?? 60), due: m.assignment_due_date,
      rubric: Array.isArray(m.assignment_rubric) ? m.assignment_rubric : [],
      team_work: m.activity_settings?.team_work === true,
    })),
    participants: ((people ?? []) as any[]).map(p => ({ enrollment_id: p.id, student: p.lms_students, team: p.team_id ? { id: p.team_id, name: p.lms_group_teams?.name ?? "Team" } : null }))
      .sort((x, y) => (x.student?.name ?? "").localeCompare(y.student?.name ?? "")),
    submissions: [...latest.values()].map(a => ({
      id: a.id, enrollment_id: a.enrollment_id, module_id: a.module_id, attempt_no: a.attempt_no,
      status: a.status, score: a.score, max_score: a.max_score, passed: a.passed, submitted_at: a.submitted_at,
      text: a.answers?.text_response ?? null, file_name: a.answers?.file_name ?? null,
      file_url: a.answers?.file_path ? urlOf.get(a.answers.file_path) ?? null : null,
      confirmed: a.status === "released" || a.ai_feedback?.graded_by === "instructor",
      ai: a.ai_feedback ? { comment: a.ai_feedback.overall_comment ?? null, criteria: a.ai_feedback.criteria ?? null } : null,
      rescores: a.ai_feedback?.rescores ?? [],
      submitted_by: a.answers?.submitted_by ?? null, team_name: a.answers?.team_name ?? null,
    })),
  })
}
