import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { paperFor } from "@/lib/lms-exam-scoring"
import { getCurrentEnrollment, getEnrollmentById, getExamRules } from "@/lib/lms-enrollment"
import { isMgr } from "@/lib/staff-roles"

// GET /api/lms/progress/[studentId]/course/[courseId]
// Full detail: quizzes, assignments, exams (with answers + security), packages
export async function GET(
  req: Request,
  { params }: { params: Promise<{ studentId: string; courseId: string }> }
) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { studentId, courseId } = await params

  // ── Course + enrollment ──────────────────────────────────────────────────
  // One enrollment's detail: ?enrollment_id= for a specific (e.g. earlier)
  // program run, otherwise the student's current enrollment in the course.
  const requested = new URL(req.url).searchParams.get("enrollment_id")
  const ctx = requested ? await getEnrollmentById(requested) : await getCurrentEnrollment(studentId, courseId)
  const [{ data: course }, { data: enrollment }, { data: history }] = await Promise.all([
    db.from("lms_courses")
      .select("id, title, status, delivery_mode, thumbnail_url, final_exam_pass_mark")
      .eq("id", courseId).single(),
    ctx && ctx.student_id === studentId && ctx.course_id === courseId
      ? db.from("lms_enrollments")
          // progress_pct is stored and kept current by syncEnrollmentProgress — use it directly
          .select("id, status, enrolled_at, completed_at, progress_pct, program_id, lms_programs(id, name)")
          .eq("id", ctx.id).single()
      : Promise.resolve({ data: null }),
    // Every enrollment of this student in this course, for switching between runs.
    db.from("lms_enrollments")
      .select("id, status, enrolled_at, completed_at, lms_programs(id, name)")
      .eq("student_id", studentId).eq("course_id", courseId)
      .order("enrolled_at", { ascending: false }),
  ])

  if (!course)      return NextResponse.json({ error: "Course not found" }, { status: 404 })
  if (!enrollment || !ctx)  return NextResponse.json({ error: "Student not enrolled" }, { status: 404 })
  const enrollmentId = (enrollment as any).id as string
  const rules = await getExamRules(ctx, course as any, null)

  // Use the stored progress_pct (computed by syncEnrollmentProgress on every student action)
  const progress_pct: number = (enrollment as any).progress_pct ?? 0

  // ── Modules for this course ──────────────────────────────────────────────
  const { data: modules } = await db
    .from("lms_modules")
    .select("id, title, module_type, order_index, prerequisite_module_id")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true })

  const moduleIds = (modules ?? []).map((m: any) => m.id)

  // Quizzes live inside package modules as items of type "quiz".
  // Their results are stored in lms_package_progress.item_scores — NOT in lms_quiz_attempts.
  // We derive quizzes after building the packages array below.

  // ── Assignment submissions ────────────────────────────────────────────────
  const assignmentModuleIds = (modules ?? [])
    .filter((m: any) => m.module_type === "assignment")
    .map((m: any) => m.id)

  // Module-level assignments are stored as lms_module_attempts (see
  // /api/lms/module-assignment). This read lms_assignment_submissions — the
  // table for CONTENT-ITEM assignments — filtered by assignment module ids, so
  // a student's module assignment submissions never appeared here. Files are a
  // path in the private lms-submissions bucket, so sign them for this view.
  const { data: assignmentAttempts } = assignmentModuleIds.length
    ? await db.from("lms_module_attempts")
        .select("id, status, score, max_score, passed, answers, ai_feedback, submitted_at, graded_at, module_id, lms_modules(id, title)")
        .eq("enrollment_id", enrollmentId)
        .in("module_id", assignmentModuleIds)
        .order("submitted_at", { ascending: false })
    : { data: [] as any[] }

  const filePaths = ((assignmentAttempts ?? []) as any[])
    .map(a => a.answers?.file_path).filter((p: any): p is string => typeof p === "string" && !!p)
  const signedByPath = new Map<string, string>()
  if (filePaths.length) {
    const { data: signed } = await db.storage.from("lms-submissions").createSignedUrls(filePaths, 3600)
    for (const s of signed ?? []) if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl)
  }

  // Same field names the page already reads for assignments.
  const assignments = ((assignmentAttempts ?? []) as any[]).map(a => ({
    id:              a.id,
    status:          a.status,
    score:           a.score,
    max_score:       a.max_score,
    passed:          a.passed,
    instructor_note: a.ai_feedback?.overall_comment ?? null,   // where manual and AI grading store feedback
    submitted_at:    a.submitted_at,
    graded_at:       a.graded_at,
    file_url:        a.answers?.file_path ? (signedByPath.get(a.answers.file_path) ?? null) : (a.answers?.file_url ?? null),
    file_name:       a.answers?.file_name ?? null,
    text_response:   a.answers?.text_response ?? null,
    module_id:       a.module_id,
    lms_modules:     a.lms_modules,
  }))

  // ── Exam attempts (final_exam modules) ───────────────────────────────────
  const examModIds = (modules ?? [])
    .filter((m: any) => m.module_type === "final_exam")
    .map((m: any) => m.id)

  const { data: examAttempts } = examModIds.length
    ? await db.from("lms_module_attempts")
        .select("id, module_id, attempt_no, score, max_score, passed, answers, ai_feedback, time_spent_s, started_at, submitted_at, paper, lms_modules(id, title, activity_settings, questions)")
        .eq("enrollment_id", enrollmentId)
        .in("module_id", examModIds)
        .order("submitted_at", { ascending: false })
    : { data: [] }

  // Group exam attempts by module + extract security events
  const examsByModule: Record<string, any> = {}
  for (const a of examAttempts ?? []) {
    const mid = (a as any).module_id
    if (!examsByModule[mid]) {
      const mod       = (a as any).lms_modules
      const settings  = mod?.activity_settings as any
      examsByModule[mid] = {
        module_id:    mid,
        module_title: mod?.title ?? "Exam",
        // The rules grading used: the program's when the enrollment has one,
        // else the course pass mark and the exam module's attempts.
        max_attempts: rules.source === "program" ? rules.maxAttempts : (settings?.max_attempts ?? 3),
        pass_mark:    rules.source === "program" ? rules.passMark : ((course as any)?.final_exam_pass_mark ?? settings?.pass_mark ?? 70),
        passed:       false,
        attempts:     [],
      }
    }
    const sec = (a as any).ai_feedback?.security_events ?? {}
    examsByModule[mid].attempts.push({
      id:            a.id,
      attempt_no:    (a as any).attempt_no,
      score:         (a as any).score,
      max_score:     (a as any).max_score,
      pct:           (a as any).max_score > 0 ? Math.round(((a as any).score / (a as any).max_score) * 100) : 0,
      passed:        (a as any).passed,
      time_spent_s:  (a as any).time_spent_s,
      started_at:    (a as any).started_at,
      submitted_at:  (a as any).submitted_at,
      tab_switches:     sec.tabs         ?? 0,
      fullscreen_exits: sec.fs           ?? 0,
      right_clicks:     sec.rightClicks  ?? 0,
      copy_attempts:    sec.copyAttempts ?? 0,
      answers:       (a as any).answers,
      ai_feedback:   (a as any).ai_feedback,
      questions:     paperFor(a as any, (a as any).lms_modules?.questions),   // the paper this attempt was taken on
    })
    if ((a as any).passed) examsByModule[mid].passed = true
  }

  const exams = Object.values(examsByModule).map((ex: any) => ({
    ...ex,
    total_attempts: ex.attempts.length,
    blocked:        !ex.passed && ex.attempts.length >= ex.max_attempts,
  }))

  // ── Package quiz/progress test scores ────────────────────────────────────
  const packageModuleIds = (modules ?? [])
    .filter((m: any) => m.module_type === "package")
    .map((m: any) => m.id)

  let packages: any[] = []
  let progByPkg: Record<string, any> = {}
  if (packageModuleIds.length) {
    const { data: pkgRows } = await db.from("lms_packages")
      .select("id, module_id, lms_modules(id, title)")
      .in("module_id", packageModuleIds)

    const pkgIds = (pkgRows ?? []).map((p: any) => p.id)

    const [pkgProgress, pkgItems] = await Promise.all([
      pkgIds.length
        ? db.from("lms_package_progress")
            .select("package_id, module_id, completed_items, item_scores, status, updated_at")
            .eq("enrollment_id", enrollmentId).in("package_id", pkgIds)
        : Promise.resolve({ data: [] }),
      pkgIds.length
        ? db.from("lms_package_items")
            .select("id, package_id, type, title, order_index, config")
            .in("package_id", pkgIds)
            .order("order_index", { ascending: true })
        : Promise.resolve({ data: [] }),
    ])

    for (const pp of pkgProgress.data ?? []) progByPkg[(pp as any).package_id] = pp

    const itemsByPkg: Record<string, any[]> = {}
    for (const item of pkgItems.data ?? []) {
      const pid = (item as any).package_id
      if (!itemsByPkg[pid]) itemsByPkg[pid] = []
      itemsByPkg[pid].push(item)
    }

    packages = (pkgRows ?? []).map((p: any) => {
      const prog    = progByPkg[p.id]
      const items   = itemsByPkg[p.id] ?? []
      const status  = prog?.status ?? "not_started"

      // Items completion (for the detail row dots)
      const currentIds   = new Set(items.map((i: any) => i.id))
      const completedIds: string[] = prog && Array.isArray(prog.completed_items) ? prog.completed_items : []
      const completed    = completedIds.filter((id: string) => currentIds.has(id)).length

      // Exact same logic as student-facing courses/[id]/page.tsx:
      //   done (passed|completed) → 100%
      //   otherwise               → completed_items / total_items (raw, no cap)
      const done           = status === "passed" || status === "completed"
      const content_pct    = done
        ? 100
        : items.length > 0 ? Math.round((completed / items.length) * 100) : 0
      // When passed, all items count as completed (student may have skipped optional ones)
      const displayCompleted = done ? items.length : completed

      // Pass the actual completed ID set so the page can mark each item correctly
      const completedIdSet = done
        ? new Set(items.map((i: any) => i.id))   // all items when passed
        : new Set(completedIds.filter((id: string) => currentIds.has(id)))

      return {
        module_id:          p.module_id,
        module_title:       (p.lms_modules as any)?.title ?? "Package",
        package_id:         p.id,
        total_items:        items.length,
        completed_items:    displayCompleted,
        completed_item_ids: Array.from(completedIdSet), // for per-item dot accuracy
        content_pct,
        status,
        last_activity_at:   prog?.updated_at ?? null,
        items,
      }
    })
  }

  // ── Quizzes — derived from package items of type "quiz" + item_scores ──────
  // Quiz items live inside packages; scores stored in lms_package_progress.item_scores
  const courseQuizAttempts: any[] = []
  for (const pkg of packages) {
    const prog    = progByPkg?.[pkg.package_id]
    const scores: Record<string, any> = (prog as any)?.item_scores ?? {}
    // Packages hold "slide_pdf" and "activity" items; filtering only "quiz" /
    // "progress_test" meant this section was always empty. Include activities
    // that actually recorded a score (knowledge checks), not every slide.
    const quizItems = pkg.items.filter((i: any) =>
      i.type === "quiz" || i.type === "progress_test" || (i.type === "activity" && scores[i.id] != null))
    for (const item of quizItems) {
      const s = scores[item.id]
      courseQuizAttempts.push({
        id:           item.id,
        title:        item.title,
        module_title: pkg.module_title,
        passed:       s?.passed ?? false,
        score:        s?.score  ?? null,
        total_score:  s?.max    ?? null,
        pct:          s?.pct    ?? null,
        completed:    pkg.completed_item_ids?.includes(item.id) ?? false,
        questions:    (item as any).config?.questions ?? [],
      })
    }
  }

  // ── Security summary (across all exam attempts) ───────────────────────────
  const security = exams.map((ex: any) => ({
    module_id:    ex.module_id,
    module_title: ex.module_title,
    attempts:     ex.attempts.map((a: any) => ({
      attempt_no:       a.attempt_no,
      submitted_at:     a.submitted_at,
      tab_switches:     a.tab_switches     ?? 0,
      fullscreen_exits: a.fullscreen_exits ?? 0,
      right_clicks:     a.right_clicks     ?? 0,
      copy_attempts:    a.copy_attempts    ?? 0,
    })),
    total_tab_switches:     ex.attempts.reduce((s: number, a: any) => s + (a.tab_switches     ?? 0), 0),
    total_fullscreen_exits: ex.attempts.reduce((s: number, a: any) => s + (a.fullscreen_exits ?? 0), 0),
    total_right_clicks:     ex.attempts.reduce((s: number, a: any) => s + (a.right_clicks     ?? 0), 0),
    total_copy_attempts:    ex.attempts.reduce((s: number, a: any) => s + (a.copy_attempts ?? 0), 0),
  }))

  return NextResponse.json({
    course,
    enrollment,
    enrollment_history: history ?? [],
    progress_pct,
    modules: modules ?? [],
    quizzes:     courseQuizAttempts,
    assignments,
    exams,
    packages,
    security,
  })
}
