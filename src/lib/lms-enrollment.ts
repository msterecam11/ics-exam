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
