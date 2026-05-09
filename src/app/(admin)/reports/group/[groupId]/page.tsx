"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import ScoreBar from "@/components/reports/ScoreBar"
import { Button } from "@/components/ui/button"
import {
  Loader2, BrainCircuit, RefreshCw, AlertCircle,
  ArrowLeft, Download, CheckCircle2, XCircle,
  Trophy, Target, TrendingUp, Lightbulb, Users, Medal, Clock, Star, AlertTriangle,
} from "lucide-react"
import { toast } from "sonner"
import TerminologyModal, { EntityTerm, ContentTerm } from "@/components/reports/TerminologyModal"
import { makeT } from "@/lib/reportTerms"

// ─── Helpers ────────────────────────────────────────────────────────────────

function scoreColor(pct: number) {
  if (pct >= 80) return { text: "#10b981", bg: "#d1fae5", border: "#a7f3d0" }
  if (pct >= 60) return { text: "#f59e0b", bg: "#fef3c7", border: "#fde68a" }
  return { text: "#ef4444", bg: "#fee2e2", border: "#fca5a5" }
}

function fmtTime(minutes: number | null) {
  if (minutes === null || minutes < 0) return "—"
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

// ─── SVG Charts ─────────────────────────────────────────────────────────────

function PassRateRing({ rate, size = 160 }: { rate: number; size?: number }) {
  const sw = 11, r = (size - sw) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(rate, 100) / 100)
  const col = rate >= 60 ? "#34d399" : "#f87171"
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col}
          strokeWidth={sw} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="text-3xl font-extrabold text-white leading-none">{rate.toFixed(1)}%</span>
        <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: col }}>Pass Rate</span>
      </div>
    </div>
  )
}

function PassFailDonut({ pass, total, size = 90 }: { pass: number; total: number; size?: number }) {
  const sw = 12, r = (size - sw) / 2
  const circ = 2 * Math.PI * r
  const pct = total > 0 ? pass / total : 0
  const offset = circ * (1 - pct)
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fee2e2" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#34d399"
          strokeWidth={sw} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-extrabold text-slate-800">
          {total > 0 ? Math.round(pct * 100) : 0}%
        </span>
        <span className="text-[8px] text-slate-400 uppercase tracking-wider">passed</span>
      </div>
    </div>
  )
}

function ScoreDistBars({ scores }: { scores: number[] }) {
  const bands = [
    { label: "90–100%", color: "#10b981", min: 90, max: 100 },
    { label: "70–89%",  color: "#3b82f6", min: 70, max: 89  },
    { label: "50–69%",  color: "#f59e0b", min: 50, max: 69  },
    { label: "0–49%",   color: "#ef4444", min: 0,  max: 49  },
  ]
  const counts = bands.map(b => scores.filter(s => s >= b.min && s <= b.max).length)
  const max = Math.max(...counts, 1)
  const total = scores.length
  return (
    <div className="space-y-2">
      {bands.map((b, i) => (
        <div key={b.label} className="flex items-center gap-3">
          <p className="text-[10px] text-slate-500 w-14 shrink-0">{b.label}</p>
          <div className="flex-1 bg-slate-100 rounded-full overflow-hidden" style={{ height: 14 }}>
            <div className="h-full rounded-full flex items-center justify-end px-1.5"
              style={{ width: `${Math.max(counts[i] > 0 ? (counts[i] / max) * 100 : 0, counts[i] > 0 ? 10 : 0)}%`, background: b.color }}>
              {counts[i] > 0 && <span className="text-[8px] text-white font-bold">{counts[i]}</span>}
            </div>
          </div>
          <p className="text-[10px] text-slate-400 w-7 text-right">
            {total > 0 ? Math.round((counts[i] / total) * 100) : 0}%
          </p>
        </div>
      ))}
    </div>
  )
}

function ComparisonBars({ items }: { items: { label: string; avg: number; passRate: number }[] }) {
  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const col = scoreColor(item.avg)
        return (
          <div key={item.label} className="flex items-center gap-3">
            <p className="text-[10px] text-slate-600 font-medium w-28 shrink-0 truncate">{item.label}</p>
            <div className="flex-1 bg-slate-100 rounded-full overflow-hidden" style={{ height: 12 }}>
              <div className="h-full rounded-full" style={{ width: `${item.avg}%`, background: col.text }} />
            </div>
            <div className="w-24 shrink-0 text-right">
              <span className="text-[10px] font-bold" style={{ color: col.text }}>{item.avg.toFixed(1)}%</span>
              <span className="text-[9px] text-slate-400 ml-1">· {item.passRate.toFixed(0)}% pass</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RadarChart({ data, size = 200 }: { data: { label: string; value: number }[]; size?: number }) {
  if (data.length < 3) return null
  const n = data.length
  const cx = size / 2, cy = size / 2, r = size * 0.32, lr = size * 0.46
  const angles = data.map((_, i) => (i * 2 * Math.PI) / n - Math.PI / 2)
  const pt = (ang: number, radius: number) => ({ x: cx + radius * Math.cos(ang), y: cy + radius * Math.sin(ang) })
  const gridLevels = [0.25, 0.5, 0.75, 1]
  const dataStr = data.map((d, i) => { const p = pt(angles[i], (Math.min(d.value, 100) / 100) * r); return `${p.x},${p.y}` }).join(" ")
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridLevels.map(lv => (
        <polygon key={lv} points={angles.map(a => { const p = pt(a, r * lv); return `${p.x},${p.y}` }).join(" ")} fill="none" stroke="#e2e8f0" strokeWidth="0.8" />
      ))}
      {angles.map((ang, i) => { const end = pt(ang, r); return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#e2e8f0" strokeWidth="0.8" /> })}
      <polygon points={dataStr} fill="#1B4F8A" fillOpacity="0.22" stroke="#1B4F8A" strokeWidth="1.5" />
      {data.map((d, i) => { const p = pt(angles[i], (Math.min(d.value, 100) / 100) * r); return <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#1B4F8A" /> })}
      {data.map((d, i) => {
        const p = pt(angles[i], lr)
        const short = d.label.length > 13 ? d.label.slice(0, 13) + "…" : d.label
        return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize="7" fill="#64748b" fontFamily="sans-serif">{short}</text>
      })}
    </svg>
  )
}

// ─── Layout primitives ───────────────────────────────────────────────────────

function Page({ children, dark = false, first = false }: { children: React.ReactNode; dark?: boolean; first?: boolean }) {
  return (
    <div data-report-page=""
      className={`relative w-full flex flex-col ${dark ? "bg-[#1B4F8A]" : "bg-white"} ${first ? "overflow-hidden" : "page-break"}`}
      style={first ? { minHeight: 1122 } : undefined}>
      {children}
    </div>
  )
}

function PageHeader({ today, light = false }: { today: string; light?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-12 pt-8 pb-5 border-b shrink-0 ${light ? "border-white/15" : "border-[#1B4F8A] border-b-2"}`}>
      <Image src={light ? "/logo/logo-white.png" : "/logo/logo-dark-blue.png"} alt="ICS Aviation" width={110} height={30} className="object-contain" />
      <p className={`text-[10px] ${light ? "text-white/40" : "text-slate-400"}`}>{today}</p>
    </div>
  )
}

function PageFooter({ page, total, light = false }: { page: number; total: number; light?: boolean }) {
  return (
    <div className={`px-12 py-4 border-t shrink-0 flex items-center justify-between mt-auto ${light ? "border-white/10" : "border-slate-100"}`}>
      <p className={`text-[9px] uppercase tracking-widest ${light ? "text-white/30" : "text-slate-300"}`}>ICS Aviation · Integrated Consulting Services · Confidential</p>
      <p className={`text-[9px] ${light ? "text-white/30" : "text-slate-300"}`}>Page {page} of {total}</p>
    </div>
  )
}

function AIPlaceholder({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="no-print avoid-break flex items-center gap-3 text-sm text-slate-400 bg-slate-50 border border-slate-100 rounded-xl p-4">
      <AlertCircle className="h-4 w-4 shrink-0 text-slate-300" />
      <span>Click <button onClick={onGenerate} className="text-purple-600 font-semibold hover:underline">Generate Expert Report</button> in the toolbar to add expert analysis here.</span>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function GroupReportViewPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generatingAI, setGeneratingAI] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [showModal, setShowModal] = useState(true)
  const [entityTerm, setEntityTerm] = useState<EntityTerm>("Group")
  const [contentTerm, setContentTerm] = useState<ContentTerm>("Course")

  // Build t() from chosen terms
  const t = makeT(entityTerm, contentTerm)

  useEffect(() => {
    fetch(`/api/reports/group/${groupId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [groupId])

  async function generateNarrative() {
    setGeneratingAI(true)
    const res = await fetch(`/api/reports/group/${groupId}`, { method: "POST" })
    setGeneratingAI(false)
    if (!res.ok) { toast.error("Failed to generate expert report"); return }
    const result = await res.json()
    setData((prev: any) => ({ ...prev, narrative: result.narrative }))
    toast.success("Expert report generated")
  }

  async function downloadPDF() {
    setDownloading(true)
    toast.info("Generating PDF… this takes a few seconds")
    try {
      const res = await fetch(`/api/reports/group/${groupId}/pdf?entity=${entityTerm}&content=${contentTerm}`)
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const cd = res.headers.get("Content-Disposition") ?? ""
      const match = cd.match(/filename="(.+)"/)
      a.href = url
      a.download = match?.[1] ?? "group-report.pdf"
      a.click()
      URL.revokeObjectURL(url)
      toast.success("PDF downloaded!")
    } catch {
      toast.error("PDF generation failed — try again")
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#1B4F8A] mx-auto" />
          <p className="text-sm text-slate-500">Loading group report…</p>
        </div>
      </div>
    )
  }

  const {
    group, courses, allSubmissions, allScores,
    totalCandidates, allPassedCount, overallPassRate, overallAvg, totalExams, narrative,
  } = data

  const hasAI = !!narrative
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  const totalPages = 3 + courses.length + (hasAI ? 2 : 0)
  const priorityColors: Record<string, string> = {
    high: "bg-red-50 text-red-600 border-red-100",
    medium: "bg-amber-50 text-amber-600 border-amber-100",
    low: "bg-slate-50 text-slate-500 border-slate-100",
  }

  return (
    <>
      <style>{`
        .page-break { break-before: page; }
        .avoid-break { break-inside: avoid; }
        @media print { .no-print { display: none !important; } }
      `}</style>

      {/* ── Terminology Modal ── */}
      {showModal && (
        <TerminologyModal onConfirm={(e, c) => { setEntityTerm(e); setContentTerm(c); setShowModal(false) }} />
      )}

      {/* ── Toolbar ── */}
      <div className="no-print sticky top-0 z-40 bg-white border-b shadow-sm px-6 py-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          {!hasAI ? (
            <Button size="sm" onClick={generateNarrative} disabled={generatingAI}
              className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
              {generatingAI ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
              {generatingAI ? "Generating…" : "Generate Expert Report"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={generateNarrative} disabled={generatingAI} className="gap-2 text-xs">
              {generatingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Regenerate Expert
            </Button>
          )}
          <Button size="sm" onClick={downloadPDF} disabled={downloading}
            className="gap-2 bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? "Generating PDF…" : "Download PDF"}
          </Button>
        </div>
      </div>

      {/* ── Preview ── */}
      <div className="bg-slate-300 min-h-screen py-8 flex justify-center">
        <div id="report-root" className="flex flex-col gap-5" style={{ width: 794 }}>

          {/* ══ PAGE 1 — COVER ══ */}
          <Page dark first>
            <div className="absolute top-0 right-0 w-96 h-96 rounded-full pointer-events-none opacity-10"
              style={{ background: "radial-gradient(circle, #60a5fa, transparent)", transform: "translate(40%,-40%)" }} />
            <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full pointer-events-none opacity-10"
              style={{ background: "radial-gradient(circle, #93c5fd, transparent)", transform: "translate(-40%,40%)" }} />

            <div className="flex items-center justify-between px-12 pt-10 shrink-0">
              <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36} className="object-contain" />
              <p className="text-white/40 text-xs">{today}</p>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-12 text-center gap-8">
              <div className="space-y-3">
                <p className="text-white/50 text-[11px] uppercase tracking-[0.4em]">{t("Group Performance Report")}</p>
                <div className="flex items-center gap-3 justify-center">
                  <div className="h-px w-14 bg-white/20" /><div className="w-1 h-1 rounded-full bg-white/30" /><div className="h-px w-14 bg-white/20" />
                </div>
              </div>
              <div>
                <h1 className="text-4xl font-extrabold text-white tracking-tight">{group.name}</h1>
              </div>
              <PassRateRing rate={overallPassRate} size={160} />
              <div className="flex items-center gap-8">
                {[
                  { label: t("Groups").replace(/s$/, "s"), val: courses.length, labelSingular: t("Groups") },
                  { label: "Exams", val: totalExams },
                  { label: "Candidates", val: totalCandidates },
                  { label: "Avg Score", val: `${overallAvg.toFixed(1)}%` },
                ].map(({ label, val }, i, arr) => (
                  <div key={i} className="flex items-center gap-8">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-white">{val}</p>
                      <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">{label}</p>
                    </div>
                    {i < arr.length - 1 && <div className="h-10 w-px bg-white/15" />}
                  </div>
                ))}
              </div>
            </div>

            <div className="px-12 py-6 border-t border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-3.5 w-3.5 text-purple-300/60" />
                <p className="text-white/30 text-[10px]">Generated by ICS Expert Analytics</p>
              </div>
              <p className="text-white/20 text-[9px]">Page 1 of {totalPages}</p>
            </div>
          </Page>

          {/* ══ PAGE 2 — GROUP OVERVIEW ══ */}
          <Page>
            <PageHeader today={today} />
            <div className="px-12 py-7 space-y-6">
              <div className="avoid-break">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A]">{t("Group Report")}</p>
                <h2 className="text-2xl font-extrabold text-slate-800 mt-1">{group.name}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{t("Group Overview")}</p>
              </div>

              {/* AI: group summary */}
              {narrative?.group_summary ? (
                <div className="bg-[#1B4F8A]/5 border border-[#1B4F8A]/10 rounded-xl p-5 avoid-break">
                  <div className="flex items-center gap-2 mb-2">
                    <BrainCircuit className="h-3.5 w-3.5 text-[#1B4F8A]" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A]">Expert Executive Summary</p>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{t(narrative.group_summary)}</p>
                </div>
              ) : (
                <AIPlaceholder onGenerate={generateNarrative} />
              )}

              {/* AI: cross-course insights */}
              {narrative?.cross_course_insights && (
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 avoid-break">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-3.5 w-3.5 text-purple-600" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-purple-700">{t("Cross-Course Insights")}</p>
                  </div>
                  <p className="text-xs text-purple-800 leading-relaxed">{t(narrative.cross_course_insights)}</p>
                </div>
              )}

              {/* Per-course summary table */}
              <div className="avoid-break">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">{t("Course Summary")}</p>
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {[t("Course"), "Exams", "Candidates", "Avg Score", "Pass Rate", "Passed", "Failed"].map(h => (
                          <th key={h} className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-400 px-3 py-2.5">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {courses.map(({ course, exams, courseAvgScore, coursePassCount, courseTotalCandidates, coursePassRate }: any, idx: number) => {
                        const col = scoreColor(courseAvgScore)
                        return (
                          <tr key={course.id} className={`border-b border-slate-50 last:border-0 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                            <td className="px-3 py-2.5 text-xs font-semibold text-slate-700">{course.name}</td>
                            <td className="px-3 py-2.5 text-xs text-slate-600">{exams.length}</td>
                            <td className="px-3 py-2.5 text-xs text-slate-600">{courseTotalCandidates}</td>
                            <td className="px-3 py-2.5"><span className="text-xs font-bold" style={{ color: col.text }}>{courseAvgScore.toFixed(1)}%</span></td>
                            <td className="px-3 py-2.5 text-xs text-slate-600">{coursePassRate.toFixed(0)}%</td>
                            <td className="px-3 py-2.5"><span className="text-xs font-semibold text-emerald-600">{coursePassCount}</span></td>
                            <td className="px-3 py-2.5"><span className="text-xs font-semibold text-red-500">{courseTotalCandidates - coursePassCount}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-2 gap-6 avoid-break">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">{t("Course Performance Comparison")}</p>
                  <ComparisonBars items={courses.map(({ course, courseAvgScore, coursePassRate }: any) => ({
                    label: course.name, avg: courseAvgScore, passRate: coursePassRate,
                  }))} />
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Score Distribution</p>
                    <ScoreDistBars scores={allScores} />
                  </div>
                  <div className="flex items-center gap-4">
                    <PassFailDonut pass={allPassedCount} total={totalCandidates} size={90} />
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl py-2.5 text-center">
                        <p className="text-base font-extrabold text-emerald-600">{allPassedCount}</p>
                        <p className="text-[8px] text-emerald-500 uppercase tracking-wider">Passed</p>
                      </div>
                      <div className="bg-red-50 border border-red-100 rounded-xl py-2.5 text-center">
                        <p className="text-base font-extrabold text-red-500">{totalCandidates - allPassedCount}</p>
                        <p className="text-[8px] text-red-400 uppercase tracking-wider">Failed</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats strip */}
              <div className="grid grid-cols-4 divide-x divide-slate-200 border border-slate-200 rounded-xl overflow-hidden avoid-break">
                {[
                  { label: "Overall Average",  value: `${overallAvg.toFixed(1)}%`,       color: "#1B4F8A" },
                  { label: "Overall Pass Rate", value: `${overallPassRate.toFixed(1)}%`,  color: overallPassRate >= 60 ? "#10b981" : "#ef4444" },
                  { label: "Total Candidates",  value: `${totalCandidates}`,              color: "#64748b" },
                  { label: "Total Exams",       value: `${totalExams}`,                   color: "#64748b" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="py-3 px-2 text-center">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                    <p className="text-lg font-bold" style={{ color }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
            <PageFooter page={2} total={totalPages} />
          </Page>

          {/* ══ PAGE 3 — RANKINGS ══ */}
          <Page>
            <PageHeader today={today} />
            <div className="px-12 py-7 space-y-6">
              <div className="avoid-break">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A]">{t("Group Report")}</p>
                <h2 className="text-2xl font-extrabold text-slate-800 mt-1">Rankings</h2>
                <p className="text-xs text-slate-400 mt-0.5">{group.name} · {t("All courses combined")}</p>
              </div>

              {/* Section A: Per-course leaderboards */}
              <div className="avoid-break">
                <div className="flex items-center gap-2 mb-3">
                  <Trophy className="h-4 w-4 text-[#1B4F8A]" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t("Per-Course Leaderboards")}</p>
                </div>
                <div className="space-y-4">
                  {courses.map(({ course, courseLeaderboard }: any) => (
                    <div key={course.id} className="rounded-xl border border-slate-100 overflow-hidden">
                      <div className="bg-slate-50 border-b border-slate-100 px-4 py-2">
                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{course.name}</p>
                      </div>
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-50">
                            {["Rank", "Candidate", "Exams Taken", "Avg Score", "Pass Rate"].map(h => (
                              <th key={h} className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-400 px-4 py-2">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(courseLeaderboard ?? []).slice(0, 5).map((c: any, idx: number) => {
                            const col = scoreColor(c.avgScore)
                            return (
                              <tr key={c.name} className={`border-b border-slate-50 last:border-0 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}>
                                <td className="px-4 py-1.5 text-center"><span className={`text-xs font-bold ${idx < 3 ? "text-amber-500" : "text-slate-400"}`}>#{idx + 1}</span></td>
                                <td className="px-4 py-1.5 text-xs font-semibold text-slate-700">{c.name}</td>
                                <td className="px-4 py-1.5 text-xs text-slate-500">{c.examsTaken}</td>
                                <td className="px-4 py-1.5"><span className="text-xs font-bold" style={{ color: col.text }}>{c.avgScore.toFixed(1)}%</span></td>
                                <td className="px-4 py-1.5 text-xs text-slate-500">{c.examsTaken > 0 ? Math.round((c.passCount / c.examsTaken) * 100) : 0}%</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section B: Overall group ranking */}
              <div className="avoid-break">
                <div className="flex items-center gap-2 mb-3">
                  <Medal className="h-4 w-4 text-[#1B4F8A]" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t("Overall Group Ranking")} · All Submissions</p>
                </div>
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {["Rank", "Candidate", t("Course"), "Exam", "Score", "Result", "Time"].map(h => (
                          <th key={h} className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-400 px-3 py-2.5">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allSubmissions.map((c: any, idx: number) => {
                        const col = scoreColor(c.total_score ?? 0)
                        return (
                          <tr key={`${c.id}-${idx}`} className={`border-b border-slate-50 last:border-0 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                            <td className="px-3 py-2 text-center"><span className={`text-xs font-bold ${idx < 3 ? "text-amber-500" : "text-slate-400"}`}>#{idx + 1}</span></td>
                            <td className="px-3 py-2 text-xs font-semibold text-slate-700">{c.full_name}</td>
                            <td className="px-3 py-2 text-[10px] text-slate-500 max-w-[100px]"><p className="truncate">{c.courseName}</p></td>
                            <td className="px-3 py-2 text-[10px] text-slate-500 max-w-[110px]"><p className="truncate">{c.examTitle}</p></td>
                            <td className="px-3 py-2"><span className="text-xs font-bold" style={{ color: col.text }}>{(c.total_score ?? 0).toFixed(1)}%</span></td>
                            <td className="px-3 py-2">
                              {c.passed
                                ? <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium"><CheckCircle2 className="h-3 w-3" /> Pass</span>
                                : <span className="inline-flex items-center gap-1 text-[10px] text-red-500 font-medium"><XCircle className="h-3 w-3" /> Fail</span>}
                            </td>
                            <td className="px-3 py-2 text-[10px] text-slate-500">
                              <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5 text-slate-300" />{fmtTime(c.timeSpentMin)}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* AI: Candidate Performance */}
              {narrative?.candidate_performance ? (
                <div className="bg-[#1B4F8A]/5 border border-[#1B4F8A]/10 rounded-xl p-4 avoid-break">
                  <div className="flex items-center gap-2 mb-2">
                    <BrainCircuit className="h-3.5 w-3.5 text-[#1B4F8A]" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A]">Candidate Performance Overview</p>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{t(narrative.candidate_performance)}</p>
                </div>
              ) : (
                <AIPlaceholder onGenerate={generateNarrative} />
              )}

              {/* AI: At-Risk Patterns */}
              {narrative?.at_risk_patterns && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 avoid-break">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="h-3.5 w-3.5 text-amber-600" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">At-Risk Candidate Patterns</p>
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed">{t(narrative.at_risk_patterns)}</p>
                </div>
              )}
            </div>
            <PageFooter page={3} total={totalPages} />
          </Page>

          {/* ══ PAGES 4+ — PER-COURSE ══ */}
          {courses.map(({ course, exams, courseAvgScore, coursePassCount, courseTotalCandidates, coursePassRate, aggregatedSectionAvgs }: any, courseIdx: number) => {
            const col = scoreColor(courseAvgScore)
            const hasRadar = (aggregatedSectionAvgs ?? []).length >= 3
            const courseAI = narrative?.course_analyses?.[course.name] ?? null

            return (
              <Page key={course.id}>
                <PageHeader today={today} />
                <div className="px-12 py-7 space-y-5">

                  <div className="border-b-2 border-slate-100 pb-4 avoid-break">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A] bg-blue-50 px-2 py-0.5 rounded-full">
                          {t(`Course ${courseIdx + 1} of ${courses.length}`)}
                        </span>
                        <h2 className="text-xl font-bold text-slate-800 mt-2">{course.name}</h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {group.name} · {exams.length} exam{exams.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center shrink-0"
                        style={{ background: col.bg, border: `1.5px solid ${col.border}` }}>
                        <span className="text-xl font-extrabold" style={{ color: col.text }}>{courseAvgScore.toFixed(0)}%</span>
                        <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: col.text }}>Avg</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap avoid-break">
                    {[
                      { label: "Exams",      val: exams.length,                       color: "bg-slate-100 text-slate-700" },
                      { label: "Candidates", val: courseTotalCandidates,               color: "bg-slate-100 text-slate-700" },
                      { label: "Passed",     val: coursePassCount,                     color: "bg-emerald-50 text-emerald-700" },
                      { label: "Failed",     val: courseTotalCandidates - coursePassCount, color: "bg-red-50 text-red-600" },
                      { label: "Pass Rate",  val: `${coursePassRate.toFixed(0)}%`,      color: "bg-blue-50 text-blue-700" },
                      { label: "Average",    val: `${courseAvgScore.toFixed(1)}%`,      color: "bg-purple-50 text-purple-700" },
                    ].map(({ label, val, color }) => (
                      <div key={label} className={`px-3 py-1.5 rounded-lg text-center ${color}`}>
                        <p className="text-xs font-bold">{val}</p>
                        <p className="text-[9px] uppercase tracking-wide opacity-70">{label}</p>
                      </div>
                    ))}
                  </div>

                  {exams.length > 1 && (
                    <div className="avoid-break">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Exam Performance Comparison</p>
                      <ComparisonBars items={exams.map(({ exam, avgScore, passRate }: any) => ({
                        label: exam.title, avg: avgScore, passRate,
                      }))} />
                    </div>
                  )}

                  {(aggregatedSectionAvgs ?? []).length > 0 && (
                    <div className={`avoid-break ${hasRadar ? "grid grid-cols-2 gap-6 items-start" : ""}`}>
                      {hasRadar && (
                        <div className="flex flex-col items-center">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 self-start">Section Radar</p>
                          <RadarChart data={(aggregatedSectionAvgs ?? []).map((s: any) => ({ label: s.title, value: s.avg }))} size={210} />
                        </div>
                      )}
                      <div className={hasRadar ? "" : "w-full"}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Section Performance</p>
                        <div className="space-y-2">
                          {(aggregatedSectionAvgs ?? []).map((s: any) => (
                            <ScoreBar key={s.title} label={s.title} score={s.avg} detail={`${s.avg.toFixed(1)}% avg`} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {courseAI ? (
                    <div className="space-y-3 avoid-break">
                      <div className="rounded-xl overflow-hidden border border-blue-100">
                        <div className="bg-[#1B4F8A] px-4 py-2 flex items-center gap-2">
                          <BrainCircuit className="h-3.5 w-3.5 text-white/70" />
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">{t("Expert Course Analysis")}</p>
                        </div>
                        <div className="bg-blue-50/60 px-4 py-3">
                          <p className="text-xs text-blue-900 leading-relaxed">{t(courseAI.summary)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Trophy className="h-3 w-3 text-emerald-600" />
                            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">{t("Course Strengths")}</p>
                          </div>
                          {(courseAI.strengths ?? []).map((s: string, i: number) => (
                            <p key={i} className="text-[10px] text-emerald-800 leading-relaxed mb-1">· {t(s)}</p>
                          ))}
                        </div>
                        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Target className="h-3 w-3 text-red-500" />
                            <p className="text-[9px] font-bold uppercase tracking-wider text-red-600">{t("Course Weaknesses")}</p>
                          </div>
                          {(courseAI.weaknesses ?? []).map((s: string, i: number) => (
                            <p key={i} className="text-[10px] text-red-800 leading-relaxed mb-1">· {t(s)}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <AIPlaceholder onGenerate={generateNarrative} />
                  )}
                </div>
                <PageFooter page={4 + courseIdx} total={totalPages} />
              </Page>
            )
          })}

          {/* ══ AI ANALYSIS PAGE ══ */}
          {hasAI && (
            <Page>
              <PageHeader today={today} />
              <div className="px-12 py-7 space-y-5">
                <div className="avoid-break">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A]">{t("Group Report")}</p>
                  <h2 className="text-2xl font-extrabold text-slate-800 mt-1">{t("Expert Group Analysis")}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{group.name} · {t("Strengths, weaknesses, readiness & key candidates")}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 avoid-break">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                    <div className="flex items-center gap-1.5 mb-3"><Trophy className="h-3.5 w-3.5 text-emerald-600" /><p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">{t("Group Strengths")}</p></div>
                    {(narrative.strengths ?? []).map((s: string, i: number) => (
                      <div key={i} className="flex items-start gap-1.5 mb-2"><CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" /><p className="text-[10px] text-emerald-800 leading-relaxed">{t(s)}</p></div>
                    ))}
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                    <div className="flex items-center gap-1.5 mb-3"><Target className="h-3.5 w-3.5 text-red-500" /><p className="text-[9px] font-bold uppercase tracking-wider text-red-600">Weakness Areas</p></div>
                    {(narrative.weaknesses ?? []).map((s: string, i: number) => (
                      <div key={i} className="flex items-start gap-1.5 mb-2"><XCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" /><p className="text-[10px] text-red-800 leading-relaxed">{t(s)}</p></div>
                    ))}
                  </div>
                </div>

                {narrative.group_readiness && (
                  <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 avoid-break">
                    <div className="flex items-center gap-2 mb-2"><BrainCircuit className="h-3.5 w-3.5 text-purple-600" /><p className="text-[10px] font-bold uppercase tracking-widest text-purple-700">{t("Group Readiness Assessment")}</p></div>
                    <p className="text-xs text-purple-800 leading-relaxed">{t(narrative.group_readiness)}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 avoid-break">
                  <div className="border border-slate-100 rounded-xl overflow-hidden">
                    <div className="bg-emerald-600 px-4 py-2 flex items-center gap-2">
                      <Star className="h-3.5 w-3.5 text-white/80" />
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/90">Top Performers</p>
                    </div>
                    <div className="p-3 space-y-2 bg-white">
                      {(narrative.top_candidates ?? []).map((c: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-emerald-50/60 rounded-lg">
                          <span className="text-emerald-600 font-bold text-xs shrink-0">#{i + 1}</span>
                          <div>
                            <p className="text-xs font-semibold text-emerald-800">{c.name}</p>
                            <p className="text-[10px] text-emerald-600 leading-relaxed">{t(c.note)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border border-slate-100 rounded-xl overflow-hidden">
                    <div className="bg-amber-500 px-4 py-2 flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-white/80" />
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/90">Needs Development</p>
                    </div>
                    <div className="p-3 space-y-2 bg-white">
                      {(narrative.development_candidates ?? []).map((c: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-amber-50/60 rounded-lg">
                          <span className="text-amber-600 font-bold text-xs shrink-0">!</span>
                          <div>
                            <p className="text-xs font-semibold text-amber-800">{c.name}</p>
                            <p className="text-[10px] text-amber-600 leading-relaxed">{t(c.note)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {(narrative.instructor_recommendations ?? []).length > 0 && (
                  <div className="avoid-break">
                    <div className="flex items-center gap-2 mb-3"><Lightbulb className="h-4 w-4 text-[#1B4F8A]" /><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Instructor Recommendations</p></div>
                    <div className="space-y-2">
                      {(narrative.instructor_recommendations ?? []).map((rec: any, i: number) => {
                        const pc = priorityColors[rec.priority ?? "medium"] ?? priorityColors.medium
                        return (
                          <div key={i} className="flex items-start gap-3 p-3 border border-slate-100 rounded-xl bg-slate-50/80">
                            <div className="w-7 h-7 rounded-full bg-[#1B4F8A] flex items-center justify-center text-white text-xs font-bold shrink-0">{i + 1}</div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-xs font-semibold text-slate-700">{t(rec.topic)}</p>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${pc}`}>{rec.priority ?? "medium"}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 leading-relaxed">→ {t(rec.action)}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              <PageFooter page={3 + courses.length + 1} total={totalPages} />
            </Page>
          )}

          {/* ══ RECOMMENDATIONS PAGE ══ */}
          {hasAI && (
            <Page>
              <PageHeader today={today} />
              <div className="px-12 py-7 space-y-6">
                <div className="avoid-break">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A]">{t("Group Report")}</p>
                  <h2 className="text-2xl font-extrabold text-slate-800 mt-1">Recommendations</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{group.name} · {t("Future training & priority topics")}</p>
                </div>

                {(narrative.future_courses ?? []).length > 0 && (
                  <div className="avoid-break">
                    <div className="flex items-center gap-2 mb-4"><TrendingUp className="h-4 w-4 text-[#1B4F8A]" /><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t("Recommended Next Courses")}</p></div>
                    <div className="space-y-2">
                      {(narrative.future_courses ?? []).map((fc: string, i: number) => (
                        <div key={i} className="flex items-center gap-3 p-3 border border-blue-100 rounded-xl bg-blue-50/60">
                          <div className="w-6 h-6 rounded-full bg-[#1B4F8A] flex items-center justify-center text-white text-xs font-bold shrink-0">{i + 1}</div>
                          <p className="text-xs text-blue-900">{t(fc)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(narrative.instructor_recommendations ?? []).length > 0 && (
                  <div className="avoid-break">
                    <div className="flex items-center gap-2 mb-3"><Target className="h-4 w-4 text-amber-500" /><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Priority Topics to Reinforce</p></div>
                    <div className="rounded-xl border border-slate-100 overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            {["Topic", "Recommended Action", "Priority"].map(h => (
                              <th key={h} className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-400 px-4 py-2">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(narrative.instructor_recommendations ?? []).map((rec: any, i: number) => {
                            const textColors: Record<string, string> = { high: "text-red-600", medium: "text-amber-600", low: "text-slate-400" }
                            return (
                              <tr key={i} className={`border-b border-slate-50 last:border-0 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                                <td className="px-4 py-2.5 text-xs font-semibold text-slate-700">{t(rec.topic)}</td>
                                <td className="px-4 py-2.5 text-[10px] text-slate-500">{t(rec.action)}</td>
                                <td className={`px-4 py-2.5 text-[10px] font-bold uppercase ${textColors[rec.priority ?? "medium"] ?? ""}`}>{rec.priority ?? "—"}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-100 pt-6 flex flex-col items-center gap-2 text-center avoid-break">
                  <Image src="/logo/logo-dark-blue.png" alt="ICS" width={80} height={22} className="object-contain opacity-25" />
                  <p className="text-[10px] text-slate-300 uppercase tracking-widest">ICS Aviation · Integrated Consulting Services</p>
                  <p className="text-[10px] text-slate-300 max-w-md">{t("This report is expert-generated based on group performance data and is for internal use only.")}</p>
                </div>
              </div>
              <PageFooter page={totalPages} total={totalPages} />
            </Page>
          )}

        </div>
      </div>
    </>
  )
}
