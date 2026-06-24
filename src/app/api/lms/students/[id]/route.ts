import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// GET /api/lms/students/[id]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params

  const [{ data: student, error: sErr }, { data: enrollments }, { data: paths }] = await Promise.all([
    db.from("lms_students")
      .select("id, name, email, job_title, company, department, language, last_login, created_at")
      .eq("id", id)
      .single(),
    db.from("lms_enrollments")
      // progress_pct is stored and kept current by syncEnrollmentProgress — use it directly
      .select("id, status, enrolled_at, completed_at, progress_pct, lms_courses(id, title, status)")
      .eq("student_id", id)
      .order("enrolled_at", { ascending: false }),
    db.from("lms_learning_path_members")
      .select("added_at, lms_learning_paths(id, title)")
      .eq("student_id", id)
      .order("added_at", { ascending: false }),
  ])

  if (sErr || !student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Quiz attempts (in-content quizzes)
  const { data: quizAttempts } = await db
    .from("lms_quiz_attempts")
    .select(`
      id, score, total_score, passed, submitted_at,
      lms_quizzes(id, title)
    `)
    .eq("student_id", id)
    .order("submitted_at", { ascending: false })
    .limit(200) as any

  // Assignment submissions — use module_id direct join, instructor_note instead of feedback
  const { data: assignmentSubs } = await db
    .from("lms_assignment_submissions")
    .select(`
      id, status, score, max_score, instructor_note, submitted_at, graded_at, file_url,
      lms_modules(id, title, course_id)
    `)
    .eq("student_id", id)
    .order("submitted_at", { ascending: false })
    .limit(100) as any

  // Final exam attempts grouped by module
  const { data: examAttempts } = await db
    .from("lms_module_attempts")
    .select(`
      id, module_id, course_id, attempt_no, score, max_score, passed, submitted_at,
      lms_modules(id, title, activity_settings)
    `)
    .eq("student_id", id)
    .order("attempt_no", { ascending: false })
    .limit(100) as any

  // Group exam attempts by module_id
  const examAttemptsByModule: Record<string, any[]> = {}
  for (const a of examAttempts ?? []) {
    if (!examAttemptsByModule[a.module_id]) examAttemptsByModule[a.module_id] = []
    examAttemptsByModule[a.module_id].push(a)
  }

  const exam_summaries = Object.entries(examAttemptsByModule).map(([moduleId, attempts]) => {
    const mod = (attempts[0] as any).lms_modules
    const maxAttempts = (mod?.activity_settings as any)?.max_attempts ?? 3
    const latestPassed = attempts.some((a: any) => a.passed)
    return {
      module_id:      moduleId,
      module_title:   mod?.title ?? "Exam",
      course_id:      attempts[0].course_id,
      total_attempts: attempts.length,
      max_attempts:   maxAttempts,
      passed:         latestPassed,
      blocked:        !latestPassed && attempts.length >= maxAttempts,
    }
  })

  // Cohort memberships
  const { data: cohortRows } = await db
    .from("lms_cohort_members")
    .select("added_at, track_id, lms_cohorts(id, name, mode, start_date, end_date)")
    .eq("student_id", id)
    .order("added_at", { ascending: false })

  const cohorts = (cohortRows ?? [])
    .filter((c: any) => c.lms_cohorts)
    .map((c: any) => ({
      added_at:   c.added_at,
      track_id:   c.track_id ?? null,
      id:         c.lms_cohorts.id,
      name:       c.lms_cohorts.name,
      description: null,
      mode:       c.lms_cohorts.mode ?? "unified",
      start_date: c.lms_cohorts.start_date ?? null,
      end_date:   c.lms_cohorts.end_date ?? null,
    }))

  return NextResponse.json({
    student,
    enrollments: (enrollments ?? []).map((e: any) => ({
      id:           e.id,
      status:       e.status,
      enrolled_at:  e.enrolled_at,
      completed_at: e.completed_at,
      progress_pct: e.progress_pct ?? 0,
      course:       e.lms_courses,
    })),
    learning_paths: (paths ?? []).map((p: any) => ({
      added_at: p.added_at,
      ...p.lms_learning_paths,
    })),
    cohorts,
    quiz_attempts:          quizAttempts      ?? [],
    assignment_submissions: assignmentSubs    ?? [],
    exam_summaries,
  })
}
