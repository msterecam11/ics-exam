/**
 * LMS Email utility — Microsoft Graph API
 *
 * Uses the same Azure app registration already configured for the panel
 * interview module (MICROSOFT_CLIENT_ID / TENANT_ID / CLIENT_SECRET).
 *
 * Sends FROM the shared mailbox lms@ics-aviation.com.
 * The Azure app's Mail.Send application permission covers all mailboxes
 * in the tenant — no extra configuration needed.
 *
 * Sender defaults to lms@ics-aviation.com. Set LMS_EMAIL only to override
 * with a different shared mailbox.
 */

import { sendGraphMailAs, isReservedTestAddress } from "@/lib/ms-graph"
import { db } from "@/lib/db"
import type { EmailRuleCode } from "@/lib/lms-email-rules"

const APP_URL   = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
// The "from" mailbox. Always defaults to the lms@ shared box — deliberately
// does NOT fall back to MICROSOFT_USER_EMAIL (alep@), which caused LMS mail to
// send from the wrong account whenever LMS_EMAIL wasn't set in the environment.
const LMS_EMAIL = process.env.LMS_EMAIL ?? "lms@ics-aviation.com"

// ── Types ──────────────────────────────────────────────────────────────────
// The older callers use the first five names; everything that goes through the
// EM-1..EM-20 rules logs its rule code as the type instead.
export type EmailType =
  | "enrollment" | "session_reminder" | "completion" | "password_reset" | "course_reminder" | "signup"
  | EmailRuleCode

interface SendOptions {
  type:       EmailType
  to:         string
  subject:    string
  html:       string
  studentId?: string
  courseId?:  string
  sessionId?: string
  // ── EM-19 log detail (set by sendRuleEmail) ──
  rule?:           string
  programId?:      string
  /** Who it was really for, when test mode redirected it. */
  intendedEmail?:  string
  reason?:         string
  /** "redirected", so a test-mode send isn't counted as a normal delivery. */
  statusOverride?: string
}

// ── Core send + log ────────────────────────────────────────────────────────

// ── Delivery guard (EM-19) ───────────────────────────────────────────────────
// Test mode used to be applied by the rules pipeline only, so everything that
// sends directly — enrolment, completion, cohorts, learning paths, CSV import —
// reached real people while the switch said otherwise. It belongs here instead:
// every email in the system passes through sendEmail().
type EmailConfigRow = {
  master_enabled: boolean; test_mode: boolean; test_address: string | null
  allowed_recipients: string[] | null
}
let configCache: { at: number; cfg: EmailConfigRow } | null = null
async function emailConfig(): Promise<EmailConfigRow> {
  if (configCache && Date.now() - configCache.at < 30_000) return configCache.cfg
  const { data } = await db.from("lms_email_config")
    .select("master_enabled, test_mode, test_address, allowed_recipients").eq("id", 1).maybeSingle()
  // Unreadable config fails SAFE: test mode on, no address, so nothing is sent.
  const cfg = (data as any) ?? { master_enabled: true, test_mode: true, test_address: null, allowed_recipients: null }
  configCache = { at: Date.now(), cfg }
  return cfg
}
/** Call this to drop the cache after the settings change. */
export function forgetEmailConfig() { configCache = null }

// External courses (e.g. ICAO) are delivered by another body: we don't email
// their participants about enrolment, joining or completion. Still sent: class
// day reminders, the certificate (the provider's once uploaded, and ours when
// the program issues one), feedback and the impact questionnaire.
const EXTERNAL_ALLOWED = new Set(["certificate", "class_reminder", "feedback_reminder", "impact_survey"])
let externalCache: { at: number; ids: Set<string> } | null = null
async function externalCourseIds(): Promise<Set<string>> {
  if (externalCache && Date.now() - externalCache.at < 60_000) return externalCache.ids
  const { data } = await db.from("lms_courses").select("id").eq("delivery_mode", "external")
  externalCache = { at: Date.now(), ids: new Set(((data ?? []) as any[]).map(c => c.id)) }
  return externalCache.ids
}

export async function sendEmail(opts: SendOptions) {
  const { type, to, subject, html, studentId, courseId, sessionId } = opts

  const cfg = await emailConfig()
  const off = cfg.master_enabled === false
  const needsSink = !off && cfg.test_mode && !cfg.test_address
  // The rules pipeline may have redirected already; comparing avoids logging it twice.
  const redirected = !off && cfg.test_mode && !!cfg.test_address && cfg.test_address !== to
  const recipient = redirected ? cfg.test_address! : to

  // An allow-list, when set, is the last word: real delivery, but only to these
  // addresses. It exists so a live client cannot be reached while we test.
  const allow = (cfg.allowed_recipients ?? []).map(a => a.trim().toLowerCase()).filter(Boolean)
  const blocked = allow.length > 0 && !allow.includes(recipient.trim().toLowerCase())
  const externalCourse = !!courseId && !EXTERNAL_ALLOWED.has(String(opts.rule ?? type)) && (await externalCourseIds().catch(() => new Set<string>())).has(courseId)

  let status   = "sent"
  let errorMsg: string | null = null

  try {
    if (externalCourse) status = "skipped"                   // delivered by another body
    else if (off) status = "skipped"                         // sending is switched off
    else if (needsSink) status = "skipped"                   // test mode with nowhere to send
    else if (blocked) status = "skipped"                     // not on the allow-list
    else if (isReservedTestAddress(recipient)) status = "skipped"  // reserved test domain — never deliverable
    else await sendGraphMailAs({ fromEmail: LMS_EMAIL, toEmail: recipient, subject, html })
  } catch (e: any) {
    status   = "failed"
    errorMsg = e?.message ?? "Unknown error"
  }

  // Log regardless of outcome
  await db.from("lms_email_log").insert({
    type,
    to_email:   recipient,
    subject,
    student_id: studentId ?? null,
    course_id:  courseId  ?? null,
    session_id: sessionId ?? null,
    status:     status === "sent" && (opts.statusOverride || redirected) ? (opts.statusOverride ?? "redirected") : status,
    error:      errorMsg,
    rule:           opts.rule ?? null,
    program_id:     opts.programId ?? null,
    intended_email: opts.intendedEmail ?? (redirected ? to : null),
    reason:         externalCourse ? "External course — delivered by the provider"
                    : off ? "Email sending is off"
                    : needsSink ? "Test mode is on but no test address is set"
                    : blocked ? "Not on the allow-list"
                    : opts.reason ?? (redirected ? "Test mode — redirected" : null),
  })

  return { ok: status === "sent", error: errorMsg }
}

// ── Brand colours ──────────────────────────────────────────────────────────
export const BLUE = "#1B4F8A"
export const GOLD = "#D4AF37"
export const APP_BASE_URL = APP_URL

export function baseTemplate(bodyHtml: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ICS Aviation</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
          <!-- Header -->
          <tr>
            <td style="background:${BLUE};padding:28px 40px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:1px;">ICS AVIATION</p>
              <p style="margin:6px 0 0;color:rgba(255,255,255,.6);font-size:12px;letter-spacing:2px;text-transform:uppercase;">Learning Management System</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                ICS Aviation Institute &nbsp;·&nbsp;
                <a href="${APP_URL}/lms/dashboard" style="color:${BLUE};text-decoration:none;">Learning Portal</a>
              </p>
              <p style="margin:6px 0 0;color:#cbd5e1;font-size:11px;">
                This is an automated notification — please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function btn(label: string, href: string) {
  return `<a href="${href}" style="display:inline-block;background:${BLUE};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;margin-top:24px;">${label}</a>`
}

export function chip(label: string, value: string) {
  return `<tr>
    <td style="padding:6px 0;color:#64748b;font-size:14px;width:130px;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;color:#1e293b;font-size:14px;font-weight:600;">${value}</td>
  </tr>`
}

// ── Email templates ────────────────────────────────────────────────────────

/** Sent when a student is enrolled in a course */
export function buildEnrollmentEmail(opts: {
  studentName: string
  courseTitle: string
  courseId:    string
  instructorName?: string
}) {
  const { studentName, courseTitle, courseId, instructorName } = opts
  const courseUrl = `${APP_URL}/lms/courses/${courseId}`

  const body = `
    <h2 style="margin:0 0 6px;color:${BLUE};font-size:22px;">Welcome aboard, ${studentName}!</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
      You've been enrolled in a new course on the ICS Aviation Learning Portal.
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;width:100%;box-sizing:border-box;">
      ${chip("Course", courseTitle)}
      ${instructorName ? chip("Instructor", instructorName) : ""}
      ${chip("Portal", "ICS Aviation LMS")}
    </table>
    <p style="text-align:center;">
      ${btn("Go to Course →", courseUrl)}
    </p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;text-align:center;">
      Log in at <a href="${APP_URL}/lms/dashboard" style="color:${BLUE};">${APP_URL}/lms/dashboard</a> if the button doesn't work.
    </p>
  `
  return {
    subject: `You've been enrolled in "${courseTitle}" — ICS Aviation LMS`,
    html:    baseTemplate(body),
  }
}

/** Sent the day before a live session */
export function buildSessionReminderEmail(opts: {
  studentName:  string
  sessionTitle: string
  courseTitle:  string
  sessionDate:  string   // "2026-06-15"
  startTime:    string   // "09:00"
  endTime?:     string
  location?:    string
  meetingLink?: string
  sessionId:    string
}) {
  const { studentName, sessionTitle, courseTitle, sessionDate, startTime, endTime, location, meetingLink, sessionId } = opts

  const dateStr = new Date(sessionDate + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
  const timeStr = endTime
    ? `${startTime} – ${endTime}`
    : startTime

  const body = `
    <div style="background:${BLUE};border-radius:8px;padding:6px 14px;display:inline-block;margin-bottom:20px;">
      <span style="color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Session Reminder</span>
    </div>
    <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">You have a session tomorrow</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
      Hi ${studentName}, don't forget about your upcoming live session for <strong>${courseTitle}</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;width:100%;box-sizing:border-box;">
      ${chip("Session", sessionTitle)}
      ${chip("Date", dateStr)}
      ${chip("Time", timeStr)}
      ${location    ? chip("Location", location)    : ""}
      ${meetingLink ? chip("Online", `<a href="${meetingLink}" style="color:${BLUE};">Join Meeting</a>`) : ""}
    </table>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;text-align:center;">
      Your instructor will record your attendance during the session.
    </p>
  `
  return {
    subject: `Reminder: "${sessionTitle}" is tomorrow — ICS Aviation LMS`,
    html:    baseTemplate(body),
  }
}

/** Sent to a self-paced student who hasn't made progress in a while (re-engagement) */
export function buildCourseReminderEmail(opts: {
  studentName: string
  courseTitle: string
  courseId:    string
  progressPct: number
}) {
  const { studentName, courseTitle, courseId, progressPct } = opts
  const courseUrl = `${APP_URL}/lms/courses/${courseId}`
  const pct = Math.max(0, Math.min(100, Math.round(progressPct)))

  const body = `
    <div style="background:${GOLD};border-radius:8px;padding:6px 14px;display:inline-block;margin-bottom:20px;">
      <span style="color:#1e293b;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Keep Learning</span>
    </div>
    <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">Pick up where you left off, ${studentName}</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
      You've made a great start on <strong>${courseTitle}</strong>. Set aside a few minutes today to
      continue — small steps add up.
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:18px 20px;width:100%;box-sizing:border-box;">
      <tr>
        <td style="padding:0 0 8px;color:#64748b;font-size:13px;">Your progress</td>
        <td style="padding:0 0 8px;color:${BLUE};font-size:13px;font-weight:700;text-align:right;">${pct}%</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:0;">
          <div style="background:#e2e8f0;border-radius:999px;height:10px;width:100%;overflow:hidden;">
            <div style="background:${BLUE};height:10px;width:${pct}%;border-radius:999px;"></div>
          </div>
        </td>
      </tr>
    </table>
    <p style="text-align:center;">
      ${btn("Resume Course →", courseUrl)}
    </p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;text-align:center;">
      Log in at <a href="${APP_URL}/lms/dashboard" style="color:${BLUE};">${APP_URL}/lms/dashboard</a> if the button doesn't work.
    </p>
  `
  return {
    subject: `You're ${pct}% through "${courseTitle}" — keep going · ICS Aviation LMS`,
    html:    baseTemplate(body),
  }
}

/** Sent when an admin creates or resets a student account */
export async function sendStudentCredentialsEmail(opts: {
  studentName:  string
  studentEmail: string
  password:     string
  isReset?:     boolean
  /** Test mode: deliver here instead, and record who it was really for. */
  testAddress?: string | null
  studentId?:   string | null
}) {
  const { studentName, studentEmail, password, isReset } = opts
  const loginUrl = `${APP_URL}/lms/login`

  const body = `
    <h2 style="margin:0 0 6px;color:${BLUE};font-size:22px;">
      ${isReset ? "Your password has been reset" : `Welcome, ${studentName}!`}
    </h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
      ${isReset
        ? `Hi ${studentName}, your ICS Aviation LMS password has been reset. Use the credentials below to log in.`
        : `Your ICS Aviation Learning Management System account is ready. Use the credentials below to access the student portal.`}
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;width:100%;box-sizing:border-box;">
      ${chip("Email", studentEmail)}
      ${chip("Password", `<code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:13px;">${password}</code>`)}
    </table>
    <p style="text-align:center;">
      ${btn("Log In to LMS →", loginUrl)}
    </p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;text-align:center;">
      We recommend changing your password after your first login.
    </p>
  `

  const subject = isReset
    ? `Your ICS Aviation LMS Password Has Been Reset`
    : `Welcome to ICS Aviation LMS — Your Account Is Ready`

  // Carries a password, so it is the one email that must reach a real person
  // even while everything else is redirected — test mode still applies, but the
  // log keeps the intended recipient either way (EM-19).
  const redirected = !!opts.testAddress && opts.testAddress !== studentEmail
  const recipient  = redirected ? opts.testAddress! : studentEmail

  let status = "sent"
  let errorMsg: string | null = null
  try {
    if (isReservedTestAddress(recipient)) status = "skipped"
    else await sendGraphMailAs({ fromEmail: LMS_EMAIL, toEmail: recipient, toName: studentName, subject, html: baseTemplate(body) })
  } catch (e: any) {
    status = "failed"
    errorMsg = e?.message ?? "Unknown error"
    throw e
  } finally {
    await db.from("lms_email_log").insert({
      type: "welcome", rule: "welcome",
      to_email: recipient, intended_email: redirected ? studentEmail : null,
      subject, student_id: opts.studentId ?? null,
      status: status === "sent" && redirected ? "redirected" : status,
      error: errorMsg,
      reason: redirected ? "Test mode — redirected" : null,
    }).then(() => {}, () => {})
  }
}

/** Sent when a student requests a password reset */
export function buildPasswordResetEmail(opts: {
  studentName: string
  resetUrl:    string
  expiresMin:  number
}) {
  const { studentName, resetUrl, expiresMin } = opts
  const body = `
    <div style="text-align:center;padding:10px 0 20px;">
      <div style="display:inline-block;background:#eff6ff;border-radius:50%;padding:20px;">
        <span style="font-size:36px;">🔑</span>
      </div>
    </div>
    <h2 style="margin:0 0 6px;color:${BLUE};font-size:22px;text-align:center;">Reset your password</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;text-align:center;">
      Hi ${studentName}, we received a request to reset your ICS Aviation Learning Portal password.
      Click the button below to choose a new one.
    </p>
    <p style="text-align:center;">
      ${btn("Reset Password →", resetUrl)}
    </p>
    <p style="color:#94a3b8;font-size:13px;line-height:1.6;text-align:center;margin-top:24px;">
      This link expires in ${expiresMin} minutes. If you didn't request this, you can safely ignore
      this email — your password won't change.
    </p>`
  return {
    subject: "Reset your password — ICS Aviation LMS",
    html:    baseTemplate(body),
  }
}

/** Self sign-up: confirm the address before the account can do anything. */
export function buildVerifyEmail(opts: { studentName: string; verifyUrl: string; expiresHours: number }) {
  const { studentName, verifyUrl, expiresHours } = opts
  const body = `
    <h2 style="margin:0 0 6px;color:${BLUE};font-size:22px;text-align:center;">Confirm your email</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;text-align:center;">
      Hi ${studentName}, thank you for registering with ICS Integrated Consulting Services.
      Confirm your email address to activate your account.
    </p>
    <p style="text-align:center;">${btn("Confirm my email →", verifyUrl)}</p>
    <p style="color:#94a3b8;font-size:13px;line-height:1.6;text-align:center;margin-top:24px;">
      This link expires in ${expiresHours} hours. If you didn't register with us, ignore this email —
      the account is never activated and is removed automatically.
    </p>`
  return { subject: "Confirm your email — ICS Aviation LMS", html: baseTemplate(body) }
}

/**
 * Someone tried to register with an address that already has an account. Sent
 * INSTEAD of a verification mail, so the sign-up form never reveals who is
 * already registered.
 */
export function buildAlreadyRegisteredEmail(opts: { studentName: string; loginUrl: string; forgotUrl: string }) {
  const { studentName, loginUrl, forgotUrl } = opts
  const body = `
    <h2 style="margin:0 0 6px;color:${BLUE};font-size:22px;text-align:center;">You already have an account</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;text-align:center;">
      Hi ${studentName}, someone just tried to register with this email address — it may well have been you.
      There is no need: you already have an ICS Aviation Learning Portal account.
    </p>
    <p style="text-align:center;">${btn("Sign in →", loginUrl)}</p>
    <p style="color:#94a3b8;font-size:13px;line-height:1.6;text-align:center;margin-top:24px;">
      Forgotten your password? <a href="${forgotUrl}" style="color:${BLUE};">Reset it here</a>.
      If this wasn't you, nothing has changed and you can ignore this email.
    </p>`
  return { subject: "You already have an account — ICS Aviation LMS", html: baseTemplate(body) }
}
