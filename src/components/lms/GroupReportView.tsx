"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Printer, Download, BrainCircuit, RefreshCw, Loader2, Users } from "lucide-react"
import { toast } from "sonner"
import type { GroupReport } from "@/lib/lms-group-report"

// ── Chrome ──────────────────────────────────────────────────────────
function Page({ children, dark = false, first = false }: { children: React.ReactNode; dark?: boolean; first?: boolean }) {
  return (
    <div className={`relative w-full flex flex-col ${dark ? "bg-[#1B4F8A]" : "bg-white"} ${first ? "" : "page-break"}`}
      style={{ minHeight: first ? 1122 : undefined }}>
      {children}
    </div>
  )
}
function PageHeader({ title, subtitle, today }: { title: string; subtitle?: string; today: string }) {
  return (
    <div className="flex items-center justify-between px-12 pt-8 pb-5 border-b-2 border-[#1B4F8A] shrink-0">
      <Image src="/logo/logo-dark-blue.png" alt="ICS Aviation" width={110} height={30} className="object-contain" />
      <div className="text-right">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A]">{title}</p>
        {subtitle && <p className="text-[10px] mt-0.5 text-slate-400">{subtitle}</p>}
        <p className="text-[10px] mt-0.5 text-slate-400">{today}</p>
      </div>
    </div>
  )
}
function PageFooter({ page, total }: { page: number; total: number }) {
  return (
    <div className="px-12 py-4 border-t border-slate-100 flex items-center justify-between mt-auto shrink-0">
      <p className="text-[9px] uppercase tracking-widest text-slate-300">ICS Aviation · Integrated Consulting Services · Confidential</p>
      <p className="text-[9px] text-slate-300">Page {page} of {total}</p>
    </div>
  )
}
function CoverRing({ score }: { score: number }) {
  const size = 164, sw = 12, r = (size - sw) / 2, circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(score, 100) / 100)
  const band = score >= 80 ? { label: "Strong", col: "#34d399" } : score >= 60 ? { label: "Developing", col: "#fbbf24" } : { label: "Weak", col: "#f87171" }
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={band.col} strokeWidth={sw} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold text-white leading-none">{score}%</span>
        <span className="text-[9px] font-bold tracking-widest uppercase text-white/50 mt-1.5">Avg Mastery</span>
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: band.col }}>{band.label}</span>
      </div>
    </div>
  )
}

const SECTION = "text-[10px] font-bold uppercase tracking-widest text-slate-400"
function sc(p: number | null) {
  if (p === null) return { t: "#64748b", b: "#f1f5f9" }
  if (p >= 80) return { t: "#059669", b: "#d1fae5" }
  if (p >= 60) return { t: "#D97706", b: "#fef3c7" }
  return { t: "#DC2626", b: "#fee2e2" }
}
function fmtTime(s: number) { if (!s || s < 60) return s >= 1 ? `${s}s` : "—"; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m` }

// ── Main ────────────────────────────────────────────────────────────
export default function GroupReportView({ data, assessment, generatedAt }: { data: GroupReport; assessment: any | null; generatedAt: string | null }) {
  const { course, stats, distribution, passFail, moduleStats, roster } = data
  const [ai, setAi] = useState<any | null>(assessment)
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })

  const pageOrder = ["cover", "overview", "modules", "roster"]
  const pageNo = (k: string) => pageOrder.indexOf(k) + 1
  const totalPages = pageOrder.length
  const distMax = Math.max(1, ...distribution.map(d => d.count))

  async function generate() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/lms/reports/course/${course.id}/expert-assessment`, { method: "POST" })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error ?? "Failed to generate"); return }
      setAi(d.assessment)
      toast.success("Expert report generated")
    } catch { toast.error("Failed to generate report") }
    finally { setGenerating(false) }
  }
  async function downloadPDF() {
    setDownloading(true); toast.info("Generating PDF…")
    try {
      const res = await fetch(`/api/lms/reports/course/${course.id}/pdf`)
      if (!res.ok) { toast.error("PDF generation failed"); return }
      const blob = await res.blob(); const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = `${course.title} - Cohort Report.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
      toast.success("PDF downloaded")
    } catch { toast.error("Failed to download PDF") }
    finally { setDownloading(false) }
  }

  return (
    <>
      <style>{`
        .page-break { break-before: page; }
        .avoid-break { break-inside: avoid; }
        @page { size: 794px 1122px; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          aside, header { display: none !important; }
          body { margin: 0; background: white; }
          body > div { display: block !important; height: auto !important; overflow: visible !important; }
          main { display: block !important; height: auto !important; overflow: visible !important; padding: 0 !important; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 flex-wrap bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-2.5 mb-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href={`/lms-admin/reports/${course.id}`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
          <Users className="h-4 w-4 text-slate-400" />
          <span className="truncate max-w-[280px] font-medium text-slate-800">{course.title}</span>
          <span className="text-slate-300">· cohort</span>
        </div>
        <div className="flex items-center gap-2">
          {ai ? (
            <Button size="sm" variant="outline" onClick={generate} disabled={generating} className="gap-1.5 text-xs">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Regenerate
            </Button>
          ) : (
            <Button size="sm" onClick={generate} disabled={generating} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
              {generating ? "Generating…" : "Generate Expert Report"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5 text-xs"><Printer className="h-3.5 w-3.5" /> Print</Button>
          <Button size="sm" variant="outline" onClick={downloadPDF} disabled={downloading} className="gap-1.5 text-xs">
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PDF
          </Button>
        </div>
      </div>

      <div id="report-root" style={{ width: 794, margin: "0 auto", boxShadow: "0 0 0 1px #e2e8f0", background: "white" }}>

        {/* PAGE 1 — COVER */}
        <Page dark first>
          <div className="absolute top-0 right-0 w-80 h-80 rounded-full pointer-events-none opacity-10" style={{ background: "radial-gradient(circle, #60a5fa, transparent)", transform: "translate(35%,-35%)" }} />
          <div className="flex items-center justify-between px-12 pt-10 shrink-0">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36} className="object-contain" />
            <p className="text-white/40 text-xs">{today}</p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-12 text-center gap-7">
            <p className="text-white/50 text-[11px] uppercase tracking-[0.4em]">Cohort Course Report</p>
            <div>
              <h1 className="text-4xl font-extrabold text-white tracking-tight">{course.title}</h1>
              <p className="text-white/50 text-sm mt-2 capitalize">{course.delivery_mode} · {stats.enrolled} students</p>
            </div>
            <CoverRing score={stats.avgMastery ?? 0} />
            <div className="flex items-center gap-8">
              <div className="text-center"><p className="text-2xl font-bold text-white">{stats.completionRate}%</p><p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Completed</p></div>
              {stats.examExists && <><div className="h-10 w-px bg-white/15" /><div className="text-center"><p className="text-2xl font-bold text-white">{stats.examPassRate}%</p><p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Exam Pass Rate</p></div></>}
              {stats.avgTimeS > 0 && <><div className="h-10 w-px bg-white/15" /><div className="text-center"><p className="text-2xl font-bold text-white">{fmtTime(stats.avgTimeS)}</p><p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Avg Time</p></div></>}
            </div>
          </div>
          <div className="px-12 py-6 border-t border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2"><BrainCircuit className="h-3.5 w-3.5 text-purple-300/60" /><p className="text-white/30 text-[10px]">Generated by ICS Expert Analytics</p></div>
            <p className="text-white/20 text-[9px]">Page 1 of {totalPages}</p>
          </div>
        </Page>

        {/* PAGE 2 — COHORT OVERVIEW */}
        <Page>
          <PageHeader title="Cohort Overview" subtitle={course.title} today={today} />
          <div className="px-12 py-7 space-y-6">
            {/* Metric cards */}
            <div className="grid grid-cols-4 gap-3 avoid-break">
              {[
                { label: "Enrolled", value: `${stats.enrolled}`, sub: `${stats.completed} completed` },
                { label: "Avg Mastery", value: stats.avgMastery !== null ? `${stats.avgMastery}%` : "—", sub: "exam-weighted", color: sc(stats.avgMastery).t },
                { label: "Exam Pass Rate", value: stats.examExists ? `${stats.examPassRate}%` : "—", sub: stats.examExists ? `${stats.examPassed}/${stats.enrolled} passed` : "no exam", color: stats.examExists ? sc(stats.examPassRate).t : "#94a3b8" },
                { label: "Avg Time", value: fmtTime(stats.avgTimeS), sub: "per student" },
              ].map(m => (
                <div key={m.label} className="border border-slate-200 rounded-xl p-4 text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{m.label}</p>
                  <p className="text-2xl font-bold" style={{ color: m.color ?? "#1e293b" }}>{m.value}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{m.sub}</p>
                </div>
              ))}
            </div>

            {/* Mastery distribution + pass/fail */}
            <div className="grid grid-cols-2 gap-8 avoid-break">
              <div>
                <p className={`${SECTION} mb-3`}>Mastery Distribution</p>
                <div className="flex items-end justify-between gap-3 h-40 border border-slate-100 rounded-xl p-4">
                  {distribution.map((d, i) => {
                    const col = i === 0 ? "#E24B4A" : i === 1 ? "#EF9F27" : i === 2 ? "#378ADD" : "#1D9E75"
                    return (
                      <div key={d.label} className="flex-1 flex flex-col items-center justify-end h-full">
                        <p className="text-xs font-bold mb-1 text-slate-700">{d.count}</p>
                        <div className="w-full rounded-t-md" style={{ height: `${Math.max(3, (d.count / distMax) * 100)}%`, background: col }} />
                        <p className="text-[9px] text-slate-400 mt-1.5">{d.label}</p>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">Students grouped by exam-weighted mastery.</p>
              </div>

              <div>
                <p className={`${SECTION} mb-3`}>Final Exam Outcome</p>
                {stats.examExists ? (
                  <>
                    <div className="flex h-8 rounded-lg overflow-hidden border border-slate-200">
                      {passFail.passed > 0 && <div style={{ width: `${passFail.passed / stats.enrolled * 100}%`, background: "#1D9E75" }} />}
                      {passFail.failed > 0 && <div style={{ width: `${passFail.failed / stats.enrolled * 100}%`, background: "#E24B4A" }} />}
                      {passFail.notAttempted > 0 && <div style={{ width: `${passFail.notAttempted / stats.enrolled * 100}%`, background: "#cbd5e1" }} />}
                    </div>
                    <div className="flex flex-col gap-1.5 mt-3">
                      {[["Passed", passFail.passed, "#1D9E75"], ["Failed", passFail.failed, "#E24B4A"], ["Not attempted", passFail.notAttempted, "#94a3b8"]].map(([l, v, c]) => (
                        <div key={l as string} className="flex items-center gap-2 text-xs">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c as string }} />
                          <span className="text-slate-600 flex-1">{l as string}</span>
                          <span className="font-semibold text-slate-700">{v as number}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <p className="text-sm text-slate-400">This course has no final exam.</p>}
              </div>
            </div>

            {/* Expert summary (basic — enhanced in a later phase) */}
            {ai?.executive_summary && (
              <div className="avoid-break bg-[#1B4F8A]/5 border border-[#1B4F8A]/10 rounded-xl p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A] mb-2">Expert Executive Summary <span className="font-normal text-slate-400">· AI</span></p>
                <p className="text-sm text-slate-700 leading-relaxed">{ai.executive_summary}</p>
              </div>
            )}
          </div>
          <PageFooter page={pageNo("overview")} total={totalPages} />
        </Page>

        {/* PAGE 3 — MODULE PERFORMANCE */}
        <Page>
          <PageHeader title="Module Performance" subtitle={course.title} today={today} />
          <div className="px-12 py-7 space-y-5">
            <p className={SECTION}>Cohort Mastery by Module</p>
            {moduleStats.length === 0 ? (
              <p className="text-sm text-slate-400">No assessed modules yet — run Expert Analyze in the course builder.</p>
            ) : moduleStats.map(m => {
              const col = sc(m.avgMastery)
              return (
                <div key={m.moduleId} className="avoid-break">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-700">{m.title}</span>
                    <span className="text-xs font-bold" style={{ color: col.t }}>{m.avgMastery !== null ? `${m.avgMastery}%` : "—"}</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-2.5 rounded-full" style={{ width: `${m.avgMastery ?? 0}%`, background: col.t }} />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">{m.strong} strong · {m.weak} weak · {m.assessed} assessed</p>
                </div>
              )
            })}
          </div>
          <PageFooter page={pageNo("modules")} total={totalPages} />
        </Page>

        {/* LAST PAGE — ROSTER */}
        <Page>
          <PageHeader title="Student Roster" subtitle={course.title} today={today} />
          <div className="px-12 py-7 flex-1">
            <p className="text-[10px] text-slate-400 mb-3 print:hidden">Click a student to open their individual report.</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-200 text-left text-slate-400 uppercase tracking-wider text-[9px]">
                  <th className="py-2 font-semibold">Student</th>
                  <th className="py-2 font-semibold">Mastery</th>
                  <th className="py-2 font-semibold">Completion</th>
                  <th className="py-2 font-semibold">Time</th>
                  {stats.examExists && <th className="py-2 font-semibold">Exam</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roster.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2">
                      <Link href={`/lms-admin/reports/${course.id}/${r.id}`} className="group/row inline-block hover:underline underline-offset-2 decoration-[#1B4F8A]/40">
                        <p className="font-medium text-slate-800 group-hover/row:text-[#1B4F8A]">{r.name}{r.atRisk && <span className="ml-1.5 text-[8px] font-bold uppercase text-red-500">· at risk</span>}</p>
                        <p className="text-[10px] text-slate-400">{[r.jobTitle, r.company].filter(Boolean).join(" · ")}</p>
                      </Link>
                    </td>
                    <td className="py-2 font-medium" style={{ color: sc(r.mastery).t }}>{r.mastery !== null ? `${r.mastery}%` : "—"}</td>
                    <td className="py-2 text-slate-700">{r.completion}%</td>
                    <td className="py-2 text-slate-500">{fmtTime(r.timeS)}</td>
                    {stats.examExists && (
                      <td className="py-2">
                        {r.passed === null ? <span className="text-slate-400">—</span> :
                          <span className={r.passed ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>{r.passed ? "Passed" : "Failed"}{r.examPct != null ? ` · ${r.examPct}%` : ""}</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PageFooter page={totalPages} total={totalPages} />
        </Page>
      </div>
    </>
  )
}
