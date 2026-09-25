"use client"

import Link from "next/link"
import Image from "next/image"
import { AlertTriangle, BrainCircuit } from "lucide-react"
import type { ProgramReport } from "@/lib/lms-program-report"
import { ProgressTimelineChart, ScoreBandsChart, GroupedBars, CHART_COLORS, SCORE_BANDS } from "@/components/lms/reports/ReportCharts"
import { clientSafeFeedback } from "@/lib/lms-report-shared"
import {
  Page, PageHeader, PageFooter, Metric, Bar, FeedbackBlock, SECTION, METRIC_NOTE, PRINT_CSS, SCREEN_PRINT_CSS,
  sc, fmtTime, fmtPct, fmtDay,
} from "@/components/lms/reports/ReportChrome"

export type Audience = "internal" | "client"

// Program report (RL-5) — or one track of it (RL-4). The same component is
// the on-screen report and the PDF. For a client (RP-16) internal notes are
// left out unless asked for, and feedback follows FB-6 / FB-8.
export default function ProgramReportView({ data, audience = "internal", includeComments = false, includeInternal = false, assessment = null, forPrint = false, linkMode = "admin" }: {
  data: ProgramReport; audience?: Audience; includeComments?: boolean; includeInternal?: boolean
  assessment?: any | null; forPrint?: boolean
  /** Where names link to: the admin reports, the viewer portal, or nowhere (PDF). */
  linkMode?: "admin" | "viewer" | "none"
}) {
  const { program, stats, courses, trackComparison, atRisk, roster, scope } = data
  const client = audience === "client"
  const showInternal = !client || includeInternal
  const mode = forPrint ? "none" : linkMode
  const links = mode !== "none"
  const viewer = mode === "viewer"
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  const subtitle = `${program.name}${scope.trackName ? ` · ${scope.trackName}` : ""}`
  const logo = program.company?.logo_url ?? null

  const courseFb = client ? clientSafeFeedback(data.feedback, includeComments) : { ...data.feedback, suppressed: false }
  const surveyFb = client ? clientSafeFeedback(data.survey, includeComments) : { ...data.survey, suppressed: false }
  const hasFeedback = data.feedback.responses > 0 || data.survey.responses > 0
  const hasTracks = trackComparison.length > 1
  const groupComparison = data.groupComparison ?? []
  const hasGroups = groupComparison.length > 0
  const hasAtRisk = showInternal && atRisk.length > 0
  const hasExpert = showInternal && !!assessment?.executive_summary

  const timeline = data.timeline ?? null
  const bands = data.scoreBands ?? []
  // Only job titles shared by 2+ people: a group of one is an individual's score.
  const jobs = (data.byJobTitle ?? []).filter(j => j.title !== "Not specified" && j.students >= 2)
  const hasTimeline = !!timeline && timeline.points.length > 1
  const hasBands = bands.some(n => n > 0)
  const hasJobs = jobs.length >= 2
  const hasCharts = hasTimeline || hasBands || hasJobs

  const order = ["cover", "overview", ...(hasCharts ? ["charts"] : []), ...(hasTracks ? ["tracks"] : []), ...(hasGroups ? ["groups"] : []), "courses", ...(hasAtRisk ? ["atrisk"] : []), ...(hasFeedback ? ["feedback"] : []), ...(hasExpert ? ["expert"] : []), "roster"]
  const pageNo = (k: string) => order.indexOf(k) + 1
  const total = order.length
  const studentHref = (id: string) => viewer
    ? `/viewer/lms/program/${program.id}/student/${id}`
    : `/lms-admin/reports/programs/${program.id}/students/${id}`
  const trackHref = (id: string) => viewer ? `/viewer/lms/program/${program.id}?track=${id}` : `/lms-admin/reports/programs/${program.id}?track=${id}`
  // Course cohort reports stay staff-only; a viewer sees results per student.
  const courseHref = (id: string) => viewer ? null : `/lms-admin/reports/${id}/group?program=${program.id}${scope.trackId ? `&track=${scope.trackId}` : ""}`

  return (
    <>
      <style>{forPrint ? PRINT_CSS : SCREEN_PRINT_CSS}</style>
      <div id="report-root" className="flex flex-col" style={forPrint ? { width: 794 } : { width: 794, margin: "0 auto", boxShadow: "0 0 0 1px #e2e8f0", background: "white" }}>

        {/* COVER */}
        <Page dark first>
          <div className="absolute top-0 right-0 w-80 h-80 rounded-full pointer-events-none opacity-10" style={{ background: "radial-gradient(circle, #60a5fa, transparent)", transform: "translate(35%,-35%)" }} />
          <div className="flex items-center justify-between px-12 pt-10 shrink-0">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36} className="object-contain" />
            <p className="text-white/40 text-xs">{today}</p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-12 text-center gap-7">
            {logo && (
              <div className="bg-white rounded-2xl px-6 py-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt={program.company?.name ?? ""} className="h-14 max-w-[220px] object-contain" />
              </div>
            )}
            <p className="text-white/50 text-[11px] uppercase tracking-[0.4em]">{scope.trackName ? "Track Report" : "Program Report"}</p>
            <div>
              <h1 className="text-4xl font-extrabold text-white tracking-tight">{program.name}</h1>
              {scope.trackName && <p className="text-white/80 text-lg mt-2">Track: {scope.trackName}</p>}
              <p className="text-white/50 text-sm mt-2">
                {[program.company?.name, program.reference && `Ref. ${program.reference}`, (program.start_date || program.end_date) && `${fmtDay(program.start_date)} → ${fmtDay(program.end_date)}`].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="grid grid-cols-4 gap-6">
              {[
                ["Students", String(stats.members - stats.withdrawn)],
                ["Completion", fmtPct(stats.completionRate)],
                ["Pass rate", fmtPct(stats.passRate)],
                ["Avg score", fmtPct(stats.avgScore)],
              ].map(([l, v]) => (
                <div key={l} className="text-center"><p className="text-2xl font-bold text-white">{v}</p><p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">{l}</p></div>
              ))}
            </div>
          </div>
          <div className="px-12 py-6 border-t border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2"><BrainCircuit className="h-3.5 w-3.5 text-purple-300/60" /><p className="text-white/30 text-[10px]">Generated by ICS Expert Analytics</p></div>
            <p className="text-white/20 text-[9px]">Page 1 of {total}</p>
          </div>
        </Page>

        {/* OVERVIEW */}
        <Page>
          <PageHeader title="Overview" subtitle={subtitle} today={today} logoUrl={logo} />
          <div className="px-12 py-7 space-y-6">
            <div className="avoid-break">
              <p className={`${SECTION} mb-3`}>Students</p>
              <div className="grid grid-cols-4 gap-3">
                <Metric label="Enrolled" value={String(stats.members)} sub={`${stats.withdrawn} withdrawn`} />
                <Metric label="Active" value={String(stats.active)} />
                <Metric label="Finished all courses" value={String(stats.completedMembers)} />
                <Metric label="Avg progress" value={fmtPct(stats.avgProgress)} color={sc(stats.avgProgress).t} />
              </div>
            </div>
            <div className="avoid-break">
              <p className={`${SECTION} mb-3`}>Results</p>
              <div className="grid grid-cols-4 gap-3">
                <Metric label="Completion rate" value={fmtPct(stats.completionRate)} sub={`${stats.completedEnrollments}/${stats.enrollments} course enrollments`} color={sc(stats.completionRate).t} />
                <Metric label="Pass rate" value={fmtPct(stats.passRate)} sub={stats.sat ? `${stats.passed}/${stats.sat} who sat the exam` : "nobody sat an exam yet"} color={sc(stats.passRate).t} />
                <Metric label="Average score" value={fmtPct(stats.avgScore)} sub="best attempt per student" color={sc(stats.avgScore).t} />
                <Metric label="Certificates" value={String(stats.certificates)} />
              </div>
            </div>
            <div className="avoid-break">
              <p className={`${SECTION} mb-3`}>Engagement &amp; deadlines</p>
              <div className="grid grid-cols-4 gap-3">
                <Metric label="Avg time" value={fmtTime(stats.avgTimeS)} sub="per student" />
                <Metric label="Attendance" value={fmtPct(stats.attendancePct)} sub={stats.attendanceCounted ? `${stats.attendancePresent}/${stats.attendanceCounted} past sessions` : "no past sessions"} color={sc(stats.attendancePct).t} />
                <Metric label="Due within 14 days" value={String(stats.dueSoon)} sub="not finished" color={stats.dueSoon ? "#D97706" : undefined} />
                <Metric label="Past end date" value={String(stats.overdue)} sub="not finished" color={stats.overdue ? "#DC2626" : undefined} />
              </div>
            </div>
            {hasExpert && (
              <div className="avoid-break bg-[#1B4F8A]/5 border border-[#1B4F8A]/10 rounded-xl p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A] mb-2">Expert Executive Summary</p>
                <p className="text-sm text-slate-700 leading-relaxed">{assessment.executive_summary}</p>
              </div>
            )}
            <p className="text-[10px] text-slate-400">{METRIC_NOTE}</p>
          </div>
          <PageFooter page={pageNo("overview")} total={total} confidential={!client} />
        </Page>

        {/* PROGRESS & RESULTS (charts) */}
        {hasCharts && (
          <Page>
            <PageHeader title="Progress & Results" subtitle={subtitle} today={today} logoUrl={logo} />
            <div className="px-12 py-7 space-y-7">
              {hasTimeline && (
                <div className="avoid-break">
                  <p className={`${SECTION} mb-2`}>Completion over time</p>
                  <ProgressTimelineChart {...timeline!} />
                </div>
              )}
              {hasBands && (
                <div className="avoid-break">
                  <p className={`${SECTION} mb-2`}>Final exam scores <span className="normal-case tracking-normal font-normal text-slate-400">· best attempt, {bands.reduce((a, b) => a + b, 0)} results</span></p>
                  <ScoreBandsChart bands={bands} labels={SCORE_BANDS} />
                </div>
              )}
              {hasJobs && (
                <div className="avoid-break">
                  <p className={`${SECTION} mb-3`}>By job title</p>
                  <GroupedBars
                    series={[{ name: "Avg progress", color: CHART_COLORS.brand }, { name: "Avg score", color: CHART_COLORS.teal }]}
                    rows={jobs.slice(0, 10).map(j => ({ label: `${j.title} (${j.students})`, values: [j.avgProgress, j.avgScore] }))}
                  />
                </div>
              )}
            </div>
            <PageFooter page={pageNo("charts")} total={total} confidential={!client} />
          </Page>
        )}

        {/* TRACK COMPARISON */}
        {hasTracks && (
          <Page>
            <PageHeader title="Track Comparison" subtitle={subtitle} today={today} logoUrl={logo} />
            <div className="px-12 py-7 space-y-5">
              <div className="avoid-break">
                <GroupedBars
                  series={[{ name: "Completion", color: CHART_COLORS.brand }, { name: "Pass rate", color: CHART_COLORS.teal }]}
                  rows={trackComparison.map(t => ({ label: `${t.name} (${t.students})`, values: [t.completionRate, t.passRate] }))}
                />
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-left text-slate-400 uppercase tracking-wider text-[9px]">
                    <th className="py-2 font-semibold">Track</th><th className="py-2 font-semibold">Students</th><th className="py-2 font-semibold w-36">Avg progress</th>
                    <th className="py-2 font-semibold">Completion</th><th className="py-2 font-semibold">Pass rate</th><th className="py-2 font-semibold">Avg score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trackComparison.map(t => (
                    <tr key={t.trackId ?? "none"} className="avoid-break">
                      <td className="py-2.5 font-medium text-slate-800">
                        {links && t.trackId ? <Link href={trackHref(t.trackId)} className="hover:text-[#1B4F8A] hover:underline">{t.name}</Link> : t.name}
                      </td>
                      <td className="py-2.5 text-slate-700">{t.students}</td>
                      <td className="py-2.5 pr-4"><div className="flex items-center gap-2"><div className="flex-1"><Bar pct={t.avgProgress} color="#1B4F8A" /></div><span className="w-9 text-right text-slate-600">{fmtPct(t.avgProgress)}</span></div></td>
                      <td className="py-2.5 text-slate-700">{fmtPct(t.completionRate)}</td>
                      <td className="py-2.5 font-medium" style={{ color: sc(t.passRate).t }}>{fmtPct(t.passRate)}</td>
                      <td className="py-2.5 font-medium" style={{ color: sc(t.avgScore).t }}>{fmtPct(t.avgScore)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-400">{METRIC_NOTE}</p>
            </div>
            <PageFooter page={pageNo("tracks")} total={total} confidential={!client} />
          </Page>
        )}

        {/* ONSITE GROUPS */}
        {hasGroups && (
          <Page>
            <PageHeader title="Onsite Groups" subtitle={subtitle} today={today} logoUrl={logo} />
            <div className="px-12 py-7 space-y-5">
              {groupComparison.length > 1 && (
                <div className="avoid-break">
                  <GroupedBars
                    series={[{ name: "Completion", color: CHART_COLORS.brand }, { name: "Pass rate", color: CHART_COLORS.teal }, { name: "Attendance", color: CHART_COLORS.amber ?? "#d97706" }]}
                    rows={groupComparison.map(g => ({ label: `${g.name} (${g.students})`, values: [g.completionRate, g.passRate, g.attendancePct] }))}
                  />
                </div>
              )}
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-left text-slate-400 uppercase tracking-wider text-[9px]">
                    <th className="py-2 font-semibold">Group</th><th className="py-2 font-semibold">Course</th><th className="py-2 font-semibold">Participants</th>
                    <th className="py-2 font-semibold">Attendance</th><th className="py-2 font-semibold">Completion</th><th className="py-2 font-semibold">Pass rate</th><th className="py-2 font-semibold">Avg score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groupComparison.map(g => (
                    <tr key={g.groupId} className="avoid-break">
                      <td className="py-2.5 font-medium text-slate-800">{links && !viewer ? <Link href={`/lms-admin/groups/${g.groupId}`} className="hover:text-[#1B4F8A] hover:underline">{g.name}</Link> : g.name}</td>
                      <td className="py-2.5 text-slate-600">{g.course}</td>
                      <td className="py-2.5 text-slate-700">{g.students}</td>
                      <td className="py-2.5 font-medium" style={{ color: sc(g.attendancePct).t }}>{fmtPct(g.attendancePct)}</td>
                      <td className="py-2.5 text-slate-700">{fmtPct(g.completionRate)}</td>
                      <td className="py-2.5 font-medium" style={{ color: sc(g.passRate).t }}>{fmtPct(g.passRate)}</td>
                      <td className="py-2.5 font-medium" style={{ color: sc(g.avgScore).t }}>{fmtPct(g.avgScore)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-400">Onsite courses with a pass rule use its weighted score and decision (exam, exercises, assignments, attendance); pending results are not counted in the pass rate. {METRIC_NOTE}</p>
            </div>
            <PageFooter page={pageNo("groups")} total={total} confidential={!client} />
          </Page>
        )}

        {/* COURSES */}
        <Page>
          <PageHeader title="Courses" subtitle={subtitle} today={today} logoUrl={logo} />
          <div className="px-12 py-7 space-y-4">
            {courses.length === 0 ? <p className="text-sm text-slate-400">No course enrollments yet.</p> : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-left text-slate-400 uppercase tracking-wider text-[9px]">
                    <th className="py-2 font-semibold">Course</th><th className="py-2 font-semibold">Enrolled</th><th className="py-2 font-semibold">Completion</th>
                    <th className="py-2 font-semibold">Pass rate</th><th className="py-2 font-semibold">Avg score</th><th className="py-2 font-semibold">Avg time</th><th className="py-2 font-semibold">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {courses.map(c => (
                    <tr key={c.course_id} className="avoid-break">
                      <td className="py-2.5 pr-2">
                        {links && courseHref(c.course_id) ? <Link href={courseHref(c.course_id)!} className="font-medium text-slate-800 hover:text-[#1B4F8A] hover:underline">{c.title}</Link> : <span className="font-medium text-slate-800">{c.title}</span>}
                        <p className="text-[10px] text-slate-400">{c.certificates} certificate{c.certificates !== 1 ? "s" : ""} · avg progress {fmtPct(c.avgProgress)}</p>
                      </td>
                      <td className="py-2.5 text-slate-700">{c.enrolled}</td>
                      <td className="py-2.5 text-slate-700">{fmtPct(c.completionRate)}</td>
                      <td className="py-2.5 font-medium" style={{ color: sc(c.passRate).t }}>{fmtPct(c.passRate)}{c.sat ? <span className="text-[9px] text-slate-400 font-normal"> ({c.passed}/{c.sat})</span> : null}</td>
                      <td className="py-2.5 font-medium" style={{ color: sc(c.avgScore).t }}>{fmtPct(c.avgScore)}</td>
                      <td className="py-2.5 text-slate-500">{fmtTime(c.avgTimeS)}</td>
                      <td className="py-2.5 text-slate-600">{c.feedbackAvg !== null && (!client || c.feedbackResponses >= 3) ? `${c.feedbackAvg.toFixed(1)}/5` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {links && !viewer && courses.length > 0 && <p className="text-[10px] text-slate-400 no-print">Open a course for its full cohort report within this program: module performance, topic heatmap, exam item analysis and ranking.</p>}
          </div>
          <PageFooter page={pageNo("courses")} total={total} confidential={!client} />
        </Page>

        {/* STUDENTS NEEDING SUPPORT (internal) */}
        {hasAtRisk && (
          <Page>
            <PageHeader title="Students Needing Support" subtitle={subtitle} today={today} logoUrl={logo} />
            <div className="px-12 py-7 space-y-3">
              <p className={SECTION}>{atRisk.length} student{atRisk.length !== 1 ? "s" : ""} flagged · no activity in 14 days, behind pace near the deadline, or one exam attempt left</p>
              {atRisk.map(a => (
                <div key={a.student_id} className="avoid-break flex items-start gap-3 p-3 border border-red-100 bg-red-50/40 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0"><AlertTriangle className="h-4 w-4 text-red-500" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">
                      {links ? <Link href={studentHref(a.student_id)} className="hover:text-[#1B4F8A] hover:underline">{a.name}</Link> : a.name}
                      {a.track && <span className="text-xs font-normal text-slate-400"> · {a.track}</span>}
                    </p>
                    <div className="mt-1 space-y-0.5">
                      {a.reasons.map((r, i) => <p key={i} className="text-[11px] text-red-700"><span className="text-slate-500">{r.course}:</span> {r.reason}</p>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <PageFooter page={pageNo("atrisk")} total={total} confidential={!client} />
          </Page>
        )}

        {/* FEEDBACK (FB-7) */}
        {hasFeedback && (
          <Page>
            <PageHeader title="Feedback" subtitle={subtitle} today={today} logoUrl={logo} />
            <div className="px-12 py-7 space-y-8">
              <FeedbackBlock title="Course feedback (all courses)" summary={courseFb} suppressed={courseFb.suppressed}
                note={client && !includeComments && courseFb.comments.length === 0 && data.feedback.comments.length > 0 ? "Comments are not included in this copy." : undefined} />
              {data.survey.responses > 0 && (
                <FeedbackBlock title="End-of-program survey" summary={surveyFb} suppressed={surveyFb.suppressed} />
              )}
              {!client && <p className="text-[10px] text-slate-400">Anonymous answers never show names. Response rate = responses ÷ students who were asked (course completed, or exam attempts used up).</p>}
            </div>
            <PageFooter page={pageNo("feedback")} total={total} confidential={!client} />
          </Page>
        )}

        {/* EXPERT SUMMARY (internal) */}
        {hasExpert && (
          <Page>
            <PageHeader title="Expert Summary" subtitle={subtitle} today={today} logoUrl={logo} />
            <div className="px-12 py-7 space-y-5">
              <div className="avoid-break bg-[#1B4F8A]/5 border border-[#1B4F8A]/10 rounded-xl p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A] mb-2">Executive Summary</p>
                <p className="text-sm text-slate-700 leading-relaxed">{assessment.executive_summary}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 avoid-break">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 mb-2">Strengths</p>
                  {(assessment.strengths ?? []).map((t: string, i: number) => <p key={i} className="text-[11px] text-emerald-800 leading-relaxed mb-1.5">· {t}</p>)}
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-amber-700 mb-2">Areas to improve</p>
                  {(assessment.improvements ?? []).map((t: string, i: number) => <p key={i} className="text-[11px] text-amber-800 leading-relaxed mb-1.5">· {t}</p>)}
                </div>
              </div>
              <div className="avoid-break">
                <p className={`${SECTION} mb-3`}>Recommendations</p>
                <div className="space-y-2.5">
                  {(assessment.recommendations ?? []).map((t: string, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 border border-slate-100 rounded-xl bg-slate-50/80">
                      <div className="w-7 h-7 rounded-full bg-[#1B4F8A] flex items-center justify-center text-white text-xs font-bold shrink-0">{i + 1}</div>
                      <p className="flex-1 text-xs text-slate-600 leading-relaxed pt-0.5">{t}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <PageFooter page={pageNo("expert")} total={total} confidential={!client} />
          </Page>
        )}

        {/* ROSTER */}
        <Page>
          <PageHeader title="Student List" subtitle={subtitle} today={today} logoUrl={logo} />
          <div className="px-12 py-7 flex-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-200 text-left text-slate-400 uppercase tracking-wider text-[9px]">
                  <th className="py-2 font-semibold">Student</th>
                  {!scope.trackId && data.tracks.length > 0 && <th className="py-2 font-semibold">Track</th>}
                  <th className="py-2 font-semibold">Courses</th><th className="py-2 font-semibold">Progress</th>
                  <th className="py-2 font-semibold">Avg score</th><th className="py-2 font-semibold">Certificates</th><th className="py-2 font-semibold">Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roster.filter(r => !client || r.status !== "withdrawn").map(r => (
                  <tr key={r.member_id} className="avoid-break">
                    <td className="py-2 pr-2">
                      {links ? <Link href={studentHref(r.student_id)} className="font-medium text-slate-800 hover:text-[#1B4F8A] hover:underline">{r.name}</Link> : <span className="font-medium text-slate-800">{r.name}</span>}
                      <p className="text-[10px] text-slate-400">
                        {[r.employee_number, r.job_title, r.status === "withdrawn" ? "withdrawn" : null].filter(Boolean).join(" · ")}
                        {showInternal && r.atRisk.length > 0 && <span className="text-red-500 font-semibold uppercase text-[8px]"> · needs support</span>}
                      </p>
                    </td>
                    {!scope.trackId && data.tracks.length > 0 && <td className="py-2 text-slate-600">{r.track ?? "—"}</td>}
                    <td className="py-2 text-slate-700">{r.coursesDone}/{r.coursesTotal}</td>
                    <td className="py-2 text-slate-700">{r.progress}%</td>
                    <td className="py-2 font-medium" style={{ color: sc(r.avgScore).t }}>{fmtPct(r.avgScore)}</td>
                    <td className="py-2 text-slate-700">{r.certificates}</td>
                    <td className="py-2 text-slate-600">{fmtPct(r.attendancePct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PageFooter page={pageNo("roster")} total={total} confidential={!client} />
        </Page>
      </div>
    </>
  )
}
