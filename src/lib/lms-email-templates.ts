// Templates for the EM-2 … EM-15 emails (EM-17: one standard branded wording
// each, filled in automatically). The three older templates — enrollment,
// session reminder and password reset — stay in lms/email.ts and are reused.
//
// Every builder returns { subject, html } and takes plain values, so it can be
// rendered in a test or a preview without touching the database.

import { baseTemplate, btn, chip, BLUE, GOLD, APP_BASE_URL as APP } from "@/lib/email"

const fmtDay = (d: string | null | undefined) =>
  d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—"

const badge = (text: string, bg: string, fg = "#ffffff") =>
  `<div style="background:${bg};border-radius:8px;padding:6px 14px;display:inline-block;margin-bottom:20px;">
     <span style="color:${fg};font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${text}</span>
   </div>`

const closing = (label = "Open the Learning Portal →", href = `${APP}/lms/dashboard`) => `
  <p style="text-align:center;">${btn(label, href)}</p>
  <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;text-align:center;">
    Log in at <a href="${APP}/lms/dashboard" style="color:${BLUE};">${APP}/lms/dashboard</a> if the button doesn't work.
  </p>`

const bar = (pct: number) => {
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  return `<table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:18px 20px;width:100%;box-sizing:border-box;">
    <tr><td style="padding:0 0 8px;color:#64748b;font-size:13px;">Your progress</td>
        <td style="padding:0 0 8px;color:${BLUE};font-size:13px;font-weight:700;text-align:right;">${p}%</td></tr>
    <tr><td colspan="2" style="padding:0;">
      <div style="background:#e2e8f0;border-radius:999px;height:10px;width:100%;overflow:hidden;">
        <div style="background:${BLUE};height:10px;width:${p}%;border-radius:999px;"></div>
      </div></td></tr>
  </table>`
}

// ── EM-2 Program started ─────────────────────────────────────────────────────
export function buildProgramStartedEmail(o: {
  studentName: string; programName: string; programId: string
  endDate?: string | null; courseCount: number; firstCourse?: string | null; track?: string | null
}) {
  const body = `
    ${badge("Your training starts today", BLUE)}
    <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">Welcome to ${o.programName}, ${o.studentName}</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
      Your program is now open. Everything you need is in the Learning Portal — work through the
      courses at your own pace and keep an eye on the finish date below.
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;width:100%;box-sizing:border-box;">
      ${chip("Program", o.programName)}
      ${o.track ? chip("Track", o.track) : ""}
      ${chip("Courses", `${o.courseCount}`)}
      ${o.firstCourse ? chip("Start with", o.firstCourse) : ""}
      ${o.endDate ? chip("Finish by", fmtDay(o.endDate)) : ""}
    </table>
    ${closing("Start Learning →", `${APP}/lms/programs/${o.programId}`)}`
  return { subject: `Your program "${o.programName}" starts today — ICS Aviation LMS`, html: baseTemplate(body) }
}

// ── EM-3 Not started yet ─────────────────────────────────────────────────────
export function buildNotStartedEmail(o: {
  studentName: string; programName: string; programId: string; daysSinceStart: number; endDate?: string | null
}) {
  const body = `
    ${badge("A gentle reminder", GOLD, "#1e293b")}
    <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">Ready when you are, ${o.studentName}</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
      <strong>${o.programName}</strong> started ${o.daysSinceStart} day${o.daysSinceStart === 1 ? "" : "s"} ago and
      we haven't seen you in the portal yet. The first course takes only a few minutes to open —
      starting early leaves you plenty of room before the deadline.
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;width:100%;box-sizing:border-box;">
      ${chip("Program", o.programName)}
      ${o.endDate ? chip("Finish by", fmtDay(o.endDate)) : ""}
    </table>
    ${closing("Open My Program →", `${APP}/lms/programs/${o.programId}`)}`
  return { subject: `Haven't started "${o.programName}" yet? — ICS Aviation LMS`, html: baseTemplate(body) }
}

// ── EM-4 Inactive ────────────────────────────────────────────────────────────
export function buildInactiveEmail(o: {
  studentName: string; programName: string; programId: string; days: number; progressPct: number
  nextCourse?: string | null; endDate?: string | null
}) {
  const body = `
    ${badge("Keep going", GOLD, "#1e293b")}
    <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">Pick up where you left off, ${o.studentName}</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
      It's been ${o.days} days since your last activity on <strong>${o.programName}</strong>.
      You're already part of the way through — a short session today keeps the momentum.
    </p>
    ${bar(o.progressPct)}
    <table cellpadding="0" cellspacing="0" style="margin-top:14px;background:#f8fafc;border-radius:8px;padding:16px 20px;width:100%;box-sizing:border-box;">
      ${o.nextCourse ? chip("Up next", o.nextCourse) : ""}
      ${o.endDate ? chip("Finish by", fmtDay(o.endDate)) : ""}
    </table>
    ${closing("Resume →", `${APP}/lms/programs/${o.programId}`)}`
  return { subject: `Continue "${o.programName}" — ICS Aviation LMS`, html: baseTemplate(body) }
}

// ── EM-5 Deadline approaching ────────────────────────────────────────────────
export function buildDeadlineEmail(o: {
  studentName: string; programName: string; programId: string; daysLeft: number; endDate: string
  progressPct: number; coursesLeft: number; extended?: boolean
}) {
  const urgent = o.daysLeft <= 3
  const body = `
    ${badge(urgent ? `${o.daysLeft} day${o.daysLeft === 1 ? "" : "s"} left` : "Deadline approaching", urgent ? "#DC2626" : GOLD, urgent ? "#ffffff" : "#1e293b")}
    <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">
      ${o.coursesLeft > 0 ? `${o.coursesLeft} course${o.coursesLeft === 1 ? "" : "s"} still to finish` : "Almost there"}, ${o.studentName}
    </h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
      Your access to <strong>${o.programName}</strong> runs until <strong>${fmtDay(o.endDate)}</strong>${o.extended ? " (your extended date)" : ""},
      which is ${o.daysLeft} day${o.daysLeft === 1 ? "" : "s"} away.
    </p>
    ${bar(o.progressPct)}
    ${closing("Finish My Courses →", `${APP}/lms/programs/${o.programId}`)}`
  return { subject: `${o.daysLeft} day${o.daysLeft === 1 ? "" : "s"} left on "${o.programName}" — ICS Aviation LMS`, html: baseTemplate(body) }
}

// EM-5 for one course with its own due date (program Structure) or a personal extension.
export function buildCourseDeadlineEmail(o: {
  studentName: string; courseTitle: string; courseId: string; programName: string
  daysLeft: number; dueDate: string; progressPct: number; extended?: boolean
}) {
  const urgent = o.daysLeft <= 3
  const body = `
    ${badge(urgent ? `${o.daysLeft} day${o.daysLeft === 1 ? "" : "s"} left` : "Deadline approaching", urgent ? "#DC2626" : GOLD, urgent ? "#ffffff" : "#1e293b")}
    <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">${o.courseTitle} is due soon, ${o.studentName}</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
      <strong>${o.courseTitle}</strong> (${o.programName}) is due on <strong>${fmtDay(o.dueDate)}</strong>${o.extended ? " (your extended date)" : ""},
      which is ${o.daysLeft} day${o.daysLeft === 1 ? "" : "s"} away. After that date you can still review it, but no longer submit work or take its exam.
    </p>
    ${bar(o.progressPct)}
    ${closing("Continue the Course →", `${APP}/lms/courses/${o.courseId}`)}`
  return { subject: `${o.daysLeft} day${o.daysLeft === 1 ? "" : "s"} left on "${o.courseTitle}" — ICS Aviation LMS`, html: baseTemplate(body) }
}

// ── EM-6 Course completed (program-aware) ────────────────────────────────────
export function buildCourseCompletedEmail(o: {
  studentName: string; courseTitle: string; programName?: string | null; programId?: string | null
  completedAt: string; examPct?: number | null; passed?: boolean | null
  coursesDone?: number | null; coursesTotal?: number | null
}) {
  const body = `
    <div style="text-align:center;padding:10px 0 20px;">
      <div style="display:inline-block;background:#ecfdf5;border-radius:50%;padding:20px;"><span style="font-size:40px;">🎓</span></div>
    </div>
    <h2 style="margin:0 0 6px;color:#059669;font-size:24px;text-align:center;">Well done, ${o.studentName}!</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;text-align:center;">You've completed</p>
    <div style="background:${BLUE};border-radius:10px;padding:20px 24px;text-align:center;margin-bottom:24px;">
      <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${o.courseTitle}</p>
      ${o.programName ? `<p style="margin:6px 0 0;color:rgba(255,255,255,.7);font-size:13px;">${o.programName}</p>` : ""}
      <p style="margin:6px 0 0;color:rgba(255,255,255,.7);font-size:13px;">Completed on ${fmtDay(o.completedAt)}</p>
    </div>
    <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;width:100%;box-sizing:border-box;">
      ${o.examPct !== null && o.examPct !== undefined ? chip("Final exam", `${o.examPct}%${o.passed ? " — passed" : ""}`) : ""}
      ${o.coursesTotal ? chip("Program progress", `${o.coursesDone ?? 0} of ${o.coursesTotal} courses`) : ""}
    </table>
    ${closing("View My Results →", o.programId ? `${APP}/lms/programs/${o.programId}` : `${APP}/lms/dashboard`)}`
  return { subject: `Course complete: "${o.courseTitle}" — ICS Aviation LMS`, html: baseTemplate(body) }
}

// ── EM-7 Certificate released ────────────────────────────────────────────────
export function buildCertificateEmail(o: {
  studentName: string; courseTitle: string; certificateCode: string; issuedAt: string; programName?: string | null
  /** A provider's certificate (e.g. ICAO): named instead of our number. */
  issuedBy?: string | null
}) {
  const body = `
    <div style="text-align:center;padding:10px 0 20px;">
      <div style="display:inline-block;background:#fefce8;border-radius:50%;padding:20px;"><span style="font-size:40px;">📜</span></div>
    </div>
    <h2 style="margin:0 0 6px;color:${BLUE};font-size:24px;text-align:center;">Your certificate is ready</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;text-align:center;">
      Congratulations ${o.studentName} — your certificate for <strong>${o.courseTitle}</strong> has been issued
      and is waiting in your portal.
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;width:100%;box-sizing:border-box;">
      ${chip("Course", o.courseTitle)}
      ${o.programName ? chip("Program", o.programName) : ""}
      ${o.issuedBy ? chip("Issued by", o.issuedBy) : chip("Certificate no.", `<code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:13px;">${o.certificateCode}</code>`)}
      ${chip("Issued", fmtDay(o.issuedAt))}
    </table>
    ${closing("Download Certificate →", `${APP}/lms/certificates`)}`
  return { subject: `Your certificate for "${o.courseTitle}" is ready — ICS Aviation`, html: baseTemplate(body) }
}

// ── EM-8 Last exam attempt left ──────────────────────────────────────────────
export function buildLastAttemptEmail(o: {
  studentName: string; courseTitle: string; courseId: string; scorePct: number; passMark: number
  attemptsUsed: number; maxAttempts: number; weakTopics?: string[]
}) {
  const topics = (o.weakTopics ?? []).slice(0, 4)
  const body = `
    ${badge("One attempt left", "#DC2626")}
    <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">Take your time with this one, ${o.studentName}</h2>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
      You scored <strong>${o.scorePct}%</strong> on the final exam for <strong>${o.courseTitle}</strong>
      and the pass mark is ${o.passMark}%. You have used ${o.attemptsUsed} of ${o.maxAttempts} attempts, so
      <strong>one attempt remains</strong>. There's no rush — go back over the material first, then sit it when you feel ready.
    </p>
    ${topics.length ? `
    <table cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;padding:16px 20px;width:100%;box-sizing:border-box;">
      <tr><td style="color:#991b1b;font-size:13px;font-weight:700;padding-bottom:8px;">Worth reviewing first</td></tr>
      ${topics.map(t => `<tr><td style="color:#7f1d1d;font-size:14px;padding:2px 0;">• ${t}</td></tr>`).join("")}
    </table>` : ""}
    ${closing("Review the Course →", `${APP}/lms/courses/${o.courseId}`)}`
  return { subject: `One attempt left on "${o.courseTitle}" — ICS Aviation LMS`, html: baseTemplate(body) }
}

// ── EM-9 Feedback reminder ───────────────────────────────────────────────────
export function buildFeedbackReminderEmail(o: {
  studentName: string; courseTitle?: string | null; programName?: string | null
  programId?: string | null; courseId?: string | null; mandatory?: boolean
}) {
  const what = o.courseTitle ? `<strong>${o.courseTitle}</strong>` : `<strong>${o.programName}</strong>`
  const body = `
    ${badge("Two minutes, if you can", BLUE)}
    <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">How did we do, ${o.studentName}?</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
      You finished ${what} a few days ago and we'd still love to hear what you thought.
      It's a short form — a few ratings and anything you'd like to tell us.
      ${o.mandatory ? "<br><br>Your certificate becomes available to download once it's in." : ""}
    </p>
    ${closing("Give Feedback →", o.courseId ? `${APP}/lms/courses/${o.courseId}` : o.programId ? `${APP}/lms/programs/${o.programId}` : `${APP}/lms/dashboard`)}`
  return { subject: `Your feedback on "${o.courseTitle ?? o.programName}" — ICS Aviation LMS`, html: baseTemplate(body) }
}

// ── EM-13 Weekly instructor digest ───────────────────────────────────────────
export function buildInstructorDigestEmail(o: {
  instructorName: string; programName: string; programId: string; weekOf: string
  completions: { student: string; course: string }[]
  behind: { student: string; reason: string }[]
  toGrade: { student: string; what: string }[]
  stats: { students: number; completionRate: number | null; passRate: number | null }
}) {
  const list = (rows: string[], empty: string) =>
    rows.length
      ? `<table cellpadding="0" cellspacing="0" width="100%">${rows.map(r => `<tr><td style="color:#334155;font-size:14px;padding:4px 0;border-bottom:1px solid #f1f5f9;">${r}</td></tr>`).join("")}</table>`
      : `<p style="color:#94a3b8;font-size:13px;margin:0;">${empty}</p>`
  const section = (title: string, inner: string) =>
    `<div style="margin-bottom:22px;">
       <p style="margin:0 0 8px;color:${BLUE};font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${title}</p>
       ${inner}
     </div>`
  const body = `
    ${badge("Weekly digest", BLUE)}
    <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">${o.programName}</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:14px;">Week of ${fmtDay(o.weekOf)} · ${o.stats.students} students${o.stats.completionRate !== null ? ` · ${o.stats.completionRate}% complete` : ""}${o.stats.passRate !== null ? ` · ${o.stats.passRate}% pass rate` : ""}</p>
    ${section(`Completed this week (${o.completions.length})`, list(o.completions.map(c => `<strong>${c.student}</strong> — ${c.course}`), "No completions this week."))}
    ${section(`Needing support (${o.behind.length})`, list(o.behind.map(b => `<strong>${b.student}</strong> — ${b.reason}`), "Nobody is flagged right now."))}
    ${section(`Waiting to be graded (${o.toGrade.length})`, list(o.toGrade.map(g => `<strong>${g.student}</strong> — ${g.what}`), "Nothing waiting."))}
    <p style="text-align:center;">${btn("Open the Program →", `${APP}/lms-admin/programs/${o.programId}`)}</p>`
  return { subject: `Weekly digest: ${o.programName} — ICS Aviation LMS`, html: baseTemplate(body) }
}

// ── EM-15 Assignment to grade ────────────────────────────────────────────────
export function buildGradingDueEmail(o: {
  instructorName: string; studentName: string; courseTitle: string; assignmentTitle: string
  submittedAt: string; programName?: string | null; courseId: string; studentId: string
}) {
  const body = `
    ${badge("Needs grading", GOLD, "#1e293b")}
    <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">A submission is waiting</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
      ${o.studentName} submitted work that needs your mark.
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;width:100%;box-sizing:border-box;">
      ${chip("Student", o.studentName)}
      ${chip("Assignment", o.assignmentTitle)}
      ${chip("Course", o.courseTitle)}
      ${o.programName ? chip("Program", o.programName) : ""}
      ${chip("Submitted", fmtDay(o.submittedAt))}
    </table>
    <p style="text-align:center;">${btn("Grade It →", `${APP}/lms-admin/reports/${o.courseId}/${o.studentId}`)}</p>`
  return { subject: `${o.studentName} submitted "${o.assignmentTitle}" — ICS Aviation LMS`, html: baseTemplate(body) }
}

// ── EM-11 / EM-14 Catalogue request (Step 10 wires the trigger) ──────────────
export function buildCatalogueAckEmail(o: { name: string; courseTitle: string }) {
  const body = `
    ${badge("Request received", BLUE)}
    <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">Thanks, ${o.name}</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
      We've received your request for <strong>${o.courseTitle}</strong>. One of our training coordinators
      will get back to you shortly with dates and details.
    </p>`
  return { subject: `We received your request for "${o.courseTitle}" — ICS Aviation`, html: baseTemplate(body) }
}

export function buildCatalogueAdminEmail(o: {
  name: string; email: string; company?: string | null; phone?: string | null; courseTitle: string; message?: string | null
}) {
  const body = `
    ${badge("New catalogue request", GOLD, "#1e293b")}
    <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">${o.courseTitle}</h2>
    <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;width:100%;box-sizing:border-box;">
      ${chip("Name", o.name)}
      ${chip("E-mail", o.email)}
      ${o.company ? chip("Company", o.company) : ""}
      ${o.phone ? chip("Phone", o.phone) : ""}
    </table>
    ${o.message ? `<p style="margin:16px 0 0;color:#475569;font-size:14px;line-height:1.6;border-left:3px solid #e2e8f0;padding-left:12px;">${o.message}</p>` : ""}`
  return { subject: `Catalogue request: ${o.courseTitle} — ${o.name}`, html: baseTemplate(body) }
}

// Staff-written free text goes into the HTML escaped, line breaks kept.
const escText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br>")

// ── EM-21 Impact questionnaire ───────────────────────────────────────────────
export function buildImpactSurveyEmail(o: { studentName: string; courseTitle: string; courseId: string; months: number }) {
  const body = `
    ${badge("Three quick questions", BLUE)}
    <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">Has it made a difference, ${o.studentName}?</h2>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
      It's been about ${o.months} month${o.months === 1 ? "" : "s"} since you completed <strong>${o.courseTitle}</strong>.
      We'd like to know whether you've been able to use it in your work — it takes a minute and helps us make the
      training more useful. It has no effect on your result or your certificate.
    </p>
    ${closing("Answer the questions →", `${APP}/lms/courses/${o.courseId}#impact`)}`
  return { subject: `How is "${o.courseTitle}" working out for you? — ICS Aviation LMS`, html: baseTemplate(body) }
}

// ── EM-22 Joining instructions ───────────────────────────────────────────────
export function buildJoiningInstructionsEmail(o: {
  studentName: string; courseTitle: string; courseId: string; daysBefore: number
  dates: string; dailyTimes: string | null; venue: string | null; address: string | null; mapUrl: string | null
  instructors: string[]; instructions: string | null
}) {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;vertical-align:top;white-space:nowrap;">${label}</td>
         <td style="padding:6px 0;color:#1e293b;font-size:14px;">${value}</td></tr>`
  const where = [o.venue, o.address].filter(Boolean).map(s => escText(s!)).join("<br>")
  const body = `
    ${badge(o.daysBefore <= 1 ? "Starting tomorrow" : `Starting in ${o.daysBefore} days`, BLUE)}
    <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">Joining instructions, ${o.studentName}</h2>
    <p style="margin:0 0 18px;color:#475569;font-size:15px;line-height:1.6;">Everything you need for <strong>${o.courseTitle}</strong>.</p>
    <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:14px 18px;width:100%;box-sizing:border-box;margin-bottom:20px;">
      ${row("Dates", o.dates)}
      ${o.dailyTimes ? row("Each day", o.dailyTimes) : ""}
      ${where ? row("Venue", where + (o.mapUrl ? `<br><a href="${o.mapUrl.replace(/"/g, "%22")}" style="color:${BLUE};">Open the map</a>` : "")) : ""}
      ${o.instructors.length ? row(o.instructors.length === 1 ? "Instructor" : "Instructors", o.instructors.map(escText).join(", ")) : ""}
    </table>
    ${o.instructions ? `<p style="margin:0 0 8px;color:${BLUE};font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Before you come</p>
    <p style="margin:0 0 24px;color:#334155;font-size:14px;line-height:1.6;">${escText(o.instructions)}</p>` : ""}
    ${closing("Open the course →", `${APP}/lms/courses/${o.courseId}`)}`
  return { subject: `Joining instructions: ${o.courseTitle} — ICS Aviation LMS`, html: baseTemplate(body) }
}
