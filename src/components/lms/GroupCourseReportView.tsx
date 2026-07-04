"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft, Printer, Download, BrainCircuit, RefreshCw, Loader2,
  Users, Trophy, TrendingUp, Lightbulb, AlertTriangle, Clock,
  BookOpen, Layers, Medal, GraduationCap, Puzzle, ClipboardList,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import LmsReleaseCertsButton from "@/components/lms/LmsReleaseCertsButton"
import { toast } from "sonner"

export type GroupAssessment = {
  executive_summary: string
  strengths: string[]
  improvements: string[]
  recommendations: string[]
  at_risk_patterns: string
}
export type GroupReportData = {
  course: { id: string; title: string; delivery_mode: string; description: string; status: string }
  stats: { enrolled: number; completed: number; avgProgress: number; completionRate: number; examPass: number; examExists: boolean; pendingGrades: number; avgTimeS: number; totalTimeS: number }
  buckets: { label: string; count: number }[]
  bucketMax: number
  moduleStats: { title: string; type: string; avg: number | null; done: number | null; total: number }[]
  atRisk: { name: string; email: string; id: string; progressPct: number; reasons: string[] }[]
  charts: {
    examScoreBuckets: { label: string; count: number }[]
    passFail: { passed: number; failed: number; notAttempted: number }
    statusCounts: { active: number; completed: number; dropped: number }
  }
  examAnalysis: { hardestQuestions: { text: string; correctPct: number; n: number }[]; difficulty: { mastered: number; mixed: number; struggled: number; total: number } }
  certificates: { issued: number; released: number }
  attendance: { overallPct: number; perSession: { title: string; date: string; presentPct: number }[] } | null
  feedbackRatings: { label: string; value: number }[]
  feedbackCount: number
  roster: { id: string; name: string; email: string; status: string; progressPct: number; attendPct: number | null; attended: number; sessionTotal: number; examPassed: boolean | null; examPct: number | null; timeS: number }[]
  assessment: GroupAssessment | null
  generatedAt: string | null
}

const fmtTime = (s: number) => { if (!s || s < 60) return s >= 1 ? `${s}s` : "—"; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m` }
const SECTION = "text-[10px] font-bold uppercase tracking-widest text-slate-400"

function Page({ children, dark = false, first = false }: { children: React.ReactNode; dark?: boolean; first?: boolean }) {
  return <div className={`relative w-full flex flex-col ${dark ? "bg-[#1B4F8A]" : "bg-white"} ${first ? "" : "page-break"}`} style={{ minHeight: first ? 1122 : undefined }}>{children}</div>
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
function CoverRing({ score, label }: { score: number; label: string }) {
  const size = 160, sw = 12, r = (size - sw) / 2, circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(score, 100) / 100)
  const band = score >= 80 ? { label: "Strong", col: "#34d399" } : score >= 50 ? { label: "Developing", col: "#fbbf24" } : { label: "At Risk", col: "#f87171" }
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={sw} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={band.col} strokeWidth={sw} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold text-white leading-none">{score}%</span>
        <span className="text-[9px] font-bold tracking-widest uppercase text-white/50 mt-1.5">{label}</span>
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: band.col }}>{band.label}</span>
      </div>
    </div>
  )
}

function Donut({ segments, size = 116 }: { segments: { value: number; color: string; label: string }[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  const sw = 15, r = (size - sw) / 2, circ = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="-rotate-90 shrink-0">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={sw} />
        {segments.filter(s => s.value > 0).map((s, i) => {
          const len = (s.value / total) * circ
          const el = <circle key={i} cx={size/2} cy={size/2} r={r} fill="none" stroke={s.color} strokeWidth={sw} strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset} strokeLinecap="butt" />
          offset += len
          return el
        })}
      </svg>
      <div className="space-y-1.5">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs min-w-[120px]">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-slate-600">{s.label}</span>
            <span className="font-semibold text-slate-800 ml-auto">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function GroupCourseReportView({ data }: { data: GroupReportData }) {
  const { course, stats, buckets, bucketMax, moduleStats, atRisk, roster } = data
  const [assessment, setAssessment] = useState<GroupAssessment | null>(data.assessment)
  const [generatedAt, setGeneratedAt] = useState<string | null>(data.generatedAt)
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  const hasAI = !!assessment
  const hasExam = data.examAnalysis.hardestQuestions.length > 0
  const hasExtras = !!data.attendance || data.feedbackRatings.length > 0 || data.certificates.issued > 0
  const pageOrder = [
    "cover", "course", "cohort", "module",
    ...(hasExam ? ["exam"] : []),
    "ranking",
    ...(hasAI ? ["expert"] : []),
    ...(hasExtras ? ["extras"] : []),
    "roster",
  ]
  const pageNo = (k: string) => pageOrder.indexOf(k) + 1
  const totalPages = pageOrder.length

  // Ranking (1st → last). Score = exam-weighted where an exam exists, else progress.
  const ranked = roster
    .filter(r => r.status !== "dropped")
    .map(r => ({ ...r, rankScore: stats.examExists && r.examPct != null ? Math.round(r.examPct * 0.6 + r.progressPct * 0.4) : r.progressPct }))
    .sort((a, b) => b.rankScore - a.rankScore)
  const medal = (i: number) => i === 0 ? "#facc15" : i === 1 ? "#94a3b8" : i === 2 ? "#d97706" : null

  const moduleIcon = (t: string) => t === "package" ? Puzzle : t === "final_exam" ? GraduationCap : t === "assignment" ? ClipboardList : Layers

  async function generate() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/lms/reports/course/${course.id}/expert-assessment`, { method: "POST" })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error ?? "Failed to generate"); return }
      setAssessment(d.assessment); setGeneratedAt(d.generated_at)
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
      const a = document.createElement("a"); a.href = url
      a.download = `${course.title} - Group Report.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
      toast.success("PDF downloaded")
    } catch { toast.error("Failed to download PDF") }
    finally { setDownloading(false) }
  }

  const barColor = (v: number) => v >= 70 ? "bg-emerald-500" : v >= 40 ? "bg-amber-400" : "bg-red-400"

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

      {/* ── Toolbar ── */}
      <div className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 flex-wrap bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-2.5 mb-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/lms-admin/reports" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
          <Users className="h-4 w-4 text-slate-400" />
          <span className="truncate max-w-[280px] font-medium text-slate-800">{course.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <LmsReleaseCertsButton courseId={course.id} />
          {assessment ? (
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
            <p className="text-white/50 text-[11px] uppercase tracking-[0.4em]">Group Course Report</p>
            <div>
              <h1 className="text-4xl font-extrabold text-white tracking-tight">{course.title}</h1>
              <p className="text-white/50 text-sm mt-2 capitalize">{course.delivery_mode} · {stats.enrolled} students</p>
            </div>
            <CoverRing score={stats.completionRate} label="Completion Rate" />
            <div className="flex items-center gap-8">
              <div className="text-center"><p className="text-2xl font-bold text-white">{stats.avgProgress}%</p><p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Avg Progress</p></div>
              <div className="h-10 w-px bg-white/15" />
              <div className="text-center"><p className="text-2xl font-bold text-white">{stats.completed}/{stats.enrolled}</p><p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Completed</p></div>
              {stats.examExists && <><div className="h-10 w-px bg-white/15" /><div className="text-center"><p className="text-2xl font-bold text-white">{stats.examPass}/{stats.enrolled}</p><p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Exam Pass</p></div></>}
              {stats.avgTimeS > 0 && <><div className="h-10 w-px bg-white/15" /><div className="text-center"><p className="text-2xl font-bold text-white">{fmtTime(stats.avgTimeS)}</p><p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Avg Time</p></div></>}
            </div>
          </div>
          <div className="px-12 py-6 border-t border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2"><BrainCircuit className="h-3.5 w-3.5 text-purple-300/60" /><p className="text-white/30 text-[10px]">Generated by ICS Expert Analytics</p></div>
            <p className="text-white/20 text-[9px]">Page 1 of {totalPages}</p>
          </div>
        </Page>

        {/* PAGE 2 — COURSE OVERVIEW */}
        <Page>
          <PageHeader title="Course Overview" subtitle={course.title} today={today} />
          <div className="px-12 py-7 space-y-7 flex-1">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#1B4F8A]/10 flex items-center justify-center shrink-0"><BookOpen className="h-6 w-6 text-[#1B4F8A]" /></div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">{course.title}</h2>
                <p className="text-xs text-slate-500 capitalize mt-0.5">{course.delivery_mode}{course.status ? ` · ${course.status}` : ""} · {moduleStats.length} module{moduleStats.length === 1 ? "" : "s"}</p>
              </div>
            </div>

            {course.description && (
              <div>
                <p className={SECTION + " mb-2"}>About this Course</p>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{course.description}</p>
              </div>
            )}

            <div>
              <p className={SECTION + " mb-3"}>Course Structure</p>
              <div className="space-y-2">
                {moduleStats.length === 0 ? (
                  <p className="text-xs text-slate-400">No modules in this course.</p>
                ) : moduleStats.map((m, i) => {
                  const Icon = moduleIcon(m.type)
                  return (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-2.5">
                      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <Icon className="h-4 w-4 text-[#1B4F8A] shrink-0" />
                      <span className="text-sm font-medium text-slate-700 flex-1 truncate">{m.title}</span>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 shrink-0">{m.type.replace("_", " ")}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <PageFooter page={pageNo("course")} total={totalPages} />
        </Page>

        {/* PAGE 3 — COHORT OVERVIEW */}
        <Page>
          <PageHeader title="Cohort Overview" subtitle={course.title} today={today} />
          <div className="px-12 py-7 space-y-7 flex-1">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Enrolled", value: stats.enrolled }, { label: "Completed", value: stats.completed },
                { label: "Avg Progress", value: `${stats.avgProgress}%` }, { label: "Completion", value: `${stats.completionRate}%` },
                { label: stats.examExists ? "Exam Passes" : "Exam", value: stats.examExists ? `${stats.examPass}/${stats.enrolled}` : "—" },
                { label: "Pending Grades", value: stats.pendingGrades },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-slate-200 p-4 text-center">
                  <p className="text-2xl font-bold text-[#1B4F8A]">{s.value}</p>
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            <div>
              <p className={SECTION + " mb-3"}>Progress Distribution</p>
              <div className="space-y-2">
                {buckets.map(b => (
                  <div key={b.label} className="flex items-center gap-3 text-xs">
                    <span className="w-16 text-slate-500 shrink-0">{b.label}</span>
                    <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden"><div className="h-full bg-[#1B4F8A]/70 rounded" style={{ width: `${(b.count / bucketMax) * 100}%` }} /></div>
                    <span className="w-6 text-right font-semibold text-slate-700">{b.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 rounded-xl border border-slate-200 p-4 flex items-center gap-3">
                <Clock className="h-6 w-6 text-sky-600" />
                <div><p className="text-lg font-bold text-slate-800">{fmtTime(stats.avgTimeS)}</p><p className="text-[10px] uppercase tracking-widest text-slate-400">Avg time / student</p></div>
              </div>
              <div className="flex-1 rounded-xl border border-slate-200 p-4 flex items-center gap-3">
                <TrendingUp className="h-6 w-6 text-emerald-600" />
                <div><p className="text-lg font-bold text-slate-800">{fmtTime(stats.totalTimeS)}</p><p className="text-[10px] uppercase tracking-widest text-slate-400">Total learning time</p></div>
              </div>
            </div>

            <div>
              <p className={SECTION + " mb-3"}>Breakdown</p>
              <div className="flex flex-wrap gap-10">
                <div>
                  <p className="text-[11px] text-slate-500 mb-2 font-medium">Enrollment Status</p>
                  <Donut segments={[
                    { value: data.charts.statusCounts.active,    color: "#3b82f6", label: "Active" },
                    { value: data.charts.statusCounts.completed, color: "#10b981", label: "Completed" },
                    { value: data.charts.statusCounts.dropped,   color: "#cbd5e1", label: "Unenrolled" },
                  ]} />
                </div>
                {stats.examExists && (
                  <div>
                    <p className="text-[11px] text-slate-500 mb-2 font-medium">Final Exam</p>
                    <Donut segments={[
                      { value: data.charts.passFail.passed,       color: "#10b981", label: "Passed" },
                      { value: data.charts.passFail.failed,       color: "#ef4444", label: "Failed" },
                      { value: data.charts.passFail.notAttempted, color: "#cbd5e1", label: "Not attempted" },
                    ]} />
                  </div>
                )}
              </div>
            </div>

            {stats.examExists && data.charts.examScoreBuckets.some(b => b.count > 0) && (
              <div>
                <p className={SECTION + " mb-3"}>Exam Score Distribution</p>
                <div className="space-y-2">
                  {(() => { const max = Math.max(1, ...data.charts.examScoreBuckets.map(x => x.count)); return data.charts.examScoreBuckets.map(b => (
                    <div key={b.label} className="flex items-center gap-3 text-xs">
                      <span className="w-16 text-slate-500 shrink-0">{b.label}</span>
                      <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden"><div className="h-full bg-indigo-500/70 rounded" style={{ width: `${(b.count / max) * 100}%` }} /></div>
                      <span className="w-6 text-right font-semibold text-slate-700">{b.count}</span>
                    </div>
                  )) })()}
                </div>
              </div>
            )}
          </div>
          <PageFooter page={pageNo("cohort")} total={totalPages} />
        </Page>

        {/* PAGE 4 — MODULE PERFORMANCE + AT-RISK */}
        <Page>
          <PageHeader title="Module Performance" subtitle={course.title} today={today} />
          <div className="px-12 py-7 space-y-7 flex-1">
            <div>
              <p className={SECTION + " mb-3"}>Cohort Average by Module</p>
              <div className="space-y-3">
                {moduleStats.map((m, i) => (
                  <div key={i} className="avoid-break">
                    <div className="flex items-center justify-between text-xs mb-1 gap-2">
                      <span className="font-medium text-slate-700 truncate">{m.title}</span>
                      <span className="text-slate-400 shrink-0">
                        {m.avg !== null ? `${m.avg}%` : "—"}
                        {m.type === "final_exam" && m.done !== null ? ` · ${m.done}/${m.total} passed` : ""}
                        {m.type === "package" && m.done !== null ? ` · ${m.done}/${m.total} done` : ""}
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${barColor(m.avg ?? 0)}`} style={{ width: `${m.avg ?? 0}%` }} /></div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-3">Low bars flag modules the whole cohort struggled with — worth reviewing that content.</p>
            </div>

            {atRisk.length > 0 && (
              <div className="avoid-break">
                <p className={SECTION + " mb-3 flex items-center gap-1.5"}><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> At-Risk Students ({atRisk.length})</p>
                <div className="space-y-1.5">
                  {atRisk.map(s => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2">
                      <span className="text-sm font-medium text-slate-700">{s.name}</span>
                      <span className="text-[11px] text-amber-700">{s.reasons.join(" · ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <PageFooter page={pageNo("module")} total={totalPages} />
        </Page>

        {/* EXAM ANALYSIS (conditional) */}
        {hasExam && (
          <Page>
            <PageHeader title="Exam Analysis" subtitle={course.title} today={today} />
            <div className="px-12 py-7 space-y-7 flex-1">
              <div>
                <p className={SECTION + " mb-3"}>Question Difficulty — cohort correct-rate</p>
                <div className="flex gap-3">
                  {[
                    { label: "Mastered ≥80%", value: data.examAnalysis.difficulty.mastered, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
                    { label: "Mixed 40–79%",  value: data.examAnalysis.difficulty.mixed,    color: "text-amber-600",   bg: "bg-amber-50 border-amber-100" },
                    { label: "Struggled <40%", value: data.examAnalysis.difficulty.struggled, color: "text-red-600",    bg: "bg-red-50 border-red-100" },
                  ].map(d => (
                    <div key={d.label} className={`flex-1 rounded-xl border p-4 text-center ${d.bg}`}>
                      <p className={`text-2xl font-bold ${d.color}`}>{d.value}</p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">{d.label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">{data.examAnalysis.difficulty.total} questions graded across the cohort.</p>
              </div>
              <div>
                <p className={SECTION + " mb-3"}>Hardest Questions — most missed by the cohort</p>
                <div className="space-y-2">
                  {data.examAnalysis.hardestQuestions.map((q, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-xl border border-slate-100 px-4 py-2.5 avoid-break">
                      <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${q.correctPct < 40 ? "bg-red-100 text-red-600" : q.correctPct < 70 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{q.correctPct}%</span>
                      <p className="text-sm text-slate-700 flex-1">{q.text}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">The % is how many students answered correctly — low values show exactly what to re-teach.</p>
              </div>
            </div>
            <PageFooter page={pageNo("exam")} total={totalPages} />
          </Page>
        )}

        {/* PAGE 5 — CLASS RANKING */}
        <Page>
          <PageHeader title="Class Ranking" subtitle={course.title} today={today} />
          <div className="px-12 py-7 flex-1">
            <p className={SECTION + " mb-3"}>Students ranked by performance{stats.examExists ? " · exam-weighted" : " · by progress"}</p>
            {ranked.length === 0 ? (
              <p className="text-xs text-slate-400">No active students to rank.</p>
            ) : (
              <div className="space-y-1.5">
                {ranked.map((r, i) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-2.5 avoid-break">
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={medal(i) ? { background: medal(i)!, color: "#fff" } : { background: "#f1f5f9", color: "#64748b" }}>
                      {medal(i) ? <Medal className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{r.name}</p>
                      <p className="text-[10px] text-slate-400">{r.progressPct}% progress{stats.examExists && r.examPct != null ? ` · exam ${r.examPct}%` : ""}</p>
                    </div>
                    <span className="text-base font-bold text-[#1B4F8A] shrink-0">{r.rankScore}%</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-3">Score = {stats.examExists ? "60% final exam + 40% course progress" : "course progress"}. Unenrolled students are excluded.</p>
          </div>
          <PageFooter page={pageNo("ranking")} total={totalPages} />
        </Page>

        {/* PAGE 6 — EXPERT REPORT (if generated) */}
        {hasAI && assessment && (
          <Page>
            <PageHeader title="Expert Cohort Report" subtitle={course.title} today={today} />
            <div className="px-12 py-7 space-y-6 flex-1">
              {assessment.executive_summary && (
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-5">
                  <p className={SECTION + " mb-2"}>Executive Summary</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{assessment.executive_summary}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                {assessment.strengths.length > 0 && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                    <p className={SECTION + " mb-2 flex items-center gap-1.5 !text-emerald-600"}><Trophy className="h-3.5 w-3.5" /> Cohort Strengths</p>
                    <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-4">{assessment.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                )}
                {assessment.improvements.length > 0 && (
                  <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-4">
                    <p className={SECTION + " mb-2 flex items-center gap-1.5 !text-rose-600"}><TrendingUp className="h-3.5 w-3.5" /> Needs Attention</p>
                    <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-4">{assessment.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                )}
              </div>
              {assessment.recommendations.length > 0 && (
                <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
                  <p className={SECTION + " mb-2 flex items-center gap-1.5 !text-amber-600"}><Lightbulb className="h-3.5 w-3.5" /> Recommendations for the Instructor</p>
                  <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-4">{assessment.recommendations.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}
              {assessment.at_risk_patterns && assessment.at_risk_patterns !== "None significant." && (
                <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 p-4">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div><p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-0.5">At-Risk Pattern</p><p className="text-sm text-slate-700">{assessment.at_risk_patterns}</p></div>
                </div>
              )}
              {generatedAt && <p className="text-[10px] text-slate-300">Generated {new Date(generatedAt).toLocaleString("en-GB")}</p>}
            </div>
            <PageFooter page={pageNo("expert")} total={totalPages} />
          </Page>
        )}

        {/* EXTRAS (conditional): attendance · feedback · certificates */}
        {hasExtras && (
          <Page>
            <PageHeader title="Attendance · Feedback · Certificates" subtitle={course.title} today={today} />
            <div className="px-12 py-7 space-y-7 flex-1">
              {data.attendance && (
                <div>
                  <p className={SECTION + " mb-3"}>Attendance — {data.attendance.overallPct}% overall</p>
                  <div className="space-y-2">
                    {data.attendance.perSession.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 text-xs">
                        <span className="w-44 truncate text-slate-600 shrink-0">{s.title}</span>
                        <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden"><div className={`h-full rounded ${s.presentPct >= 70 ? "bg-emerald-500" : s.presentPct >= 40 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${s.presentPct}%` }} /></div>
                        <span className="w-8 text-right font-medium text-slate-700">{s.presentPct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {data.feedbackRatings.length > 0 && (
                <div>
                  <p className={SECTION + " mb-3"}>Course Feedback — {data.feedbackCount} response{data.feedbackCount === 1 ? "" : "s"}</p>
                  <div className="grid grid-cols-5 gap-3">
                    {data.feedbackRatings.map(r => (
                      <div key={r.label} className="rounded-xl border border-slate-100 p-3 text-center">
                        <p className="text-xl font-bold text-[#1B4F8A]">{r.value}<span className="text-xs text-slate-400">/5</span></p>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">{r.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {data.certificates.issued > 0 && (
                <div>
                  <p className={SECTION + " mb-3"}>Certificates</p>
                  <div className="flex gap-3">
                    <div className="flex-1 rounded-xl border border-slate-100 p-4 flex items-center gap-3"><GraduationCap className="h-6 w-6 text-[#1B4F8A]" /><div><p className="text-lg font-bold text-slate-800">{data.certificates.issued}</p><p className="text-[10px] uppercase tracking-widest text-slate-400">Issued</p></div></div>
                    <div className="flex-1 rounded-xl border border-slate-100 p-4 flex items-center gap-3"><GraduationCap className="h-6 w-6 text-emerald-600" /><div><p className="text-lg font-bold text-slate-800">{data.certificates.released}</p><p className="text-[10px] uppercase tracking-widest text-slate-400">Released to students</p></div></div>
                  </div>
                </div>
              )}
            </div>
            <PageFooter page={pageNo("extras")} total={totalPages} />
          </Page>
        )}

        {/* LAST PAGE — ROSTER */}
        <Page>
          <PageHeader title="Student Roster" subtitle={course.title} today={today} />
          <div className="px-12 py-7 flex-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-200 text-left text-slate-400 uppercase tracking-wider text-[9px]">
                  <th className="py-2 font-semibold">Student</th>
                  <th className="py-2 font-semibold">Status</th>
                  <th className="py-2 font-semibold">Progress</th>
                  <th className="py-2 font-semibold">Time</th>
                  {stats.examExists && <th className="py-2 font-semibold">Exam</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roster.map(r => (
                  <tr key={r.id}>
                    <td className="py-2">
                      <p className="font-medium text-slate-800">{r.name}</p>
                      <p className="text-[10px] text-slate-400">{r.email}</p>
                    </td>
                    <td className="py-2 capitalize text-slate-600">{r.status === "dropped" ? "unenrolled" : r.status}</td>
                    <td className="py-2 text-slate-700 font-medium">{r.progressPct}%</td>
                    <td className="py-2 text-slate-500">{fmtTime(r.timeS)}</td>
                    {stats.examExists && (
                      <td className="py-2">
                        {r.examPassed === null ? <span className="text-slate-400">—</span> :
                          <span className={r.examPassed ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                            {r.examPassed ? "Passed" : "Failed"}{r.examPct != null ? ` · ${r.examPct}%` : ""}
                          </span>}
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
