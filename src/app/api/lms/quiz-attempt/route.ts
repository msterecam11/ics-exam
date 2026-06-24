import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { scoreOpenEndedAnswer } from "@/lib/ai-scoring"

// POST /api/lms/quiz-attempt
// Body: { quiz_id, content_item_id, course_id, answers }
// answers: [{ question_id, choice_ids?, text_answer? }]
export async function POST(req: Request) {
  const adminSession   = await auth()
  const studentSession = adminSession ? null : await getStudentSession()
  if (!adminSession && !studentSession)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const studentId = studentSession?.id ?? null

  const body = await req.json().catch(() => ({}))
  const { quiz_id, content_item_id, course_id, answers } = body

  if (!quiz_id)  return NextResponse.json({ error: "quiz_id required" },  { status: 400 })
  if (!Array.isArray(answers))
    return NextResponse.json({ error: "answers array required" }, { status: 400 })

  // Students only can submit (admin has no student_id context for scoring)
  if (!studentId)
    return NextResponse.json({ error: "Students only" }, { status: 403 })

  // Get the quiz
  const { data: quiz, error: qErr } = await db
    .from("lms_quizzes")
    .select(`
      id, pass_score, max_attempts, show_answers_after,
      lms_quiz_questions(
        question_id,
        lms_questions(id, type, score, text, ai_scoring_guide, lms_question_choices(id, is_correct))
      )
    `)
    .eq("id", quiz_id)
    .single()

  if (qErr || !quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 })

  // Check attempt count
  if (quiz.max_attempts) {
    const { count } = await db
      .from("lms_quiz_attempts")
      .select("*", { count: "exact", head: true })
      .eq("quiz_id", quiz_id)
      .eq("student_id", studentId)
    if ((count ?? 0) >= quiz.max_attempts)
      return NextResponse.json(
        { error: `Maximum ${quiz.max_attempts} attempt(s) reached` },
        { status: 409 }
      )
  }

  // Score the submission
  let totalScore  = 0
  let earnedScore = 0
  const scored: {
    question_id: string
    correct: boolean
    earned: number
    max: number
    correct_choices?: string[]
  }[] = []

  const qqMap = new Map(
    (quiz.lms_quiz_questions ?? []).map((qq: any) => [qq.question_id, qq.lms_questions])
  )

  for (const a of answers) {
    const q = qqMap.get(a.question_id) as any
    if (!q) continue

    const qScore = q.score ?? 1
    totalScore  += qScore

    if (q.type === "open_ended") {
      const studentAnswer = typeof a.text_answer === "string" ? a.text_answer : ""
      let aiEarned = 0
      let aiJustification: string | undefined
      if (studentAnswer.trim()) {
        const guide = q.ai_scoring_guide?.trim()
          || "Evaluate the answer for accuracy, completeness, and relevance to the question."
        const aiResult = await scoreOpenEndedAnswer(q.text ?? "", guide, studentAnswer, qScore)
        aiEarned       = aiResult.score
        aiJustification = aiResult.justification
      }
      earnedScore += aiEarned
      scored.push({
        question_id: a.question_id,
        correct:     aiEarned >= qScore,
        earned:      aiEarned,
        max:         qScore,
        ...(aiJustification ? { ai_justification: aiJustification } : {}),
      } as any)
      continue
    }

    const correctChoiceIds = (q.lms_question_choices ?? [])
      .filter((c: any) => c.is_correct)
      .map((c: any) => c.id) as string[]

    const submittedIds: string[] = Array.isArray(a.choice_ids) ? a.choice_ids : []

    const isCorrect =
      correctChoiceIds.length === submittedIds.length &&
      correctChoiceIds.every(id => submittedIds.includes(id))

    const earned = isCorrect ? qScore : 0
    earnedScore += earned

    scored.push({
      question_id:     a.question_id,
      correct:         isCorrect,
      earned,
      max:             qScore,
      correct_choices: quiz.show_answers_after ? correctChoiceIds : undefined,
    })
  }

  const pct    = totalScore > 0 ? Math.round((earnedScore / totalScore) * 100) : 0
  const passed = pct >= (quiz.pass_score ?? 70)

  // Save attempt
  const { data: attempt, error: aErr } = await db
    .from("lms_quiz_attempts")
    .insert({
      quiz_id,
      student_id:    studentId,
      score:         earnedScore,
      total_score:   totalScore,
      passed,
      answers:       answers,     // raw submitted answers
      scored,                     // graded detail
      submitted_at:  new Date().toISOString(),
    })
    .select()
    .single()

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })

  // Mark content item progress as completed if passed
  if (content_item_id && course_id && passed) {
    const { data: module } = await db
      .from("lms_content_items")
      .select("module_id")
      .eq("id", content_item_id)
      .single()

    if (module) {
      await db.from("lms_progress").upsert({
        student_id:      studentId,
        content_item_id,
        module_id:       module.module_id,
        course_id,
        status:          "completed",
        completed_at:    new Date().toISOString(),
      }, { onConflict: "student_id,content_item_id" })
    }
  }

  return NextResponse.json({
    attempt_id:  attempt.id,
    score:       earnedScore,
    total_score: totalScore,
    pct,
    passed,
    scored:      quiz.show_answers_after ? scored : scored.map(s => ({
      question_id: s.question_id,
      correct:     s.correct,
      earned:      s.earned,
      max:         s.max,
    })),
  })
}

// GET /api/lms/quiz-attempt?quiz_id=xxx  — fetch student's past attempts
export async function GET(req: Request) {
  const adminSession   = await auth()
  const studentSession = adminSession ? null : await getStudentSession()
  if (!adminSession && !studentSession)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const quizId    = searchParams.get("quiz_id")
  const studentId = searchParams.get("student_id") ?? studentSession?.id

  if (!quizId)    return NextResponse.json({ error: "quiz_id required" },   { status: 400 })
  if (!studentId) return NextResponse.json({ error: "student_id required" }, { status: 400 })

  // Non-admins can only see their own attempts
  if (studentSession && studentId !== studentSession.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data, error } = await db
    .from("lms_quiz_attempts")
    .select("id, score, total_score, passed, submitted_at, scored")
    .eq("quiz_id", quizId)
    .eq("student_id", studentId)
    .order("submitted_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
