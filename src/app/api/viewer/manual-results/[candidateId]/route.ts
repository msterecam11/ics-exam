import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ candidateId: string }> }

// View-only — mirrors the admin manual-score/answers overlay route, gated
// by the manual_reports viewer permission instead of an admin session.
export async function GET(_: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role ?? ""
  if (!["admin", "instructor", "viewer"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { candidateId } = await params

  const { data: candidate, error: candidateErr } = await db
    .from("candidates")
    .select("id, full_name, email, job_title, company, total_score, passed, submitted_at, exam_id, exams(id, title, passing_score, show_results, courses(name, groups(name)))")
    .eq("id", candidateId)
    .single()

  if (candidateErr) return NextResponse.json({ error: candidateErr.message }, { status: 500 })
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Viewer: verify they have manual_reports permission for this exam
  // (direct, or inherited via its parent course/group).
  if (role === "viewer") {
    const examId = candidate.exam_id

    const { data: accessRows } = await db
      .from("viewer_access")
      .select("resource_type, resource_id, permissions")
      .eq("user_id", session.user.id)
      .eq("system", "exam")

    const rows = accessRows ?? []
    const directExam = rows.some(a => a.permissions?.manual_reports && a.resource_type === "exam" && a.resource_id === examId)

    if (!directExam) {
      const { data: exam } = await db.from("exams").select("course_id").eq("id", examId).single()
      const courseAccess = exam?.course_id && rows.some(a => a.permissions?.manual_reports && a.resource_type === "course" && a.resource_id === exam.course_id)

      if (!courseAccess) {
        const { data: course } = await db.from("courses").select("group_id").eq("id", exam?.course_id ?? "").single()
        const groupAccess = course?.group_id && rows.some(a => a.permissions?.manual_reports && a.resource_type === "group" && a.resource_id === course.group_id)

        if (!groupAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }
  }

  const { data: manualScore } = await db
    .from("manual_scores")
    .select("*")
    .eq("candidate_id", candidateId)
    .in("status", ["draft", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!manualScore) return NextResponse.json({ error: "No active manual score" }, { status: 404 })

  const { data: answers } = await db
    .from("candidate_answers")
    .select("*, questions(*, choices(*), matching_pairs(*), ordering_items(*))")
    .eq("candidate_id", candidateId)

  const { data: overrides } = await db
    .from("manual_score_answer_overrides")
    .select("candidate_answer_id, manual_score_achieved")
    .eq("manual_score_id", manualScore.id)

  const overrideMap = new Map((overrides ?? []).map((o: any) => [o.candidate_answer_id, o.manual_score_achieved]))

  const sorted = (answers ?? [])
    .map((a: any) => {
      const override = overrideMap.get(a.id)
      return override === undefined ? a : { ...a, score_achieved: override }
    })
    .sort((a: any, b: any) => (a.questions?.order_index ?? 0) - (b.questions?.order_index ?? 0))

  return NextResponse.json({
    candidate: {
      ...candidate,
      total_score: manualScore.achieved_score,
      passed: manualScore.achieved_score >= ((candidate.exams as any)?.passing_score ?? 60),
    },
    answers: sorted,
    manualScore,
  })
}
