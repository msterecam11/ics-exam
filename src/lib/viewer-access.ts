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
    .limit(1)

  return !!membership && membership.length > 0
}
