// GET /api/lms/groups/[id]/exam — every final-exam attempt of the group's
// participants (newest first per person), for the group's Final exam tab.
// Re-scoring a question goes through /api/lms/exam-rescore.
//
// Admins and this group's instructors.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardStaff, forbidden } from "@/lib/staff-access"
import { loadGroup, SEAT_STATUSES } from "@/lib/lms-groups"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardStaff()
  if (!g.ok) return g.res
  const { id } = await params
  if (!g.scope.isAdmin && !g.scope.instructorGroupIds.includes(id)) return forbidden()
  const group = await loadGroup(id)
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })

  const [{ data: exam }, { data: people }] = await Promise.all([
    db.from("lms_modules").select("id, title").eq("course_id", group.course_id).eq("module_type", "final_exam").maybeSingle(),
    db.from("lms_enrollments").select("id, lms_students(id, name, email)").eq("group_id", id).in("status", SEAT_STATUSES),
  ])
  const enrIds = ((people ?? []) as any[]).map(p => p.id)
  const { data: attempts } = exam && enrIds.length
    ? await db.from("lms_module_attempts").select("id, enrollment_id, attempt_no, score, max_score, passed, submitted_at, ai_feedback")
        .eq("module_id", (exam as any).id).in("enrollment_id", enrIds).order("attempt_no", { ascending: false })
    : { data: [] as any[] }

  return NextResponse.json({
    exam: exam ?? null,
    participants: ((people ?? []) as any[]).map(p => ({
      enrollment_id: p.id, student: p.lms_students,
      attempts: ((attempts ?? []) as any[]).filter(a => a.enrollment_id === p.id).map(a => ({
        id: a.id, attempt_no: a.attempt_no, score: a.score, max_score: a.max_score, passed: a.passed, submitted_at: a.submitted_at,
        pct: a.max_score ? Math.round((Number(a.score) / Number(a.max_score)) * 100) : null,
        changed: Object.keys(a.ai_feedback?.question_overrides ?? {}).length,
      })),
    })).sort((x, y) => (x.student?.name ?? "").localeCompare(y.student?.name ?? "")),
  })
}
