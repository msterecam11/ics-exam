import { db } from "@/lib/db"

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

export type EnsureEnrollmentResult = "enrolled" | "reactivated" | "already" | "full" | "error"

/**
 * Enroll one student in one course for bulk flows (cohort and learning-path
 * enrollment), with the same rules as a direct enrollment.
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

  const { data: existing, error: exErr } = await db
    .from("lms_enrollments").select("id, status")
    .eq("student_id", studentId).eq("course_id", courseId).maybeSingle()
  if (exErr) return "error"
  if (existing && existing.status !== "dropped") return "already"

  // Capacity counts active seats, as in POST /api/lms/enrollments.
  const { data: course } = await db.from("lms_courses").select("capacity").eq("id", courseId).maybeSingle()
  if ((course as any)?.capacity) {
    const { count } = await db.from("lms_enrollments")
      .select("*", { count: "exact", head: true }).eq("course_id", courseId).eq("status", "active")
    if ((count ?? 0) >= (course as any).capacity) return "full"
  }

  if (existing) {
    const { error } = await db.from("lms_enrollments")
      .update({ status: "active", completed_at: null, ...(cohortId ? { cohort_id: cohortId } : {}) })
      .eq("id", existing.id)
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

/** True if the student may use this course (enrolled, and not unenrolled). */
export async function hasCourseAccess(studentId: string, courseId: string | null | undefined): Promise<boolean> {
  if (!courseId) return false
  const { data } = await db
    .from("lms_enrollments")
    .select("id")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .in("status", [...COURSE_ACCESS_STATUSES])
    .maybeSingle()
  return !!data
}
