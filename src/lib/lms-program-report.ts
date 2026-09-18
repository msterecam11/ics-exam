import { db } from "@/lib/db"
import { coursesForTrack } from "@/lib/lms-program-courses"
import { completionRate, passRate, averageScore, atRiskReasons } from "@/lib/lms-metrics"
import { selectAll } from "@/lib/lms-report-cache"
import { readFeedbackRatings, readFeedbackComments, COURSE_RATING_LABELS, FEEDBACK_ROW_COLUMNS } from "@/lib/lms-feedback"
import { clientSafeFeedback, type FeedbackSummary, type RatingSummary } from "@/lib/lms-report-shared"
export { clientSafeFeedback, type FeedbackSummary, type RatingSummary }

// ── Report levels above one course (RL-4 … RL-8, FB-7) ────────────────────
//
// Built from per-enrollment "facts" (status, progress, best exam result,
// attempts, last activity, attendance, certificate, feedback) loaded in a few
// bulk queries, then aggregated with the shared metric definitions.

const todayISO = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
const round = (n: number) => Math.round(n)
const maxIso = (...v: (string | null | undefined)[]) => v.filter(Boolean).sort().pop() ?? null

export type EnrollmentFacts = {
  enrollment_id: string
  student_id: string
  course_id: string
  program_id: string | null
  member_id: string | null
  status: "active" | "completed" | "dropped"
  progress: number
  timeS: number
  enrolledAt: string
  completedAt: string | null
  exam: { exists: boolean; sat: boolean; passed: boolean; bestPct: number | null; attempts: number; maxAttempts: number }
  lastActivity: string | null
  attendance: { counted: number; present: number }
  certificate: { status: "released" | "held"; code: string } | null
  feedbackAsked: boolean
}

type FactsFilter = { programId?: string; courseId?: string }

export async function loadEnrollmentFacts(filter: FactsFilter): Promise<EnrollmentFacts[]> {
  const scoped = (q: any, path = "") => {
    if (filter.programId) q = q.eq(`${path}program_id`, filter.programId)
    if (filter.courseId)  q = q.eq(`${path}course_id`, filter.courseId)
    return q
  }
  const enrollments = await selectAll<any>((from, to) =>
    scoped(db.from("lms_enrollments").select("id, student_id, course_id, program_id, member_id, status, progress_pct, time_spent_s, enrolled_at, completed_at, lms_program_members(track_id)"))
      .order("enrolled_at").range(from, to))
  if (!enrollments.length) return []

  const J = "lms_enrollments!inner(program_id, course_id)"
  const joined = (table: string, cols: string) => (from: number, to: number) =>
    scoped(db.from(table).select(`${cols}, ${J}`), "lms_enrollments.").range(from, to)

  const courseIds = [...new Set(enrollments.map(e => e.course_id))]
  const programIds = [...new Set(enrollments.map(e => e.program_id).filter(Boolean))] as string[]

  const [attempts, pkg, prog, certs, examMods, rules, sessions] = await Promise.all([
    selectAll<any>(joined("lms_module_attempts", "enrollment_id, module_id, score, max_score, passed, started_at, submitted_at, graded_at")),
    selectAll<any>(joined("lms_package_progress", "enrollment_id, updated_at")),
    selectAll<any>(joined("lms_progress", "enrollment_id, updated_at")),
    selectAll<any>(joined("lms_certificates", "enrollment_id, verification_code, released_at, revoked_at")),
    db.from("lms_modules").select("id, course_id, order_index, activity_settings").in("course_id", courseIds).eq("module_type", "final_exam").order("order_index"),
    programIds.length ? db.from("lms_program_course_rules").select("program_id, course_id, max_attempts").in("program_id", programIds) : Promise.resolve({ data: [] as any[] }),
    programIds.length
      ? selectAll<any>((from, to) => db.from("lms_sessions").select("id, program_id, track_id, course_id, session_date").in("program_id", programIds).in("course_id", courseIds).lte("session_date", todayISO()).range(from, to))
      : Promise.resolve([] as any[]),
  ])
  const sessionIds = sessions.map(s => s.id)
  const attendance: any[] = []
  for (let i = 0; i < sessionIds.length; i += 150) {
    const chunk = sessionIds.slice(i, i + 150)
    attendance.push(...await selectAll<any>((from, to) => db.from("lms_attendance").select("session_id, student_id, status, scanned_at").in("session_id", chunk).range(from, to)))
  }

  const examByCourse = new Map<string, any>()
  for (const m of (examMods.data ?? []) as any[]) if (!examByCourse.has(m.course_id)) examByCourse.set(m.course_id, m)
  const ruleKey = (p: string, c: string) => `${p}:${c}`
  const maxByRule = new Map<string, number>(((rules.data ?? []) as any[]).map(r => [ruleKey(r.program_id, r.course_id), Number(r.max_attempts)]))

  const group = <T,>(rows: T[], key: (r: T) => string) => {
    const m = new Map<string, T[]>()
    for (const r of rows) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r) }
    return m
  }
  const attemptsBy = group(attempts, a => a.enrollment_id)
  const pkgBy = group(pkg, p => p.enrollment_id)
  const progBy = group(prog, p => p.enrollment_id)
  const certBy = new Map<string, any>(certs.filter(c => !c.revoked_at).map(c => [c.enrollment_id, c]))
  const attBySessionStudent = new Map<string, any>(attendance.map(a => [`${a.session_id}:${a.student_id}`, a]))

  return enrollments.map(e => {
    const examMod = examByCourse.get(e.course_id)
    const mine = (attemptsBy.get(e.id) ?? []).filter(a => examMod && a.module_id === examMod.id)
    const pcts = mine.map(a => (Number(a.max_score) > 0 ? round((Number(a.score) / Number(a.max_score)) * 100) : null)).filter((v): v is number => v !== null)
    const maxAttempts = e.program_id && maxByRule.has(ruleKey(e.program_id, e.course_id))
      ? maxByRule.get(ruleKey(e.program_id, e.course_id))!
      : Number(examMod?.activity_settings?.max_attempts ?? 3)
    const passed = mine.some(a => a.passed)
    const trackId = e.lms_program_members?.track_id ?? null

    // Past sessions of this enrollment's program + track; excused ones don't count.
    let counted = 0, present = 0
    for (const s of sessions) {
      if (s.program_id !== e.program_id || s.course_id !== e.course_id) continue
      if (s.track_id !== null && s.track_id !== trackId) continue
      const a = attBySessionStudent.get(`${s.id}:${e.student_id}`)
      if (a?.status === "excused") continue
      counted++
      if (a?.status === "present" || a?.status === "late") present++
    }

    const allAttempts = attemptsBy.get(e.id) ?? []
    const lastActivity = maxIso(
      ...(pkgBy.get(e.id) ?? []).map(p => p.updated_at),
      ...(progBy.get(e.id) ?? []).map(p => p.updated_at),
      ...allAttempts.map(a => a.graded_at ?? a.submitted_at ?? a.started_at),
    )
    const cert = certBy.get(e.id)
    const exhausted = mine.length > 0 && !passed && mine.length >= maxAttempts

    return {
      enrollment_id: e.id, student_id: e.student_id, course_id: e.course_id,
      program_id: e.program_id ?? null, member_id: e.member_id ?? null,
      status: e.status, progress: Math.min(100, Math.round(Number(e.progress_pct ?? 0))),
      timeS: Number(e.time_spent_s ?? 0), enrolledAt: e.enrolled_at, completedAt: e.completed_at,
      exam: { exists: !!examMod, sat: mine.length > 0, passed, bestPct: pcts.length ? Math.max(...pcts) : null, attempts: mine.length, maxAttempts },
      lastActivity,
      attendance: { counted, present },
      certificate: cert ? { status: cert.released_at ? "released" : "held", code: cert.verification_code } : null,
      feedbackAsked: e.status === "completed" || exhausted,
    } satisfies EnrollmentFacts
  })
}

// ── Feedback summary (FB-7) ──────────────────────────────────────────────

function summarize(rows: { ratings: Record<string, number | null>; recommend?: string | null; comments: { wentWell?: string | null; improve?: string | null; general?: string | null }; anonymous: boolean }[],
  labels: [string, string][], asked: number): FeedbackSummary {
  const ratings = labels.map(([key, label]) => {
    const vals = rows.map(r => r.ratings[key]).filter((v): v is number => typeof v === "number" && v >= 1 && v <= 5)
    const dist = [0, 0, 0, 0, 0]
    for (const v of vals) dist[Math.round(v) - 1]++
    const sum = vals.reduce((a, b) => a + b, 0)
    return { key, label, avg: vals.length ? Math.round((sum / vals.length) * 10) / 10 : null, count: vals.length, sum, dist }
  }).filter(r => r.count > 0)
  const rec = { yes: 0, maybe: 0, no: 0, answered: 0 }
  for (const r of rows) if (r.recommend === "yes" || r.recommend === "maybe" || r.recommend === "no") { rec[r.recommend]++; rec.answered++ }
  const comments = rows.flatMap(r => [
    r.comments.wentWell && { kind: "went_well" as const, text: r.comments.wentWell },
    r.comments.improve && { kind: "improve" as const, text: r.comments.improve },
    r.comments.general && { kind: "comment" as const, text: r.comments.general },
  ].filter(Boolean) as FeedbackSummary["comments"])
  return {
    asked, responses: rows.length, responseRate: asked > 0 ? Math.min(100, round((rows.length / asked) * 100)) : null,
    ratings,
    recommend: rec.answered ? { ...rec, yesPct: round((rec.yes / rec.answered) * 100) } : null,
    comments,
    anonymousShare: rows.filter(r => r.anonymous).length,
  }
}

export function mergeFeedback(list: FeedbackSummary[]): FeedbackSummary {
  const byKey = new Map<string, RatingSummary>()
  for (const s of list) for (const r of s.ratings) {
    const cur = byKey.get(r.key) ?? { key: r.key, label: r.label, avg: null, count: 0, sum: 0, dist: [0, 0, 0, 0, 0] }
    cur.count += r.count; cur.sum += r.sum; cur.dist = cur.dist.map((d, i) => d + r.dist[i])
    byKey.set(r.key, cur)
  }
  const ratings = [...byKey.values()].map(r => ({ ...r, avg: r.count ? Math.round((r.sum / r.count) * 10) / 10 : null }))
  const rec = list.reduce((a, s) => s.recommend ? { yes: a.yes + s.recommend.yes, maybe: a.maybe + s.recommend.maybe, no: a.no + s.recommend.no, answered: a.answered + s.recommend.answered } : a, { yes: 0, maybe: 0, no: 0, answered: 0 })
  const asked = list.reduce((a, s) => a + s.asked, 0), responses = list.reduce((a, s) => a + s.responses, 0)
  return {
    asked, responses, responseRate: asked > 0 ? Math.min(100, round((responses / asked) * 100)) : null,
    ratings, recommend: rec.answered ? { ...rec, yesPct: round((rec.yes / rec.answered) * 100) } : null,
    comments: list.flatMap(s => s.comments),
    anonymousShare: list.reduce((a, s) => a + s.anonymousShare, 0),
  }
}

export const SURVEY_RATING_LABELS: [string, string][] = [["overall", "Overall satisfaction"], ["organisation", "Organisation"], ["instructor", "Instructor(s)"]]

async function courseFeedbackFor(facts: EnrollmentFacts[]): Promise<Map<string, FeedbackSummary>> {
  const ids = facts.map(f => f.enrollment_id)
  const rows: any[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await db.from("lms_feedback").select(`${FEEDBACK_ROW_COLUMNS}, lms_programs(feedback_anonymous)`).in("enrollment_id", ids.slice(i, i + 150))
    rows.push(...(data ?? []))
  }
  const byEnrollment = new Map(rows.map(r => [r.enrollment_id, r]))
  const byCourse = new Map<string, EnrollmentFacts[]>()
  for (const f of facts) { if (!byCourse.has(f.course_id)) byCourse.set(f.course_id, []); byCourse.get(f.course_id)!.push(f) }
  const out = new Map<string, FeedbackSummary>()
  for (const [courseId, list] of byCourse) {
    const given = list.map(f => byEnrollment.get(f.enrollment_id)).filter(Boolean)
    const asked = list.filter(f => f.feedbackAsked || byEnrollment.has(f.enrollment_id)).length
    out.set(courseId, summarize(given.map(r => {
      const c = readFeedbackComments(r)
      return { ratings: readFeedbackRatings(r) as any, recommend: r.recommend, comments: c, anonymous: !!r.is_anonymous || r.lms_programs?.feedback_anonymous === true }
    }), COURSE_RATING_LABELS as [string, string][], asked))
  }
  return out
}

// ── Program report (RL-5) / track report (RL-4) ───────────────────────────

export type ProgramRosterRow = {
  student_id: string; member_id: string; name: string; email: string; employee_number: string | null; job_title: string | null
  track: string | null; status: "active" | "completed" | "withdrawn"
  coursesDone: number; coursesTotal: number; progress: number; avgScore: number | null; examsPassed: number; examsSat: number
  certificates: number; timeS: number; attendancePct: number | null; lastActivity: string | null
  endDate: string | null; extended: boolean; atRisk: string[]
}

export type CourseRow = {
  course_id: string; title: string
  enrolled: number; completed: number; completionRate: number | null
  sat: number; passed: number; passRate: number | null
  avgScore: number | null; avgProgress: number | null; avgTimeS: number
  certificates: number; feedbackAvg: number | null; feedbackResponses: number
}

export type ProgramReport = {
  generatedAt: string
  scope: { trackId: string | null; trackName: string | null }
  program: {
    id: string; name: string; reference: string | null; description: string | null; status: string; structure: string
    start_date: string | null; end_date: string | null; is_individual: boolean
    feedback_anonymous: boolean
    company: { id: string; name: string; code: string; logo_url: string | null } | null
  }
  tracks: { id: string; name: string }[]
  stats: {
    members: number; active: number; completedMembers: number; withdrawn: number
    enrollments: number; completedEnrollments: number; completionRate: number | null
    sat: number; passed: number; passRate: number | null
    scoreSum: number; scoreCount: number; avgScore: number | null
    avgProgress: number | null; avgTimeS: number; certificates: number
    attendancePct: number | null; attendanceCounted: number; attendancePresent: number
    overdue: number; dueSoon: number; atRisk: number
  }
  trackComparison: { trackId: string | null; name: string; students: number; avgProgress: number | null; completionRate: number | null; passRate: number | null; avgScore: number | null }[]
  courses: CourseRow[]
  atRisk: { student_id: string; name: string; track: string | null; reasons: { course: string; reason: string }[] }[]
  feedback: FeedbackSummary
  survey: FeedbackSummary
  roster: ProgramRosterRow[]
  /** Charts (v4). Cumulative completed course enrollments per week. */
  timeline: ProgressTimeline
  /** Best exam score per enrollment that sat it, in SCORE_BANDS. */
  scoreBands: number[]
  byJobTitle: { title: string; students: number; avgProgress: number | null; avgScore: number | null }[]
}

export type ProgressTimeline = { start: string | null; end: string | null; total: number; points: { date: string; completed: number }[] }
/** Bands: below 50, 50–59, 60–69, 70–79, 80–89, 90–100 (labels live in ReportCharts). */
export function scoreBandsOf(pcts: (number | null)[]): number[] {
  const bands = [0, 0, 0, 0, 0, 0]
  for (const p of pcts) {
    if (typeof p !== "number" || !Number.isFinite(p)) continue
    bands[p < 50 ? 0 : p >= 90 ? 5 : Math.floor(p / 10) - 4]++
  }
  return bands
}

/** Weekly cumulative completions from the start date to today (or the end, if earlier). */
function progressTimeline(facts: EnrollmentFacts[], start: string | null, end: string | null): ProgressTimeline {
  const total = facts.length
  const done = facts.filter(f => f.status === "completed" && f.completedAt).map(f => f.completedAt!.slice(0, 10)).sort()
  const first = start ?? facts.map(f => f.enrolledAt.slice(0, 10)).sort()[0] ?? null
  if (!first || !total) return { start, end, total, points: [] }
  const today = todayISO()
  const last = [end && end < today ? end : today, done[done.length - 1] ?? first].sort().pop()!
  const points: { date: string; completed: number }[] = []
  const DAY = 86_400_000
  for (let t = Date.parse(first + "T00:00:00Z"); ; t += 7 * DAY) {
    const date = new Date(Math.min(t, Date.parse(last + "T00:00:00Z"))).toISOString().slice(0, 10)
    points.push({ date, completed: done.filter(d => d <= date).length })
    if (date >= last || points.length > 260) break
  }
  return { start: first, end, total, points }
}

function courseRows(facts: EnrollmentFacts[], titles: Map<string, string>, order: string[], fb: Map<string, FeedbackSummary>): CourseRow[] {
  const ids = [...new Set(facts.map(f => f.course_id))].sort((a, b) => (order.indexOf(a) + 1 || 1e9) - (order.indexOf(b) + 1 || 1e9))
  return ids.map(course_id => {
    const list = facts.filter(f => f.course_id === course_id && f.status !== "dropped")
    const c = completionRate(list), p = passRate(list.map(f => f.exam)), s = averageScore(list.map(f => f.exam.bestPct))
    const summary = fb.get(course_id)
    const overall = summary?.ratings.find(r => r.key === "overall")
    return {
      course_id, title: titles.get(course_id) ?? "Course",
      enrolled: c.counted, completed: c.completed, completionRate: c.rate,
      sat: p.sat, passed: p.passed, passRate: p.rate, avgScore: s.avg,
      avgProgress: list.length ? round(list.reduce((a, f) => a + f.progress, 0) / list.length) : null,
      avgTimeS: list.length ? round(list.reduce((a, f) => a + f.timeS, 0) / list.length) : 0,
      certificates: list.filter(f => f.certificate).length,
      feedbackAvg: overall?.avg ?? null, feedbackResponses: summary?.responses ?? 0,
    }
  })
}

export async function buildProgramReport(programId: string, opts: { trackId?: string | null } = {}): Promise<ProgramReport | null> {
  const { data: p } = await db.from("lms_programs")
    .select("id, name, reference, description, status, structure, start_date, end_date, is_individual, feedback_anonymous, lms_companies(id, name, code, logo_url)")
    .eq("id", programId).maybeSingle()
  if (!p) return null
  const program = p as any

  const [{ data: tracksData }, members, allFacts, { data: surveyRows }] = await Promise.all([
    db.from("lms_program_tracks").select("id, name, order_index").eq("program_id", programId).order("order_index"),
    selectAll<any>((from, to) => db.from("lms_program_members")
      .select("id, student_id, track_id, status, end_date_override, lms_students(id, name, email, employee_number, job_title)")
      .eq("program_id", programId).range(from, to)),
    loadEnrollmentFacts({ programId }),
    db.from("lms_program_feedback").select("member_id, rating_overall, rating_organisation, rating_instructor, recommend, comment_went_well, comment_improve, is_anonymous").eq("program_id", programId),
  ])
  const tracks = ((tracksData ?? []) as any[]).map(t => ({ id: t.id, name: t.name }))
  const trackName = new Map(tracks.map(t => [t.id, t.name]))
  const trackId = opts.trackId && trackName.has(opts.trackId) ? opts.trackId : null

  const scopedMembers = members.filter(m => !trackId || m.track_id === trackId)
  const memberIds = new Set(scopedMembers.map(m => m.id))
  const facts = allFacts.filter(f => f.member_id && memberIds.has(f.member_id))

  const courseIds = [...new Set(facts.map(f => f.course_id))]
  const [{ data: courseData }, order] = await Promise.all([
    courseIds.length ? db.from("lms_courses").select("id, title").in("id", courseIds) : Promise.resolve({ data: [] as any[] }),
    coursesForTrack(programId, trackId),
  ])
  const titles = new Map(((courseData ?? []) as any[]).map(c => [c.id, c.title]))
  const courseFeedback = await courseFeedbackFor(facts.filter(f => f.status !== "dropped"))

  const today = todayISO()
  const roster: ProgramRosterRow[] = scopedMembers.map(m => {
    const mine = facts.filter(f => f.member_id === m.id)
    const live = mine.filter(f => f.status !== "dropped")
    const endDate = m.end_date_override ?? program.end_date ?? null
    const reasons = m.status === "active" ? live.flatMap(f => atRiskReasons({
      status: f.status, progress: f.progress, lastActivity: f.lastActivity, enrolledAt: f.enrolledAt,
      startDate: program.start_date, endDate, exam: f.exam.exists ? f.exam : null,
    }).map(reason => `${titles.get(f.course_id) ?? "Course"}: ${reason}`)) : []
    const att = live.reduce((a, f) => ({ c: a.c + f.attendance.counted, p: a.p + f.attendance.present }), { c: 0, p: 0 })
    const score = averageScore(live.map(f => f.exam.bestPct))
    return {
      student_id: m.student_id, member_id: m.id,
      name: m.lms_students?.name ?? "Student", email: m.lms_students?.email ?? "",
      employee_number: m.lms_students?.employee_number ?? null, job_title: m.lms_students?.job_title ?? null,
      track: m.track_id ? trackName.get(m.track_id) ?? null : null,
      status: m.status,
      coursesDone: live.filter(f => f.status === "completed").length, coursesTotal: live.length,
      progress: live.length ? round(live.reduce((a, f) => a + (f.status === "completed" ? 100 : f.progress), 0) / live.length) : 0,
      avgScore: score.avg, examsPassed: live.filter(f => f.exam.passed).length, examsSat: live.filter(f => f.exam.sat).length,
      certificates: live.filter(f => f.certificate).length,
      timeS: live.reduce((a, f) => a + f.timeS, 0),
      attendancePct: att.c ? round((att.p / att.c) * 100) : null,
      lastActivity: maxIso(...live.map(f => f.lastActivity)),
      endDate, extended: !!m.end_date_override && m.end_date_override !== program.end_date,
      atRisk: reasons,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  const live = facts.filter(f => f.status !== "dropped")
  const comp = completionRate(live), pr = passRate(live.map(f => f.exam)), sc = averageScore(live.map(f => f.exam.bestPct))
  const att = live.reduce((a, f) => ({ c: a.c + f.attendance.counted, p: a.p + f.attendance.present }), { c: 0, p: 0 })
  const notWithdrawn = roster.filter(r => r.status !== "withdrawn")
  const unfinished = notWithdrawn.filter(r => r.coursesTotal > r.coursesDone)
  const daysTo = (d: string) => Math.round((Date.parse(d + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000)

  const trackComparison = !trackId && tracks.length > 0
    ? [...tracks.map(t => ({ id: t.id as string | null, name: t.name })), ...(members.some(m => !m.track_id) ? [{ id: null, name: "No track" }] : [])].map(t => {
        const tm = new Set(members.filter(m => m.track_id === t.id).map(m => m.id))
        const tf = live.filter(f => f.member_id && tm.has(f.member_id))
        const students = roster.filter(r => r.status !== "withdrawn" && members.find(m => m.id === r.member_id)?.track_id === t.id)
        return {
          trackId: t.id, name: t.name, students: students.length,
          avgProgress: students.length ? round(students.reduce((a, r) => a + r.progress, 0) / students.length) : null,
          completionRate: completionRate(tf).rate, passRate: passRate(tf.map(f => f.exam)).rate, avgScore: averageScore(tf.map(f => f.exam.bestPct)).avg,
        }
      })
    : []

  const surveyEligible = notWithdrawn.filter(r => r.coursesTotal > 0 && r.coursesDone === r.coursesTotal).length
  const scopedSurvey = ((surveyRows ?? []) as any[]).filter(s => memberIds.has(s.member_id))
  const survey = summarize(scopedSurvey.map(s => ({
    ratings: { overall: s.rating_overall, organisation: s.rating_organisation, instructor: s.rating_instructor },
    recommend: s.recommend, comments: { wentWell: s.comment_went_well, improve: s.comment_improve },
    anonymous: !!s.is_anonymous || !!program.feedback_anonymous,
  })), SURVEY_RATING_LABELS, Math.max(surveyEligible, scopedSurvey.length))

  return {
    generatedAt: new Date().toISOString(),
    scope: { trackId, trackName: trackId ? trackName.get(trackId) ?? null : null },
    program: {
      id: program.id, name: program.name, reference: program.reference, description: program.description,
      status: program.status, structure: program.structure, start_date: program.start_date, end_date: program.end_date,
      is_individual: program.is_individual, feedback_anonymous: !!program.feedback_anonymous,
      company: program.lms_companies ? { id: program.lms_companies.id, name: program.lms_companies.name, code: program.lms_companies.code, logo_url: program.lms_companies.logo_url } : null,
    },
    tracks,
    stats: {
      members: roster.length,
      active: roster.filter(r => r.status === "active").length,
      completedMembers: roster.filter(r => r.status === "completed" || (r.status === "active" && r.coursesTotal > 0 && r.coursesDone === r.coursesTotal)).length,
      withdrawn: roster.filter(r => r.status === "withdrawn").length,
      enrollments: comp.counted, completedEnrollments: comp.completed, completionRate: comp.rate,
      sat: pr.sat, passed: pr.passed, passRate: pr.rate,
      scoreSum: sc.sum, scoreCount: sc.count, avgScore: sc.avg,
      avgProgress: notWithdrawn.length ? round(notWithdrawn.reduce((a, r) => a + r.progress, 0) / notWithdrawn.length) : null,
      avgTimeS: notWithdrawn.length ? round(notWithdrawn.reduce((a, r) => a + r.timeS, 0) / notWithdrawn.length) : 0,
      certificates: live.filter(f => f.certificate).length,
      attendancePct: att.c ? round((att.p / att.c) * 100) : null, attendanceCounted: att.c, attendancePresent: att.p,
      overdue: unfinished.filter(r => r.endDate && daysTo(r.endDate) < 0).length,
      dueSoon: unfinished.filter(r => r.endDate && daysTo(r.endDate) >= 0 && daysTo(r.endDate) <= 14).length,
      atRisk: roster.filter(r => r.atRisk.length).length,
    },
    trackComparison,
    courses: courseRows(live, titles, order, courseFeedback),
    atRisk: roster.filter(r => r.atRisk.length).map(r => ({
      student_id: r.student_id, name: r.name, track: r.track,
      reasons: r.atRisk.map(x => { const i = x.indexOf(": "); return { course: x.slice(0, i), reason: x.slice(i + 2) } }),
    })),
    feedback: mergeFeedback([...courseFeedback.values()]),
    survey,
    roster,
    timeline: progressTimeline(live, program.start_date, program.end_date),
    scoreBands: scoreBandsOf(live.filter(f => f.exam.sat).map(f => f.exam.bestPct)),
    byJobTitle: (() => {
      const groups = new Map<string, ProgramRosterRow[]>()
      for (const r of notWithdrawn) {
        const k = (r.job_title ?? "").trim() || "Not specified"
        if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r)
      }
      return [...groups].map(([title, rs]) => {
        const s = averageScore(rs.map(r => r.avgScore))
        return { title, students: rs.length, avgProgress: round(rs.reduce((a, r) => a + r.progress, 0) / rs.length), avgScore: s.avg }
      }).sort((a, b) => b.students - a.students || a.title.localeCompare(b.title))
    })(),
  }
}

// ── Student in a program (RL-6) ────────────────────────────────────────────

export type StudentProgramReport = {
  generatedAt: string
  program: ProgramReport["program"]
  student: { id: string; name: string; email: string; employee_number: string | null; job_title: string | null; company: string | null }
  member: { id: string; status: string; track: string | null; endDate: string | null; extended: boolean; addedAt: string | null; withdrawnAt: string | null }
  totals: ProgramRosterRow
  courses: {
    enrollment_id: string; course_id: string; title: string; status: string; progress: number; timeS: number
    completedAt: string | null
    exam: EnrollmentFacts["exam"]; certificate: EnrollmentFacts["certificate"]
    attendancePct: number | null; lastActivity: string | null; atRisk: string[]
    feedback: { given: boolean; anonymous: boolean; overall: number | null; recommend: string | null; comments: string[] } | null
  }[]
  survey: { given: boolean; anonymous: boolean; overall: number | null; recommend: string | null; comments: string[] } | null
}

export async function buildStudentProgramReport(programId: string, studentId: string, base?: ProgramReport | null): Promise<StudentProgramReport | null> {
  const report = base ?? await buildProgramReport(programId)
  if (!report) return null
  const totals = report.roster.find(r => r.student_id === studentId)
  if (!totals) return null

  const [{ data: m }, { data: s }, facts] = await Promise.all([
    db.from("lms_program_members").select("id, status, track_id, end_date_override, added_at, withdrawn_at").eq("id", totals.member_id).single(),
    db.from("lms_students").select("id, name, email, employee_number, job_title, company").eq("id", studentId).single(),
    loadEnrollmentFacts({ programId }),
  ])
  const mine = facts.filter(f => f.member_id === totals.member_id)
  const order = await coursesForTrack(programId, (m as any)?.track_id ?? null)
  mine.sort((a, b) => (order.indexOf(a.course_id) + 1 || 1e9) - (order.indexOf(b.course_id) + 1 || 1e9))

  const ids = mine.map(f => f.enrollment_id)
  const [{ data: courses }, { data: fb }, { data: sv }] = await Promise.all([
    ids.length ? db.from("lms_courses").select("id, title").in("id", mine.map(f => f.course_id)) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db.from("lms_feedback").select(FEEDBACK_ROW_COLUMNS).in("enrollment_id", ids) : Promise.resolve({ data: [] as any[] }),
    db.from("lms_program_feedback").select("rating_overall, recommend, comment_went_well, comment_improve, is_anonymous").eq("member_id", totals.member_id).maybeSingle(),
  ])
  const titles = new Map(((courses ?? []) as any[]).map(c => [c.id, c.title]))
  const fbBy = new Map(((fb ?? []) as any[]).map(r => [r.enrollment_id, r]))
  const anonymousProgram = report.program.feedback_anonymous

  // FB-6: anonymous answers are reported as "given" only — never their content.
  const describe = (row: any, overall: number | null) => {
    const anonymous = !!row.is_anonymous || anonymousProgram
    const c = readFeedbackComments(row)
    return anonymous
      ? { given: true, anonymous: true, overall: null, recommend: null, comments: [] }
      : { given: true, anonymous: false, overall, recommend: row.recommend ?? null, comments: [c.wentWell && `Went well: ${c.wentWell}`, c.improve && `Improve: ${c.improve}`, c.general].filter(Boolean) as string[] }
  }

  const endDate = totals.endDate
  return {
    generatedAt: new Date().toISOString(),
    program: report.program,
    student: s as any,
    member: {
      id: totals.member_id, status: (m as any)?.status, track: totals.track, endDate, extended: totals.extended,
      addedAt: (m as any)?.added_at ?? null, withdrawnAt: (m as any)?.withdrawn_at ?? null,
    },
    totals,
    courses: mine.map(f => {
      const row = fbBy.get(f.enrollment_id)
      return {
        enrollment_id: f.enrollment_id, course_id: f.course_id, title: titles.get(f.course_id) ?? "Course",
        status: f.status, progress: f.status === "completed" ? 100 : f.progress, timeS: f.timeS, completedAt: f.completedAt,
        exam: f.exam, certificate: f.certificate,
        attendancePct: f.attendance.counted ? round((f.attendance.present / f.attendance.counted) * 100) : null,
        lastActivity: f.lastActivity,
        atRisk: (m as any)?.status === "active" ? atRiskReasons({ status: f.status, progress: f.progress, lastActivity: f.lastActivity, enrolledAt: f.enrolledAt, startDate: report.program.start_date, endDate, exam: f.exam.exists ? f.exam : null }) : [],
        feedback: row ? describe(row, readFeedbackRatings(row).overall) : f.feedbackAsked ? { given: false, anonymous: false, overall: null, recommend: null, comments: [] } : null,
      }
    }),
    survey: sv ? describe(sv, (sv as any).rating_overall ?? null) : null,
  }
}

// ── Client report (RL-7) ──────────────────────────────────────────────────

export type ClientReport = {
  generatedAt: string
  company: { id: string; name: string; code: string; logo_url: string | null; sector: string | null; country: string | null }
  totals: {
    programs: number; activePrograms: number; completedPrograms: number
    trained: number; enrollments: number; completionRate: number | null
    sat: number; passed: number; passRate: number | null; avgScore: number | null; certificates: number
    atRisk: number
  }
  programs: {
    id: string; name: string; reference: string | null; status: string; start_date: string | null; end_date: string | null
    students: number; completionRate: number | null; passRate: number | null; avgScore: number | null; avgProgress: number | null
    certificates: number; feedbackAvg: number | null; recommendPct: number | null; atRisk: number
  }[]
  feedback: FeedbackSummary
  survey: FeedbackSummary
  scoreBands: number[]
}

export async function buildClientReport(companyId: string, buildProgram: (id: string) => Promise<ProgramReport | null> = buildProgramReport): Promise<ClientReport | null> {
  const { data: c } = await db.from("lms_companies").select("id, name, code, logo_url, sector, country").eq("id", companyId).maybeSingle()
  if (!c) return null
  const { data: progs } = await db.from("lms_programs").select("id, start_date").eq("company_id", companyId).neq("status", "draft").order("start_date", { ascending: false, nullsFirst: false })
  const reports = (await Promise.all(((progs ?? []) as any[]).map(p => buildProgram(p.id)))).filter((r): r is ProgramReport => !!r)

  const students = new Set<string>()
  for (const r of reports) for (const row of r.roster) if (row.status !== "withdrawn") students.add(row.student_id)
  const sum = (f: (r: ProgramReport) => number) => reports.reduce((a, r) => a + f(r), 0)
  const enrollments = sum(r => r.stats.enrollments), completed = sum(r => r.stats.completedEnrollments)
  const sat = sum(r => r.stats.sat), passed = sum(r => r.stats.passed)
  const scoreCount = sum(r => r.stats.scoreCount), scoreSum = sum(r => r.stats.scoreSum)

  return {
    generatedAt: new Date().toISOString(),
    company: c as any,
    totals: {
      programs: reports.length,
      activePrograms: reports.filter(r => r.program.status === "active").length,
      completedPrograms: reports.filter(r => r.program.status === "completed" || r.program.status === "archived").length,
      trained: students.size, enrollments,
      completionRate: enrollments ? round((completed / enrollments) * 100) : null,
      sat, passed, passRate: sat ? round((passed / sat) * 100) : null,
      avgScore: scoreCount ? round(scoreSum / scoreCount) : null,
      certificates: sum(r => r.stats.certificates),
      atRisk: sum(r => r.stats.atRisk),
    },
    programs: reports.map(r => ({
      id: r.program.id, name: r.program.name, reference: r.program.reference, status: r.program.status,
      start_date: r.program.start_date, end_date: r.program.end_date,
      students: r.stats.members - r.stats.withdrawn, completionRate: r.stats.completionRate, passRate: r.stats.passRate,
      avgScore: r.stats.avgScore, avgProgress: r.stats.avgProgress, certificates: r.stats.certificates,
      feedbackAvg: r.feedback.ratings.find(x => x.key === "overall")?.avg ?? null, recommendPct: r.feedback.recommend?.yesPct ?? null,
      atRisk: r.stats.atRisk,
    })),
    feedback: mergeFeedback(reports.map(r => r.feedback)),
    survey: mergeFeedback(reports.map(r => r.survey)),
    scoreBands: reports.reduce((acc, r) => acc.map((v, i) => v + (r.scoreBands?.[i] ?? 0)), [0, 0, 0, 0, 0, 0]),
  }
}

// ── Course analytics: comparison between programs (RL-8) ───────────────────

export type CourseComparisonRow = {
  program_id: string | null; name: string; company: string | null; status: string | null
  enrolled: number; completionRate: number | null; sat: number; passRate: number | null; avgScore: number | null; avgTimeS: number
}

export async function buildCourseComparison(courseId: string): Promise<CourseComparisonRow[]> {
  const facts = (await loadEnrollmentFacts({ courseId })).filter(f => f.status !== "dropped")
  const programIds = [...new Set(facts.map(f => f.program_id).filter(Boolean))] as string[]
  const { data: progs } = programIds.length
    ? await db.from("lms_programs").select("id, name, status, lms_companies(name)").in("id", programIds)
    : { data: [] as any[] }
  const info = new Map(((progs ?? []) as any[]).map(p => [p.id, p]))
  const keys = [...programIds, ...(facts.some(f => !f.program_id) ? [null] : [])]
  return keys.map(pid => {
    const list = facts.filter(f => f.program_id === pid)
    const p = pid ? info.get(pid) : null
    return {
      program_id: pid, name: p?.name ?? "Outside programs", company: p?.lms_companies?.name ?? null, status: p?.status ?? null,
      enrolled: list.length, completionRate: completionRate(list).rate,
      sat: passRate(list.map(f => f.exam)).sat, passRate: passRate(list.map(f => f.exam)).rate,
      avgScore: averageScore(list.map(f => f.exam.bestPct)).avg,
      avgTimeS: list.length ? round(list.reduce((a, f) => a + f.timeS, 0) / list.length) : 0,
    }
  }).sort((a, b) => b.enrolled - a.enrolled)
}
