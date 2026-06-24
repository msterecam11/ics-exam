import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// GET /api/lms/progress/[studentId]/course/[courseId]
// Full detail: quizzes, assignments, exams (with answers + security), packages
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ studentId: string; courseId: string }> }
) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { studentId, courseId } = await params

  // ── Course + enrollment ──────────────────────────────────────────────────
  const [{ data: course }, { data: enrollment }] = await Promise.all([
    db.from("lms_courses")
      .select("id, title, status, delivery_mode, thumbnail_url")
      .eq("id", courseId).single(),
    db.from("lms_enrollments")
      // progress_pct is stored and kept current by syncEnrollmentProgress — use it directly
      .select("id, status, enrolled_at, completed_at, progress_pct")
      .eq("student_id", studentId).eq("course_id", courseId).single(),
  ])

  if (!course)      return NextResponse.json({ error: "Course not found" }, { status: 404 })
  if (!enrollment)  return NextResponse.json({ error: "Student not enrolled" }, { status: 404 })

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

  const { data: assignments } = assignmentModuleIds.length
    ? await db.from("lms_assignment_submissions")
        .select("id, status, score, max_score, instructor_note, submitted_at, graded_at, file_url, module_id, lms_modules(id, title)")
        .eq("student_id", studentId)
        .in("module_id", assignmentModuleIds)
        .order("submitted_at", { ascending: false })
    : { data: [] }

  // ── Exam attempts (final_exam modules) ───────────────────────────────────
  const examModIds = (modules ?? [])
    .filter((m: any) => m.module_type === "final_exam")
    .map((m: any) => m.id)

  const { data: examAttempts } = examModIds.length
    ? await db.from("lms_module_attempts")
        .select("id, module_id, attempt_no, score, max_score, passed, answers, ai_feedback, time_spent_s, started_at, submitted_at, lms_modules(id, title, activity_settings, questions)")
        .eq("student_id", studentId)
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
        max_attempts: settings?.max_attempts ?? 3,
        pass_mark:    settings?.pass_mark    ?? 70,
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
      questions:     (a as any).lms_modules?.questions ?? [],
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
            .eq("student_id", studentId).in("package_id", pkgIds)
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
    const quizItems = pkg.items.filter((i: any) => i.type === "quiz" || i.type === "progress_test")
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
    progress_pct,
    modules: modules ?? [],
    quizzes:     courseQuizAttempts,
    assignments: assignments ?? [],
    exams,
    packages,
    security,
  })
}
