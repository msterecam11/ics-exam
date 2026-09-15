import { db } from "@/lib/db"

// Does this viewer user have "reports" permission covering this student's
// course — either a direct course-scope grant, or a cohort-scope grant where
// the student is a member of that cohort?
export async function canViewLmsReport(userId: string, studentId: string, courseId: string): Promise<boolean> {
  const { data: rows } = await db
    .from("viewer_access")
    .select("resource_type, resource_id, permissions")
    .eq("user_id", userId)
    .eq("system", "lms")

  const grants = (rows ?? []).filter((r: any) => (r.permissions ?? {}).reports === true)
  if (grants.length === 0) return false

  const courseGrant = grants.find((r: any) => r.resource_type === "course" && r.resource_id === courseId)
  if (courseGrant) return true

  const cohortGrantIds = grants.filter((r: any) => r.resource_type === "cohort").map((r: any) => r.resource_id)
  if (cohortGrantIds.length === 0) return false

  const { data: membership } = await db
    .from("lms_cohort_members")
    .select("cohort_id")
    .eq("student_id", studentId)
    .in("cohort_id", cohortGrantIds)

  const memberCohortIds = (membership ?? []).map((m: any) => m.cohort_id)
  if (memberCohortIds.length === 0) return false

  // Membership alone isn't enough — the COURSE must also belong to one of those
  // cohorts. Without this, a cohort-scoped grant would expose that learner's
  // reports for every OTHER course they happen to be enrolled in, including
  // courses belonging to a different client entirely.
  return cohortCoversCourse(memberCohortIds, courseId)
}

/** Do any of these cohorts include this course (directly or via a track)? */
async function cohortCoversCourse(cohortIds: string[], courseId: string): Promise<boolean> {
  const { data: direct } = await db
    .from("lms_cohort_courses")
    .select("cohort_id")
    .eq("course_id", courseId)
    .in("cohort_id", cohortIds)
    .limit(1)
  if (direct && direct.length > 0) return true

  const { data: tracks } = await db
    .from("lms_cohort_tracks")
    .select("id")
    .in("cohort_id", cohortIds)
  const trackIds = (tracks ?? []).map((t: any) => t.id)
  if (trackIds.length === 0) return false

  const { data: viaTrack } = await db
    .from("lms_cohort_track_courses")
    .select("track_id")
    .eq("course_id", courseId)
    .in("track_id", trackIds)
    .limit(1)
  return !!viaTrack && viaTrack.length > 0
}

/**
 * Cohort-level (whole-course) report access. A course-scope grant covers it
 * directly; a cohort-scope grant covers it when that cohort includes the course.
 */
export async function canViewLmsCourseReport(userId: string, courseId: string): Promise<boolean> {
  const { data: rows } = await db
    .from("viewer_access")
    .select("resource_type, resource_id, permissions")
    .eq("user_id", userId)
    .eq("system", "lms")

  const grants = (rows ?? []).filter((r: any) => (r.permissions ?? {}).reports === true)
  if (grants.length === 0) return false

  if (grants.some((r: any) => r.resource_type === "course" && r.resource_id === courseId)) return true

  const cohortGrantIds = grants.filter((r: any) => r.resource_type === "cohort").map((r: any) => r.resource_id)
  if (cohortGrantIds.length === 0) return false
  return cohortCoversCourse(cohortGrantIds, courseId)
}
