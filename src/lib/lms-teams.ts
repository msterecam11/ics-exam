// Teams inside an onsite group.
//
// An assignment or exercise marked "team work" (activity_settings.team_work)
// is done once per team: one member submits and every teammate's record gets
// the same submission; the instructor marks it once and the mark, feedback and
// release reach every member. Each person keeps their own attempt / result, so
// the pass rule, progress and reports work as for individual work.
//
// Team copies of one submission share answers.team_submission (the id of the
// attempt the member actually submitted).

import { db } from "@/lib/db"
import { SEAT_STATUSES } from "@/lib/lms-groups"

export const isTeamWork = (mod: { activity_settings?: any } | null | undefined) => mod?.activity_settings?.team_work === true

export type TeamInfo = { id: string; name: string; members: { enrollment_id: string; student_id: string; name: string }[] }

/** The team of an enrolment (with its members), or null. */
export async function teamOf(enrollmentId: string): Promise<TeamInfo | null> {
  const { data: e } = await db.from("lms_enrollments").select("team_id").eq("id", enrollmentId).maybeSingle()
  const teamId = (e as any)?.team_id
  if (!teamId) return null
  const [{ data: team }, { data: members }] = await Promise.all([
    db.from("lms_group_teams").select("id, name").eq("id", teamId).maybeSingle(),
    db.from("lms_enrollments").select("id, student_id, lms_students(name)").eq("team_id", teamId).in("status", SEAT_STATUSES),
  ])
  if (!team) return null
  return {
    id: (team as any).id, name: (team as any).name,
    members: ((members ?? []) as any[]).map(m => ({ enrollment_id: m.id, student_id: m.student_id, name: m.lms_students?.name ?? "Participant" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/** Every attempt that is a copy of the same team submission (including itself). */
export async function teamCopies(attempt: { id: string; answers?: any }): Promise<string[]> {
  const key = attempt.answers?.team_submission
  if (!key) return [attempt.id]
  const { data } = await db.from("lms_module_attempts").select("id").filter("answers->>team_submission", "eq", key)
  const ids = ((data ?? []) as any[]).map(r => r.id)
  return ids.length ? ids : [attempt.id]
}
