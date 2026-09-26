import { db } from "@/lib/db"
import { getFeedbackState, getProgramSurveyState } from "@/lib/lms-feedback"
import { coursesForTrack } from "@/lib/lms-program-courses"
import {
  computeAccess, getCourseLocks, todayISO,
  type CourseAccess, type CourseLock, type EnrollmentProgram,
} from "@/lib/lms-enrollment"

// ── Student portal: "My Programs" ─────────────────────────────────────────
//
// A program membership as the student sees it: the program, their track, the
// courses they take in it (in delivery order) with progress and locks, the
// deadline that applies to THEM (a personal extension wins), and certificates.
//
// Hidden from the student: draft programs, and memberships they were withdrawn
// from. Individual programs (single-course enrollments wrapped in a program)
// aren't listed as programs — those courses simply appear under My Courses.

export type PortalCourse = {
  enrollment_id: string
  course_id: string
  group_id: string | null
  title: string
  description: string | null
  thumbnail_url: string | null
  delivery_mode: string
  status: "active" | "completed"
  progress_pct: number
  completed_at: string | null
  access: CourseAccess
  lock: CourseLock
  certificate: "released" | "held" | null
}

export type DeadlineLevel = "red" | "amber" | null

export type PortalProgram = {
  member_id: string
  member_status: "active" | "completed"
  program: EnrollmentProgram & {
    description: string | null
    reference: string | null
    company: string | null
  }
  track: { id: string; name: string } | null
  /** The end date that applies to this student (extension, else program end). */
  endDate: string | null
  extended: boolean
  access: CourseAccess
  accessNote: string | null
  notStarted: boolean
  ended: boolean
  courses: PortalCourse[]
  completedCount: number
  totalCount: number
  progressPct: number
  daysLeft: number | null
  deadline: DeadlineLevel
  certificatesReleased: number
}

const DAY = 86_400_000

/** Whole days from today (institute day) to an ISO date; negative once past. */
export function daysUntil(isoDate: string, now = new Date()): number {
  return Math.round((Date.parse(isoDate + "T00:00:00Z") - Date.parse(todayISO(now) + "T00:00:00Z")) / DAY)
}

/** Deadline colour (SP decision): 3 days or less red, 14 or less amber. */
export function deadlineLevel(daysLeft: number | null): DeadlineLevel {
  if (daysLeft === null || daysLeft < 0) return null
  if (daysLeft <= 3) return "red"
  if (daysLeft <= 14) return "amber"
  return null
}

export async function getStudentPrograms(studentId: string, opts: { programId?: string; now?: Date } = {}): Promise<PortalProgram[]> {
  const now = opts.now ?? new Date()

  let q = db
    .from("lms_program_members")
    .select(`id, status, track_id, end_date_override, program_id,
      lms_programs!inner(id, name, description, reference, status, is_individual, start_date, end_date, after_end_access,
        certificate_enabled, certificate_auto_release, progress_enforcement, lms_companies(name)),
      lms_program_tracks(id, name)`)
    .eq("student_id", studentId)
    .neq("status", "withdrawn")
    .neq("lms_programs.status", "draft")
    .eq("lms_programs.is_individual", false)
  if (opts.programId) q = q.eq("program_id", opts.programId)
  const { data: members, error } = await q
  if (error || !members?.length) return []

  const memberIds = (members as any[]).map(m => m.id)
  const { data: enrollmentRows } = await db
    .from("lms_enrollments")
    .select("id, course_id, status, completed_at, progress_pct, member_id, program_id, group_id, opens_on, lms_courses(id, title, description, thumbnail_url, delivery_mode, status)")
    .in("member_id", memberIds)
    .neq("status", "dropped")

  const enrollmentIds = ((enrollmentRows ?? []) as any[]).map(e => e.id)
  const { data: certRows } = enrollmentIds.length
    ? await db.from("lms_certificates").select("enrollment_id, released_at").in("enrollment_id", enrollmentIds)
        .is("revoked_at", null).eq("visible_to_student", true)
    : { data: [] as any[] }
  const certByEnrollment = new Map<string, "released" | "held">(
    ((certRows ?? []) as any[]).map(c => [c.enrollment_id, c.released_at ? "released" : "held"]))

  const out: PortalProgram[] = []
  for (const m of members as any[]) {
    const p = m.lms_programs
    const program: PortalProgram["program"] = {
      id: p.id, name: p.name, status: p.status, is_individual: p.is_individual,
      start_date: p.start_date, end_date: p.end_date, after_end_access: p.after_end_access,
      certificate_enabled: p.certificate_enabled, certificate_auto_release: p.certificate_auto_release,
      progress_enforcement: p.progress_enforcement,
      description: p.description ?? null, reference: p.reference ?? null, company: p.lms_companies?.name ?? null,
    }
    const member = { status: m.status, end_date_override: m.end_date_override, track_id: m.track_id }
    const { access, note } = computeAccess({ status: "active", program, member }, now)

    const endDate = m.end_date_override ?? p.end_date ?? null
    const today = todayISO(now)
    const notStarted = !!p.start_date && today < p.start_date
    const ended = p.status === "completed" || p.status === "archived" || (!!endDate && today > endDate)

    // Courses in delivery order; anything enrolled but no longer in the
    // structure goes last rather than disappearing.
    const order = await coursesForTrack(p.id, m.track_id ?? null)
    const mine = ((enrollmentRows ?? []) as any[])
      .filter(e => e.member_id === m.id)
      .sort((a, b) => {
        const ia = order.indexOf(a.course_id), ib = order.indexOf(b.course_id)
        return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib)
      })

    const locks = await getCourseLocks(
      mine.map(e => ({ course_id: e.course_id, status: e.status, program_id: p.id, member_id: m.id, program, member, access, opens_on: e.opens_on ?? null, group_id: e.group_id ?? null })),
      now,
    )
    const courses: PortalCourse[] = mine.map(e => ({
      enrollment_id: e.id,
      course_id: e.course_id,
      group_id: e.group_id ?? null,
      title: e.lms_courses?.title ?? "Untitled course",
      description: e.lms_courses?.description ?? null,
      thumbnail_url: e.lms_courses?.thumbnail_url ?? null,
      delivery_mode: e.lms_courses?.delivery_mode ?? "online",
      status: e.status,
      progress_pct: Math.min(100, Math.round(Number(e.progress_pct ?? 0))),
      completed_at: e.completed_at,
      access,
      lock: e.lms_courses?.status && e.lms_courses.status !== "published"
        ? { locked: true, kind: "not_published", reason: "This course isn't open yet. We'll let you know when it is." } as CourseLock
        : locks.get(e.course_id) ?? { locked: false },
      certificate: certByEnrollment.get(e.id) ?? null,
    }))

    const completedCount = courses.filter(c => c.status === "completed").length
    const totalCount = courses.length
    const progressPct = totalCount
      ? Math.round(courses.reduce((s, c) => s + (c.status === "completed" ? 100 : c.progress_pct), 0) / totalCount)
      : 0
    const finished = m.status === "completed" || (totalCount > 0 && completedCount === totalCount)
    const daysLeft = endDate && !ended && !finished ? daysUntil(endDate, now) : null

    out.push({
      member_id: m.id,
      member_status: m.status,
      program,
      track: m.lms_program_tracks ? { id: m.lms_program_tracks.id, name: m.lms_program_tracks.name } : null,
      endDate,
      extended: !!m.end_date_override && m.end_date_override !== p.end_date,
      access,
      accessNote: note,
      notStarted,
      ended,
      courses,
      completedCount,
      totalCount,
      progressPct,
      daysLeft,
      deadline: deadlineLevel(daysLeft),
      certificatesReleased: courses.filter(c => c.certificate === "released").length,
    })
  }

  // Running programs first (soonest deadline first), then upcoming, then ended.
  const rank = (x: PortalProgram) => (x.ended ? 2 : x.notStarted ? 1 : 0)
  return out.sort((a, b) =>
    rank(a) - rank(b)
    || (a.endDate ?? "9999").localeCompare(b.endDate ?? "9999")
    || a.program.name.localeCompare(b.program.name))
}

// ── Feedback waiting for the student (FB-2 / FB-5) ─────────────────────────

export type FeedbackRequest =
  | { kind: "course"; course_id: string; title: string; program: string | null; mandatory: boolean }
  | { kind: "program"; program_id: string; name: string }

export async function getFeedbackRequests(studentId: string, enrollments: any[]): Promise<FeedbackRequest[]> {
  const out: FeedbackRequest[] = []
  for (const e of enrollments) {
    if (e.access === "none" || e.status === "dropped") continue
    const st = await getFeedbackState({ id: e.id, course_id: e.course_id, status: e.status, program_id: e.program_id ?? null, member: e.lms_program_members ?? null })
    if (st.due) out.push({
      kind: "course", course_id: e.course_id, title: e.lms_courses?.title ?? "Course",
      program: e.lms_programs && !e.lms_programs.is_individual ? e.lms_programs.name : null, mandatory: st.settings.mandatory,
    })
  }
  const { data: members } = await db.from("lms_program_members")
    .select("id, program_id, lms_programs!inner(name, is_individual, status)")
    .eq("student_id", studentId).neq("status", "withdrawn")
    .eq("lms_programs.is_individual", false).neq("lms_programs.status", "draft")
  for (const m of (members ?? []) as any[]) {
    const st = await getProgramSurveyState(m.id)
    if (st?.due) out.push({ kind: "program", program_id: m.program_id, name: m.lms_programs.name })
  }
  return out
}

/** The course a student should open next in a program: first unlocked, unfinished one. */
export function nextCourse(p: PortalProgram): PortalCourse | null {
  if (p.access !== "full") return null
  return p.courses.find(c => c.status !== "completed" && !c.lock.locked) ?? null
}
