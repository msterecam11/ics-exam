import ExcelJS from "exceljs"
import type { ProgramReport, ClientReport, StudentProgramReport } from "@/lib/lms-program-report"

// RP-15: Excel exports — raw rows, one sheet per table, numbers as numbers.
// Internal notes (students needing support) only in the internal version, and
// feedback comments are never exported with names.

type Col = { header: string; key: string; width?: number; pct?: boolean }

function sheet(wb: ExcelJS.Workbook, name: string, cols: Col[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name.slice(0, 31))
  ws.columns = cols.map(c => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 2) }))
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B4F8A" } }
  ws.views = [{ state: "frozen", ySplit: 1 }]
  for (const r of rows) ws.addRow(r)
  cols.forEach((c, i) => { if (c.pct) ws.getColumn(i + 1).numFmt = '0"%"' })
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }
  return ws
}

const hours = (s: number) => Math.round((s / 3600) * 10) / 10

function feedbackSheet(wb: ExcelJS.Workbook, name: string, s: ProgramReport["feedback"]) {
  const rows: Record<string, unknown>[] = [
    { item: "Asked", value: s.asked }, { item: "Responses", value: s.responses }, { item: "Response rate %", value: s.responseRate },
    ...s.ratings.map(r => ({ item: `${r.label} (avg of 5)`, value: r.avg, detail: `${r.count} ratings · 1★ ${r.dist[0]} · 2★ ${r.dist[1]} · 3★ ${r.dist[2]} · 4★ ${r.dist[3]} · 5★ ${r.dist[4]}` })),
    ...(s.recommend ? [{ item: "Would recommend (yes %)", value: s.recommend.yesPct, detail: `${s.recommend.yes} yes · ${s.recommend.maybe} maybe · ${s.recommend.no} no` }] : []),
    ...s.comments.map(c => ({ item: c.kind === "went_well" ? "Went well" : c.kind === "improve" ? "Improve" : "Comment", detail: c.text })),
  ]
  sheet(wb, name, [{ header: "Item", key: "item", width: 28 }, { header: "Value", key: "value", width: 12 }, { header: "Detail", key: "detail", width: 80 }], rows)
}

async function done(wb: ExcelJS.Workbook) {
  wb.creator = "ICS Aviation"
  wb.created = new Date()
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export async function programWorkbook(r: ProgramReport, opts: { internal: boolean }) {
  const wb = new ExcelJS.Workbook()
  const s = r.stats
  sheet(wb, "Summary", [{ header: "Measure", key: "k", width: 34 }, { header: "Value", key: "v", width: 20 }], [
    { k: "Program", v: r.program.name }, { k: "Client", v: r.program.company?.name ?? "" }, { k: "Track", v: r.scope.trackName ?? "All" },
    { k: "Start date", v: r.program.start_date ?? "" }, { k: "End date", v: r.program.end_date ?? "" },
    { k: "Students enrolled", v: s.members }, { k: "Active", v: s.active }, { k: "Finished all courses", v: s.completedMembers }, { k: "Withdrawn", v: s.withdrawn },
    { k: "Completion rate %", v: s.completionRate }, { k: "Pass rate %", v: s.passRate }, { k: "Exams sat", v: s.sat }, { k: "Exams passed", v: s.passed },
    { k: "Average score % (best attempt)", v: s.avgScore }, { k: "Average progress %", v: s.avgProgress }, { k: "Average time (hours)", v: hours(s.avgTimeS) },
    { k: "Certificates", v: s.certificates }, { k: "Attendance %", v: s.attendancePct }, { k: "Due within 14 days", v: s.dueSoon }, { k: "Past end date", v: s.overdue },
    ...(opts.internal ? [{ k: "Students needing support", v: s.atRisk }] : []),
    { k: "Generated", v: new Date(r.generatedAt).toISOString() },
  ])
  sheet(wb, "Students", [
    { header: "Name", key: "name", width: 28 }, { header: "Email", key: "email", width: 30 }, { header: "Employee no.", key: "emp" }, { header: "Job title", key: "job", width: 20 },
    { header: "Track", key: "track" }, { header: "Status", key: "status" }, { header: "Courses done", key: "done" }, { header: "Courses", key: "total" },
    { header: "Progress", key: "progress", pct: true }, { header: "Avg score", key: "score", pct: true }, { header: "Exams passed", key: "passed" }, { header: "Exams sat", key: "sat" },
    { header: "Certificates", key: "certs" }, { header: "Time (h)", key: "time" }, { header: "Attendance", key: "att", pct: true }, { header: "Last activity", key: "last", width: 20 },
    { header: "End date", key: "end" }, { header: "Extended", key: "ext" },
    ...(opts.internal ? [{ header: "Needs support", key: "risk", width: 60 }] : []),
  ], r.roster.map(x => ({
    name: x.name, email: x.email, emp: x.employee_number ?? "", job: x.job_title ?? "", track: x.track ?? "", status: x.status,
    done: x.coursesDone, total: x.coursesTotal, progress: x.progress, score: x.avgScore, passed: x.examsPassed, sat: x.examsSat,
    certs: x.certificates, time: hours(x.timeS), att: x.attendancePct, last: x.lastActivity ? x.lastActivity.slice(0, 10) : "",
    end: x.endDate ?? "", ext: x.extended ? "yes" : "", risk: x.atRisk.join(" | "),
  })))
  sheet(wb, "Courses", [
    { header: "Course", key: "title", width: 40 }, { header: "Enrolled", key: "enrolled" }, { header: "Completed", key: "completed" }, { header: "Completion", key: "cr", pct: true },
    { header: "Sat exam", key: "sat" }, { header: "Passed", key: "passed" }, { header: "Pass rate", key: "pr", pct: true }, { header: "Avg score", key: "score", pct: true },
    { header: "Avg progress", key: "prog", pct: true }, { header: "Avg time (h)", key: "time" }, { header: "Certificates", key: "certs" },
    { header: "Feedback avg (of 5)", key: "fb" }, { header: "Feedback responses", key: "fbn" },
  ], r.courses.map(c => ({
    title: c.title, enrolled: c.enrolled, completed: c.completed, cr: c.completionRate, sat: c.sat, passed: c.passed, pr: c.passRate,
    score: c.avgScore, prog: c.avgProgress, time: hours(c.avgTimeS), certs: c.certificates, fb: c.feedbackAvg, fbn: c.feedbackResponses,
  })))
  if (r.trackComparison.length) sheet(wb, "Tracks", [
    { header: "Track", key: "name", width: 24 }, { header: "Students", key: "n" }, { header: "Avg progress", key: "p", pct: true },
    { header: "Completion", key: "c", pct: true }, { header: "Pass rate", key: "pr", pct: true }, { header: "Avg score", key: "s", pct: true },
  ], r.trackComparison.map(t => ({ name: t.name, n: t.students, p: t.avgProgress, c: t.completionRate, pr: t.passRate, s: t.avgScore })))
  feedbackSheet(wb, "Course feedback", r.feedback)
  if (r.survey.responses) feedbackSheet(wb, "Program survey", r.survey)
  return done(wb)
}

export async function clientWorkbook(r: ClientReport) {
  const wb = new ExcelJS.Workbook()
  const t = r.totals
  sheet(wb, "Summary", [{ header: "Measure", key: "k", width: 34 }, { header: "Value", key: "v", width: 20 }], [
    { k: "Client", v: r.company.name }, { k: "Programs delivered", v: t.programs }, { k: "Running", v: t.activePrograms }, { k: "Completed", v: t.completedPrograms },
    { k: "People trained", v: t.trained }, { k: "Course enrollments", v: t.enrollments }, { k: "Completion rate %", v: t.completionRate },
    { k: "Pass rate %", v: t.passRate }, { k: "Average score %", v: t.avgScore }, { k: "Certificates", v: t.certificates },
    { k: "Generated", v: new Date(r.generatedAt).toISOString() },
  ])
  sheet(wb, "Programs", [
    { header: "Program", key: "name", width: 36 }, { header: "Reference", key: "ref" }, { header: "Status", key: "status" }, { header: "Start", key: "start" }, { header: "End", key: "end" },
    { header: "Students", key: "n" }, { header: "Completion", key: "c", pct: true }, { header: "Pass rate", key: "pr", pct: true }, { header: "Avg score", key: "s", pct: true },
    { header: "Avg progress", key: "p", pct: true }, { header: "Certificates", key: "certs" }, { header: "Feedback avg (of 5)", key: "fb" }, { header: "Recommend %", key: "rec" },
  ], r.programs.map(p => ({
    name: p.name, ref: p.reference ?? "", status: p.status, start: p.start_date ?? "", end: p.end_date ?? "", n: p.students, c: p.completionRate,
    pr: p.passRate, s: p.avgScore, p: p.avgProgress, certs: p.certificates, fb: p.feedbackAvg, rec: p.recommendPct,
  })))
  feedbackSheet(wb, "Course feedback", r.feedback)
  if (r.survey.responses) feedbackSheet(wb, "Program surveys", r.survey)
  return done(wb)
}

export async function studentWorkbook(r: StudentProgramReport, opts: { internal: boolean }) {
  const wb = new ExcelJS.Workbook()
  sheet(wb, "Summary", [{ header: "Measure", key: "k", width: 30 }, { header: "Value", key: "v", width: 30 }], [
    { k: "Student", v: r.student.name }, { k: "Email", v: r.student.email }, { k: "Employee no.", v: r.student.employee_number ?? "" },
    { k: "Program", v: r.program.name }, { k: "Client", v: r.program.company?.name ?? "" }, { k: "Track", v: r.member.track ?? "" },
    { k: "Status", v: r.member.status }, { k: "End date", v: r.member.endDate ?? "" },
    { k: "Courses completed", v: `${r.totals.coursesDone}/${r.totals.coursesTotal}` }, { k: "Progress %", v: r.totals.progress },
    { k: "Average score %", v: r.totals.avgScore }, { k: "Certificates", v: r.totals.certificates }, { k: "Time (h)", v: hours(r.totals.timeS) },
    { k: "Attendance %", v: r.totals.attendancePct },
    ...(opts.internal ? [{ k: "Needs support", v: r.totals.atRisk.join(" | ") }] : []),
  ])
  sheet(wb, "Courses", [
    { header: "Course", key: "title", width: 36 }, { header: "Status", key: "status" }, { header: "Progress", key: "p", pct: true },
    { header: "Exam", key: "exam" }, { header: "Best score", key: "best", pct: true }, { header: "Attempts", key: "att" }, { header: "Max attempts", key: "max" },
    { header: "Certificate", key: "cert", width: 18 }, { header: "Time (h)", key: "time" }, { header: "Attendance", key: "a", pct: true },
    { header: "Completed", key: "completed", width: 14 }, { header: "Last activity", key: "last", width: 14 },
  ], r.courses.map(c => ({
    title: c.title, status: c.status, p: c.progress,
    exam: !c.exam.exists ? "none" : !c.exam.sat ? "not taken" : c.exam.passed ? "passed" : "not passed",
    best: c.exam.bestPct, att: c.exam.attempts, max: c.exam.maxAttempts,
    cert: c.certificate ? `${c.certificate.code}${c.certificate.status === "held" ? " (held)" : ""}` : "",
    time: hours(c.timeS), a: c.attendancePct, completed: c.completedAt?.slice(0, 10) ?? "", last: c.lastActivity?.slice(0, 10) ?? "",
  })))
  return done(wb)
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
