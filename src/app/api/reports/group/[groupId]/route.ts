export const maxDuration = 60

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import Groq from "groq-sdk"

// ─── shared data fetcher ────────────────────────────────────────────────────

async function fetchGroupData(groupId: string) {
  const [groupRes, coursesRes] = await Promise.all([
    db.from("groups").select("id, name").eq("id", groupId).single(),
    db.from("courses").select("id, name").eq("group_id", groupId).order("name"),
  ])

  const group = groupRes.data as any
  const courses = (coursesRes.data ?? []) as any[]

  const courseDataArr = await Promise.all(
    courses.map(async (course: any) => {
      const examsRes = await db.from("exams")
        .select("id, title, passing_score, created_at, duration_minutes")
        .eq("course_id", course.id)
        .order("created_at")
      const exams = (examsRes.data ?? []) as any[]

      const examDataArr = await Promise.all(
        exams.map(async (exam: any) => {
          const candidatesRes = await db.from("candidates")
            .select("id, full_name, company, started_at, submitted_at, total_score, passed")
            .eq("exam_id", exam.id)
            .not("submitted_at", "is", null)

          const candidates = (candidatesRes.data ?? []) as any[]
          const cIds = candidates.map((c: any) => c.id)

          let sectionAvgs: { title: string; avg: number }[] = []

          // A candidate with rows in candidate_exam_questions has a frozen
          // random draw (from one bank, several banks — doesn't matter
          // which). Detecting this from the candidates' own data instead of
          // an exam-level "question_bank_id" column means this works the
          // same regardless of how many banks the exam is linked to.
          const { data: drawnRows } = cIds.length > 0
            ? await db.from("candidate_exam_questions")
                .select("candidate_id, question_id, questions(score, topic)")
                .in("candidate_id", cIds)
            : { data: [] }
          const allDrawn = (drawnRows ?? []) as any[]

          if (allDrawn.length > 0) {
            // Question Bank exam: candidates each answered a different subset,
            // so there's no shared exam_analyses row and no shared "possible"
            // denominator per topic — both must be computed per-candidate from
            // their own frozen draw (candidate_exam_questions).
            const qIds = [...new Set(allDrawn.map((d: any) => d.question_id))]

            let answers: any[] = []
            if (cIds.length > 0 && qIds.length > 0) {
              const { data } = await db.from("candidate_answers")
                .select("candidate_id, question_id, score_achieved")
                .in("candidate_id", cIds).in("question_id", qIds)
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
            const qIds = questions.map((q: any) => q.id)
            if (cIds.length > 0 && qIds.length > 0) {
              const { data } = await db
                .from("candidate_answers")
                .select("candidate_id, question_id, score_achieved")
                .in("candidate_id", cIds)
                .in("question_id", qIds)
              answers = data ?? []
            }

            sectionAvgs = sections.map((section: any) => {
              const sqIds: string[] = section.question_ids ?? []
              const sQs = questions.filter((q: any) => sqIds.includes(q.id))
              const possible = sQs.reduce((s: number, q: any) => s + (q.score ?? 0), 0)
              if (possible === 0 || candidates.length === 0) return { title: section.title, avg: 0 }
              const sAns = answers.filter((a: any) => sqIds.includes(a.question_id))
              const cScores = candidates.map((c: any) => {
                const earned = sAns
                  .filter((a: any) => a.candidate_id === c.id)
                  .reduce((s: number, a: any) => s + (a.score_achieved ?? 0), 0)
                return (earned / possible) * 100
              })
              return { title: section.title, avg: cScores.reduce((s: number, v: number) => s + v, 0) / cScores.length }
            })
          }

          const avgScore = candidates.length > 0
            ? candidates.reduce((s: number, c: any) => s + (c.total_score ?? 0), 0) / candidates.length : 0
          const passCount = candidates.filter((c: any) => c.passed).length
          const passRate = candidates.length > 0 ? (passCount / candidates.length) * 100 : 0

          return { exam, candidates, sectionAvgs, avgScore, passCount, passRate }
        })
      )

      // All submissions for this course (with timeSpentMin)
      const allCourseSubmissions = examDataArr.flatMap(({ exam, candidates }: any) =>
        candidates.map((c: any) => ({
          id: c.id,
          full_name: c.full_name,
          company: c.company ?? null,
          total_score: c.total_score ?? 0,
          passed: c.passed,
          examTitle: exam.title,
          examId: exam.id,
          courseName: course.name,
          courseId: course.id,
          timeSpentMin: (() => {
            if (!c.started_at || !c.submitted_at) return null
            // Elapsed wall-clock, capped at the exam's time limit — a learner can't
            // actively spend more than the allotted time on a timed exam (the excess
            // is idle/away time before an auto-submit on return).
            const mins = Math.round((new Date(c.submitted_at).getTime() - new Date(c.started_at).getTime()) / 60000)
            return exam.duration_minutes ? Math.min(mins, exam.duration_minutes) : mins
          })(),
        }))
      )

      const courseAvgScore = allCourseSubmissions.length > 0
        ? allCourseSubmissions.reduce((s: number, c: any) => s + c.total_score, 0) / allCourseSubmissions.length : 0
      const coursePassCount = allCourseSubmissions.filter((c: any) => c.passed).length
      const courseTotalCandidates = allCourseSubmissions.length
      const coursePassRate = courseTotalCandidates > 0 ? (coursePassCount / courseTotalCandidates) * 100 : 0

      // Per-course leaderboard: aggregate submissions by candidate name
      const nameMap = new Map<string, { name: string; scores: number[]; passCount: number }>()
      allCourseSubmissions.forEach((c: any) => {
        if (!nameMap.has(c.full_name)) nameMap.set(c.full_name, { name: c.full_name, scores: [], passCount: 0 })
        const entry = nameMap.get(c.full_name)!
        entry.scores.push(c.total_score)
        if (c.passed) entry.passCount++
      })
      const courseLeaderboard = Array.from(nameMap.values())
        .map(e => ({
          name: e.name,
          examsTaken: e.scores.length,
          avgScore: e.scores.reduce((s, v) => s + v, 0) / e.scores.length,
          passCount: e.passCount,
          totalExams: e.scores.length,
        }))
        .sort((a, b) => b.avgScore - a.avgScore)

      // Aggregate section averages across all exams in this course (for radar)
      const sectionMap = new Map<string, { sum: number; count: number }>()
      examDataArr.forEach(({ sectionAvgs }: any) => {
        sectionAvgs.forEach(({ title, avg }: any) => {
          if (!sectionMap.has(title)) sectionMap.set(title, { sum: 0, count: 0 })
          const entry = sectionMap.get(title)!
          entry.sum += avg
          entry.count++
        })
      })
      const aggregatedSectionAvgs = Array.from(sectionMap.entries())
        .map(([title, { sum, count }]) => ({ title, avg: sum / count }))

      return {
        course,
        examDataArr,
        allCourseSubmissions,
        courseAvgScore,
        coursePassCount,
        courseTotalCandidates,
        coursePassRate,
        courseLeaderboard,
        aggregatedSectionAvgs,
      }
    })
  )

  // All group submissions sorted by score
  const allSubmissions = courseDataArr
    .flatMap((cd: any) => cd.allCourseSubmissions)
    .sort((a: any, b: any) => b.total_score - a.total_score)

  const allScores = allSubmissions.map((c: any) => c.total_score)
  const totalCandidates = allSubmissions.length
  const allPassedCount = allSubmissions.filter((c: any) => c.passed).length
  const overallPassRate = totalCandidates > 0 ? (allPassedCount / totalCandidates) * 100 : 0
  const overallAvg = totalCandidates > 0
    ? allSubmissions.reduce((s: number, c: any) => s + c.total_score, 0) / totalCandidates : 0
  const totalExams = courseDataArr.reduce((s: number, cd: any) => s + cd.examDataArr.length, 0)

  // Unique candidate stats for AI prompt (top/bottom performers)
  const candidateMap = new Map<string, { name: string; scores: number[]; passCount: number }>()
  allSubmissions.forEach((c: any) => {
    if (!candidateMap.has(c.full_name)) candidateMap.set(c.full_name, { name: c.full_name, scores: [], passCount: 0 })
    const entry = candidateMap.get(c.full_name)!
    entry.scores.push(c.total_score)
    if (c.passed) entry.passCount++
  })
  const uniqueCandidateStats = Array.from(candidateMap.values())
    .map(e => ({
      name: e.name,
      avgScore: e.scores.reduce((s, v) => s + v, 0) / e.scores.length,
      passCount: e.passCount,
      totalExams: e.scores.length,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)

  // First real exam ID for report_cache FK sentinel
  const firstExamId = courseDataArr[0]?.examDataArr[0]?.exam?.id as string | undefined

  return {
    group,
    courseDataArr,
    allSubmissions,
    allScores,
    totalCandidates,
    allPassedCount,
    overallPassRate,
    overallAvg,
    totalExams,
    uniqueCandidateStats,
    firstExamId,
  }
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { groupId } = await params
  const { group, courseDataArr, allSubmissions, allScores, totalCandidates, allPassedCount, overallPassRate, overallAvg, totalExams } =
    await fetchGroupData(groupId)

  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: cached } = await db
    .from("report_cache")
    .select("narrative, generated_at")
    .eq("type", "group")
    .eq("reference_id", groupId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let narrative: any = null
  if (cached?.narrative) {
    try { narrative = JSON.parse(cached.narrative) } catch { narrative = null }
  }

  return NextResponse.json({
    group,
    courses: courseDataArr.map(({ course, examDataArr, courseAvgScore, coursePassCount, courseTotalCandidates, coursePassRate, courseLeaderboard, aggregatedSectionAvgs }: any) => ({
      course,
      exams: examDataArr.map(({ exam, avgScore, passCount, passRate, sectionAvgs }: any) => ({
        exam, avgScore, passCount, passRate, sectionAvgs,
      })),
      courseAvgScore,
      coursePassCount,
      courseTotalCandidates,
      coursePassRate,
      courseLeaderboard,
      aggregatedSectionAvgs,
    })),
    allSubmissions,
    allScores,
    totalCandidates,
    allPassedCount,
    overallPassRate,
    overallAvg,
    totalExams,
    narrative,
    narrativeGeneratedAt: cached?.generated_at ?? null,
  })
}

// ─── POST — generate AI narrative ────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { allowed, retryAfterSeconds } = await rateLimit(`ai:${session.user.id}`, 10, 3600)
  if (!allowed) return res429(retryAfterSeconds)

  const { groupId } = await params
  const { group, courseDataArr, totalCandidates, overallPassRate, overallAvg, totalExams, uniqueCandidateStats, firstExamId } =
    await fetchGroupData(groupId)

  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const courseCount = courseDataArr.length
  const groupSummaryInstruction = courseCount === 1
    ? "2-3 concise sentences summarizing overall group performance."
    : `A full paragraph (5-7 sentences) synthesizing performance trends and key observations across all ${courseCount} courses.`

  const courseSummary = courseDataArr
    .map(({ course, examDataArr, courseAvgScore, coursePassRate, courseTotalCandidates }: any) => {
      const examLines = examDataArr.map(({ exam, avgScore, passRate, candidates }: any) =>
        `  - ${exam.title}: ${candidates?.length ?? 0} candidates, avg ${avgScore.toFixed(1)}%, pass rate ${passRate.toFixed(1)}%`
      ).join("\n")
      return `• ${course.name}: ${courseTotalCandidates} candidates, avg ${courseAvgScore.toFixed(1)}%, pass rate ${coursePassRate.toFixed(1)}%\n${examLines}`
    })
    .join("\n")

  const top5 = uniqueCandidateStats.slice(0, 5)
    .map(c => `  - ${c.name}: avg ${c.avgScore.toFixed(1)}%, ${c.totalExams} exam(s), ${c.passCount}/${c.totalExams} passed`)
    .join("\n")

  const bottom5 = uniqueCandidateStats.slice(-5).reverse()
    .map(c => `  - ${c.name}: avg ${c.avgScore.toFixed(1)}%, ${c.totalExams} exam(s), ${c.passCount}/${c.totalExams} passed`)
    .join("\n")

  const courseTitles = courseDataArr.map(({ course }: any) => course.name)

  const prompt = `You are an expert aviation training analyst. Analyze the following group performance data across all courses and generate a structured assessment.

Group: ${group.name}
Total Courses: ${courseCount}
Total Exams: ${totalExams}
Total Candidates (all submissions): ${totalCandidates}
Overall Pass Rate: ${overallPassRate.toFixed(1)}%
Overall Average Score: ${overallAvg.toFixed(1)}%

Per-Course Breakdown:
${courseSummary}

Top Performers:
${top5 || "  - No data"}

Candidates Needing Development:
${bottom5 || "  - No data"}

Return ONLY valid JSON (no markdown) with this exact structure:
{
  "group_summary": "${groupSummaryInstruction}",
  "cross_course_insights": "One paragraph comparing course performance against each other — which courses performed best/worst and why.",
  "candidate_performance": "One paragraph on overall candidate engagement, score distribution, and observable trends.",
  "at_risk_patterns": "One paragraph on patterns among candidates who failed or scored below the group average.",
  "group_readiness": "One paragraph assessing the group's overall readiness for certification or advancement to the next training level.",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "top_candidates": [
    {"name": "exact candidate name from top performers list", "note": "brief note on what makes them stand out"}
  ],
  "development_candidates": [
    {"name": "exact candidate name from needs-development list", "note": "brief note on what they need to work on"}
  ],
  "instructor_recommendations": [
    {"topic": "topic name", "action": "specific action", "priority": "high"},
    {"topic": "...", "action": "...", "priority": "medium"}
  ],
  "future_courses": ["recommended next course 1", "follow-up 2"],
  "course_analyses": {
    ${courseTitles.map((t: string) => `"${t}": {"summary": "1-2 sentences about this course's results.", "strengths": ["course-specific strength"], "weaknesses": ["course-specific weakness"]}`).join(",\n    ")}
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
          max_tokens: 1800,
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
      console.error("Group AI failed:", lastErr)
      return NextResponse.json({ error: "AI service temporarily unavailable. Please try again." }, { status: 503 })
    }
  } catch (err) {
    console.error("Group AI unexpected error:", err)
    return NextResponse.json({ error: "AI service temporarily unavailable. Please try again." }, { status: 503 })
  }

  // DELETE existing + INSERT fresh with real exam ID to satisfy FK constraint
  if (firstExamId) {
    await db.from("report_cache").delete().eq("type", "group").eq("reference_id", groupId)
    await db.from("report_cache").insert({
      type: "group",
      reference_id: groupId,
      exam_id: firstExamId,
      narrative: JSON.stringify(narrative),
      generated_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({ narrative })
}
