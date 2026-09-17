"use client"

import Link from "next/link"
import Image from "next/image"
import { AlertTriangle, Award, CheckCircle2 } from "lucide-react"
import type { StudentProgramReport } from "@/lib/lms-program-report"
import { Page, PageHeader, PageFooter, Metric, Bar, SECTION, PRINT_CSS, SCREEN_PRINT_CSS, sc, fmtTime, fmtPct, fmtDay } from "@/components/lms/reports/ReportChrome"
import type { Audience } from "@/components/lms/reports/ProgramReportView"

// Student in a program (RL-6): courses in order, results, certificates, time,
// attendance, feedback given (named answers only), links to each course report.
export default function StudentProgramReportView({ data, audience = "internal", includeInternal = false, forPrint = false }: {
  data: StudentProgramReport; audience?: Audience; includeInternal?: boolean; forPrint?: boolean
}) {
  const { program, student, member, totals, courses, survey } = data
  const client = audience === "client"
  const showInternal = !client || includeInternal
  const links = !forPrint
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  const logo = program.company?.logo_url ?? null
  const subtitle = `${student.name} · ${program.name}`

  return (
    <>
      <style>{forPrint ? PRINT_CSS : SCREEN_PRINT_CSS}</style>
      <div id="report-root" className="flex flex-col" style={forPrint ? { width: 794 } : { width: 794, margin: "0 auto", boxShadow: "0 0 0 1px #e2e8f0", background: "white" }}>
        <Page dark first>
          <div className="flex items-center justify-between px-12 pt-10 shrink-0">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36} className="object-contain" />
            <p className="text-white/40 text-xs">{today}</p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-12 text-center gap-6">
            {logo && (
              <div className="bg-white rounded-2xl px-6 py-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt={program.company?.name ?? ""} className="h-12 max-w-[200px] object-contain" />
              </div>
            )}
            <p className="text-white/50 text-[11px] uppercase tracking-[0.4em]">Student Program Report</p>
            <div>
              <h1 className="text-4xl font-extrabold text-white tracking-tight">{student.name}</h1>
              <p className="text-white/50 text-sm mt-2">{[student.employee_number, student.job_title].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="px-8 py-4 rounded-2xl border border-white/10 bg-white/5">
              <p className="text-white/80 text-sm font-semibold">{program.name}</p>
              <p className="text-white/40 text-[11px] mt-1">{[program.company?.name, member.track && `Track: ${member.track}`, `${fmtDay(program.start_date)} → ${fmtDay(member.endDate)}${member.extended ? " (extended)" : ""}`].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="grid grid-cols-4 gap-6">
              {[["Courses", `${totals.coursesDone}/${totals.coursesTotal}`], ["Progress", `${totals.progress}%`], ["Avg score", fmtPct(totals.avgScore)], ["Certificates", String(totals.certificates)]].map(([l, v]) => (
                <div key={l} className="text-center"><p className="text-2xl font-bold text-white">{v}</p><p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">{l}</p></div>
              ))}
            </div>
          </div>
          <div className="px-12 py-6 border-t border-white/10 flex justify-end shrink-0"><p className="text-white/20 text-[9px]">Page 1 of 2</p></div>
        </Page>

        <Page>
          <PageHeader title="Courses & Results" subtitle={subtitle} today={today} logoUrl={logo} />
          <div className="px-12 py-7 space-y-6">
            <div className="grid grid-cols-4 gap-3 avoid-break">
              <Metric label="Status" value={member.status === "withdrawn" ? "Withdrawn" : totals.coursesTotal > 0 && totals.coursesDone === totals.coursesTotal ? "Finished" : "In progress"} />
              <Metric label="Exams passed" value={`${totals.examsPassed}/${totals.examsSat}`} sub="of exams sat" />
              <Metric label="Time" value={fmtTime(totals.timeS)} />
              <Metric label="Attendance" value={fmtPct(totals.attendancePct)} color={sc(totals.attendancePct).t} />
            </div>

            {showInternal && totals.atRisk.length > 0 && (
              <div className="avoid-break border border-red-100 bg-red-50/50 rounded-xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-600 mb-1 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Needs support</p>
                {totals.atRisk.map((r, i) => <p key={i} className="text-xs text-red-800">{r}</p>)}
              </div>
            )}

            <div>
              <p className={`${SECTION} mb-3`}>Courses in order</p>
              <div className="space-y-3">
                {courses.map((c, i) => (
                  <div key={c.enrollment_id} className="avoid-break border border-slate-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">
                          <span className="text-slate-400 mr-1.5">{i + 1}.</span>
                          {links ? <Link href={`/lms-admin/reports/${c.course_id}/${student.id}?enrollment=${c.enrollment_id}&from=${encodeURIComponent(`/lms-admin/reports/programs/${program.id}/students/${student.id}`)}`} className="hover:text-[#1B4F8A] hover:underline">{c.title}</Link> : c.title}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {c.status === "completed" ? <span className="text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Completed {fmtDay(c.completedAt)}</span>
                            : c.status === "dropped" ? "Withdrawn" : "In progress"}
                          {" · "}{fmtTime(c.timeS)}{c.attendancePct !== null && ` · attendance ${c.attendancePct}%`}
                          {c.lastActivity && ` · last active ${fmtDay(c.lastActivity)}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {c.exam.exists ? (
                          c.exam.sat ? (
                            <p className="text-sm font-bold" style={{ color: c.exam.passed ? "#059669" : "#DC2626" }}>{c.exam.passed ? "Passed" : "Not passed"} · {fmtPct(c.exam.bestPct)}</p>
                          ) : <p className="text-xs text-slate-400">Exam not taken</p>
                        ) : <p className="text-xs text-slate-400">No final exam</p>}
                        {c.exam.exists && c.exam.sat && <p className="text-[10px] text-slate-400">{c.exam.attempts}/{c.exam.maxAttempts} attempts · best shown</p>}
                        {c.certificate && <p className="text-[10px] text-emerald-700 inline-flex items-center gap-1 mt-0.5"><Award className="h-3 w-3" /> {c.certificate.code}{c.certificate.status === "held" ? " (held)" : ""}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3"><div className="flex-1"><Bar pct={c.progress} color={c.status === "completed" ? "#059669" : "#1B4F8A"} /></div><span className="text-[11px] w-9 text-right text-slate-600">{c.progress}%</span></div>
                    {showInternal && c.atRisk.length > 0 && <p className="text-[11px] text-red-600 mt-2">{c.atRisk.join(" · ")}</p>}
                    {c.feedback && (
                      <p className="text-[11px] text-slate-500 mt-2">
                        Feedback: {!c.feedback.given ? "not given yet" : c.feedback.anonymous ? "given (anonymous)" : <>given{c.feedback.overall ? ` · overall ${c.feedback.overall}/5` : ""}{c.feedback.recommend ? ` · would recommend: ${c.feedback.recommend}` : ""}</>}
                      </p>
                    )}
                    {c.feedback && !c.feedback.anonymous && c.feedback.comments.map((t, j) => <p key={j} className="text-[11px] text-slate-600 italic border-l-2 border-slate-200 pl-2 mt-1">{t}</p>)}
                  </div>
                ))}
              </div>
            </div>
            {survey && (
              <p className="text-xs text-slate-500 avoid-break">
                Program survey: {survey.anonymous ? "answered (anonymous)" : <>answered{survey.overall ? ` · overall ${survey.overall}/5` : ""}{survey.recommend ? ` · would recommend: ${survey.recommend}` : ""}</>}
              </p>
            )}
          </div>
          <PageFooter page={2} total={2} confidential={!client} />
        </Page>
      </div>
    </>
  )
}
