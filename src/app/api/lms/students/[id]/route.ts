import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assignmentAttempts } from "@/lib/lms-marking"
import { guardStaff, canSeeStudent } from "@/lib/staff-access"

// GET /api/lms/students/[id]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guardStaff()
  if (!g.ok) return g.res

  const { id } = await params
  if (!(await canSeeStudent(g.scope, id))) return NextResponse.json({ error: "Student not found" }, { status: 404 })

  const [{ data: student, error: sErr }, { data: enrollments }] = await Promise.all([
    db.from("lms_students")
      .select("id, name, email, job_title, company, company_id, employee_number, phone, department, language, last_login, created_at, lms_companies(id, name, code, status)")
      .eq("id", id)
      .single(),
    db.from("lms_enrollments")
      // progress_pct is stored and kept current by syncEnrollmentProgress — use it directly
      .select("id, status, enrolled_at, completed_at, progress_pct, program_id, lms_courses(id, title, status), lms_programs(id, name)")
      .eq("student_id", id)
      .order("enrolled_at", { ascending: false }),
  ])

  if (sErr || !student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Assignment submissions (module attempts of assignment modules), with a
  // short-lived link to the submitted file.
  const { data: rawSubs } = await assignmentAttempts("id, status, score, max_score, submitted_at, graded_at, answers, ai_feedback")
    .eq("student_id", id)
    .order("submitted_at", { ascending: false })
    .limit(100)
  const subPaths = ((rawSubs ?? []) as any[]).map(a => a.answers?.file_path).filter(Boolean) as string[]
  const { data: subSigned } = subPaths.length ? await db.storage.from("lms-submissions").createSignedUrls(subPaths, 3600) : { data: [] as any[] }
  const subUrl = new Map(((subSigned ?? []) as any[]).map(s => [s.path, s.signedUrl]))
  const assignmentSubs = ((rawSubs ?? []) as any[]).map(a => ({
    id: a.id, status: a.status, score: a.score, max_score: a.max_score, submitted_at: a.submitted_at, graded_at: a.graded_at,
    instructor_note: a.ai_feedback?.overall_comment ?? null,
    file_url: a.answers?.file_path ? subUrl.get(a.answers.file_path) ?? null : null,
    lms_modules: a.lms_modules,
  }))

  // Final exam attempts grouped by module
  const { data: examAttempts } = await db
    .from("lms_module_attempts")
    .select(`
      id, module_id, course_id, enrollment_id, attempt_no, score, max_score, passed, submitted_at,
      lms_modules(id, title, activity_settings)
    `)
    .eq("student_id", id)
    .order("attempt_no", { ascending: false })
    .limit(100) as any

  // Group exam attempts by enrollment + module (a retake is a separate run with
  // its own attempt count).
  const examAttemptsByModule: Record<string, any[]> = {}
  for (const a of examAttempts ?? []) {
    const key = `${a.enrollment_id}|${a.module_id}`
    if (!examAttemptsByModule[key]) examAttemptsByModule[key] = []
    examAttemptsByModule[key].push(a)
  }

  // The attempt limit that actually applies: the program's rule when the run
  // belongs to a program that sets one, else the exam's own setting.
  const runIds = [...new Set(((examAttempts ?? []) as any[]).map(a => a.enrollment_id).filter(Boolean))]
  const { data: runRows } = runIds.length
    ? await db.from("lms_enrollments").select("id, program_id").in("id", runIds)
    : { data: [] as any[] }
  const programOfRun = new Map(((runRows ?? []) as any[]).map(r => [r.id, r.program_id as string | null]))
  const programIds = [...new Set([...programOfRun.values()].filter(Boolean))] as string[]
  const { data: ruleRows } = programIds.length
    ? await db.from("lms_program_course_rules").select("program_id, course_id, max_attempts").in("program_id", programIds)
    : { data: [] as any[] }
  const ruleMax = new Map(((ruleRows ?? []) as any[]).map(r => [`${r.program_id}:${r.course_id}`, Number(r.max_attempts)]))

  const exam_summaries = Object.entries(examAttemptsByModule).map(([key, attempts]) => {
    const moduleId = key.split("|")[1]
    const mod = (attempts[0] as any).lms_modules
    const programId = programOfRun.get(key.split("|")[0]) ?? null
    const maxAttempts = (programId && ruleMax.get(`${programId}:${attempts[0].course_id}`))
      || ((mod?.activity_settings as any)?.max_attempts ?? 3)
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

  return NextResponse.json({
    student,
    enrollments: (enrollments ?? []).map((e: any) => ({
      id:           e.id,
      status:       e.status,
      enrolled_at:  e.enrolled_at,
      completed_at: e.completed_at,
      progress_pct: e.progress_pct ?? 0,
      program:      e.lms_programs ?? null,
      course:       e.lms_courses,
    })),
    assignment_submissions: assignmentSubs    ?? [],
    exam_summaries,
  })
}
