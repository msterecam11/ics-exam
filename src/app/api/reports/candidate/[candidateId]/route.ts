export const maxDuration = 60

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import Groq from "groq-sdk"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "placeholder" })

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
    .select("*, exams(id, title, passing_score, question_bank_id, courses(name, groups(name)))")
    .eq("id", candidateId)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

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
    .select("*, exams(id, title, passing_score, question_bank_id, courses(name, groups(name)))")
    .eq("id", candidateId)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const examId = (candidate.exams as any)?.id
  const examTitle = (candidate.exams as any)?.title
  const isBankExam = !!(candidate.exams as any)?.question_bank_id

  const [answersRes, analysisRes] = await Promise.all([
    db.from("candidate_answers")
      .select("*, questions(id, text, type, score, order_index, topic)")
      .eq("candidate_id", candidateId),
    isBankExam
      ? Promise.resolve({ data: null } as any)
      : db.from("exam_analyses").select("sections").eq("exam_id", examId).single(),
  ])

  const answers = answersRes.data ?? []
  const sections = isBankExam ? buildTopicSections(answers) : ((analysisRes.data?.sections ?? []) as any[])
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
        model      : "llama-3.1-8b-instant",
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

  // ── Security AI analysis (optional) ───────────────────────────────────────
  // Always clear it first so re-generating without checkbox removes old data
  delete narrativeObj.security_analysis

  if (includeSecurity) {
    const tabSwitches: { timestamp: string; duration: number | null }[] = (candidate as any).tab_switches ?? []
    const fullscreenExits: number = (candidate as any).fullscreen_exits ?? 0
    const rightClicks: number = (candidate as any).right_click_attempts ?? 0
    const copyPaste: number = (candidate as any).copy_paste_attempts ?? 0
    const totalAway = tabSwitches.reduce((s, sw) => s + (sw.duration ?? 0), 0)
    const totalEvents = tabSwitches.length + fullscreenExits
    const riskLevel = totalEvents === 0 ? "clean" : totalEvents <= 2 ? "medium" : "high"

    const switchLines = tabSwitches.map((sw, i) =>
      `  Switch ${i + 1}: at ${new Date(sw.timestamp).toLocaleTimeString("en-GB")}, away for ${sw.duration ?? 0}s`
    ).join("\n")

    const secPrompt = `You are a forensic exam integrity analyst at ICS Aviation. Analyze the following behavioral data recorded during a candidate's exam and provide a professional assessment.

Candidate: ${candidate.full_name}
Exam: ${examTitle}
Score: ${candidate.total_score?.toFixed(1)}% (${candidate.passed ? "PASSED" : "FAILED"})

Section Performance:
${sectionLines || "No section breakdown available"}

Behavioral Events Recorded:
- Tab switches (left exam window): ${tabSwitches.length}
- Total time away from exam: ${totalAway}s
${switchLines ? `Tab switch details:\n${switchLines}` : ""}
- Fullscreen exits: ${fullscreenExits}
- Right-click attempts: ${rightClicks}
- Copy/cut attempts: ${copyPaste}

Based on this data, write a professional 3-4 sentence behavioral assessment that:
1. Describes the pattern of behavior objectively
2. Correlates the timing/frequency of events with section performance where relevant
3. Predicts what the candidate was likely doing during those away periods, based on the evidence
4. States the overall integrity risk level

Return ONLY valid JSON:
{
  "risk_level": "${riskLevel}",
  "tab_switches": ${tabSwitches.length},
  "fullscreen_exits": ${fullscreenExits},
  "right_click_attempts": ${rightClicks},
  "copy_paste_attempts": ${copyPaste},
  "total_away_seconds": ${totalAway},
  "behavioral_assessment": "Your 3-4 sentence assessment here"
}`

    try {
      const secCompletion = await withRetry(() =>
        groq.chat.completions.create({
          model      : "llama-3.1-8b-instant",
          messages   : [{ role: "user", content: secPrompt }],
          temperature: 0.4,
          max_tokens : 500,
        })
      )
      const secRaw     = secCompletion.choices[0]?.message?.content?.trim() ?? ""
      const secCleaned = secRaw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
      const secMatch   = secCleaned.match(/\{[\s\S]*\}/)
      narrativeObj.security_analysis = JSON.parse(secMatch ? secMatch[0] : secCleaned)
    } catch {
      // Security analysis failed — don't block the full report, just skip it
      console.error("[Security AI] Failed to generate security analysis")
    }
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
