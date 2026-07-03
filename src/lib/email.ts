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
 * Only one env var to add:
 *   LMS_EMAIL=lms@ics-aviation.com
 *
 * (falls back to MICROSOFT_USER_EMAIL if LMS_EMAIL is not set)
 */

import { sendGraphMailAs } from "@/lib/ms-graph"
import { db } from "@/lib/db"

const APP_URL   = process.env.NEXT_PUBLIC_APP_URL ?? "https://ics-exam.vercel.app"
// The "from" mailbox — lms@ shared box, falls back to the existing alep@ if not set
const LMS_EMAIL = process.env.LMS_EMAIL ?? process.env.MICROSOFT_USER_EMAIL ?? "lms@ics-aviation.com"

// ── Types ──────────────────────────────────────────────────────────────────
export type EmailType = "enrollment" | "session_reminder" | "completion"

interface SendOptions {
  type:       EmailType
  to:         string
  subject:    string
  html:       string
  studentId?: string
  courseId?:  string
  sessionId?: string
}

// ── Core send + log ────────────────────────────────────────────────────────
export async function sendEmail(opts: SendOptions) {
  const { type, to, subject, html, studentId, courseId, sessionId } = opts

  let status   = "sent"
  let errorMsg: string | null = null

  try {
    await sendGraphMailAs({ fromEmail: LMS_EMAIL, toEmail: to, subject, html })
  } catch (e: any) {
    status   = "failed"
    errorMsg = e?.message ?? "Unknown error"
  }

  // Log regardless of outcome
  await db.from("lms_email_log").insert({
    type,
    to_email:   to,
    subject,
    student_id: studentId ?? null,
    course_id:  courseId  ?? null,
    session_id: sessionId ?? null,
    status,
    error:      errorMsg,
  })

  return { ok: status === "sent", error: errorMsg }
}

// ── Brand colours ──────────────────────────────────────────────────────────
const BLUE = "#1B4F8A"
const GOLD = "#D4AF37"

function baseTemplate(bodyHtml: string) {
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

function btn(label: string, href: string) {
  return `<a href="${href}" style="display:inline-block;background:${BLUE};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;margin-top:24px;">${label}</a>`
}

function chip(label: string, value: string) {
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
  const checkInUrl = `${APP_URL}/lms/attend/${sessionId}`

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
    <p style="text-align:center;">
      ${btn("Self Check-In →", checkInUrl)}
    </p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;text-align:center;">
      You can self check-in using the button above, or present your QR code to the instructor.
    </p>
  `
  return {
    subject: `Reminder: "${sessionTitle}" is tomorrow — ICS Aviation LMS`,
    html:    baseTemplate(body),
  }
}

/** Sent when an admin creates or resets a student account */
export async function sendStudentCredentialsEmail(opts: {
  studentName:  string
  studentEmail: string
  password:     string
  isReset?:     boolean
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

  await sendGraphMailAs({
    fromEmail: LMS_EMAIL,
    toEmail:   studentEmail,
    toName:    studentName,
    subject,
    html:      baseTemplate(body),
  })
}

/** Sent when a student completes all mandatory content in a course */
export function buildCompletionEmail(opts: {
  studentName: string
  courseTitle: string
  courseId?:   string   // unused in the body; kept for callers that pass it
  completedAt: string
  kind?:       "course" | "learning path" | "programme"   // label for subject line
}) {
  const { studentName, courseTitle, completedAt, kind = "course" } = opts
  const kindLabel = kind === "course" ? "Course" : kind === "learning path" ? "Learning Path" : "Programme"
  const dateStr = new Date(completedAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  })
  const dashUrl = `${APP_URL}/lms/dashboard`

  const body = `
    <div style="text-align:center;padding:10px 0 20px;">
      <div style="display:inline-block;background:#ecfdf5;border-radius:50%;padding:20px;">
        <span style="font-size:40px;">🎓</span>
      </div>
    </div>
    <h2 style="margin:0 0 6px;color:#059669;font-size:24px;text-align:center;">Congratulations, ${studentName}!</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;text-align:center;">
      You have successfully completed all required content for:
    </p>
    <div style="background:${BLUE};border-radius:10px;padding:20px 24px;text-align:center;margin-bottom:24px;">
      <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${courseTitle}</p>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.7);font-size:13px;">Completed on ${dateStr}</p>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.6;text-align:center;">
      Your completion has been recorded. If a certificate is available, it will appear in your dashboard.
    </p>
    <p style="text-align:center;">
      ${btn("Go to Dashboard →", dashUrl)}
    </p>
  `
  return {
    subject: `${kindLabel} Complete: "${courseTitle}" — ICS Aviation LMS`,
    html:    baseTemplate(body),
  }
}
