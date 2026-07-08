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

  const { data: candidate, error: candidateErr } = await db
    .from("candidates")
    .select("*, exams(id, title, passing_score, question_bank_id, courses(name, groups(name)))")
    .eq("id", candidateId)
    .single()

  if (candidateErr || !candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Viewer: check reports permission via viewer_access
  if (role === "viewer") {
    const examId = (candidate.exams as any)?.id

    const { data: accessRows } = await db
      .from("viewer_access")
      .select("resource_type, resource_id, permissions")
      .eq("user_id", session.user.id)
      .eq("system", "exam")

    const rows = accessRows ?? []
    const hasAccess =
      rows.some(a => a.permissions?.reports && a.resource_type === "exam" && a.resource_id === examId) ||
      await (async () => {
        const { data: exam } = await db.from("exams").select("course_id").eq("id", examId).single()
        if (exam?.course_id && rows.some(a => a.permissions?.reports && a.resource_type === "course" && a.resource_id === exam.course_id))
          return true
        const { data: course } = await db.from("courses").select("group_id").eq("id", exam?.course_id ?? "").single()
        return !!(course?.group_id && rows.some(a => a.permissions?.reports && a.resource_type === "group" && a.resource_id === course.group_id))
      })()

    if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const examId = (candidate.exams as any)?.id
  const isBankExam = !!(candidate.exams as any)?.question_bank_id

  const [answersRes, analysisRes, cachedRes, allCandidatesRes] = await Promise.all([
    db.from("candidate_answers")
      .select("*, questions(id, text, type, score, order_index, topic)")
      .eq("candidate_id", candidateId),
    // Question Bank exams have no per-exam exam_analyses row (topics are
    // tagged on the bank, not the exam) — the "sections" equivalent is
    // synthesized below from each answered question's own topic tag.
    isBankExam
      ? Promise.resolve({ data: null } as any)
      : db.from("exam_analyses").select("sections, generated_at").eq("exam_id", examId).single(),
    db.from("report_cache")
      .select("narrative, generated_at")
      .eq("type", "candidate")
      .eq("reference_id", candidateId)
      .eq("exam_id", examId)
      .single(),
    db.from("candidates")
      .select("id, total_score")
      .eq("exam_id", examId)
      .not("submitted_at", "is", null),
  ])

  const allCandidates = (allCandidatesRes.data ?? [])
    .sort((a: any, b: any) => (b.total_score ?? 0) - (a.total_score ?? 0))
  const rank = allCandidates.findIndex((c: any) => c.id === candidateId) + 1
  const classAvg = allCandidates.length > 0
    ? allCandidates.reduce((s: number, c: any) => s + (c.total_score ?? 0), 0) / allCandidates.length
    : 0

  let narrativeParsed = null
  if (cachedRes.data?.narrative) {
    try { narrativeParsed = JSON.parse(cachedRes.data.narrative) } catch { narrativeParsed = null }
  }

  const analysis = isBankExam
    ? { sections: buildTopicSections(answersRes.data ?? []), generated_at: null }
    : (analysisRes.data ?? null)

  return NextResponse.json({
    candidate,
    answers: answersRes.data ?? [],
    analysis,
    narrative: narrativeParsed,
    narrativeGeneratedAt: cachedRes.data?.generated_at ?? null,
    rank,
    totalCandidates: allCandidates.length,
    classAvg: Math.round(classAvg * 10) / 10,
  })
}

// For a Question Bank exam, builds the same { title, question_ids } shape as
// exam_analyses.sections, but derived directly from each answered question's
// own topic tag (set once by the bank's Expert Analyze) — no per-exam
// analysis needed, since the exam has no fixed question list to analyze.
function buildTopicSections(answers: any[]): { title: string; question_ids: string[] }[] {
  const byTopic = new Map<string, string[]>()
  for (const a of answers) {
    const topic = (a.questions as any)?.topic ?? "General"
    if (!byTopic.has(topic)) byTopic.set(topic, [])
    byTopic.get(topic)!.push(a.question_id)
  }
  return [...byTopic.entries()].map(([title, question_ids]) => ({ title, question_ids }))
}
