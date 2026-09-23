import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { getStudentSession, PREVIEW_READ_ONLY } from "@/lib/lms-auth"
import { guardStaff, staffScope, canSeeEnrollment, forbidden } from "@/lib/staff-access"
import { db } from "@/lib/db"
import { syncEnrollmentProgress, checkCourseCompletion } from "@/lib/lms-completion"
import { notifyLastAttempt } from "@/lib/lms-email-events"
import { scoreOpenEndedAnswer } from "@/lib/ai-scoring"
import { paperFor } from "@/lib/lms-exam-scoring"
import { examTimeLimitS, elapsedSince, EXAM_GRACE_S, UNLIMITED_EXAM_CAP_S } from "@/lib/lms-exam-session"
import { getWritableEnrollment, getCurrentEnrollment, getExamRules } from "@/lib/lms-enrollment"
import { scorePaper, type PaperQuestion } from "@/lib/lms-exam-bank"

// POST /api/lms/exam-attempt
// Body: { module_id, course_id, answers, security_events }
// Requires a session opened by POST /api/lms/exam-attempt/start.
// `score`/`max_score`/`pct`/`passed` are NEVER accepted from the client —
// every question type is graded here, server-side, against the module's
// current answer key (recalculateAttemptScore mirrors the same objective
// grading rules FinalExamPlayer.tsx uses for immediate on-screen feedback,
// but this server pass is the one that actually gets persisted/trusted).
export async function POST(req: Request) {
  const studentSession = await getStudentSession()
  if (!studentSession)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (studentSession.preview) return NextResponse.json(PREVIEW_READ_ONLY, { status: 403 })

  const studentId = studentSession.id

  const body = await req.json().catch(() => ({}))
  // time_spent_s may still be sent by older clients; it is ignored — duration is measured server-side.
  const { module_id, course_id, answers, security_events } = body

  if (!module_id) return NextResponse.json({ error: "module_id required" }, { status: 400 })
  if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 })

  // Verify the module exists, belongs to this course, and is actually a final
  // exam. Without the type check any module id in the course (e.g. a package)
  // was accepted and recorded as an exam attempt.
  const { data: module } = await db
    .from("lms_modules")
    .select("id, module_type, questions, activity_settings")
    .eq("id", module_id)
    .eq("course_id", course_id)
    .single()

  if (!module || (module as any).module_type !== "final_exam")
    return NextResponse.json({ error: "Module not found" }, { status: 404 })

  // The student must be enrolled in the course. The exam PAGE checks this, but
  // the submission endpoint did not — and a passing attempt runs
  // checkCourseCompletion, whose certificate issuance does not look at
  // enrollment either. So a passing submission from outside the course would
  // have produced a certificate for a course the student was never enrolled in.
  const writable = await getWritableEnrollment(studentId, course_id)
  if (!writable.ok) return NextResponse.json({ error: writable.error }, { status: writable.status })
  const enrollment = writable.enrollment

  // Single source of truth for the exam pass mark: the course-level
  // `final_exam_pass_mark` (edited in Course Settings) governs. We fall back to
  // the exam module's own `activity_settings.pass_mark`, then 70. This prevents
  // the two from diverging — grading always agrees with the course setting.
  const { data: course } = await db
    .from("lms_courses")
    .select("final_exam_pass_mark")
    .eq("id", course_id)
    .single()

  // Count existing attempts — of THIS enrollment (a retake starts from zero)
  const { count } = await db
    .from("lms_module_attempts")
    .select("*", { count: "exact", head: true })
    .eq("module_id", module_id)
    .eq("enrollment_id", enrollment.id)

  const settings = module.activity_settings as any
  // Program rules first (pass mark / attempts per program), else the course's.
  const rules = await getExamRules(enrollment, course as any, settings)
  const maxAttempts = rules.maxAttempts

  if ((count ?? 0) >= maxAttempts)
    return NextResponse.json({ error: `Maximum ${maxAttempts} attempt(s) reached` }, { status: 409 })

  // ── Server-side timing ──────────────────────────────────────────────────
  // A submission must belong to a session opened by /exam-attempt/start. The
  // session is CLAIMED here, before the slow AI grading, with a conditional
  // update — so a double submit can't both proceed, and elapsed time comes from
  // the server's own start timestamp instead of the browser's time_spent_s.
  // (Previously started_at was stamped at submission, and the time limit
  // existed only as a countdown the student's own browser controlled.)
  const { data: openSession } = await db
    .from("lms_exam_sessions")
    .select("id")
    .eq("enrollment_id", enrollment.id)
    .eq("module_id", module_id)
    .is("submitted_at", null)
    .maybeSingle()

  if (!openSession)
    return NextResponse.json(
      { error: "No active exam session was found. Please return to the exam and press Begin Exam again." },
      { status: 409 }
    )

  const submittedAt = new Date()
  const { data: claimed } = await db
    .from("lms_exam_sessions")
    .update({ submitted_at: submittedAt.toISOString() })
    .eq("id", openSession.id)
    .is("submitted_at", null)
    .select("id, started_at, paper")
    .maybeSingle()

  if (!claimed)
    return NextResponse.json({ error: "This exam has already been submitted." }, { status: 409 })

  const limitS    = examTimeLimitS(settings)
  const elapsedS  = elapsedSince(claimed.started_at, submittedAt)
  // Over the limit plus a grace window for network delay on the auto-submit.
  // The attempt is still graded and stored — the answers are evidence and the
  // student should see them — but it cannot count as a pass.
  const overTime  = limitS !== null && elapsedS > limitS + EXAM_GRACE_S

  // Grade against the paper frozen when this session opened, not the module's
  // current questions — an edit made while the student was sitting the exam
  // must not change what they are marked on. (Sessions opened before frozen
  // papers fall back to the current questions.)
  const questions: any[] = paperFor(claimed as any, module.questions)

  // AI-score any open_ended questions
  const openEndedQs = questions.filter((q: any) => q.type === "open_ended" && !q.voided)
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

  // Authoritative pass mark (program rule → course setting → module setting → 70).
  const passMark = rules.passMark

  // Grade every objective question (mcq/ordering/matching) server-side against
  // the module's current answer key, then add the AI-graded open_ended sum —
  // this function is never given a client-supplied score to start from.
  // The same scorer Recalculate uses, so a submission and a later re-mark of
  // the same paper can never disagree. Voided questions count for nobody.
  const { score: correctedScore, maxScore: correctedMaxScore, pct: correctedPct } = scorePaper(
    questions as PaperQuestion[],
    (answers as Record<string, any>) ?? {},
    aiScores
  )

  const correctedPassed = !overTime && correctedPct >= passMark

  const attemptNo = (count ?? 0) + 1

  // Recorded duration is the SERVER-measured elapsed time. The browser's own
  // time_spent_s is no longer trusted for anything. Capped at the limit (or 24h
  // for untimed exams) because it rolls into the student's learning time; the
  // true elapsed figure is kept in ai_feedback when the limit was exceeded.
  const recordedTimeS = Math.min(elapsedS, limitS ?? UNLIMITED_EXAM_CAP_S)

  const { data: attempt, error } = await db
    .from("lms_module_attempts")
    .insert({
      module_id,
      student_id:   studentId,
      enrollment_id: enrollment.id,
      course_id,
      attempt_no:   attemptNo,
      status:       "graded",
      score:        correctedScore,
      max_score:    correctedMaxScore,
      passed:       correctedPassed,
      answers:      answers ?? [],
      paper:        questions,
      ai_feedback:  {
        ...(openEndedQs.length > 0 ? { open_ended_scores: aiScores } : {}),
        ...(security_events       ? { security_events }              : {}),
        ...(overTime ? { time_limit_exceeded: true, elapsed_s: elapsedS, time_limit_s: limitS } : {}),
      },
      time_spent_s: recordedTimeS,
      started_at:   claimed.started_at,
      submitted_at: submittedAt.toISOString(),
    })
    .select("id, attempt_no, passed, score, max_score")
    .single()

  if (error) {
    // The session was already claimed. Release it so the student can resubmit
    // from the same session rather than losing the attempt to a transient error.
    await db.from("lms_exam_sessions").update({ submitted_at: null }).eq("id", claimed.id)
    return NextResponse.json({ error: "Could not save your attempt. Please try submitting again." }, { status: 500 })
  }

  await db.from("lms_exam_sessions").update({ attempt_id: attempt.id }).eq("id", claimed.id)

  // Sync progress + check completion
  if (course_id) {
    await syncEnrollmentProgress(studentId, course_id, enrollment.id)
    // Always ask: a course with a pass rule can complete on a failed exam when
    // the exam isn't required and the weighted score carries it.
    await checkCourseCompletion(studentId, course_id, enrollment.id)
    if (!correctedPassed && attempt.attempt_no === maxAttempts - 1) {
      // EM-8 — failed with exactly one attempt left. Never fatal to the
      // submission, so a mail problem can't cost the student their result.
      notifyLastAttempt({
        studentId, courseId: course_id, programId: enrollment.program_id ?? null,
        scorePct: Math.round(correctedPct), passMark, attemptsUsed: attempt.attempt_no, maxAttempts,
      }).catch(err => console.error("[email] last-attempt notice failed", err))
    }
    revalidatePath(`/lms/courses/${course_id}/exam/${module_id}`)
    revalidatePath(`/lms/courses/${course_id}`)
  }

  return NextResponse.json({
    attempt_id:  attempt.id,
    attempt_no:  attempt.attempt_no,
    time_limit_exceeded: overTime,
    score:       correctedScore,
    max_score:   correctedMaxScore,
    pct:         correctedPct,
    passed:      correctedPassed,
    ai_scores:   openEndedQs.length > 0 ? aiScores : undefined,
  })
}

// DELETE /api/lms/exam-attempt?module_id=xxx&student_id=xxx — admin only, resets all attempts
export async function DELETE(req: Request) {
  // IR-14 — an instructor with "Reset attempts", for a student of theirs.
  const g = await guardStaff({ permission: "reset_attempts" })
  if (!g.ok) return g.res

  const { searchParams } = new URL(req.url)
  const moduleId  = searchParams.get("module_id")
  const studentId = searchParams.get("student_id")

  if (!moduleId || !studentId)
    return NextResponse.json({ error: "module_id and student_id required" }, { status: 400 })

  // Resets the attempts of the student's CURRENT enrollment only — attempts
  // from earlier programs are history and stay.
  const { data: mod } = await db.from("lms_modules").select("course_id").eq("id", moduleId).maybeSingle()
  const current = await getCurrentEnrollment(studentId, (mod as any)?.course_id)
  if (!current) return NextResponse.json({ error: "Student is not enrolled in this course" }, { status: 404 })
  if (!(await canSeeEnrollment(g.scope, current.id))) return forbidden()

  await db.from("lms_exam_sessions").delete().eq("module_id", moduleId).eq("enrollment_id", current.id)
  const { error } = await db
    .from("lms_module_attempts")
    .delete()
    .eq("module_id", moduleId)
    .eq("enrollment_id", current.id)

  if (error) return NextResponse.json({ error: "Could not reset attempts" }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// GET /api/lms/exam-attempt?module_id=xxx
export async function GET(req: Request) {
  // Staff access was granted to ANY admin_users session, including `viewer`
  // and `assessor` accounts, which then could read any student's attempt
  // history just by passing student_id — bypassing the per-course/cohort
  // viewer_access grants that scope what a viewer may see everywhere else.
  // Only managers get the unscoped read; nothing in the UI calls this as any
  // other staff role.
  const staff          = await auth()
  const adminSession   = staff && (staff.user.role === "admin" || staff.user.role === "instructor") ? staff : null
  const staffScopeNow  = adminSession ? await staffScope({ id: adminSession.user.id, role: adminSession.user.role }) : null
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

  const { data: mod } = await db.from("lms_modules").select("course_id").eq("id", moduleId).maybeSingle()
  const current = await getCurrentEnrollment(studentId, (mod as any)?.course_id)
  if (!current) return NextResponse.json([])
  // Staff: an instructor only for a student of their own programs (and tracks).
  if (staffScopeNow && !(await canSeeEnrollment(staffScopeNow, current.id))) return forbidden()

  const { data, error } = await db
    .from("lms_module_attempts")
    .select("id, attempt_no, status, score, max_score, passed, submitted_at")
    .eq("module_id", moduleId)
    .eq("enrollment_id", current.id)
    .order("attempt_no", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
