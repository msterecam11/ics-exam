// Mirrors the real candidate report route's timeout — topic-heavy bank
// exams can need a few sequential Groq calls with pauses between them.
export const maxDuration = 180

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import { scaleToTarget } from "@/lib/scoreDisplay"
import { generateCandidateNarrative, buildTopicSections, type SectionDatum } from "@/app/api/reports/candidate/[candidateId]/route"
import { loadManualScoresForCandidates } from "@/lib/manualOverrides"

async function loadActiveManualScore(candidateId: string) {
  return db
    .from("manual_scores")
    .select("*")
    .eq("candidate_id", candidateId)
    .in("status", ["draft", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
}

export async function GET(_: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { candidateId } = await params

  const { data: candidate } = await db
    .from("candidates")
    .select("*, exams(id, title, passing_score, duration_minutes, courses(name, groups(name, manual_report_logos)))")
    .eq("id", candidateId)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: manualScore } = await loadActiveManualScore(candidateId)
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
    // Keyed by manual_score_id, not candidate_id — editing the score creates
    // a new id, so the old cached narrative is simply orphaned and this
    // lookup naturally comes back empty until it's regenerated.
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

  // Rank/class average are cohort-relative stats — every cohort member who
  // also has a confirmed manual score contributes THAT number instead of
  // their real one, same blended approach as the Group/Course manual
  // reports. Otherwise "Your Score" (manual) and "Class Average" (real)
  // would sit on different bases and visibly disagree, e.g. a 1-candidate
  // cohort where the average wouldn't equal the candidate's own score.
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

export async function POST(req: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { allowed, retryAfterSeconds } = await rateLimit(`ai:${session.user.id}`, 10, 3600)
  if (!allowed) return res429(retryAfterSeconds)

  const { candidateId } = await params
  const body = await req.json().catch(() => ({}))
  const includeSecurity = !!body.includeSecurity

  const { data: candidate } = await db
    .from("candidates")
    .select("*, exams(id, title, passing_score, duration_minutes, courses(name, groups(name, manual_report_logos)))")
    .eq("id", candidateId)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: manualScore } = await loadActiveManualScore(candidateId)
  if (!manualScore) return NextResponse.json({ error: "No active manual score" }, { status: 404 })
  if (manualScore.status !== "confirmed") {
    return NextResponse.json({ error: "Manual score must be confirmed before generating a report" }, { status: 400 })
  }

  const examId = (candidate.exams as any)?.id
  const examTitle = (candidate.exams as any)?.title

  const { data: drawnCheckPost } = await db
    .from("candidate_exam_questions")
    .select("candidate_id")
    .eq("candidate_id", candidateId)
    .limit(1)
  const isBankExam = (drawnCheckPost?.length ?? 0) > 0

  const [answersRes, analysisRes, overridesRes] = await Promise.all([
    db.from("candidate_answers")
      .select("*, questions(id, text, type, score, order_index, topic)")
      .eq("candidate_id", candidateId),
    isBankExam
      ? Promise.resolve({ data: null } as any)
      : db.from("exam_analyses").select("sections").eq("exam_id", examId).single(),
    db.from("manual_score_answer_overrides")
      .select("candidate_answer_id, manual_score_achieved")
      .eq("manual_score_id", manualScore.id),
  ])

  const overrideMap = new Map((overridesRes.data ?? []).map((o: any) => [o.candidate_answer_id, o.manual_score_achieved]))
  const answers = (answersRes.data ?? []).map((a: any) => {
    const override = overrideMap.get(a.id)
    return override === undefined ? a : { ...a, score_achieved: override }
  })

  const sections = isBankExam ? buildTopicSections(answers) : ((analysisRes.data?.sections ?? []) as any[])
  const answerMap = new Map(answers.map((a: any) => [a.question_id, a]))

  const sectionData: SectionDatum[] = sections.map((section: any) => {
    const sectionAnswers = (section.question_ids ?? [])
      .map((qid: string) => answerMap.get(qid))
      .filter(Boolean)
    const earned = sectionAnswers.reduce((s: number, a: any) => s + (a.score_achieved ?? 0), 0)
    const possible = sectionAnswers.reduce((s: number, a: any) => s + ((a.questions as any)?.score ?? 0), 0)
    const pct = possible > 0 ? Math.round((earned / possible) * 100) : 0
    return { title: section.title, pct, earned, possible }
  })

  const manualCandidate = {
    ...candidate,
    total_score: manualScore.achieved_score,
    passed: manualScore.achieved_score >= ((candidate.exams as any)?.passing_score ?? 60),
  }

  let narrativeObj: any
  try {
    narrativeObj = await generateCandidateNarrative(manualCandidate, examTitle, sectionData)
  } catch {
    return NextResponse.json({ error: "AI service temporarily unavailable. Please try again in a moment." }, { status: 503 })
  }

  // Security AI analysis is intentionally never included in a manual report —
  // it reflects real proctoring events, which have no meaning against a
  // manually-substituted score.
  delete narrativeObj.security_analysis
  void includeSecurity

  const narrativeStr = JSON.stringify(narrativeObj)

  await db.from("report_cache").upsert(
    {
      type: "candidate_manual",
      reference_id: manualScore.id,
      exam_id: examId,
      narrative: narrativeStr,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "type,reference_id,exam_id" }
  )

  return NextResponse.json({ narrative: narrativeObj, generated_at: new Date().toISOString() })
}
