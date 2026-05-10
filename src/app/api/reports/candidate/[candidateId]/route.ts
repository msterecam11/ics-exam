export const maxDuration = 60

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import Groq from "groq-sdk"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// Retry with exponential backoff — handles Groq rate limits gracefully
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || err?.message?.includes("rate")
      if (attempt === retries || !isRateLimit) throw err
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)))
    }
  }
  throw new Error("Max retries exceeded")
}

export async function GET(_: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { candidateId } = await params

  const { data: candidate } = await db
    .from("candidates")
    .select("*, exams(id, title, passing_score, courses(name, groups(name)))")
    .eq("id", candidateId)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const examId = (candidate.exams as any)?.id

  const [answersRes, analysisRes, cachedRes, allCandidatesRes] = await Promise.all([
    db.from("candidate_answers")
      .select("*, questions(id, text, type, score, order_index)")
      .eq("candidate_id", candidateId),
    db.from("exam_analyses")
      .select("sections, generated_at")
      .eq("exam_id", examId)
      .single(),
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

  // Compute rank and class average
  const allCandidates = (allCandidatesRes.data ?? [])
    .sort((a: any, b: any) => (b.total_score ?? 0) - (a.total_score ?? 0))
  const rank = allCandidates.findIndex((c: any) => c.id === candidateId) + 1
  const classAvg = allCandidates.length > 0
    ? allCandidates.reduce((s: number, c: any) => s + (c.total_score ?? 0), 0) / allCandidates.length
    : 0

  // Parse narrative (stored as JSON string)
  let narrativeParsed = null
  if (cachedRes.data?.narrative) {
    try { narrativeParsed = JSON.parse(cachedRes.data.narrative) } catch { narrativeParsed = null }
  }

  return NextResponse.json({
    candidate,
    answers: answersRes.data ?? [],
    analysis: analysisRes.data ?? null,
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

  const { data: candidate } = await db
    .from("candidates")
    .select("*, exams(id, title, passing_score, courses(name, groups(name)))")
    .eq("id", candidateId)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const examId = (candidate.exams as any)?.id
  const examTitle = (candidate.exams as any)?.title

  const [answersRes, analysisRes] = await Promise.all([
    db.from("candidate_answers")
      .select("*, questions(id, text, type, score, order_index)")
      .eq("candidate_id", candidateId),
    db.from("exam_analyses").select("sections").eq("exam_id", examId).single(),
  ])

  const answers = answersRes.data ?? []
  const sections = (analysisRes.data?.sections ?? []) as any[]
  const answerMap = new Map(answers.map((a: any) => [a.question_id, a]))

  // Build section performance for AI
  const sectionData = sections.map((section: any) => {
    const sectionAnswers = (section.question_ids ?? [])
      .map((qid: string) => answerMap.get(qid))
      .filter(Boolean)
    const earned = sectionAnswers.reduce((s: number, a: any) => s + (a.score_achieved ?? 0), 0)
    const possible = sectionAnswers.reduce((s: number, a: any) => s + ((a.questions as any)?.score ?? 0), 0)
    const pct = possible > 0 ? Math.round((earned / possible) * 100) : 0
    return { title: section.title, pct, earned, possible }
  })

  const sectionLines = sectionData.map(s =>
    `  - ${s.title}: ${s.pct}% (${s.earned.toFixed(1)}/${s.possible} pts)`
  ).join("\n")

  const prompt = `You are an expert aviation training analyst at ICS Aviation. Analyze this candidate's exam performance and return a detailed JSON report.

Candidate: ${candidate.full_name}
Exam: ${examTitle}
Overall Score: ${candidate.total_score?.toFixed(1)}%
Result: ${candidate.passed ? "PASSED" : "FAILED"}
Passing Score: ${(candidate.exams as any)?.passing_score}%

Section Performance:
${sectionLines || "No section breakdown available"}

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "executive_summary": "2-3 professional sentences summarizing overall performance, result, and tone",
  "section_analyses": {
    ${sectionData.map(s => `"${s.title}": {
      "summary": "one sentence overall assessment of this section (score: ${s.pct}%)",
      "strengths": ["specific strength observed in this section"],
      "weaknesses": ["specific weakness observed based on score"],
      "development": ["one concrete action to improve in this section"]
    }`).join(",\n    ")}
  },
  "strengths": ["overall strength 1", "overall strength 2"],
  "improvements": ["overall weak area 1 with context", "overall weak area 2"],
  "recommendations": [
    {"area": "section or topic name", "score": ${sectionData[0]?.pct ?? 0}, "action": "specific actionable step"},
    {"area": "section or topic name", "score": ${sectionData[1]?.pct ?? 50}, "action": "specific actionable step"}
  ]
}

Be specific, professional, constructive, and base all insights strictly on the section scores provided.`

  let narrativeObj: any
  try {
    const completion = await withRetry(() =>
      groq.chat.completions.create({
        model      : "llama-3.3-70b-versatile",
        messages   : [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens : 1400,
      })
    )
    const raw     = completion.choices[0]?.message?.content?.trim() ?? ""
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    const match   = cleaned.match(/\{[\s\S]*\}/)
    narrativeObj  = JSON.parse(match ? match[0] : cleaned)
  } catch {
    return NextResponse.json({ error: "AI service temporarily unavailable. Please try again in a moment." }, { status: 503 })
  }

  const narrativeStr = JSON.stringify(narrativeObj)

  await db.from("report_cache").upsert(
    {
      type: "candidate",
      reference_id: candidateId,
      exam_id: examId,
      narrative: narrativeStr,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "type,reference_id,exam_id" }
  )

  return NextResponse.json({ narrative: narrativeObj, generated_at: new Date().toISOString() })
}
