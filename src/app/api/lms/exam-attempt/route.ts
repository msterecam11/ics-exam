import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { syncEnrollmentProgress, checkCourseCompletion, checkLearningPathCompletion, checkCohortCompletion } from "@/lib/lms-completion"
import { scoreOpenEndedAnswer } from "@/lib/ai-scoring"

// POST /api/lms/exam-attempt
// Body: { module_id, course_id, score, max_score, pct, passed, answers, time_spent_s, security_events }
export async function POST(req: Request) {
  const studentSession = await getStudentSession()
  if (!studentSession)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const studentId = studentSession.id

  const body = await req.json().catch(() => ({}))
  const { module_id, course_id, score, max_score, pct, passed, answers, time_spent_s, security_events } = body

  if (!module_id) return NextResponse.json({ error: "module_id required" }, { status: 400 })
  if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 })

  // Verify the module exists and belongs to this course
  const { data: module } = await db
    .from("lms_modules")
    .select("id, questions, activity_settings")
    .eq("id", module_id)
    .eq("course_id", course_id)
    .single()

  if (!module) return NextResponse.json({ error: "Module not found" }, { status: 404 })

  // Count existing attempts
  const { count } = await db
    .from("lms_module_attempts")
    .select("*", { count: "exact", head: true })
    .eq("module_id", module_id)
    .eq("student_id", studentId)

  const settings = module.activity_settings as any
  const maxAttempts = settings?.max_attempts ?? 3

  if ((count ?? 0) >= maxAttempts)
    return NextResponse.json({ error: `Maximum ${maxAttempts} attempt(s) reached` }, { status: 409 })

  // AI-score any open_ended questions
  const questions: any[] = (module.questions as any[] | null) ?? []
  const openEndedQs = questions.filter((q: any) => q.type === "open_ended")
  const aiScores: Record<string, { score: number; justification: string }> = {}

  await Promise.all(openEndedQs.map(async (q: any) => {
    const studentAnswer = (answers as Record<string, any>)?.[q.id]
    if (typeof studentAnswer !== "string" || !studentAnswer.trim()) {
      aiScores[q.id] = { score: 0, justification: "No answer provided." }
      return
    }
    try {
      aiScores[q.id] = await scoreOpenEndedAnswer(
        q.text,
        q.rubric?.trim() || "Evaluate the answer for accuracy, completeness, and relevance.",
        studentAnswer,
        q.points ?? 1
      )
    } catch {
      // AI scoring failed — give partial credit so attempt is still saved
      aiScores[q.id] = { score: 0, justification: "AI grading unavailable." }
    }
  }))

  // Recalculate score with AI results (client sent 0 for open_ended)
  let correctedScore  = score ?? 0
  let correctedPct    = pct ?? 0
  let correctedPassed = passed ?? false

  if (openEndedQs.length > 0 && (max_score ?? 0) > 0) {
    const aiEarned = openEndedQs.reduce((sum: number, q: any) => sum + (aiScores[q.id]?.score ?? 0), 0)
    correctedScore  = (score ?? 0) + aiEarned
    correctedPct    = Math.round((correctedScore / max_score) * 100)
    correctedPassed = correctedPct >= (settings?.pass_mark ?? 70)
  }

  const attemptNo = (count ?? 0) + 1
  const now = new Date().toISOString()

  const { data: attempt, error } = await db
    .from("lms_module_attempts")
    .insert({
      module_id,
      student_id:   studentId,
      course_id,
      attempt_no:   attemptNo,
      status:       "graded",
      score:        correctedScore,
      max_score:    max_score ?? 0,
      passed:       correctedPassed,
      answers:      answers ?? [],
      ai_feedback:  {
        ...(openEndedQs.length > 0 ? { open_ended_scores: aiScores } : {}),
        ...(security_events       ? { security_events }              : {}),
      },
      time_spent_s: time_spent_s ?? null,
      started_at:   now,
      submitted_at: now,
    })
    .select("id, attempt_no, passed, score, max_score")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync progress + check completion
  if (course_id) {
    await syncEnrollmentProgress(studentId, course_id)
    if (correctedPassed) {
      // Run all completion checks in parallel — each is independently non-critical
      await Promise.all([
        checkCourseCompletion(studentId, course_id),
        checkLearningPathCompletion(studentId, course_id),
        checkCohortCompletion(studentId, course_id),
      ])
    }
    revalidatePath(`/lms/courses/${course_id}/exam/${module_id}`)
    revalidatePath(`/lms/courses/${course_id}`)
  }

  return NextResponse.json({
    attempt_id:  attempt.id,
    attempt_no:  attempt.attempt_no,
    score:       correctedScore,
    max_score,
    pct:         correctedPct,
    passed:      correctedPassed,
    ai_scores:   openEndedQs.length > 0 ? aiScores : undefined,
  })
}

// DELETE /api/lms/exam-attempt?module_id=xxx&student_id=xxx — admin only, resets all attempts
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || (session.user.role !== "admin" && session.user.role !== "instructor"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const moduleId  = searchParams.get("module_id")
  const studentId = searchParams.get("student_id")

  if (!moduleId || !studentId)
    return NextResponse.json({ error: "module_id and student_id required" }, { status: 400 })

  const { error } = await db
    .from("lms_module_attempts")
    .delete()
    .eq("module_id", moduleId)
    .eq("student_id", studentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// GET /api/lms/exam-attempt?module_id=xxx
export async function GET(req: Request) {
  const adminSession   = await auth()
  const studentSession = adminSession ? null : await getStudentSession()
  if (!adminSession && !studentSession)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const moduleId  = searchParams.get("module_id")
  const studentId = searchParams.get("student_id") ?? studentSession?.id

  if (!moduleId)  return NextResponse.json({ error: "module_id required" }, { status: 400 })
  if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (studentSession && studentId !== studentSession.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data, error } = await db
    .from("lms_module_attempts")
    .select("id, attempt_no, status, score, max_score, passed, submitted_at")
    .eq("module_id", moduleId)
    .eq("student_id", studentId)
    .order("attempt_no", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
