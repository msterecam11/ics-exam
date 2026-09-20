import { db } from "@/lib/db"

// ── LMS viewer grants ─────────────────────────────────────────────────────
// A viewer (or a client's training manager) is granted access to a course, a
// cohort, a PROGRAM or a whole COMPANY. Program and company grants are what
// the program / client / student reports (RL-9) are gated on; everything they
// see is the client copy (no internal notes, feedback rules applied).

export type LmsGrant = { resource_type: string; resource_id: string; permissions: Record<string, boolean>; label?: string | null }

// Which report a client may open is chosen per grant: the company summary, the
// program report, or an individual learner's. Grants written before these keys
// existed carry a single `reports` flag, and a level they don't mention falls
// back to it — so nobody loses access the day this ships.
export const REPORT_LEVELS = ["report_client", "report_program", "report_group", "report_individual"] as const
export type ReportLevel = (typeof REPORT_LEVELS)[number]
const LEVELS = new Set<string>(REPORT_LEVELS)

export function grantAllows(permissions: Record<string, boolean> | null | undefined, key: string): boolean {
  const p = permissions ?? {}
  if (p[key] === true) return true
  return LEVELS.has(key) && p[key] === undefined && p.reports === true
}

export async function lmsGrants(userId: string, permission = "reports"): Promise<LmsGrant[]> {
  const { data } = await db
    .from("viewer_access")
    .select("resource_type, resource_id, permissions, label")
    .eq("user_id", userId)
    .eq("system", "lms")
  return ((data ?? []) as any[]).filter(r => grantAllows(r.permissions, permission))
}

/**
 * Programs the viewer may see at this level: granted directly, or through their
 * company. A draft program is never visible — it isn't a program the client has
 * been told about yet, whichever way the grant reaches it.
 */
export async function viewerProgramIds(userId: string, level: ReportLevel = "report_program"): Promise<string[]> {
  const grants = await lmsGrants(userId, level)
  const direct = grants.filter(g => g.resource_type === "program").map(g => g.resource_id)
  const companies = grants.filter(g => g.resource_type === "company").map(g => g.resource_id)

  const ids = new Set<string>()
  if (direct.length) {
    const { data } = await db.from("lms_programs").select("id").in("id", direct).neq("status", "draft")
    for (const p of (data ?? []) as any[]) ids.add(p.id)
  }
  if (companies.length) {
    const { data } = await db.from("lms_programs").select("id").in("company_id", companies).neq("status", "draft")
    for (const p of (data ?? []) as any[]) ids.add(p.id)
  }
  return [...ids]
}

export async function canViewProgramReport(userId: string, programId: string): Promise<boolean> {
  return (await viewerProgramIds(userId, "report_program")).includes(programId)
}

/** One course of one program — granted at the group level. */
export async function canViewGroupReport(userId: string, programId: string): Promise<boolean> {
  return (await viewerProgramIds(userId, "report_group")).includes(programId)
}

export async function canViewClientReport(userId: string, companyId: string): Promise<boolean> {
  const grants = await lmsGrants(userId, "report_client")
  return grants.some(g => g.resource_type === "company" && g.resource_id === companyId)
}

/** The student must also be in that program (not withdrawn) to open their report. */
export async function canViewStudentInProgram(userId: string, programId: string, studentId: string): Promise<boolean> {
  if (!(await viewerProgramIds(userId, "report_individual")).includes(programId)) return false
  const { data } = await db.from("lms_program_members").select("id")
    .eq("program_id", programId).eq("student_id", studentId).neq("status", "withdrawn").maybeSingle()
  return !!data
}

/** One enrollment's course report, when its program is one the viewer may see. */
export async function canViewEnrollmentReport(userId: string, enrollmentId: string): Promise<{ studentId: string; courseId: string } | null> {
  const { data } = await db.from("lms_enrollments").select("student_id, course_id, program_id").eq("id", enrollmentId).maybeSingle()
  const e = data as any
  if (!e?.program_id) return null
  if (!(await viewerProgramIds(userId, "report_individual")).includes(e.program_id)) return null
  return { studentId: e.student_id, courseId: e.course_id }
}

// Does this viewer user have "reports" permission covering this student's
// course — either a direct course-scope grant, or a cohort-scope grant where
// the student is a member of that cohort?
export async function canViewLmsReport(userId: string, studentId: string, courseId: string): Promise<boolean> {
  // One learner's results — the individual level.
  const grants = await lmsGrants(userId, "report_individual")
  if (grants.length === 0) return false

  // Program / company grant: the student takes this course inside a program the
  // viewer may see.
  const programIds = await viewerProgramIds(userId, "report_individual")

  // A course grant covers the course, not everyone on it: the same course runs
  // for several clients. It opens a learner's report only when that learner is
  // an individual (no program) or sits in a program this viewer may see.
  const courseGrant = grants.find((r: any) => r.resource_type === "course" && r.resource_id === courseId)
  if (courseGrant) {
    const { data: rows } = await db.from("lms_enrollments").select("program_id")
      .eq("student_id", studentId).eq("course_id", courseId)
    if ((rows ?? []).some((e: any) => !e.program_id || programIds.includes(e.program_id))) return true
  }

  if (programIds.length) {
    const { data: inProgram } = await db.from("lms_enrollments").select("id")
      .eq("student_id", studentId).eq("course_id", courseId).in("program_id", programIds).limit(1)
    if (inProgram && inProgram.length > 0) return true
  }

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
 * Exam-system candidate access. A viewer's grant may sit at exam, course or
 * group level, and access flows down that hierarchy:
 *   grant on the exam → the exam's course → that course's group.
 *
 * NOTE: the same rule is currently also inlined in the viewer API routes
 * (exam-report, exam-result, manual-*). Those still work and are left alone
 * here so a security fix isn't mixed with a refactor of working code — but
 * they should be collapsed onto this helper, since duplicated authorization
 * logic is exactly the kind of thing that drifts apart.
 */
export async function canViewExamCandidate(userId: string, candidateId: string): Promise<boolean> {
  const { data: rows } = await db
    .from("viewer_access")
    .select("resource_type, resource_id, permissions")
    .eq("user_id", userId)
    .eq("system", "exam")

  const grants = (rows ?? []).filter((r: any) => (r.permissions ?? {}).reports === true)
  if (grants.length === 0) return false

  const { data: candidate } = await db
    .from("candidates")
    .select("exam_id")
    .eq("id", candidateId)
    .single()
  const examId = (candidate as any)?.exam_id
  if (!examId) return false

  if (grants.some((g: any) => g.resource_type === "exam" && g.resource_id === examId)) return true

  const { data: exam } = await db.from("exams").select("course_id").eq("id", examId).single()
  const courseId = (exam as any)?.course_id
  if (!courseId) return false

  if (grants.some((g: any) => g.resource_type === "course" && g.resource_id === courseId)) return true

  const { data: course } = await db.from("courses").select("group_id").eq("id", courseId).single()
  const groupId = (course as any)?.group_id
  if (!groupId) return false

  return grants.some((g: any) => g.resource_type === "group" && g.resource_id === groupId)
}

/**
 * Cohort-level (whole-course) report access. A course-scope grant covers it
 * directly; a cohort-scope grant covers it when that cohort includes the course.
 */
export async function canViewLmsCourseReport(userId: string, courseId: string): Promise<boolean> {
  const grants = await lmsGrants(userId, "report_individual")
  if (grants.length === 0) return false

  if (grants.some((r: any) => r.resource_type === "course" && r.resource_id === courseId)) return true

  const cohortGrantIds = grants.filter((r: any) => r.resource_type === "cohort").map((r: any) => r.resource_id)
  if (cohortGrantIds.length === 0) return false
  return cohortCoversCourse(cohortGrantIds, courseId)
}
