import { db } from "@/lib/db"
import { coursesForTrack } from "@/lib/lms-program-courses"
import { syncEnrollmentProgress } from "@/lib/lms-completion"
import { sendEmail, buildEnrollmentEmail } from "@/lib/email"

// ── Program Manager core ────────────────────────────────────────────────
//
// A program delivers courses to its members. What a member takes is decided by
// the program's items: items with no track are for everyone; items on a track
// are for that track's members. An item is a course or a learning path (a path
// expands to its courses, in order).
//
// Each course a member takes is one ENROLLMENT (program_id + member_id). Its
// progress, attempts and certificate belong to that enrollment only.

export const PROGRAM_STATUSES = ["draft", "active", "completed", "archived"] as const
export type ProgramStatus = typeof PROGRAM_STATUSES[number]

export const PROGRAM_COLUMNS = `id, name, company_id, is_individual, reference, description, start_date, end_date,
  capacity, status, structure, after_end_access, certificate_enabled, certificate_auto_release,
  feedback_enabled, feedback_mandatory, feedback_anonymous, progress_enforcement, duplicated_from, created_at, updated_at`

// Ordered course ids delivered to a track (lives in lms-program-courses to avoid an import cycle).
export { coursesForTrack }

/** Every course the program delivers (all tracks), for rules and reports. */
export async function allProgramCourses(programId: string): Promise<string[]> {
  const { data: tracks } = await db.from("lms_program_tracks").select("id").eq("program_id", programId)
  const sets = await Promise.all([null, ...((tracks ?? []) as any[]).map(t => t.id)].map(t => coursesForTrack(programId, t)))
  return [...new Set(sets.flat())]
}

/**
 * Copies each course's current pass mark / attempts into the program's rules
 * for courses that don't have a rule yet (PM-4: copied when added, then
 * independent). Existing rules are never overwritten.
 */
export async function ensureProgramRules(programId: string): Promise<void> {
  const courseIds = await allProgramCourses(programId)
  if (!courseIds.length) return
  const [{ data: existing }, { data: courses }, { data: exams }] = await Promise.all([
    db.from("lms_program_course_rules").select("course_id").eq("program_id", programId),
    db.from("lms_courses").select("id, final_exam_pass_mark").in("id", courseIds),
    db.from("lms_modules").select("course_id, activity_settings").in("course_id", courseIds).eq("module_type", "final_exam"),
  ])
  const have = new Set(((existing ?? []) as any[]).map(r => r.course_id))
  const examByCourse = new Map(((exams ?? []) as any[]).map(m => [m.course_id, m.activity_settings]))
  const rows = ((courses ?? []) as any[])
    .filter(c => !have.has(c.id))
    .map(c => {
      const s = examByCourse.get(c.id) as any
      const pass = Number(c.final_exam_pass_mark ?? s?.pass_mark ?? 70)
      const attempts = Number(s?.max_attempts ?? 3)
      return {
        program_id: programId, course_id: c.id,
        pass_mark: Math.min(100, Math.max(0, Math.round(pass))),
        max_attempts: Math.min(20, Math.max(1, Math.round(attempts))),
      }
    })
  if (rows.length) await db.from("lms_program_course_rules").insert(rows)
}

export type SyncIssue = { student_id: string; course_id: string; reason: string }

/**
 * Brings one member's enrollments in line with what their track should take:
 *  • missing course      → new enrollment (unless the student is already
 *                          ACTIVE in that course elsewhere — reported, skipped)
 *  • withdrawn course    → reactivated if it's back in their set
 *  • course no longer in their set (track moved) → withdrawn, history kept
 * Only for active members; a withdrawn member's enrollments are all withdrawn.
 */
export async function syncMemberEnrollments(memberId: string, actorId: string | null, opts?: { notify?: boolean }):
  Promise<{ created: number; reactivated: number; withdrawn: number; issues: SyncIssue[] }> {
  const result = { created: 0, reactivated: 0, withdrawn: 0, issues: [] as SyncIssue[] }

  const { data: member } = await db
    .from("lms_program_members")
    .select("id, program_id, student_id, track_id, status, lms_programs(id, status)")
    .eq("id", memberId)
    .maybeSingle()
  if (!member) return result
  const m = member as any

  const { data: current } = await db
    .from("lms_enrollments")
    .select("id, course_id, status")
    .eq("member_id", memberId)
  const byCourse = new Map(((current ?? []) as any[]).map(e => [e.course_id, e]))

  const wanted = m.status === "withdrawn" ? [] : await coursesForTrack(m.program_id, m.track_id)
  const wantedSet = new Set(wanted)

  // Withdraw what's no longer wanted (keep completed ones as they are).
  const toWithdraw = ((current ?? []) as any[]).filter(e => !wantedSet.has(e.course_id) && e.status === "active")
  if (toWithdraw.length) {
    await db.from("lms_enrollments").update({ status: "dropped" }).in("id", toWithdraw.map(e => e.id))
    result.withdrawn = toWithdraw.length
  }

  const newlyEnrolled: string[] = []
  for (const courseId of wanted) {
    const existing = byCourse.get(courseId)
    if (existing && existing.status !== "dropped") continue

    // One ACTIVE enrollment per student per course across all programs.
    const { data: activeElsewhere } = await db
      .from("lms_enrollments")
      .select("id, lms_programs(name)")
      .eq("student_id", m.student_id).eq("course_id", courseId).eq("status", "active")
      // .neq alone would skip enrollments outside programs (member_id NULL).
      .or(`member_id.is.null,member_id.neq.${memberId}`)
      .limit(1)
    if (activeElsewhere?.length) {
      const where = (activeElsewhere[0] as any).lms_programs?.name
      result.issues.push({ student_id: m.student_id, course_id: courseId, reason: `Already active in this course${where ? ` (${where})` : ""}` })
      continue
    }

    if (existing) {
      const { error } = await db.from("lms_enrollments")
        .update({ status: "active", completed_at: null }).eq("id", existing.id)
      if (error) result.issues.push({ student_id: m.student_id, course_id: courseId, reason: "Could not reactivate" })
      else { result.reactivated++; newlyEnrolled.push(courseId) }
      continue
    }

    const { error } = await db.from("lms_enrollments").insert({
      student_id: m.student_id, course_id: courseId, status: "active",
      enrolled_at: new Date().toISOString(), enrolled_by: actorId,
      program_id: m.program_id, member_id: memberId,
    })
    if (error) {
      result.issues.push({
        student_id: m.student_id, course_id: courseId,
        reason: (error as any).code === "23505" ? "The student already has a record for this course" : "Could not enroll",
      })
    } else { result.created++; newlyEnrolled.push(courseId) }
  }

  // Keep stored progress right for reactivated enrollments.
  for (const courseId of newlyEnrolled) {
    const e = byCourse.get(courseId)
    if (e) await syncEnrollmentProgress(m.student_id, courseId, e.id)
  }

  // Tell the student, only when the program is live.
  if (opts?.notify && newlyEnrolled.length && m.lms_programs?.status === "active") {
    await notifyEnrolled(m.student_id, newlyEnrolled)
  }
  return result
}

export async function notifyEnrolled(studentId: string, courseIds: string[]) {
  const [{ data: student }, { data: courses }] = await Promise.all([
    db.from("lms_students").select("id, name, email").eq("id", studentId).maybeSingle(),
    db.from("lms_courses").select("id, title").in("id", courseIds),
  ])
  if (!(student as any)?.email) return
  for (const c of (courses ?? []) as any[]) {
    const { subject, html } = buildEnrollmentEmail({ studentName: (student as any).name, courseTitle: c.title, courseId: c.id })
    sendEmail({ type: "enrollment", to: (student as any).email, subject, html, studentId, courseId: c.id }).catch(() => {})
  }
}

/** Active members of a program (for capacity). */
export async function activeMemberCount(programId: string): Promise<number> {
  const { count } = await db.from("lms_program_members")
    .select("*", { count: "exact", head: true }).eq("program_id", programId).eq("status", "active")
  return count ?? 0
}
