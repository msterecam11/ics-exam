"use client"

import Image from "next/image"
import type { DeliveryReport } from "@/lib/lms-delivery-report"
import { Page, PageHeader, PageFooter, Metric, PRINT_CSS, SCREEN_PRINT_CSS, sc, fmtPct, fmtDay, SECTION } from "@/components/lms/reports/ReportChrome"

// One onsite group's report — the on-screen view and the PDF. The client
// version (audience "client") leaves out instructor ratings, participants'
// comments, impact examples and e-mail addresses.

const ROWS_PER_PAGE = 20
const MARK: Record<string, { t: string; c: string }> = {
  present: { t: "P", c: "bg-emerald-50 text-emerald-700" }, late: { t: "L", c: "bg-amber-50 text-amber-700" },
  absent: { t: "A", c: "bg-red-50 text-red-600" }, excused: { t: "E", c: "bg-blue-50 text-blue-600" }, "—": { t: "·", c: "text-slate-300" },
}
const RESULT: Record<string, { t: string; c: string }> = {
  passed: { t: "Passed", c: "bg-emerald-50 text-emerald-700" }, not_passed: { t: "Not passed", c: "bg-red-50 text-red-600" }, pending: { t: "In progress", c: "bg-slate-100 text-slate-600" },
}
const chunk = <T,>(xs: T[], n: number) => { const out: T[][] = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out.length ? out : [[]] }

export default function DeliveryReportView({ data, forPrint = false }: { data: DeliveryReport; forPrint?: boolean }) {
  const client = data.audience === "client"
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  const subtitle = `${data.course.title} · ${data.group.label}`
  const logo = data.program?.logo ?? null
  const s = data.summary
  const resultPages = chunk(data.participants, ROWS_PER_PAGE)
  const attPages = chunk(data.participants, ROWS_PER_PAGE)
  const hasEval = data.evaluations.modules.length > 0 || (data.evaluations.instructors?.length ?? 0) > 0 || data.impact.responses > 0
  const order = ["cover", "overview", ...resultPages.map((_, i) => `results${i}`), ...(data.days.length ? attPages.map((_, i) => `att${i}`) : []), ...(hasEval ? ["eval"] : [])]
  const pageNo = (k: string) => order.indexOf(k) + 1
  const total = order.length

  return (
    <>
      <style>{forPrint ? PRINT_CSS : SCREEN_PRINT_CSS}</style>
      <div id="report-root" className="flex flex-col" style={forPrint ? { width: 794 } : { width: 794, margin: "0 auto", boxShadow: "0 0 0 1px #e2e8f0", background: "white" }}>

        {/* COVER */}
        <Page dark first>
          <div className="flex items-center justify-between px-12 pt-10 shrink-0">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36} className="object-contain" />
            <p className="text-white/40 text-xs">{today}</p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-12 text-center gap-7">
            {logo && (
              <div className="bg-white rounded-2xl px-6 py-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt={data.program?.client ?? ""} className="h-14 max-w-[220px] object-contain" />
              </div>
            )}
            <p className="text-white/50 text-[11px] uppercase tracking-[0.4em]">Group Report</p>
            <div>
              <h1 className="text-4xl font-extrabold text-white tracking-tight">{data.course.title}</h1>
              <p className="text-white/80 text-lg mt-2">{data.group.label}</p>
              <p className="text-white/50 text-sm mt-2">{[data.program?.client, data.program?.name, data.course.code].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="grid grid-cols-4 gap-6">
              {[["Participants", String(s.participants)], ["Pass rate", fmtPct(s.passRate)], ["Avg score", fmtPct(s.avgScore)], ["Attendance", fmtPct(s.avgAttendance)]].map(([l, v]) => (
                <div key={l} className="text-center"><p className="text-2xl font-bold text-white">{v}</p><p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">{l}</p></div>
              ))}
            </div>
          </div>
          <div className="px-12 py-6 border-t border-white/10 flex items-center justify-between shrink-0">
            <p className="text-white/30 text-[10px]">ICS Aviation · Integrated Consulting Services</p>
            <p className="text-white/20 text-[9px]">Page 1 of {total}</p>
          </div>
        </Page>

        {/* OVERVIEW */}
        <Page>
          <PageHeader title="Overview" subtitle={subtitle} today={today} logoUrl={logo} />
          <div className="px-12 py-7 space-y-6">
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
              {[
                ["Dates", data.group.dates], ["Daily", data.group.dailyTimes ?? "—"],
                ["Venue", [data.group.venue, data.group.city].filter(Boolean).join(", ") || "—"], ["Delivered by", data.staff.provider ?? "ICS Aviation"],
                ["Instructors", data.staff.instructors.join(", ") || "—"], ["Facilitators", data.staff.facilitators.join(", ") || "—"],
                ["Days", String(data.days.length)], ["Seats", data.group.seats ? String(data.group.seats) : "—"],
              ].map(([l, v]) => <p key={l}><span className="text-slate-400 inline-block w-24">{l}</span><span className="text-slate-800">{v}</span></p>)}
            </div>
            <div className="grid grid-cols-4 gap-3">
              <Metric label="Passed" value={String(s.passed)} color="#047857" />
              <Metric label="Not passed" value={String(s.notPassed)} color={s.notPassed ? "#dc2626" : undefined} />
              <Metric label="In progress" value={String(s.pending)} />
              <Metric label="Certificates" value={String(s.certificates)} />
            </div>
            <div>
              <p className={SECTION}>How the result is decided</p>
              {data.components.length === 0 ? <p className="text-xs text-slate-600 mt-2">Passing the final exam completes the course.</p> : (
                <table className="w-full text-xs mt-2">
                  <thead><tr className="border-b-2 border-slate-200 text-left text-slate-400 uppercase tracking-wider text-[9px]">
                    <th className="py-2 font-semibold">Part</th><th className="py-2 font-semibold">Weight</th><th className="py-2 font-semibold">Requirement</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.components.map(c => (
                      <tr key={c.key}><td className="py-2 text-slate-800">{c.label}</td><td className="py-2 text-slate-700">{c.weight ? `${c.weight}%` : "not scored"}</td>
                        <td className="py-2 text-slate-600">{c.required ? c.requirement ?? "Required" : "Counts toward the score"}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              {data.passMark !== null && data.components.length > 0 && <p className="text-xs text-slate-600 mt-2">Pass: every requirement met <b>and</b> a weighted score of at least <b>{data.passMark}%</b>.</p>}
            </div>
          </div>
          <PageFooter page={pageNo("overview")} total={total} confidential={!client} />
        </Page>

        {/* RESULTS */}
        {resultPages.map((rows, pi) => (
          <Page key={`r${pi}`}>
            <PageHeader title={resultPages.length > 1 ? `Results (${pi + 1}/${resultPages.length})` : "Results"} subtitle={subtitle} today={today} logoUrl={logo} />
            <div className="px-12 py-7 space-y-3">
              <table className="w-full text-[11px]">
                <thead><tr className="border-b-2 border-slate-200 text-left text-slate-400 uppercase tracking-wider text-[9px]">
                  <th className="py-2 font-semibold">Participant</th><th className="py-2 font-semibold">Attend.</th>
                  {data.components.filter(c => c.key !== "attendance").map(c => <th key={c.key} className="py-2 font-semibold">{c.label}</th>)}
                  <th className="py-2 font-semibold">Score</th><th className="py-2 font-semibold">Result</th><th className="py-2 font-semibold">Cert.</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((p, i) => (
                    <tr key={i} className="avoid-break align-top">
                      <td className="py-2 pr-2"><p className="font-medium text-slate-800">{p.name}</p>
                        {p.company && <p className="text-[9px] text-slate-400">{p.company}</p>}
                        {p.reasons.length > 0 && <p className="text-[9px] text-red-500 mt-0.5">{p.reasons.join(" · ")}</p>}</td>
                      <td className="py-2" style={{ color: sc(p.attendancePct).t }}>{fmtPct(p.attendancePct)}</td>
                      {data.components.filter(c => c.key !== "attendance").map(c => <td key={c.key} className="py-2 text-slate-700">{fmtPct(p.components[c.key] ?? null)}</td>)}
                      <td className="py-2 font-semibold" style={{ color: sc(p.score).t }}>{fmtPct(p.score)}</td>
                      <td className="py-2"><span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${RESULT[p.result].c}`}>{RESULT[p.result].t}</span></td>
                      <td className="py-2 text-slate-600">{p.certificate === "released" ? "Issued" : p.certificate === "held" ? "Held" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <p className="text-sm text-slate-400">No participants in this group.</p>}
            </div>
            <PageFooter page={pageNo(`results${pi}`)} total={total} confidential={!client} />
          </Page>
        ))}

        {/* ATTENDANCE */}
        {data.days.length > 0 && attPages.map((rows, pi) => (
          <Page key={`a${pi}`}>
            <PageHeader title={attPages.length > 1 ? `Attendance (${pi + 1}/${attPages.length})` : "Attendance"} subtitle={subtitle} today={today} logoUrl={logo} />
            <div className="px-12 py-7 space-y-3">
              <table className="w-full text-[11px]">
                <thead><tr className="border-b-2 border-slate-200 text-left text-slate-400 uppercase tracking-wider text-[9px]">
                  <th className="py-2 font-semibold">Participant</th>
                  {data.days.map(d => <th key={d.id} className="py-2 font-semibold text-center">{fmtDay(d.date).replace(/ \d{4}$/, "")}</th>)}
                  <th className="py-2 font-semibold text-right">Attendance</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((p, i) => (
                    <tr key={i} className="avoid-break">
                      <td className="py-1.5 text-slate-800">{p.name}</td>
                      {p.days.map((m, j) => <td key={j} className="py-1.5 text-center"><span className={`inline-block w-5 h-5 leading-5 rounded text-[9px] font-bold ${MARK[m]?.c ?? ""}`}>{MARK[m]?.t ?? "·"}</span></td>)}
                      <td className="py-1.5 text-right font-medium" style={{ color: sc(p.attendancePct).t }}>{fmtPct(p.attendancePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-400">P present · L late · A absent · E excused · late arrival or early leave counts partly (from check-in / check-out times).</p>
            </div>
            <PageFooter page={pageNo(`att${pi}`)} total={total} confidential={!client} />
          </Page>
        ))}

        {/* EVALUATION & IMPACT */}
        {hasEval && (
          <Page>
            <PageHeader title="Evaluation & Impact" subtitle={subtitle} today={today} logoUrl={logo} />
            <div className="px-12 py-7 space-y-6">
              {data.evaluations.modules.length > 0 && (
                <div>
                  <p className={SECTION}>Modules (participants&apos; ratings, out of 5)</p>
                  <table className="w-full text-xs mt-2"><tbody className="divide-y divide-slate-100">
                    {data.evaluations.modules.map((m, i) => (
                      <tr key={i}><td className="py-2 text-slate-800">{m.title}</td>
                        <td className="py-2 text-[10px] text-slate-500">{m.criteria.map(c => `${c.label} ${c.avg ?? "—"}`).join(" · ")}</td>
                        <td className="py-2 text-right text-slate-400 text-[10px]">{m.responses} resp.</td>
                        <td className="py-2 text-right font-semibold text-slate-800 w-12">{m.avg ?? "—"}</td></tr>
                    ))}
                  </tbody></table>
                </div>
              )}
              {data.evaluations.instructors && data.evaluations.instructors.length > 0 && (
                <div>
                  <p className={SECTION}>Instructors (internal)</p>
                  <table className="w-full text-xs mt-2"><tbody className="divide-y divide-slate-100">
                    {data.evaluations.instructors.map((m, i) => (
                      <tr key={i}><td className="py-2 text-slate-800">{m.name}</td>
                        <td className="py-2 text-[10px] text-slate-500">{m.criteria.map(c => `${c.label} ${c.avg ?? "—"}`).join(" · ")}</td>
                        <td className="py-2 text-right text-slate-400 text-[10px]">{m.responses} resp.</td>
                        <td className="py-2 text-right font-semibold text-slate-800 w-12">{m.avg ?? "—"}</td></tr>
                    ))}
                  </tbody></table>
                </div>
              )}
              {data.impact.enabled && (
                <div>
                  <p className={SECTION}>Impact on the job</p>
                  <p className="text-xs text-slate-700 mt-2">{data.impact.responses
                    ? <>Impact score <b>{data.impact.avgScore}%</b> from {data.impact.responses} participant{data.impact.responses === 1 ? "" : "s"} — asked some months after the course; separate from the course result.</>
                    : "Not answered yet — the questionnaire is sent some months after each participant completes the course."}</p>
                  {data.impact.examples && data.impact.examples.length > 0 && (
                    <ul className="mt-2 space-y-1">{data.impact.examples.slice(0, 8).map((e, i) => <li key={i} className="text-[11px] text-slate-600">“{e}”</li>)}</ul>
                  )}
                </div>
              )}
              {data.evaluations.comments && data.evaluations.comments.length > 0 && (
                <div>
                  <p className={SECTION}>Participants&apos; comments (internal, unattributed)</p>
                  <ul className="mt-2 space-y-1">{data.evaluations.comments.slice(0, 12).map((c, i) => <li key={i} className="text-[11px] text-slate-600">“{c}”</li>)}</ul>
                </div>
              )}
            </div>
            <PageFooter page={pageNo("eval")} total={total} confidential={!client} />
          </Page>
        )}
      </div>
    </>
  )
}
