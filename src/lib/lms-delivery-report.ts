// One onsite group's report (a "delivery"): who took part, their attendance
// day by day, each part of the pass rule, the result and the certificate —
// plus what participants said (evaluations) and the impact questionnaire.
//
// audience "client": what the client company receives. Instructor ratings,
// participants' written comments and impact examples stay internal.

import { db } from "@/lib/db"
import { SEAT_STATUSES, groupLabel, groupDates } from "@/lib/lms-groups"
import { attendanceCredit } from "@/lib/lms-sessions"
import { evaluatePassRule } from "@/lib/lms-pass-rule"
import { MODULE_CRITERIA, INSTRUCTOR_CRITERIA } from "@/lib/lms-evaluation-questions"

export type DeliveryAudience = "internal" | "client"
type DayMark = "present" | "late" | "absent" | "excused" | "—"

export type DeliveryReport = {
  audience: DeliveryAudience
  generatedAt: string
  group: { id: string; label: string; dates: string; status: string; city: string | null; venue: string | null; dailyTimes: string | null; seats: number | null }
  course: { id: string; title: string; code: string | null }
  program: { id: string; name: string; client: string | null; logo: string | null } | null
  staff: { instructors: string[]; facilitators: string[]; provider: string | null }
  days: { id: string; date: string; title: string }[]
  /** The pass rule's parts, in order (empty = "pass the final exam"). */
  components: { key: string; label: string; weight: number; required: boolean; requirement: string | null }[]
  passMark: number | null
  participants: {
    name: string; email: string; company: string | null
    days: DayMark[]; attendancePct: number | null
    components: Record<string, number | null>
    score: number | null
    result: "passed" | "not_passed" | "pending"
    reasons: string[]
    certificate: "released" | "held" | null
  }[]
  summary: {
    participants: number; passed: number; notPassed: number; pending: number
    passRate: number | null; avgScore: number | null; avgAttendance: number | null; certificates: number
  }
  evaluations: {
    modules: { title: string; responses: number; avg: number | null; criteria: { label: string; avg: number | null }[] }[]
    instructors: { name: string; responses: number; avg: number | null; criteria: { label: string; avg: number | null }[] }[] | null
    comments: string[] | null
  }
  impact: { enabled: boolean; responses: number; avgScore: number | null; examples: string[] | null }
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)
const pctAvg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)

export async function buildDeliveryReport(groupId: string, audience: DeliveryAudience): Promise<DeliveryReport | null> {
  const { data: g } = await db.from("lms_course_groups")
    .select("id, course_id, program_id, name, start_date, end_date, daily_start, daily_end, city, venue_name, seats, status, lms_service_providers(name)")
    .eq("id", groupId).maybeSingle()
  if (!g) return null
  const grp = g as any
  const internal = audience === "internal"

  const [{ data: course }, { data: prog }, { data: staff }, { data: days }, { data: enrols }] = await Promise.all([
    db.from("lms_courses").select("id, title, course_code, completion_rules, impact_enabled").eq("id", grp.course_id).single(),
    grp.program_id ? db.from("lms_programs").select("id, name, lms_companies(name, logo_url)").eq("id", grp.program_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("lms_group_staff").select("role, admin_users(name)").eq("group_id", groupId),
    db.from("lms_sessions").select("id, title, session_date, start_time, duration_minutes, late_threshold").eq("group_id", groupId).order("session_date"),
    db.from("lms_enrollments").select("id, student_id, status, lms_students(name, email, company), lms_programs(lms_companies(name))")
      .eq("group_id", groupId).in("status", SEAT_STATUSES),
  ])
  const dayRows = (days ?? []) as any[]
  const people = ((enrols ?? []) as any[]).sort((a, b) => (a.lms_students?.name ?? "").localeCompare(b.lms_students?.name ?? ""))
  const studentIds = people.map(p => p.student_id)
  const enrIds = people.map(p => p.id)

  const [{ data: att }, { data: certs }, { data: evals }, { data: impact }, { data: mods }] = await Promise.all([
    dayRows.length && studentIds.length
      ? db.from("lms_attendance").select("session_id, student_id, status, check_in_at, check_out_at, minutes_attended").in("session_id", dayRows.map(d => d.id)).in("student_id", studentIds)
      : Promise.resolve({ data: [] as any[] }),
    enrIds.length ? db.from("lms_certificates").select("enrollment_id, released_at, revoked_at").in("enrollment_id", enrIds) : Promise.resolve({ data: [] as any[] }),
    db.from("lms_evaluations").select("subject_type, subject_id, ratings, comment").eq("group_id", groupId),
    db.from("lms_impact_responses").select("impact_score, answers").eq("group_id", groupId),
    db.from("lms_modules").select("id, title, order_index").eq("course_id", grp.course_id).order("order_index"),
  ])
  const attBy = new Map(((att ?? []) as any[]).map(a => [`${a.session_id}:${a.student_id}`, a]))
  const certBy = new Map(((certs ?? []) as any[]).filter(c => !c.revoked_at).map(c => [c.enrollment_id, c.released_at ? "released" as const : "held" as const]))

  // The pass rule, per participant (a few at a time).
  const results = new Map<string, Awaited<ReturnType<typeof evaluatePassRule>>>()
  for (let i = 0; i < people.length; i += 6)
    await Promise.all(people.slice(i, i + 6).map(async p => results.set(p.id, await evaluatePassRule(p.id).catch(() => null))))
  const first = [...results.values()].find(r => r && r.components.length)
  const components = (first?.components ?? []).map(c => ({ key: c.key, label: c.label, weight: c.weight, required: c.required, requirement: c.requirement }))

  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
  const participants = people.map(p => {
    const marks: DayMark[] = []
    let counted = 0, credit = 0
    for (const d of dayRows) {
      const a = attBy.get(`${d.id}:${p.student_id}`)
      marks.push(a ? a.status : "—")
      if (d.session_date > today) continue
      const c = attendanceCredit(a, d)
      if (c === null) continue
      counted++; credit += c
    }
    const r = results.get(p.id)
    const passed = !!r?.passed || p.status === "completed"
    return {
      name: p.lms_students?.name ?? "Participant", email: internal ? p.lms_students?.email ?? "" : "",
      company: p.lms_programs?.lms_companies?.name ?? p.lms_students?.company ?? null,
      days: marks, attendancePct: counted ? Math.round((credit / counted) * 100) : null,
      components: Object.fromEntries((r?.components ?? []).map(c => [c.key, c.score])),
      score: r?.score ?? null,
      result: passed ? "passed" as const : r?.pending ? "pending" as const : "not_passed" as const,
      reasons: passed ? [] : r?.reasons ?? [],
      certificate: certBy.get(p.id) ?? null,
    }
  })

  const decided = participants.filter(p => p.result !== "pending")
  const passedN = participants.filter(p => p.result === "passed").length

  // Evaluations: module averages for everyone; instructors and comments internal only.
  const rows = (evals ?? []) as any[]
  const summarise = (type: "module" | "instructor", id: string) => {
    const mine = rows.filter(r => r.subject_type === type && r.subject_id === id)
    const crit = type === "module" ? MODULE_CRITERIA : INSTRUCTOR_CRITERIA
    const all = mine.flatMap(r => crit.map(c => Number(r.ratings?.[c.key])).filter(n => n >= 1 && n <= 5))
    return { responses: mine.length, avg: avg(all), criteria: crit.map(c => ({ label: c.label, avg: avg(mine.map(r => Number(r.ratings?.[c.key])).filter(n => n >= 1 && n <= 5)) })) }
  }
  const modTitle = new Map(((mods ?? []) as any[]).map(m => [m.id, m.title]))
  const evalModules = [...new Set(rows.filter(r => r.subject_type === "module").map(r => r.subject_id))]
    .sort((a, b) => ((mods ?? []) as any[]).findIndex(m => m.id === a) - ((mods ?? []) as any[]).findIndex(m => m.id === b))
    .map(id => ({ title: modTitle.get(id) ?? "Module", ...summarise("module", id) }))
  const staffRows = (staff ?? []) as any[]
  let instructors: DeliveryReport["evaluations"]["instructors"] = null
  if (internal) {
    const ids = [...new Set(rows.filter(r => r.subject_type === "instructor").map(r => r.subject_id))]
    const { data: users } = ids.length ? await db.from("admin_users").select("id, name").in("id", ids) : { data: [] as any[] }
    const nameOf = new Map(((users ?? []) as any[]).map(u => [u.id, u.name]))
    instructors = ids.map(id => ({ name: nameOf.get(id) ?? "Instructor", ...summarise("instructor", id) }))
  }
  const imp = (impact ?? []) as any[]

  return {
    audience, generatedAt: new Date().toISOString(),
    group: {
      id: grp.id, label: groupLabel(grp), dates: groupDates(grp), status: grp.status, city: grp.city, venue: grp.venue_name,
      dailyTimes: grp.daily_start ? `${String(grp.daily_start).slice(0, 5)}–${String(grp.daily_end ?? "").slice(0, 5)}` : null, seats: grp.seats,
    },
    course: { id: (course as any).id, title: (course as any).title, code: (course as any).course_code },
    program: prog ? { id: (prog as any).id, name: (prog as any).name, client: (prog as any).lms_companies?.name ?? null, logo: (prog as any).lms_companies?.logo_url ?? null } : null,
    staff: {
      instructors: staffRows.filter(s => s.role === "instructor").map(s => s.admin_users?.name).filter(Boolean),
      facilitators: staffRows.filter(s => s.role === "facilitator").map(s => s.admin_users?.name).filter(Boolean),
      provider: grp.lms_service_providers?.name ?? null,
    },
    days: dayRows.map(d => ({ id: d.id, date: d.session_date, title: d.title })),
    components, passMark: first?.passMark ?? null,
    participants,
    summary: {
      participants: participants.length, passed: passedN, notPassed: participants.filter(p => p.result === "not_passed").length,
      pending: participants.filter(p => p.result === "pending").length,
      passRate: decided.length ? Math.round((passedN / decided.length) * 100) : null,
      avgScore: pctAvg(participants.map(p => p.score).filter((n): n is number => typeof n === "number")),
      avgAttendance: pctAvg(participants.map(p => p.attendancePct).filter((n): n is number => typeof n === "number")),
      certificates: participants.filter(p => p.certificate).length,
    },
    evaluations: {
      modules: evalModules, instructors,
      comments: internal ? rows.filter(r => r.comment).map(r => r.comment as string) : null,
    },
    impact: {
      enabled: !!(course as any).impact_enabled, responses: imp.length,
      avgScore: imp.length ? Math.round(imp.reduce((a, r) => a + Number(r.impact_score ?? 0), 0) / imp.length) : null,
      examples: internal ? imp.map(r => r.answers?.example).filter(Boolean) : null,
    },
  }
}
