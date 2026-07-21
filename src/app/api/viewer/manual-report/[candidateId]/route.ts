import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { scaleToTarget } from "@/lib/scoreDisplay"
import { buildTopicSections } from "@/app/api/reports/candidate/[candidateId]/route"
import { loadManualScoresForCandidates } from "@/lib/manualOverrides"

type Params = { params: Promise<{ candidateId: string }> }

// View-only — viewers never trigger AI generation (no POST here), matching
// the "view-only access" requirement. Mirrors the admin manual report
// route's GET logic exactly, gated by the manual_reports viewer permission
// instead of an admin session.
export async function GET(_: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role ?? ""
  if (!["admin", "instructor", "viewer"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { candidateId } = await params

  const { data: candidate } = await db
    .from("candidates")
    .select("*, exams(id, title, passing_score, duration_minutes, courses(name, groups(name)))")
    .eq("id", candidateId)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Viewer: check manual_reports permission via viewer_access, same 3-tier
  // (exam → course → group) pattern as the real viewer report route.
  if (role === "viewer") {
    const examId = (candidate.exams as any)?.id

    const { data: accessRows } = await db
      .from("viewer_access")
      .select("resource_type, resource_id, permissions")
      .eq("user_id", session.user.id)
      .eq("system", "exam")

    const rows = accessRows ?? []
    const hasAccess =
      rows.some(a => a.permissions?.manual_reports && a.resource_type === "exam" && a.resource_id === examId) ||
      await (async () => {
        const { data: exam } = await db.from("exams").select("course_id").eq("id", examId).single()
        if (exam?.course_id && rows.some(a => a.permissions?.manual_reports && a.resource_type === "course" && a.resource_id === exam.course_id))
          return true
        const { data: course } = await db.from("courses").select("group_id").eq("id", exam?.course_id ?? "").single()
        return !!(course?.group_id && rows.some(a => a.permissions?.manual_reports && a.resource_type === "group" && a.resource_id === course.group_id))
      })()

    if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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

  const examId = (candidate.exams as any)?.id

  const { data: drawnCheck } = await db
    .from("candidate_exam_questions")
    .select("candidate_id")
    .eq("candidate_id", candidateId)
    .limit(1)
  const isBankExam = (drawnCheck?.length ?? 0) > 0

  const [answersRes, analysisRes, cachedRes, overridesRes, allCandidatesRes] = await Promise.all([
    db.from("candidate_answers")
      .select("*, questions(id, text, type, score, order_index, topic)")
      .eq("candidate_id", candidateId),
    isBankExam
      ? Promise.resolve({ data: null } as any)
      : db.from("exam_analyses").select("sections, generated_at").eq("exam_id", examId).single(),
    db.from("report_cache")
      .select("narrative, generated_at")
      .eq("type", "candidate_manual")
      .eq("reference_id", manualScore.id)
      .eq("exam_id", examId)
      .single(),
    db.from("manual_score_answer_overrides")
      .select("candidate_answer_id, manual_score_achieved")
      .eq("manual_score_id", manualScore.id),
    db.from("candidates")
      .select("id, total_score")
      .eq("exam_id", examId)
      .not("submitted_at", "is", null),
  ])

  // Rank/class average blend in every cohort member's confirmed manual
  // score where one exists, same as the admin manual report — otherwise
  // "Your Score" (manual) and "Class Average" (real) would visibly
  // disagree, e.g. a 1-candidate cohort where the average wouldn't equal
  // the candidate's own displayed score.
  const cohortIds = (allCandidatesRes.data ?? []).map((c: any) => c.id)
  const cohortManualMap = await loadManualScoresForCandidates(cohortIds)
  const allCandidates = (allCandidatesRes.data ?? [])
    .map((c: any) => ({ ...c, total_score: cohortManualMap.get(c.id)?.achievedScore ?? c.total_score }))
    .sort((a: any, b: any) => (b.total_score ?? 0) - (a.total_score ?? 0))
  const rank = allCandidates.findIndex((c: any) => c.id === candidateId) + 1
  const classAvg = allCandidates.length > 0
    ? allCandidates.reduce((s: number, c: any) => s + (c.total_score ?? 0), 0) / allCandidates.length
    : 0

  const overrideMap = new Map((overridesRes.data ?? []).map((o: any) => [o.candidate_answer_id, o.manual_score_achieved]))
  const rawAnswers = (answersRes.data ?? []).map((a: any) => {
    const override = overrideMap.get(a.id)
    return override === undefined ? a : { ...a, score_achieved: override }
  })

  let narrativeParsed = null
  if (cachedRes.data?.narrative) {
    try { narrativeParsed = JSON.parse(cachedRes.data.narrative) } catch { narrativeParsed = null }
  }

  const analysis = isBankExam
    ? { sections: buildTopicSections(rawAnswers), generated_at: null }
    : (analysisRes.data ?? null)

  const rawPossible = rawAnswers.map((a: any) => a.questions?.score ?? 0)
  const displayPossible = scaleToTarget(rawPossible)
  const answersWithDisplay = rawAnswers.map((a: any, i: number) => {
    const raw = rawPossible[i]
    const ratio = raw > 0 ? displayPossible[i] / raw : 0
    return {
      ...a,
      display_possible: displayPossible[i],
      display_achieved: Math.round((a.score_achieved ?? 0) * ratio * 100) / 100,
    }
  })

  return NextResponse.json({
    candidate: {
      ...candidate,
      total_score: manualScore.achieved_score,
      passed: manualScore.achieved_score >= ((candidate.exams as any)?.passing_score ?? 60),
    },
    manualScore,
    answers: answersWithDisplay,
    analysis,
    narrative: narrativeParsed,
    narrativeGeneratedAt: cachedRes.data?.generated_at ?? null,
    rank,
    totalCandidates: allCandidates.length,
    classAvg: Math.round(classAvg * 10) / 10,
  })
}
