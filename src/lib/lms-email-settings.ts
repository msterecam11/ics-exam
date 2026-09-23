// Server-side resolver for the email settings (EM-16, EM-18).
//
// Priority, first "off" wins:
//   master switch  →  the program's own override  →  the global rule default
//
// Everything that sends an automatic email goes through sendRuleEmail() so the
// switches, the daily cap, test mode and the log all behave the same way
// wherever the email is triggered from.

import { db } from "@/lib/db"
import { sendEmail } from "@/lib/email"
import { EMAIL_RULES, RULE_BY_CODE, defaultConfig, type EmailRuleCode } from "@/lib/lms-email-rules"

export interface EmailConfig {
  master_enabled: boolean
  test_mode: boolean
  test_address: string | null
  /** When set, mail reaches only these addresses — real delivery, narrow audience. */
  allowed_recipients?: string[] | null
  daily_cap: number
}

export interface RuleState { enabled: boolean; config: Record<string, any> }

export interface EmailSettings {
  config: EmailConfig
  rules: Record<string, RuleState>
}

const FALLBACK_CONFIG: EmailConfig = { master_enabled: true, test_mode: true, test_address: null, allowed_recipients: null, daily_cap: 1 }

/** Reads the global configuration and every rule's default. */
export async function loadEmailSettings(): Promise<EmailSettings> {
  const [cfgRes, rulesRes] = await Promise.all([
    db.from("lms_email_config").select("master_enabled, test_mode, test_address, allowed_recipients, daily_cap").eq("id", 1).maybeSingle(),
    db.from("lms_email_rules").select("code, enabled, config"),
  ])
  const config = { ...FALLBACK_CONFIG, ...(cfgRes.data ?? {}) } as EmailConfig
  const rules: Record<string, RuleState> = {}
  for (const r of EMAIL_RULES) rules[r.code] = { enabled: true, config: defaultConfig(r.code) }
  for (const row of rulesRes.data ?? []) {
    if (!rules[(row as any).code]) continue
    rules[(row as any).code] = {
      enabled: !!(row as any).enabled,
      // A stored config only overrides the knobs it actually carries, so adding
      // a new knob later doesn't leave old rows with a missing value.
      config: { ...defaultConfig((row as any).code), ...((row as any).config ?? {}) },
    }
  }
  return { config, rules }
}

export interface EffectiveRule {
  code: string
  enabled: boolean
  config: Record<string, any>
  /** Why it is off, when it is off. */
  reason: string | null
  source: "master" | "program" | "global"
}

/**
 * The setting that actually applies, for one email and (optionally) one program.
 * `programSettings` is the program's `email_settings` jsonb.
 */
export function effectiveRule(
  settings: EmailSettings,
  code: EmailRuleCode | string,
  programSettings?: Record<string, any> | null,
): EffectiveRule {
  const def = RULE_BY_CODE[code]
  const global = settings.rules[code] ?? { enabled: true, config: defaultConfig(code) }
  const override = def?.scope === "program" ? (programSettings ?? {})[code] : undefined
  const hasOverride = !!override && typeof override === "object" && typeof override.enabled === "boolean"

  // Knobs merge even when the switch itself is inherited, so a program can keep
  // the global on/off and still use its own timing.
  const config = { ...global.config, ...(override && typeof override === "object" ? stripEnabled(override) : {}) }

  if (!settings.config.master_enabled)
    return { code, enabled: false, config, reason: "Master switch is off", source: "master" }
  if (hasOverride)
    return { code, enabled: override.enabled, config, reason: override.enabled ? null : "Turned off for this program", source: "program" }
  return { code, enabled: global.enabled, config, reason: global.enabled ? null : "Turned off in LMS settings", source: "global" }
}

function stripEnabled(o: Record<string, any>) {
  const { enabled, ...rest } = o
  void enabled
  return rest
}

// ── Sending ──────────────────────────────────────────────────────────────────

export interface RuleSendInput {
  rule: EmailRuleCode
  to: string | null | undefined
  subject: string
  html: string
  studentId?: string | null
  courseId?: string | null
  programId?: string | null
  sessionId?: string | null
  /** Pre-resolved rule; pass it when sending in a loop to avoid re-reading. */
  effective?: EffectiveRule
  /** The program's own overrides, when the email belongs to one. */
  programSettings?: Record<string, any> | null
  settings?: EmailSettings
  /** Report what would happen without sending or writing to the log. */
  dryRun?: boolean
  /** Already-counted sends per student in this run, for the daily cap. */
  capUsed?: Map<string, number>
  /** Skip the rule check — a person pressed a button (manual resend). */
  manual?: boolean
}

export interface RuleSendResult {
  rule: string
  to: string | null
  intended: string | null
  status: "sent" | "redirected" | "skipped" | "failed" | "would_send"
  reason: string | null
  studentId: string | null
  programId: string | null
  subject: string
}

/**
 * Sends one rule-driven email, applying the switches, the daily cap and test
 * mode, then records the outcome in lms_email_log — including the skips, so the
 * log answers "why didn't this person get it?".
 */
export async function sendRuleEmail(input: RuleSendInput): Promise<RuleSendResult> {
  const settings = input.settings ?? (await loadEmailSettings())
  const eff = input.effective ?? effectiveRule(settings, input.rule, input.programSettings)
  const def = RULE_BY_CODE[input.rule]
  const studentId = input.studentId ?? null
  const programId = input.programId ?? null

  const base = { rule: input.rule, to: null as string | null, intended: input.to ?? null, studentId, programId, subject: input.subject }
  const skip = async (reason: string): Promise<RuleSendResult> => {
    const r: RuleSendResult = { ...base, status: "skipped", reason }
    if (!input.dryRun) await log(r, input)
    return r
  }

  if (!input.manual && !eff.enabled) return skip(eff.reason ?? "Turned off")
  if (!input.to) return skip("No e-mail address on file")

  // EM-18 — one reminder per student per day. Only scheduled reminders count;
  // an email caused by something the student just did (a completion, a released
  // certificate) is never held back.
  if (!input.manual && def?.scheduled && studentId && settings.config.daily_cap > 0) {
    const used = input.capUsed?.get(studentId) ?? (await sentTodayCount(studentId))
    if (used >= settings.config.daily_cap)
      return skip(`Daily limit reached (${settings.config.daily_cap} per day)`)
  }

  // Test mode — one address receives everything, and the log keeps the name of
  // the person it was really for.
  const redirected = settings.config.test_mode && !!settings.config.test_address
  const recipient = redirected ? settings.config.test_address! : input.to
  if (settings.config.test_mode && !settings.config.test_address)
    return skip("Test mode is on but no test address is set")

  if (input.dryRun) {
    // Count it against the cap even in a preview, so a dry run reports exactly
    // what a real run would do rather than one email per rule per student.
    if (studentId && def?.scheduled && input.capUsed)
      input.capUsed.set(studentId, (input.capUsed.get(studentId) ?? 0) + 1)
    return { ...base, to: recipient, status: "would_send", reason: redirected ? "Test mode — would be redirected" : null }
  }

  const res = await sendEmail({
    type: input.rule as any,
    to: recipient,
    subject: input.subject,
    html: input.html,
    studentId: studentId ?? undefined,
    courseId: input.courseId ?? undefined,
    sessionId: input.sessionId ?? undefined,
    rule: input.rule,
    programId: programId ?? undefined,
    intendedEmail: redirected ? input.to : undefined,
    reason: redirected ? "Test mode — redirected" : undefined,
    statusOverride: redirected ? "redirected" : undefined,
  })

  if (res.ok && studentId && def?.scheduled && input.capUsed)
    input.capUsed.set(studentId, (input.capUsed.get(studentId) ?? 0) + 1)

  return {
    ...base,
    to: recipient,
    status: res.ok ? (redirected ? "redirected" : "sent") : "failed",
    reason: res.ok ? (redirected ? "Test mode — redirected" : null) : res.error ?? "Send failed",
  }
}

/** Reminders already sent to this student today (UTC day, same as the job). */
async function sentTodayCount(studentId: string): Promise<number> {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0)
  const scheduled = EMAIL_RULES.filter(r => r.scheduled).map(r => r.code)
  const { count } = await db
    .from("lms_email_log")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId)
    .in("rule", scheduled)
    .in("status", ["sent", "redirected"])
    .gte("sent_at", since.toISOString())
  return count ?? 0
}

async function log(r: RuleSendResult, input: RuleSendInput) {
  await db.from("lms_email_log").insert({
    type: input.rule,
    rule: input.rule,
    to_email: r.to ?? input.to ?? "",
    intended_email: r.intended,
    subject: input.subject,
    student_id: r.studentId,
    course_id: input.courseId ?? null,
    program_id: r.programId,
    session_id: input.sessionId ?? null,
    status: r.status,
    reason: r.reason,
  })
}

/** Pre-loads the per-student reminder counts for a whole cron run in one query. */
export async function todaysReminderCounts(studentIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!studentIds.length) return out
  const since = new Date(); since.setUTCHours(0, 0, 0, 0)
  const scheduled = EMAIL_RULES.filter(r => r.scheduled).map(r => r.code)
  const { data } = await db
    .from("lms_email_log")
    .select("student_id")
    .in("student_id", studentIds)
    .in("rule", scheduled)
    .in("status", ["sent", "redirected"])
    .gte("sent_at", since.toISOString())
  // Everyone asked about gets an entry, so a caller can rely on the map alone
  // instead of falling back to a per-student query.
  for (const id of studentIds) out.set(id, 0)
  for (const r of data ?? []) {
    const id = (r as any).student_id
    if (id) out.set(id, (out.get(id) ?? 0) + 1)
  }
  return out
}

/** A program's email overrides, for the one-off (event-driven) emails. */
export async function programEmailOverrides(programId: string | null | undefined): Promise<Record<string, any>> {
  if (!programId) return {}
  const { data } = await db.from("lms_programs").select("email_settings").eq("id", programId).maybeSingle()
  const v = (data as any)?.email_settings
  return v && typeof v === "object" ? v : {}
}
