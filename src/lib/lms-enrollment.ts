import { db } from "@/lib/db"

// ── Enrollment-based records ─────────────────────────────────────────────
//
// A student can take the same course more than once — in different programs
// (e.g. ALEP 2026, then a recurrent ALEP 2028). Each enrollment owns its own
// progress, exam attempts, certificate and report; nothing is shared between
// them. Every progress row carries enrollment_id.
//
// For a given student + course, the CURRENT enrollment is the active one (at
// most one can be active), otherwise the most recent completed one (so a
// finished learner can still review). Earlier enrollments are history.
//
// "dropped" is what the admin UI calls "withdrawn"/"unenrolled".

// Which enrollment statuses let a student into a course.
//
// "dropped" is what the admin UI labels "unenrolled". Until this was introduced,
// every student page and API checked only that an enrollment row EXISTED, never
// its status — so a student an admin had unenrolled kept full access by direct
// link: the course, its packages, and the final exam (and the certificate a pass
// issues). The course only disappeared from their dashboard list.
//
// "completed" keeps access so learners can revisit material they finished.
export const COURSE_ACCESS_STATUSES = ["active", "completed"] as const

export type CourseAccess = "full" | "read_only" | "none"

export type EnrollmentProgram = {
  id: string
  name: string
  status: "draft" | "active" | "completed" | "archived"
  end_date: string | null
  after_end_access: "read_only" | "full" | "locked"
  certificate_enabled: boolean
  certificate_auto_release: boolean
  progress_enforcement: boolean
}

export type EnrollmentContext = {
  id: string
  student_id: string
  course_id: string
  status: "active" | "completed" | "dropped"
  enrolled_at: string
  completed_at: string | null
  program_id: string | null
  member_id: string | null
  program: EnrollmentProgram | null
  member: { status: "active" | "withdrawn" | "completed"; end_date_override: string | null; track_id: string | null } | null
  /** full = learn and submit · read_only = review only · none = no access */
  access: CourseAccess
  /** Why access is limited, for display. */
  accessNote: string | null
}

const ENROLLMENT_SELECT = `
  id, student_id, course_id, status, enrolled_at, completed_at, program_id, member_id,
  lms_programs(id, name, status, end_date, after_end_access, certificate_enabled, certificate_auto_release, progress_enforcement),
  lms_program_members(status, end_date_override, track_id)`

function todayISO(now = new Date()) {
  // Program dates are calendar dates; compare in the institute's day (UTC+3).
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10)
}

/** Access rules for one enrollment (PM-6/7/8). */
export function computeAccess(e: Pick<EnrollmentContext, "status" | "program" | "member">, now = new Date()): { access: CourseAccess; note: string | null } {
  if (e.status === "dropped") return { access: "none", note: "You have been withdrawn from this course." }
  const p = e.program
  if (!p) return { access: "full", note: null }                       // enrollment from before programs
  if (p.status === "draft") return { access: "none", note: "This program has not started yet." }
  if (e.member?.status === "withdrawn") return { access: "none", note: "You have been withdrawn from this program." }

  const end = e.member?.end_date_override ?? p.end_date
  const ended = p.status === "completed" || p.status === "archived" || (!!end && todayISO(now) > end)
  if (!ended) return { access: "full", note: null }

  if (p.after_end_access === "full")   return { access: "full", note: null }
  if (p.after_end_access === "locked") return { access: "none", note: "This program has ended." }
  return { access: "read_only", note: "This program has ended — you can review the material and your results." }
}

function toContext(row: any, now = new Date()): EnrollmentContext {
  const program = row.lms_programs ?? null
  const member  = row.lms_program_members ?? null
  const base = {
    id: row.id, student_id: row.student_id, course_id: row.course_id, status: row.status,
    enrolled_at: row.enrolled_at, completed_at: row.completed_at,
    program_id: row.program_id ?? null, member_id: row.member_id ?? null,
    program, member,
  }
  const { access, note } = computeAccess(base, now)
  return { ...base, access, accessNote: note }
}

/**
 * The student's current enrollment in a course (active, else most recent
 * completed, else the most recent withdrawn one — which has no access).
 * Null when they were never enrolled.
 */
export async function getCurrentEnrollment(studentId: string, courseId: string | null | undefined): Promise<EnrollmentContext | null> {
  if (!studentId || !courseId) return null
  const { data, error } = await db
    .from("lms_enrollments")
    .select(ENROLLMENT_SELECT)
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .order("enrolled_at", { ascending: false })
  if (error || !data?.length) return null
  const rank = (s: string) => (s === "active" ? 0 : s === "completed" ? 1 : 2)
  const row = [...data].sort((a: any, b: any) => rank(a.status) - rank(b.status))[0]
  return toContext(row)
}

export async function getEnrollmentById(enrollmentId: string | null | undefined): Promise<EnrollmentContext | null> {
  if (!enrollmentId) return null
  const { data } = await db.from("lms_enrollments").select(ENROLLMENT_SELECT).eq("id", enrollmentId).maybeSingle()
  return data ? toContext(data) : null
}

/** Current enrollment of each of the student's courses (one per course). */
export async function getCurrentEnrollments(studentId: string): Promise<EnrollmentContext[]> {
  const { data } = await db
    .from("lms_enrollments")
    .select(ENROLLMENT_SELECT)
    .eq("student_id", studentId)
    .order("enrolled_at", { ascending: false })
  const rank = (s: string) => (s === "active" ? 0 : s === "completed" ? 1 : 2)
  const byCourse = new Map<string, any>()
  for (const row of [...(data ?? [])].sort((a: any, b: any) => rank(a.status) - rank(b.status))) {
    if (!byCourse.has(row.course_id)) byCourse.set(row.course_id, row)
  }
  return [...byCourse.values()].map(r => toContext(r))
}

/** Columns to add to an lms_enrollments select (which must also include
 *  course_id, status and enrolled_at) so rows can go through currentVisible(). */
export const ENROLLMENT_ACCESS_COLUMNS = `program_id, member_id,
  lms_programs(id, name, status, end_date, after_end_access, certificate_enabled, certificate_auto_release, progress_enforcement),
  lms_program_members(status, end_date_override, track_id)`

/**
 * From a student's enrollment rows (selected with ENROLLMENT_ACCESS_COLUMNS),
 * keep only the current enrollment of each course that the student can open,
 * with its access attached. List pages use this so a course taken twice shows
 * once, and draft/withdrawn/locked ones don't show at all.
 */
export function currentVisible<T extends Record<string, any>>(rows: T[] | null | undefined): (T & { access: CourseAccess; accessNote: string | null })[] {
  const rank = (s: string) => (s === "active" ? 0 : s === "completed" ? 1 : 2)
  const sorted = [...(rows ?? [])].sort((a, b) =>
    rank(a.status) - rank(b.status) || String(b.enrolled_at).localeCompare(String(a.enrolled_at)))
  const seen = new Set<string>()
  const out: (T & { access: CourseAccess; accessNote: string | null })[] = []
  for (const r of sorted) {
    const courseId = r.course_id ?? r.lms_courses?.id
    if (!courseId || seen.has(courseId)) continue
    seen.add(courseId)
    const { access, note } = computeAccess({ status: r.status, program: r.lms_programs ?? null, member: r.lms_program_members ?? null })
    if (access !== "none") out.push({ ...r, access, accessNote: note })
  }
  return out
}

/** True if the student may open this course (full or review access). */
export async function hasCourseAccess(studentId: string, courseId: string | null | undefined): Promise<boolean> {
  const e = await getCurrentEnrollment(studentId, courseId)
  return !!e && e.access !== "none"
}

/**
 * The enrollment a student may RECORD progress / submit work under, or an
 * error to return. Review-only access (program ended) can't write.
 */
export async function getWritableEnrollment(studentId: string, courseId: string | null | undefined):
  Promise<{ ok: true; enrollment: EnrollmentContext } | { ok: false; status: 403; error: string }> {
  const e = await getCurrentEnrollment(studentId, courseId)
  if (!e || e.access === "none") return { ok: false, status: 403, error: e?.accessNote ?? "Not enrolled in this course" }
  if (e.access === "read_only") return { ok: false, status: 403, error: e.accessNote ?? "This course is review-only" }
  return { ok: true, enrollment: e }
}

// ── Assessment rules (pass mark / attempts) ──────────────────────────────

export type ExamRules = { passMark: number; maxAttempts: number; source: "program" | "course" }

/**
 * Pass mark and attempts for an enrollment's final exam. A program's own
 * rules (copied from the course when the course was added, then independent)
 * win; enrollments outside a program use the course settings as before.
 */
export async function getExamRules(
  enrollment: Pick<EnrollmentContext, "program_id" | "course_id"> | null,
  course: { final_exam_pass_mark?: number | null } | null,
  moduleSettings: any,
): Promise<ExamRules> {
  if (enrollment?.program_id) {
    const { data } = await db
      .from("lms_program_course_rules")
      .select("pass_mark, max_attempts")
      .eq("program_id", enrollment.program_id)
      .eq("course_id", enrollment.course_id)
      .maybeSingle()
    if (data) return { passMark: Number((data as any).pass_mark), maxAttempts: Number((data as any).max_attempts), source: "program" }
  }
  return {
    passMark:    Number(course?.final_exam_pass_mark ?? moduleSettings?.pass_mark ?? 70),
    maxAttempts: Number(moduleSettings?.max_attempts ?? 3),
    source: "course",
  }
}

export type EnsureEnrollmentResult = "enrolled" | "reactivated" | "already" | "full" | "error"

/**
 * Enroll one student in one course for bulk flows (cohort and learning-path
 * enrollment), with the same rules as a direct enrollment. These legacy flows
 * create enrollments outside any program.
 *
 * The four bulk loops used to treat ANY existing row as "already enrolled" and
 * skip it — so a student who had been unenrolled ("dropped") stayed dropped
 * and, now that dropped means no access, would silently get nothing. They also
 * ignored course capacity, which direct enrollment enforces.
 */
export async function ensureEnrollment(opts: {
  studentId:  string
  courseId:   string
  enrolledBy: string
  cohortId?:  string | null
}): Promise<EnsureEnrollmentResult> {
  const { studentId, courseId, enrolledBy, cohortId } = opts

  const current = await getCurrentEnrollment(studentId, courseId)
  if (current && current.status !== "dropped") return "already"

  // Capacity counts active seats, as in POST /api/lms/enrollments.
  const { data: course } = await db.from("lms_courses").select("capacity").eq("id", courseId).maybeSingle()
  if ((course as any)?.capacity) {
    const { count } = await db.from("lms_enrollments")
      .select("*", { count: "exact", head: true }).eq("course_id", courseId).eq("status", "active")
    if ((count ?? 0) >= (course as any).capacity) return "full"
  }

  // A withdrawn enrollment outside any program is reactivated (same record).
  if (current && !current.program_id) {
    const { error } = await db.from("lms_enrollments")
      .update({ status: "active", completed_at: null, ...(cohortId ? { cohort_id: cohortId } : {}) })
      .eq("id", current.id)
    return error ? "error" : "reactivated"
  }

  const { error } = await db.from("lms_enrollments").insert({
    student_id: studentId, course_id: courseId, status: "active",
    enrolled_at: new Date().toISOString(), enrolled_by: enrolledBy,
    // Record which cohort produced the enrollment — the column existed but the
    // cohort flow never set it.
    ...(cohortId ? { cohort_id: cohortId } : {}),
  })
  // 23505: a concurrent enrollment won the race — it exists, which is the goal.
  if (error) return (error as any).code === "23505" ? "already" : "error"
  return "enrolled"
}

/**
 * True if the student may use this quiz.
 *
 * Quizzes are created without a course_id (the quiz API never sets it); they
 * reach a course through a content item whose content.quiz_id points at them,
 * and one quiz may be reused in several courses. Checking only quiz.course_id
 * — which is null for every quiz created through the UI — would refuse every
 * student. Access is granted if the quiz's own course, or the course of any
 * content item using it, is one the student can access.
 */
export async function canUseQuiz(studentId: string, quiz: { id: string; course_id?: string | null }): Promise<boolean> {
  if (quiz.course_id && (await hasCourseAccess(studentId, quiz.course_id))) return true

  const { data: items } = await db
    .from("lms_content_items")
    .select("id, lms_modules!inner(course_id)")
    .eq("content->>quiz_id", quiz.id)

  const courseIds = [...new Set(((items ?? []) as any[]).map(i => i.lms_modules?.course_id).filter(Boolean))] as string[]
  for (const courseId of courseIds) {
    if (await hasCourseAccess(studentId, courseId)) return true
  }
  return false
}
