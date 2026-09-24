import { NextResponse } from "next/server"
import { notifyGradingDue } from "@/lib/lms-email-events"
import { auth } from "@/lib/auth"
import { getStudentSession, PREVIEW_READ_ONLY } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { scoreOpenEndedAnswer } from "@/lib/ai-scoring"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import { getCurrentEnrollment, getWritableEnrollment } from "@/lib/lms-enrollment"
import { checkCourseCompletion, syncEnrollmentProgress } from "@/lib/lms-completion"
import { guardStaff, canSeeStudent, forbidden, staffScope, visibleEnrollmentIdsForCourse } from "@/lib/staff-access"
import { isMgr } from "@/lib/staff-roles"
import { itemGate } from "@/lib/lms-groups"

const BUCKET = "lms-submissions"
const SIGNED_URL_SECONDS = 60 * 60

// Submitted files live in lms-submissions, a PRIVATE bucket, and are recorded
// as a storage PATH in answers.file_path rather than as a URL.
//
// They used to go to lms-library (public:true) and be stored as a permanent
// public URL — a student's submitted work readable by anyone who ever saw the
// link. Note that signing alone would not have fixed that: in a public bucket
// the public URL for the same path keeps working regardless. The bucket has to
// be private, which is why submissions now have their own.
//
// Callers reaching this point are already authorised, so mint a short-lived
// signed URL and expose it as answers.file_url — the shape every existing
// reader (admin grading views, progress pages) already expects.
async function signAnswerFiles<T extends { answers?: any }>(rows: T[]): Promise<T[]> {
  const paths = rows
    .map(r => r?.answers?.file_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0)
  if (paths.length === 0) return rows

  const { data: signed } = await db.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS)
  const byPath = new Map((signed ?? []).map(s => [s.path, s.signedUrl]))

  return rows.map(r =>
    r?.answers?.file_path
      ? { ...r, answers: { ...r.answers, file_url: byPath.get(r.answers.file_path) ?? null } }
      : r
  )
}

// GET — student: own submissions for a module
//       admin: all submissions for a module
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const moduleId = searchParams.get("module_id")
  if (!moduleId) return NextResponse.json({ error: "module_id required" }, { status: 400 })

  const adminSession = await auth()
  if (adminSession && isMgr(adminSession.user.role)) {
    // Assignment submissions only (this is not a way to read exam attempts),
    // and an instructor sees their own programs' (and tracks') students only.
    const { data: mod } = await db.from("lms_modules").select("course_id, module_type").eq("id", moduleId).maybeSingle()
    if (!mod || (mod as any).module_type !== "assignment") return NextResponse.json([])
    const scope = await staffScope({ id: adminSession.user.id, role: adminSession.user.role })
    const visible = await visibleEnrollmentIdsForCourse(scope, (mod as any).course_id)
    const { data, error } = await db
      .from("lms_module_attempts")
      .select(`
        id, attempt_no, status, score, max_score, passed, enrollment_id,
        answers, ai_feedback, submitted_at,
        lms_students(id, name, email)
      `)
      .eq("module_id", moduleId)
      .order("submitted_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const mine = ((data ?? []) as any[]).filter(a => visible === "all" || visible.has(a.enrollment_id))
    return NextResponse.json(await signAnswerFiles(mine))
  }

  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Submissions of the student's current enrollment in the module's course.
  const { data: mod } = await db.from("lms_modules").select("course_id, activity_settings").eq("id", moduleId).maybeSingle()
  const enrollment = await getCurrentEnrollment(student.id, (mod as any)?.course_id)
  if (!enrollment || enrollment.access === "none") return NextResponse.json([])

  const { data, error } = await db
    .from("lms_module_attempts")
    .select("id, attempt_no, status, score, max_score, passed, answers, ai_feedback, submitted_at")
    .eq("module_id", moduleId)
    .eq("enrollment_id", enrollment.id)
    .order("attempt_no", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // A mark reaches the participant once released — or at once when the
  // assignment releases automatically.
  const manualRelease = (mod as any)?.activity_settings?.manual_release !== false
  const visible = ((data ?? []) as any[]).map(a =>
    a.status === "graded" && manualRelease ? { ...a, status: "submitted", score: null, max_score: null, passed: null, ai_feedback: null } : a)
  return NextResponse.json(await signAnswerFiles(visible))
}

// POST — student submits an assignment
// Body: { module_id, course_id, file_url, file_name, file_size }
export async function POST(req: Request) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (student.preview) return NextResponse.json(PREVIEW_READ_ONLY, { status: 403 })

  const { allowed, retryAfterSeconds } = await rateLimit(`lms-assignment-submit:${student.id}`, 20, 60)
  if (!allowed) return res429(retryAfterSeconds)

  const body = await req.json().catch(() => ({}))
  const { module_id, course_id, file_path, file_name, file_size, text_response } = body

  if (!module_id)  return NextResponse.json({ error: "module_id required" },  { status: 400 })
  if (!course_id)  return NextResponse.json({ error: "course_id required" },  { status: 400 })
  if (!file_path && !text_response?.trim())
    return NextResponse.json({ error: "Provide a file or a written response" }, { status: 400 })

  // The file is identified by its storage path, and that path must be one THIS
  // student uploaded. The client previously passed a file_url that was stored
  // verbatim, so a student could submit any URL as their work — including
  // another student's file. /api/lms/student-upload writes to
  // submissions/<studentId>/..., so requiring that prefix ties file to uploader.
  if (file_path && !String(file_path).startsWith(`submissions/${student.id}/`))
    return NextResponse.json({ error: "Invalid file reference" }, { status: 400 })

  // Verify module + check max attempts
  const { data: module } = await db
    .from("lms_modules")
    .select("id, title, assignment_max_attempts, assignment_due_date, assignment_rubric, activity_settings")
    .eq("id", module_id)
    .eq("course_id", course_id)
    .single()

  if (!module) return NextResponse.json({ error: "Module not found" }, { status: 404 })

  // No enrollment check existed: any signed-in student could submit an
  // assignment (and trigger AI grading) in any course by id.
  const writable = await getWritableEnrollment(student.id, course_id)
  if (!writable.ok) return NextResponse.json({ error: writable.error }, { status: writable.status })
  const enrollment = writable.enrollment

  // The group's instructor may have locked it.
  const gate = await itemGate(enrollment.group_id, { id: module_id, module_type: "assignment" })
  if (!gate.open) return NextResponse.json({ error: gate.message, locked: true }, { status: 403 })

  // Due date check
  if (module.assignment_due_date) {
    if (new Date() > new Date(module.assignment_due_date))
      return NextResponse.json({ error: "Submission deadline has passed" }, { status: 409 })
  }

  // Count existing attempts
  const { count } = await db
    .from("lms_module_attempts")
    .select("*", { count: "exact", head: true })
    .eq("module_id", module_id)
    .eq("enrollment_id", enrollment.id)

  const maxAttempts = module.assignment_max_attempts ?? 99
  if ((count ?? 0) >= maxAttempts)
    return NextResponse.json({ error: `Maximum ${maxAttempts} submission(s) reached` }, { status: 409 })

  // AI grading against rubric (only when student wrote a text response)
  type Criterion = { id: string; criterion: string; description: string; points: number }
  const rubric = (module.assignment_rubric as Criterion[] | null) ?? []
  const maxScore = rubric.reduce((s, c) => s + c.points, 0)

  let aiScore = 0
  const criteriaScores: Array<{ criterion: string; score: number; max: number; comment: string }> = []
  let overallComment = ""
  let passed = false
  let status: "submitted" | "graded" = "submitted"

  if (text_response?.trim() && rubric.length > 0) {
    await Promise.all(rubric.map(async (criterion) => {
      const guide = [criterion.criterion, criterion.description].filter(Boolean).join(" — ")
      const result = await scoreOpenEndedAnswer(module.title ?? "Assignment", guide, text_response, criterion.points)
      criteriaScores.push({ criterion: criterion.criterion, score: result.score, max: criterion.points, comment: result.justification })
    }))
    aiScore       = criteriaScores.reduce((s, c) => s + c.score, 0)
    overallComment = criteriaScores.map(c => `**${c.criterion}** (${c.score}/${c.max}): ${c.comment}`).join("\n\n")
    // Same threshold as the admin re-grade (grade-assignment-ai): the module's
    // pass_mark if set, else 60%. This was a hardcoded 60% while re-grading used
    // the module setting (default 70), so the two could disagree on a pass.
    const passMark = Number((module as any).activity_settings?.pass_mark ?? 60)
    passed        = maxScore > 0 && (aiScore / maxScore) * 100 >= passMark
    status        = "graded"
  }

  const now       = new Date().toISOString()
  const attemptNo = (count ?? 0) + 1

  const { data: attempt, error } = await db
    .from("lms_module_attempts")
    .insert({
      module_id,
      student_id:   student.id,
      enrollment_id: enrollment.id,
      course_id,
      attempt_no:   attemptNo,
      status,
      score:        status === "graded" ? Math.round(aiScore * 100) / 100 : null,
      max_score:    status === "graded" && maxScore > 0 ? maxScore : null,
      passed:       status === "graded" ? passed : false,
      answers:      { file_path: file_path ?? null, file_url: null, file_name: file_name ?? null, file_size: file_size ?? null, text_response: text_response ?? null },
      ai_feedback:  { overall_comment: overallComment, criteria_scores: criteriaScores },
      started_at:   now,
      submitted_at: now,
    })
    .select("id, attempt_no, status, score, max_score, passed, answers, ai_feedback, submitted_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // EM-15 — work that still needs a human mark. An AI-graded submission is
  // already scored, so nobody is asked to look at it.
  if (status === "submitted")
    notifyGradingDue({
      studentId: student.id, courseId: course_id,
      moduleTitle: module.title ?? "Assignment", submittedAt: now,
    }).catch(err => console.error("[email] grading notice failed", err))

  return NextResponse.json(attempt, { status: 201 })
}

// PATCH — admin grades or releases a submission
// Grade:   { attempt_id, score, max_score, passed, feedback }
// Release: { attempt_id, release: true }
export async function PATCH(req: Request) {
  // IR-6 — any staff account may mark work; the student has to be theirs.
  const g = await guardStaff()
  if (!g.ok) return g.res
  const adminSession = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

  const body = await req.json().catch(() => ({}))
  const { attempt_id, release, score, max_score, passed, feedback, reason } = body
  if (!attempt_id) return NextResponse.json({ error: "attempt_id required" }, { status: 400 })

  // Only ASSIGNMENT attempts can be graded or released here. The attempt's type
  // was never checked, so this endpoint would overwrite the score and pass/fail
  // of any attempt — including a Final Exam attempt — by id.
  const { data: target } = await db
    .from("lms_module_attempts")
    .select("id, student_id, enrollment_id, course_id, score, status, ai_feedback, lms_modules!inner(module_type)")
    .eq("id", attempt_id)
    .maybeSingle()
  if (!target) return NextResponse.json({ error: "Attempt not found" }, { status: 404 })
  if (!(await canSeeStudent(g.scope, (target as any).student_id))) return forbidden()
  if ((target as any).lms_modules?.module_type !== "assignment")
    return NextResponse.json({ error: "Only assignment submissions can be graded here" }, { status: 400 })

  // Release action — make result visible to student
  if (release) {
    const { data, error } = await db
      .from("lms_module_attempts")
      .update({ status: "released" })
      .eq("id", attempt_id)
      .select("id, status")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await recheck(target)
    return NextResponse.json(data)
  }

  // Grade action. Re-marking a result the instructor already gave needs a reason.
  const alreadyMarked = (target as any).ai_feedback?.graded_by === "instructor" || (target as any).status === "released"
  const rescored = alreadyMarked && score !== undefined && Number(score) !== Number((target as any).score)
  if (rescored && !(typeof reason === "string" && reason.trim()))
    return NextResponse.json({ error: "Give a reason for changing a mark already given" }, { status: 400 })

  const { data, error } = await db
    .from("lms_module_attempts")
    .update({
      score:       score     ?? null,
      max_score:   max_score ?? null,
      passed:      passed    ?? false,
      // Merge rather than replace: this used to overwrite the whole object,
      // discarding the AI grader's per-criterion scores and comments.
      ai_feedback: {
        ...(((target as any).ai_feedback) ?? {}), overall_comment: feedback ?? "", graded_by: "instructor",
        // Changing a mark already given is recorded with its reason (and who, when).
        ...(rescored ? { rescores: [...((((target as any).ai_feedback) ?? {}).rescores ?? []), { from: (target as any).score, to: score, reason: String(reason).slice(0, 500), by: g.session.name ?? g.session.id, at: new Date().toISOString() }] } : {}),
      },
      status:      "graded",
      graded_at:   new Date().toISOString(),
    })
    .eq("id", attempt_id)
    .select("id, score, max_score, passed, status")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recheck(target)
  return NextResponse.json(data)
}

// A marked assignment can be what completes the course under its pass rule.
async function recheck(target: any) {
  if (!target?.enrollment_id || !target?.course_id) return
  await syncEnrollmentProgress(target.student_id, target.course_id, target.enrollment_id)
  await checkCourseCompletion(target.student_id, target.course_id, target.enrollment_id).catch(() => {})
}
