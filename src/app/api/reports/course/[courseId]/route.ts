export const maxDuration = 60

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import Groq from "groq-sdk"

// ─── shared data fetcher ────────────────────────────────────────────────────

async function fetchCourseData(courseId: string) {
  const [courseRes, examsRes] = await Promise.all([
    db.from("courses").select("id, name, groups(name)").eq("id", courseId).single(),
    db.from("exams")
      .select("id, title, passing_score, duration_minutes, created_at")
      .eq("course_id", courseId)
      .order("created_at"),
  ])

  const course = courseRes.data as any
  const exams = (examsRes.data ?? []) as any[]

  const examDataArr = await Promise.all(
    exams.map(async (exam: any) => {
      const candidatesRes = await db.from("candidates")
        .select("id, full_name, job_title, company, started_at, submitted_at, total_score, passed")
        .eq("exam_id", exam.id)
        .not("submitted_at", "is", null)

      const candidates = (candidatesRes.data ?? []) as any[]
      const candidateIds = candidates.map((c: any) => c.id)

      let sectionAvgs: { title: string; avg: number }[] = []

      // A candidate with rows in candidate_exam_questions has a frozen
      // random draw (from one bank, several banks — doesn't matter which).
      // Detecting this from the candidates' own data instead of an
      // exam-level "question_bank_id" column means this works the same
      // regardless of how many banks the exam is linked to.
      const { data: drawnRows } = candidateIds.length > 0
        ? await db.from("candidate_exam_questions")
            .select("candidate_id, question_id, questions(score, topic)")
            .in("candidate_id", candidateIds)
        : { data: [] }
      const allDrawn = (drawnRows ?? []) as any[]

      if (allDrawn.length > 0) {
        // Question Bank exam: candidates each answered a different subset,
        // so there's no shared exam_analyses row and no shared "possible"
        // denominator per topic — both must be computed per-candidate from
        // their own frozen draw (candidate_exam_questions).
        const qIds = [...new Set(allDrawn.map((d: any) => d.question_id))]

        let answers: any[] = []
        if (candidateIds.length > 0 && qIds.length > 0) {
          const { data } = await db.from("candidate_answers")
            .select("candidate_id, question_id, score_achieved")
            .in("candidate_id", candidateIds).in("question_id", qIds)
          answers = data ?? []
        }

        const topics = [...new Set(allDrawn.map((d: any) => (d.questions as any)?.topic ?? "General"))]
        sectionAvgs = topics.map(topic => {
          const cScores = candidates.map((c: any) => {
            const myDrawn = allDrawn.filter((d: any) => d.candidate_id === c.id && ((d.questions as any)?.topic ?? "General") === topic)
            const possible = myDrawn.reduce((s: number, d: any) => s + ((d.questions as any)?.score ?? 0), 0)
            if (possible === 0) return null
            const myQIds = new Set(myDrawn.map((d: any) => d.question_id))
            const earned = answers
              .filter((a: any) => a.candidate_id === c.id && myQIds.has(a.question_id))
              .reduce((s: number, a: any) => s + (a.score_achieved ?? 0), 0)
            return (earned / possible) * 100
          }).filter((v): v is number => v !== null)
          return { title: topic, avg: cScores.length ? cScores.reduce((s, v) => s + v, 0) / cScores.length : 0 }
        })
      } else {
        // Manual exam — unchanged from before this feature existed.
        const [questionsRes, analysisRes] = await Promise.all([
          db.from("questions").select("id, score").eq("exam_id", exam.id),
          db.from("exam_analyses").select("sections").eq("exam_id", exam.id).maybeSingle(),
        ])
        const questions = (questionsRes.data ?? []) as any[]
        const sections = ((analysisRes.data?.sections ?? []) as any[]).sort(
          (a: any, b: any) => a.order_index - b.order_index
        )

        let answers: any[] = []
        const questionIds = questions.map((q: any) => q.id)
        if (candidateIds.length > 0 && questionIds.length > 0) {
          const { data } = await db
            .from("candidate_answers")
            .select("candidate_id, question_id, score_achieved")
            .in("candidate_id", candidateIds)
            .in("question_id", questionIds)
          answers = data ?? []
        }

        // Per-section averages
        sectionAvgs = sections.map((section: any) => {
          const qIds: string[] = section.question_ids ?? []
          const sQs = questions.filter((q: any) => qIds.includes(q.id))
          const possible = sQs.reduce((s: number, q: any) => s + (q.score ?? 0), 0)
          if (possible === 0 || candidates.length === 0) return { title: section.title, avg: 0 }
          const sAnswers = answers.filter((a: any) => qIds.includes(a.question_id))
          const cScores = candidates.map((c: any) => {
            const earned = sAnswers
              .filter((a: any) => a.candidate_id === c.id)
              .reduce((s: number, a: any) => s + (a.score_achieved ?? 0), 0)
            return (earned / possible) * 100
          })
          return { title: section.title, avg: cScores.reduce((s: number, v: number) => s + v, 0) / cScores.length }
        })
      }

      const avgScore =
        candidates.length > 0
          ? candidates.reduce((s: number, c: any) => s + (c.total_score ?? 0), 0) / candidates.length
          : 0
      const passCount = candidates.filter((c: any) => c.passed).length
      const passRate = candidates.length > 0 ? (passCount / candidates.length) * 100 : 0

      return { exam, candidates, avgScore, passCount, passRate, sectionAvgs }
    })
  )

  // Build ranked candidates list with timeSpentMin for the rankings table
  const allCandidatesRanked = examDataArr
    .flatMap(({ exam, candidates }: any) =>
      candidates.map((c: any) => ({
        id: c.id,
        full_name: c.full_name,
        company: c.company ?? null,
        total_score: c.total_score ?? 0,
        passed: c.passed,
        examTitle: exam.title,
        timeSpentMin: (() => {
          if (!c.started_at || !c.submitted_at) return null
          const mins = Math.round((new Date(c.submitted_at).getTime() - new Date(c.started_at).getTime()) / 60000)
          return exam.duration_minutes ? Math.min(mins, exam.duration_minutes) : mins
        })(),
      }))
    )
    .sort((a: any, b: any) => b.total_score - a.total_score)

  const allScores = allCandidatesRanked.map((c: any) => c.total_score)
  const totalCandidates = allCandidatesRanked.length
  const allPassedCount = allCandidatesRanked.filter((c: any) => c.passed).length
  const overallPassRate = totalCandidates > 0 ? (allPassedCount / totalCandidates) * 100 : 0
  const overallAvg =
    totalCandidates > 0
      ? allCandidatesRanked.reduce((s: number, c: any) => s + c.total_score, 0) / totalCandidates
      : 0

  return {
    course,
    examDataArr,
    allCandidatesRanked,
    allScores,
    totalCandidates,
    overallPassRate,
    overallAvg,
  }
}

// ─── GET — return report data + cached narrative ─────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { courseId } = await params

  const { course, examDataArr, allCandidatesRanked, allScores, totalCandidates, overallPassRate, overallAvg } =
    await fetchCourseData(courseId)

  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Fetch cached narrative — query by type + reference_id only (exam_id varies by sentinel strategy)
  const { data: cached } = await db
    .from("report_cache")
    .select("narrative, generated_at")
    .eq("type", "course")
    .eq("reference_id", courseId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let narrative: any = null
  if (cached?.narrative) {
    try { narrative = JSON.parse(cached.narrative) } catch { narrative = null }
  }

  return NextResponse.json({
    course,
    exams: examDataArr.map(({ exam, candidates, avgScore, passCount, passRate, sectionAvgs }: any) => ({
      exam,
      candidateCount: candidates.length,
      avgScore,
      passCount,
      passRate,
      sectionAvgs,
    })),
    allCandidatesRanked,
    allScores,
    totalCandidates,
    overallPassRate,
    overallAvg,
    narrative,
    narrativeGeneratedAt: cached?.generated_at ?? null,
  })
}

// ─── POST — generate AI narrative ────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { allowed, retryAfterSeconds } = await rateLimit(`ai:${session.user.id}`, 10, 3600)
  if (!allowed) return res429(retryAfterSeconds)

  const { courseId } = await params

  const { course, examDataArr, totalCandidates, overallPassRate, overallAvg } =
    await fetchCourseData(courseId)

  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const courseName = course.name
  const groupName = (course as any).groups?.name ?? ""
  const examCount = examDataArr.length

  const examSummary = examDataArr
    .map(({ exam, candidates, avgScore, passRate, sectionAvgs }: any) => {
      const sectionLines =
        sectionAvgs.length > 0
          ? `\n  Sections: ${sectionAvgs.map((s: any) => `${s.title} ${s.avg.toFixed(1)}%`).join(" | ")}`
          : ""
      return `• ${exam.title}: ${candidates.length} candidates, avg ${avgScore.toFixed(1)}%, pass rate ${passRate.toFixed(1)}%${sectionLines}`
    })
    .join("\n")

  const examTitles = examDataArr.map(({ exam }: any) => exam.title)

  const courseSummaryInstruction =
    examCount === 1
      ? "course_summary: Write 2-3 concise sentences summarizing overall course performance."
      : `course_summary: Write a full paragraph (5-7 sentences) synthesizing performance trends and key observations across all ${examCount} exams.`

  const prompt = `You are an expert aviation training analyst. Analyze the following course performance data and generate a structured assessment.

Course: ${courseName}
Group: ${groupName}
Total Exams: ${examCount}
Total Candidates (all exams combined): ${totalCandidates}
Overall Pass Rate: ${overallPassRate.toFixed(1)}%
Overall Average Score: ${overallAvg.toFixed(1)}%

Per-Exam Breakdown:
${examSummary}

Return ONLY valid JSON (no markdown, no extra text) with this exact structure:
{
  "course_summary": "<${courseSummaryInstruction}>",
  "candidate_performance": "One paragraph describing overall candidate performance, engagement level, score distribution trends, and observable patterns across the course.",
  "at_risk_patterns": "One paragraph describing patterns specifically among candidates who failed or scored below the class average.",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "instructor_recommendations": [
    {"topic": "topic or section name", "action": "specific action the instructor should take", "priority": "high"},
    {"topic": "...", "action": "...", "priority": "medium"}
  ],
  "future_courses": ["recommended next course or topic 1", "recommended follow-up 2"],
  "exam_analyses": {
    ${examTitles.map((t: string) => `"${t}": {"summary": "1-2 sentences about this specific exam's results and standout observations.", "strengths": ["exam-specific strength 1"], "weaknesses": ["exam-specific weakness 1"]}`).join(",\n    ")}
  }
}`

  let narrative: any = null
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    let lastErr: any
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const completion = await groq.chat.completions.create({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 1400,
        })
        const raw = (completion.choices[0]?.message?.content ?? "")
          .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
        const match = raw.match(/\{[\s\S]*\}/)
        const cleaned = match ? match[0] : raw
        try { narrative = JSON.parse(cleaned) } catch { narrative = null }
        if (narrative) break
      } catch (err: any) {
        lastErr = err
        const isRate = err?.status === 429 || err?.message?.includes("rate")
        if (!isRate) break
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
      }
    }
    if (!narrative) {
      console.error("Course AI failed:", lastErr)
      return NextResponse.json({ error: "AI service temporarily unavailable. Please try again." }, { status: 503 })
    }
  } catch (err) {
    console.error("Course AI unexpected error:", err)
    return NextResponse.json({ error: "AI service temporarily unavailable. Please try again." }, { status: 503 })
  }

  // Cache — use the first real exam ID from this course to satisfy the FK constraint on exam_id.
  // DELETE existing entry first (avoids unique constraint conflicts), then INSERT fresh.
  const firstExamId = examDataArr[0]?.exam?.id as string | undefined
  if (firstExamId) {
    await db.from("report_cache")
      .delete()
      .eq("type", "course")
      .eq("reference_id", courseId)

    await db.from("report_cache").insert({
      type: "course",
      reference_id: courseId,
      exam_id: firstExamId,
      narrative: JSON.stringify(narrative),
      generated_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({ narrative })
}
