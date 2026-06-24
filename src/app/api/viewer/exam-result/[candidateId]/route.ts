import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ candidateId: string }> }

export async function GET(_: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role ?? ""
  if (!["admin", "instructor", "viewer"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { candidateId } = await params

  // Fetch candidate to get exam_id
  const { data: candidate, error: candidateErr } = await db
    .from("candidates")
    .select("id, full_name, email, job_title, company, total_score, passed, submitted_at, exam_id, exams(id, title, passing_score)")
    .eq("id", candidateId)
    .single()

  if (candidateErr) return NextResponse.json({ error: candidateErr.message }, { status: 500 })

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Viewer: verify they have reports permission for this exam (direct or via course/group)
  if (role === "viewer") {
    const examId = candidate.exam_id

    const { data: accessRows } = await db
      .from("viewer_access")
      .select("resource_type, resource_id, permissions")
      .eq("user_id", session.user.id)
      .eq("system", "exam")

    const rows = accessRows ?? []

    const directExam = rows.some(a => a.permissions?.reports && a.resource_type === "exam" && a.resource_id === examId)

    if (!directExam) {
      // Check course-level access
      const { data: exam } = await db.from("exams").select("course_id").eq("id", examId).single()
      const courseAccess = exam?.course_id && rows.some(a => a.permissions?.reports && a.resource_type === "course" && a.resource_id === exam.course_id)

      if (!courseAccess) {
        // Check group-level access
        const { data: course } = await db.from("courses").select("group_id").eq("id", exam?.course_id ?? "").single()
        const groupAccess = course?.group_id && rows.some(a => a.permissions?.reports && a.resource_type === "group" && a.resource_id === course.group_id)

        if (!groupAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }
  }

  // Fetch answers with question details, sorted by question order
  const { data: answers } = await db
    .from("candidate_answers")
    .select("*, questions(*, choices(*), matching_pairs(*), ordering_items(*))")
    .eq("candidate_id", candidateId)

  const sorted = (answers ?? []).sort(
    (a: any, b: any) => (a.questions?.order_index ?? 0) - (b.questions?.order_index ?? 0)
  )

  return NextResponse.json({ candidate, answers: sorted })
}
