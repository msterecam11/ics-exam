// EM-20 — the single daily pass behind /api/cron/lms-daily.
//
// One run gathers the facts once, then walks every dated rule (EM-2, 3, 4, 5, 9,
// 10 and the weekly EM-13). Nothing here decides whether an email may be sent:
// that is sendRuleEmail's job, so a dry run and a real run follow exactly the
// same path and the same switches.
//
// Dry run (?dry=1) reports who would receive what — and why everyone else was
// skipped — without sending anything or writing to the log.

import { db } from "@/lib/db"
import { assignmentAttempts, TO_MARK } from "@/lib/lms-marking"
import {
  loadEmailSettings, effectiveRule, sendRuleEmail, todaysReminderCounts,
  type EmailSettings, type RuleSendResult,
} from "@/lib/lms-email-settings"
import { sessionRoster, sessionEndTime } from "@/lib/lms-sessions"
import {
  buildProgramStartedEmail, buildNotStartedEmail, buildInactiveEmail, buildDeadlineEmail,
  buildFeedbackReminderEmail, buildInstructorDigestEmail,
} from "@/lib/lms-email-templates"
import { buildSessionReminderEmail } from "@/lib/email"

const DAY_MS = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / DAY_MS)

export interface DailyRunOptions {
  dryRun?: boolean
  /** Run one rule only (handy for the preview button and the tests). */
  only?: string | null
  now?: Date
}

export interface DailyRunReport {
  ranAt: string
  /** Unconfirmed self sign-ups removed on this run. */
  purgedUnconfirmed?: number
  dryRun: boolean
  masterEnabled: boolean
  testMode: boolean
  testAddress: string | null
  programs: number
  members: number
  results: RuleSendResult[]
  counts: Record<string, { sent: number; skipped: number; failed: number }>
}

// ── Facts gathered once per run ──────────────────────────────────────────────
interface MemberFact {
  memberId: string
  studentId: string
  name: string
  email: string | null
  track: string | null
  programId: string
  endDate: string | null
  extended: boolean
  coursesTotal: number
  coursesDone: number
  progress: number
  started: boolean
  lastActivity: string | null
  nextCourse: string | null
}

interface ProgramFact {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  emailSettings: Record<string, any>
  feedbackEnabled: boolean
  feedbackMandatory: boolean
  members: MemberFact[]
}

export async function runDailyEmails(opts: DailyRunOptions = {}): Promise<DailyRunReport> {
  const now = opts.now ?? new Date()
  const today = iso(now)
  const dryRun = !!opts.dryRun
  const settings = await loadEmailSettings()
  const results: RuleSendResult[] = []

  const wants = (code: string) => !opts.only || opts.only === code

  const { programs, memberIndex } = await gatherFacts(today)
  const studentIds = [...new Set(programs.flatMap(p => p.members.map(m => m.studentId)))]
  const capUsed = await todaysReminderCounts(studentIds)
  const history = await loadHistory(studentIds)

  const push = async (r: Promise<RuleSendResult>) => { results.push(await r) }

  for (const p of programs) {
    const rule = (code: string) => effectiveRule(settings, code, p.emailSettings)
    const common = { settings, dryRun, capUsed, programId: p.id }

    // ── EM-2 Program started ────────────────────────────────────────────────
    if (wants("program_started") && p.startDate === today) {
      const eff = rule("program_started")
      for (const m of p.members) {
        const t = buildProgramStartedEmail({
          studentName: m.name, programName: p.name, programId: p.id,
          endDate: m.endDate, courseCount: m.coursesTotal, firstCourse: m.nextCourse, track: m.track,
        })
        await push(sendRuleEmail({ ...common, rule: "program_started", effective: eff, to: m.email, studentId: m.studentId, ...t }))
      }
    }

    // ── EM-3 Not started yet ────────────────────────────────────────────────
    if (wants("not_started") && p.startDate) {
      const eff = rule("not_started")
      const since = daysBetween(p.startDate, today)
      const days = num(eff.config.days, 3)
      if (since >= days) {
        for (const m of p.members) {
          if (m.started) continue                                   // they're under way
          if (history.has(key("not_started", m.studentId, p.id))) continue   // told them once
          const t = buildNotStartedEmail({
            studentName: m.name, programName: p.name, programId: p.id, daysSinceStart: since, endDate: m.endDate,
          })
          await push(sendRuleEmail({ ...common, rule: "not_started", effective: eff, to: m.email, studentId: m.studentId, ...t }))
        }
      }
    }

    // ── EM-4 Inactive ───────────────────────────────────────────────────────
    if (wants("inactive")) {
      const eff = rule("inactive")
      const days = num(eff.config.days, 7)
      const repeat = num(eff.config.repeat_days, 7)
      for (const m of p.members) {
        if (!m.started) continue                                    // EM-3 covers those
        if (m.coursesTotal > 0 && m.coursesDone >= m.coursesTotal) continue   // finished
        if (!m.lastActivity || daysBetween(m.lastActivity.slice(0, 10), today) < days) continue
        const last = history.get(key("inactive", m.studentId, p.id))
        if (last && (repeat === 0 || daysBetween(last.slice(0, 10), today) < repeat)) continue
        const t = buildInactiveEmail({
          studentName: m.name, programName: p.name, programId: p.id,
          days: daysBetween(m.lastActivity.slice(0, 10), today), progressPct: m.progress,
          nextCourse: m.nextCourse, endDate: m.endDate,
        })
        await push(sendRuleEmail({ ...common, rule: "inactive", effective: eff, to: m.email, studentId: m.studentId, ...t }))
      }
    }

    // ── EM-5 Deadline approaching ───────────────────────────────────────────
    if (wants("deadline")) {
      const eff = rule("deadline")
      const list = numList(eff.config.days_list, [14, 3])
      for (const m of p.members) {
        if (!m.endDate) continue
        const left = daysBetween(today, m.endDate)
        if (!list.includes(left)) continue                          // only on the exact marks
        if (m.coursesTotal > 0 && m.coursesDone >= m.coursesTotal) continue   // nothing left to chase
        const already = history.get(key("deadline", m.studentId, p.id))
        if (already && already.slice(0, 10) === today) continue
        const t = buildDeadlineEmail({
          studentName: m.name, programName: p.name, programId: p.id, daysLeft: left, endDate: m.endDate,
          progressPct: m.progress, coursesLeft: Math.max(0, m.coursesTotal - m.coursesDone), extended: m.extended,
        })
        await push(sendRuleEmail({ ...common, rule: "deadline", effective: eff, to: m.email, studentId: m.studentId, ...t }))
      }
    }
  }

  // ── EM-9 Feedback reminder ────────────────────────────────────────────────
  if (wants("feedback_reminder")) {
    for (const r of await feedbackCandidates(programs, today, history)) {
      const p = programs.find(x => x.id === r.programId)!
      const eff = effectiveRule(settings, "feedback_reminder", p.emailSettings)
      if (daysBetween(r.askedOn, today) < num(eff.config.days, 3)) continue
      const t = buildFeedbackReminderEmail({
        studentName: r.name, courseTitle: r.courseTitle, programName: p.name,
        programId: p.id, courseId: r.courseId, mandatory: p.feedbackMandatory,
      })
      results.push(await sendRuleEmail({
        settings, dryRun, capUsed, rule: "feedback_reminder", effective: eff,
        to: r.email, studentId: r.studentId, programId: p.id, courseId: r.courseId, ...t,
      }))
    }
  }

  // ── EM-10 Class reminder ──────────────────────────────────────────────────
  if (wants("class_reminder")) {
    results.push(...await classReminders(programs, settings, now, dryRun, capUsed, history))
  }

  // ── EM-13 Weekly instructor digest ────────────────────────────────────────
  if (wants("instructor_digest")) {
    results.push(...await instructorDigests(programs, memberIndex, settings, now, dryRun))
  }

  // Housekeeping, not email: a registration nobody ever confirmed is deleted
  // after 30 days, so the students list doesn't silt up with ghosts. Stated in
  // the privacy policy, so it has to actually happen.
  const purged = dryRun ? 0 : await purgeUnconfirmedSignups(now)

  const counts: DailyRunReport["counts"] = {}
  for (const r of results) {
    const c = counts[r.rule] ?? (counts[r.rule] = { sent: 0, skipped: 0, failed: 0 })
    if (r.status === "sent" || r.status === "redirected" || r.status === "would_send") c.sent++
    else if (r.status === "failed") c.failed++
    else c.skipped++
  }

  return {
    ranAt: now.toISOString(), dryRun,
    masterEnabled: settings.config.master_enabled,
    testMode: settings.config.test_mode, testAddress: settings.config.test_address,
    programs: programs.length,
    members: programs.reduce((a, p) => a + p.members.length, 0),
    results, counts, purgedUnconfirmed: purged,
  }
}

/** Unconfirmed self sign-ups older than 30 days. Never touches a confirmed
 *  account, and never one that staff created. */
async function purgeUnconfirmedSignups(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 86400_000).toISOString()
  const { data } = await db.from("lms_students").select("id")
    .is("email_verified_at", null).eq("self_registered", true).lt("created_at", cutoff).limit(500)
  const ids = ((data ?? []) as any[]).map(s => s.id)
  if (!ids.length) return 0
  // Only ever a bare registration: anything enrolled is left alone and reported.
  const { data: enrolled } = await db.from("lms_enrollments").select("student_id").in("student_id", ids)
  const keep = new Set(((enrolled ?? []) as any[]).map(e => e.student_id))
  const removable = ids.filter(id => !keep.has(id))
  if (!removable.length) return 0
  await db.from("lms_students").delete().in("id", removable)
  return removable.length
}

// ── Fact gathering ───────────────────────────────────────────────────────────
async function gatherFacts(today: string) {
  // Only live programs are ever chased (never a draft, completed or archived one).
  const { data: progRows } = await db
    .from("lms_programs")
    .select("id, name, start_date, end_date, email_settings, feedback_enabled, feedback_mandatory")
    .eq("status", "active")

  const programs: ProgramFact[] = []
  const memberIndex = new Map<string, MemberFact>()
  const programIds = (progRows ?? []).map((p: any) => p.id)
  if (!programIds.length) return { programs, memberIndex }

  const [membersRes, enrRes, itemsRes, tracksRes] = await Promise.all([
    db.from("lms_program_members")
      .select("id, program_id, student_id, track_id, status, end_date_override, lms_students(id, name, email)")
      .in("program_id", programIds).neq("status", "withdrawn"),
    db.from("lms_enrollments")
      .select("id, student_id, program_id, course_id, status, progress_pct, completed_at, lms_courses(id, title)")
      .in("program_id", programIds),
    db.from("lms_program_items").select("program_id, track_id, course_id, order_index").in("program_id", programIds),
    db.from("lms_program_tracks").select("id, name").in("program_id", programIds),
  ])

  const trackName = new Map((tracksRes.data ?? []).map((t: any) => [t.id, t.name]))
  const enrollments = (enrRes.data ?? []) as any[]
  const studentIds = [...new Set((membersRes.data ?? []).map((m: any) => m.student_id))]
  const lastActivity = await lastActivityByStudent(studentIds)

  for (const p of progRows ?? []) {
    const pf: ProgramFact = {
      id: (p as any).id, name: (p as any).name,
      startDate: (p as any).start_date, endDate: (p as any).end_date,
      emailSettings: ((p as any).email_settings ?? {}) as Record<string, any>,
      feedbackEnabled: !!(p as any).feedback_enabled,
      feedbackMandatory: !!(p as any).feedback_mandatory,
      members: [],
    }
    for (const m of (membersRes.data ?? []).filter((x: any) => x.program_id === pf.id)) {
      const mm = m as any
      const student = mm.lms_students
      const mine = enrollments.filter(e => e.program_id === pf.id && e.student_id === mm.student_id)
      const done = mine.filter(e => e.status === "completed").length
      const progress = mine.length
        ? Math.round(mine.reduce((a, e) => a + Number(e.progress_pct ?? 0), 0) / mine.length)
        : 0
      const next = mine.find(e => e.status !== "completed" && e.status !== "dropped")
      const fact: MemberFact = {
        memberId: mm.id, studentId: mm.student_id,
        name: student?.name ?? "Student", email: student?.email ?? null,
        track: mm.track_id ? trackName.get(mm.track_id) ?? null : null,
        programId: pf.id,
        endDate: mm.end_date_override ?? pf.endDate,
        extended: !!mm.end_date_override,
        coursesTotal: mine.length, coursesDone: done, progress,
        started: (lastActivity.get(mm.student_id) ?? null) !== null || mine.some(e => Number(e.progress_pct ?? 0) > 0),
        lastActivity: lastActivity.get(mm.student_id) ?? null,
        nextCourse: next?.lms_courses?.title ?? null,
      }
      pf.members.push(fact)
      memberIndex.set(`${pf.id}|${mm.student_id}`, fact)
    }
    programs.push(pf)
  }
  void itemsRes
  void today
  return { programs, memberIndex }
}

/** Newest activity of any kind, per student. */
async function lastActivityByStudent(studentIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!studentIds.length) return out
  const bump = (sid: string, ts: string | null | undefined) => {
    if (!ts) return
    const cur = out.get(sid)
    if (!cur || ts > cur) out.set(sid, ts)
  }
  const [pkg, att] = await Promise.all([
    db.from("lms_package_progress").select("student_id, updated_at").in("student_id", studentIds),
    db.from("lms_module_attempts").select("student_id, submitted_at, started_at").in("student_id", studentIds),
  ])
  for (const r of pkg.data ?? []) bump((r as any).student_id, (r as any).updated_at)
  for (const r of att.data ?? []) bump((r as any).student_id, (r as any).submitted_at ?? (r as any).started_at)
  return out
}

// ── History (so nothing is sent twice) ───────────────────────────────────────
const key = (rule: string, studentId: string, scopeId: string | null) => `${rule}|${studentId}|${scopeId ?? ""}`

/** Newest successful send per (rule, student, program/course/session). */
async function loadHistory(studentIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!studentIds.length) return out
  const { data } = await db
    .from("lms_email_log")
    .select("rule, student_id, program_id, course_id, session_id, sent_at")
    .in("student_id", studentIds)
    .in("status", ["sent", "redirected"])
    .not("rule", "is", null)
    .order("sent_at", { ascending: true })
  for (const r of data ?? []) {
    const row = r as any
    for (const scope of [row.program_id, row.course_id, row.session_id]) {
      if (!scope) continue
      out.set(key(row.rule, row.student_id, scope), row.sent_at)
    }
  }
  return out
}

// ── EM-9 candidates ──────────────────────────────────────────────────────────
interface FeedbackCandidate {
  studentId: string; name: string; email: string | null
  programId: string; courseId: string; courseTitle: string; askedOn: string
}

async function feedbackCandidates(programs: ProgramFact[], today: string, history: Map<string, string>): Promise<FeedbackCandidate[]> {
  const live = programs.filter(p => p.feedbackEnabled)
  if (!live.length) return []
  const ids = live.map(p => p.id)

  const enrRes = await db.from("lms_enrollments")
    .select("id, student_id, program_id, course_id, completed_at, lms_courses(id, title, feedback_enabled), lms_students(id, name, email)")
    .in("program_id", ids).eq("status", "completed").not("completed_at", "is", null)
  // Matched by enrollment too: feedback given before an enrollment joined or
  // moved program still carries its old (or no) program_id.
  const enrollmentIds = ((enrRes.data ?? []) as any[]).map(e => e.id)
  const fbRows: any[] = []
  for (const [col, list] of [["program_id", ids], ["enrollment_id", enrollmentIds]] as const)
    for (let i = 0; i < list.length; i += 200)
      fbRows.push(...((await db.from("lms_feedback").select("student_id, course_id").in(col, list.slice(i, i + 200))).data ?? []))
  const given = new Set(fbRows.map((f: any) => `${f.student_id}|${f.course_id}`))

  const out: FeedbackCandidate[] = []
  for (const e of (enrRes.data ?? []) as any[]) {
    if (given.has(`${e.student_id}|${e.course_id}`)) continue
    // One reminder per course, ever (FB-9).
    if (history.has(key("feedback_reminder", e.student_id, e.course_id))) continue
    out.push({
      studentId: e.student_id, name: e.lms_students?.name ?? "Student", email: e.lms_students?.email ?? null,
      programId: e.program_id, courseId: e.course_id, courseTitle: e.lms_courses?.title ?? "your course",
      askedOn: String(e.completed_at).slice(0, 10),
    })
  }
  void today
  return out
}

// ── EM-10 Class reminders ────────────────────────────────────────────────────
async function classReminders(
  programs: ProgramFact[], settings: EmailSettings, now: Date,
  dryRun: boolean, capUsed: Map<string, number>, history: Map<string, string>,
): Promise<RuleSendResult[]> {
  const out: RuleSendResult[] = []
  const byId = new Map(programs.map(p => [p.id, p]))
  // The widest window any program asks for decides how far ahead to look.
  const windows = programs.map(p => num(effectiveRule(settings, "class_reminder", p.emailSettings).config.hours, 24))
  const maxHours = Math.max(24, ...windows)
  const horizon = new Date(now.getTime() + maxHours * 3_600_000)

  // A session_date is a plain date with no timezone, so a window built from UTC
  // dates can sit a day either side of the one the session was entered in. Pull
  // a day extra at each end and let the exact start time below decide — that
  // way the job behaves the same whatever timezone the server runs in.
  const { data: sessions } = await db
    .from("lms_sessions")
    .select("id, title, session_date, start_time, duration_minutes, location, meeting_link, course_id, program_id, track_id, group_id, lms_courses(id, title), session_group:lms_course_groups(status)")
    .gte("session_date", iso(new Date(now.getTime() - DAY_MS)))
    .lte("session_date", iso(new Date(horizon.getTime() + DAY_MS)))
    .is("closed_at", null)

  for (const s of (sessions ?? []) as any[]) {
    if (s.group_id) {
      out.push(...await groupSessionReminders(s, byId, settings, now, dryRun, capUsed, history))
      continue
    }
    const p = s.program_id ? byId.get(s.program_id) : null
    if (s.program_id && !p) continue                                // not a live program
    const eff = effectiveRule(settings, "class_reminder", p?.emailSettings)
    const hours = num(eff.config.hours, 24)
    const startsAt = new Date(`${s.session_date}T${(s.start_time ?? "00:00").slice(0, 5)}:00`)
    const lead = (startsAt.getTime() - now.getTime()) / 3_600_000
    if (lead < 0 || lead > hours) continue                          // outside this program's window

    const roster = await sessionRoster(s, { activeOnly: true })
    for (const r of roster) {
      if (history.has(key("class_reminder", r.student_id, s.id))) continue
      const t = buildSessionReminderEmail({
        studentName: r.name, sessionTitle: s.title ?? "Session", courseTitle: s.lms_courses?.title ?? "your course",
        sessionDate: s.session_date, startTime: (s.start_time ?? "").slice(0, 5),
        endTime: sessionEndTime(s.start_time, s.duration_minutes),
        location: s.location ?? undefined, meetingLink: s.meeting_link ?? undefined, sessionId: s.id,
      })
      out.push(await sendRuleEmail({
        settings, dryRun, capUsed, rule: "class_reminder", effective: eff,
        to: r.email, studentId: r.student_id, programId: s.program_id ?? null,
        courseId: s.course_id, sessionId: s.id, ...t,
      }))
    }
  }
  return out
}

// A group's day: its participants can come through different programs (or
// none), so each person's OWN program switches and "hours before" decide —
// never one setting for the whole room. Nothing goes out for a group that
// isn't confirmed.
async function groupSessionReminders(
  s: any, byId: Map<string, ProgramFact>, settings: EmailSettings, now: Date,
  dryRun: boolean, capUsed: Map<string, number>, history: Map<string, string>,
): Promise<RuleSendResult[]> {
  const out: RuleSendResult[] = []
  if (s.session_group?.status !== "confirmed") return out
  const roster = await sessionRoster(s, { activeOnly: true })
  if (!roster.length) return out
  const enrIds = roster.map(r => r.enrollment_id).filter(Boolean) as string[]
  const { data: enr } = enrIds.length
    ? await db.from("lms_enrollments").select("id, program_id").in("id", enrIds)
    : { data: [] as any[] }
  const programOf = new Map(((enr ?? []) as any[]).map(e => [e.id, e.program_id as string | null]))
  const startsAt = new Date(`${s.session_date}T${(s.start_time ?? "00:00").slice(0, 5)}:00`)
  const lead = (startsAt.getTime() - now.getTime()) / 3_600_000
  for (const r of roster) {
    const programId = (r.enrollment_id && programOf.get(r.enrollment_id)) || null
    const p = programId ? byId.get(programId) : null
    if (programId && !p) continue                                   // their program isn't live
    const eff = effectiveRule(settings, "class_reminder", p?.emailSettings)
    if (lead < 0 || lead > num(eff.config.hours, 24)) continue
    if (history.has(key("class_reminder", r.student_id, s.id))) continue
    const t = buildSessionReminderEmail({
      studentName: r.name, sessionTitle: s.title ?? "Session", courseTitle: s.lms_courses?.title ?? "your course",
      sessionDate: s.session_date, startTime: (s.start_time ?? "").slice(0, 5),
      endTime: sessionEndTime(s.start_time, s.duration_minutes),
      location: s.location ?? undefined, meetingLink: s.meeting_link ?? undefined, sessionId: s.id,
    })
    out.push(await sendRuleEmail({
      settings, dryRun, capUsed, rule: "class_reminder", effective: eff,
      to: r.email, studentId: r.student_id, programId,
      courseId: s.course_id, sessionId: s.id, ...t,
    }))
  }
  return out
}

// ── EM-13 Weekly instructor digest ───────────────────────────────────────────
async function instructorDigests(
  programs: ProgramFact[], memberIndex: Map<string, MemberFact>,
  settings: EmailSettings, now: Date, dryRun: boolean,
): Promise<RuleSendResult[]> {
  const out: RuleSendResult[] = []
  if (!programs.length) return out
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS)

  const { data: staffLinks } = await db
    .from("lms_program_instructors")
    .select("program_id, user_id")
    .in("program_id", programs.map(p => p.id))
  const staffIds = [...new Set((staffLinks ?? []).map((s: any) => s.user_id))]
  const { data: staffUsers } = staffIds.length
    ? await db.from("admin_users").select("id, name, email").in("id", staffIds).eq("is_active", true)
    : { data: [] as any[] }
  const staffById = new Map((staffUsers ?? []).map((u: any) => [u.id, u]))

  const [doneRes, gradeRes] = await Promise.all([
    db.from("lms_enrollments")
      .select("program_id, student_id, completed_at, lms_courses(title), lms_students(name)")
      .in("program_id", programs.map(p => p.id)).eq("status", "completed")
      .gte("completed_at", weekAgo.toISOString()),
    assignmentAttempts("student_id, status, submitted_at, lms_students(name)").or(TO_MARK),
  ])

  for (const p of programs) {
    const eff = effectiveRule(settings, "instructor_digest", p.emailSettings)
    if (now.getUTCDay() !== num(eff.config.weekday, 1)) continue
    const staff = (staffLinks ?? [])
      .filter((s: any) => s.program_id === p.id)
      .map((s: any) => staffById.get(s.user_id))
      .filter(Boolean) as { id: string; name: string; email: string }[]
    if (!staff.length) continue

    const completions = ((doneRes.data ?? []) as any[])
      .filter(e => e.program_id === p.id)
      .map(e => ({ student: e.lms_students?.name ?? "Student", course: e.lms_courses?.title ?? "a course" }))
    const behind = p.members
      .filter(m => m.started && m.lastActivity && daysBetween(m.lastActivity.slice(0, 10), iso(now)) >= 14)
      .map(m => ({ student: m.name, reason: `no activity for ${daysBetween(m.lastActivity!.slice(0, 10), iso(now))} days` }))
      .concat(p.members.filter(m => !m.started).map(m => ({ student: m.name, reason: "has not started" })))
    const memberIds = new Set(p.members.map(m => m.studentId))
    const toGrade = ((gradeRes.data ?? []) as any[])
      .filter(a => memberIds.has(a.student_id))
      .map(a => ({ student: a.lms_students?.name ?? "Student", what: a.lms_modules?.title ?? "an assignment" }))

    const finished = p.members.filter(m => m.coursesTotal > 0 && m.coursesDone >= m.coursesTotal).length
    for (const s of staff) {
      const t = buildInstructorDigestEmail({
        instructorName: s.name, programName: p.name, programId: p.id, weekOf: iso(weekAgo),
        completions, behind, toGrade,
        stats: {
          students: p.members.length,
          completionRate: p.members.length ? Math.round((finished / p.members.length) * 100) : null,
          passRate: null,
        },
      })
      out.push(await sendRuleEmail({
        settings, dryRun, rule: "instructor_digest", effective: eff,
        to: s.email, programId: p.id, ...t,
      }))
    }
  }
  void memberIndex
  return out
}

// ── Small helpers ────────────────────────────────────────────────────────────
function num(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
function numList(v: unknown, fallback: number[]): number[] {
  if (!Array.isArray(v)) return fallback
  const out = v.map(Number).filter(n => Number.isFinite(n) && n > 0)
  return out.length ? out : fallback
}
