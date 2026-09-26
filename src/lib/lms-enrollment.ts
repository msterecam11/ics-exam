import { db } from "@/lib/db"
import { coursesForTrack } from "@/lib/lms-program-courses"

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
  is_individual: boolean
  start_date: string | null
  end_date: string | null
  after_end_access: "read_only" | "full" | "locked"
  certificate_enabled: boolean
  certificate_auto_release: boolean
  external_ics_certificate?: boolean
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
  /** The onsite group (scheduled delivery) this enrolment is placed in. */
  group_id: string | null
  /** The course's own dates in the program (Structure), and a personal extension. */
  opens_on?: string | null
  due_on?: string | null
  due_override?: string | null
  /** The last day of the participant's class (onsite / external) — the default due date there. */
  class_end?: string | null
  program: EnrollmentProgram | null
  member: { status: "active" | "withdrawn" | "completed"; end_date_override: string | null; track_id: string | null } | null
  /** full = learn and submit · read_only = review only · none = no access */
  access: CourseAccess
  /** Why access is limited, for display. */
  accessNote: string | null
}

const ENROLLMENT_SELECT = `
  id, student_id, course_id, status, enrolled_at, completed_at, program_id, member_id, group_id, opens_on, due_on, due_override,
  enr_class:lms_course_groups(start_date, end_date, status),
  lms_programs(id, name, status, is_individual, start_date, end_date, after_end_access, certificate_enabled, certificate_auto_release, progress_enforcement, external_ics_certificate),
  lms_program_members(status, end_date_override, track_id)`

export function todayISO(now = new Date()) {
  // Program dates are calendar dates; compare in the institute's day (UTC+3).
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10)
}

/** Access rules for one enrollment (PM-6/7/8). */
export function computeAccess(e: Pick<EnrollmentContext, "status" | "program" | "member"> & { due_on?: string | null; due_override?: string | null; class_end?: string | null }, now = new Date()): { access: CourseAccess; note: string | null } {
  if (e.status === "dropped") return { access: "none", note: "You have been withdrawn from this course." }
  const p = e.program
  if (!p) return { access: "full", note: null }                       // enrollment from before programs
  if (p.status === "draft") return { access: "none", note: "This program has not started yet." }
  if (e.member?.status === "withdrawn") return { access: "none", note: "You have been withdrawn from this program." }

  const end = e.member?.end_date_override ?? p.end_date
  const ended = p.status === "completed" || p.status === "archived" || (!!end && todayISO(now) > end)
  if (!ended) {
    // The course's own due date (program Structure), or the participant's extension.
    // Onsite / external: by default the work is due on the class's last day.
    const due = e.due_override ?? e.due_on ?? e.class_end ?? null
    if (due && e.status === "active" && todayISO(now) > due)
      return { access: "read_only", note: `This course was due on ${fmtDay(due)} — you can review the material and your results. Ask your coordinator if you need more time.` }
    return { access: "full", note: null }
  }

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
    group_id: row.group_id ?? null,
    opens_on: row.opens_on ?? null, due_on: row.due_on ?? null, due_override: row.due_override ?? null,
    class_end: row.enr_class?.end_date ?? null,
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
export const ENROLLMENT_ACCESS_COLUMNS = `program_id, member_id, group_id, opens_on, due_on, due_override,
  enr_class:lms_course_groups(start_date, end_date, status),
  lms_programs(id, name, status, is_individual, start_date, end_date, after_end_access, certificate_enabled, certificate_auto_release, progress_enforcement, external_ics_certificate),
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
    const { access, note } = computeAccess({ status: r.status, program: r.lms_programs ?? null, member: r.lms_program_members ?? null, due_on: r.due_on ?? null, due_override: r.due_override ?? null, class_end: r.enr_class?.end_date ?? null })
    if (access !== "none") out.push({ ...r, access, accessNote: note })
  }
  return out
}


// ── Course locks (program start, sequential courses) ─────────────────────
//
// A lock keeps a course VISIBLE (it's listed, with the reason) but closes its
// content: nothing can be opened or recorded until it lifts. Two causes:
//   • the program hasn't reached its start date yet;
//   • the program uses sequential courses (progress_enforcement) and an
//     earlier course in the member's track isn't completed.
// Only full access is ever locked — review-only access after a program ends
// never is, so finished learners can always look back.

export type CourseLock =
  | { locked: false }
  | { locked: true; kind: "not_started"; reason: string; opensOn: string }
  | { locked: true; kind: "sequential"; reason: string; blockedBy: { course_id: string; title: string } }
  // A course that went back to draft (or was archived) after people were
  // enrolled. They keep their place; the course simply isn't open.
  | { locked: true; kind: "not_published"; reason: string }

type LockInput = Pick<EnrollmentContext, "course_id" | "status" | "program_id" | "member_id" | "program" | "member" | "access"> & { opens_on?: string | null; group_id?: string | null }

function fmtDay(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
}

/** Locks for several enrollments at once (list pages). Keyed by course_id. */
export async function getCourseLocks(items: LockInput[], now = new Date()): Promise<Map<string, CourseLock>> {
  const out = new Map<string, CourseLock>()
  const today = todayISO(now)
  const sequential: LockInput[] = []

  // An onsite (or external) course opens with its class: until the participant's class is
  // confirmed and its first day comes, the course is locked (the class details
  // still show on the course page).
  const live = items.filter(e => e.access === "full" && e.status === "active")
  const courseIds = [...new Set(live.map(e => e.course_id))]
  const { data: modeRows } = courseIds.length ? await db.from("lms_courses").select("id, delivery_mode").in("id", courseIds) : { data: [] as any[] }
  const onsite = new Set(((modeRows ?? []) as any[]).filter(c => c.delivery_mode === "onsite" || c.delivery_mode === "external").map(c => c.id))
  const groupIds = [...new Set(live.filter(e => onsite.has(e.course_id) && e.group_id).map(e => e.group_id!))]
  const { data: groupRows } = groupIds.length ? await db.from("lms_course_groups").select("id, status, start_date").in("id", groupIds) : { data: [] as any[] }
  const groupOf = new Map(((groupRows ?? []) as any[]).map(g => [g.id, g]))

  for (const e of items) {
    out.set(e.course_id, { locked: false })
    if (e.access !== "full" || !e.program || e.status === "dropped") continue
    if (e.program.start_date && today < e.program.start_date) {
      out.set(e.course_id, {
        locked: true, kind: "not_started", opensOn: e.program.start_date,
        reason: `This program opens on ${fmtDay(e.program.start_date)}.`,
      })
      continue
    }
    if (onsite.has(e.course_id) && e.status === "active") {
      const g = e.group_id ? groupOf.get(e.group_id) : null
      if (!g || !["confirmed", "completed"].includes(g.status)) {
        out.set(e.course_id, { locked: true, kind: "not_started", opensOn: g?.start_date ?? "", reason: "This course opens with your class — its dates will be confirmed soon." })
        continue
      }
      if (g.start_date && today < g.start_date) {
        out.set(e.course_id, { locked: true, kind: "not_started", opensOn: g.start_date, reason: `This course opens on the first day of your class, ${fmtDay(g.start_date)}.` })
        continue
      }
    }
    // The course's own opening date (program Structure).
    if (e.opens_on && today < e.opens_on && e.status === "active") {
      out.set(e.course_id, {
        locked: true, kind: "not_started", opensOn: e.opens_on,
        reason: `This course opens on ${fmtDay(e.opens_on)}.`,
      })
      continue
    }
    // A completed course is never re-locked.
    if (e.program.progress_enforcement && e.member_id && e.status === "active") sequential.push(e)
  }
  if (!sequential.length) return out

  // One order + one status lookup per program member.
  const byMember = new Map<string, LockInput[]>()
  for (const e of sequential) {
    if (!byMember.has(e.member_id!)) byMember.set(e.member_id!, [])
    byMember.get(e.member_id!)!.push(e)
  }
  const titles = new Map<string, string>()
  for (const [memberId, list] of byMember) {
    const first = list[0]
    const order = await coursesForTrack(first.program_id!, first.member?.track_id ?? null)
    const { data: rows } = await db
      .from("lms_enrollments")
      .select("course_id, status")
      .eq("member_id", memberId)
      .neq("status", "dropped")
    const status = new Map(((rows ?? []) as any[]).map(r => [r.course_id as string, r.status as string]))

    for (const e of list) {
      const pos = order.indexOf(e.course_id)
      if (pos <= 0) continue
      // The first earlier course the member is enrolled in and hasn't completed.
      const blocker = order.slice(0, pos).find(cid => status.has(cid) && status.get(cid) !== "completed")
      if (!blocker) continue
      if (!titles.has(blocker)) {
        const { data: c } = await db.from("lms_courses").select("title").eq("id", blocker).maybeSingle()
        titles.set(blocker, (c as any)?.title ?? "the previous course")
      }
      const title = titles.get(blocker)!
      out.set(e.course_id, {
        locked: true, kind: "sequential", blockedBy: { course_id: blocker, title },
        reason: `Complete "${title}" to unlock this course.`,
      })
    }
  }
  return out
}

export async function getCourseLock(e: LockInput | null, now = new Date()): Promise<CourseLock> {
  if (!e) return { locked: false }
  return (await getCourseLocks([e], now)).get(e.course_id) ?? { locked: false }
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
  const lock = await getCourseLock(e)
  if (lock.locked) return { ok: false, status: 403, error: lock.reason }
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

