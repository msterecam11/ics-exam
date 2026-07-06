"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft, Printer, Download, BrainCircuit, RefreshCw, Loader2,
  CheckCircle2, XCircle, MinusCircle, Sparkles,
  Trophy, Target, Lightbulb, TrendingUp, ShieldAlert,
  Medal, Users, Star, Clock, ClipboardList, CalendarCheck, MessageSquareText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import ScoreBar from "@/components/reports/ScoreBar"
import { toast } from "sonner"
import type { CourseReport } from "@/lib/lms-course-report"

function sc(p: number | null) {
  if (p === null) return { text: "#64748b", bg: "#f1f5f9", border: "#e2e8f0" }
  if (p >= 80) return { text: "#059669", bg: "#d1fae5", border: "#a7f3d0" }
  if (p >= 60) return { text: "#D97706", bg: "#fef3c7", border: "#fde68a" }
  return { text: "#DC2626", bg: "#fee2e2", border: "#fca5a5" }
}
function statusLabel(s: string) { return ({ passed: "Completed", completed: "Completed", failed: "Completed", in_progress: "In progress", not_started: "Not started" } as Record<string, string>)[s] ?? s }
function fmtTime(s: number) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m` }

function Page({ children, dark = false, first = false }: { children: React.ReactNode; dark?: boolean; first?: boolean }) {
  return (
    <div className={`relative w-full flex flex-col ${dark ? "bg-[#1B4F8A]" : "bg-white"} ${first ? "" : "page-break"}`} style={{ minHeight: first ? 1122 : undefined }}>
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
  const size = 160, sw = 12, r = (size - sw) / 2, circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(score, 100) / 100)
  const band = score >= 80 ? { label: "Strong", col: "#34d399" } : score >= 60 ? { label: "Developing", col: "#fbbf24" } : { label: "Weak", col: "#f87171" }
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={sw} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={band.col} strokeWidth={sw} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold text-white leading-none">{score}%</span>
        <span className="text-[9px] font-bold tracking-widest uppercase text-white/50 mt-1.5">Overall Mastery</span>
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: band.col }}>{band.label}</span>
      </div>
    </div>
  )
}

const SECTION = "text-[10px] font-bold uppercase tracking-widest text-slate-400"

// Compact topic-mastery radar (student values only). Falls back to nothing < 3 axes.
function TopicRadar({ topics }: { topics: { topic: string; pct: number }[] }) {
  const pts = topics.slice(0, 6)
  const n = pts.length
  if (n < 3) return null
  const cx = 100, cy = 95, R = 70
  const coord = (i: number, v: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n
    const r = (Math.max(0, Math.min(100, v)) / 100) * R
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)]
  }
  const grid = [0.25, 0.5, 0.75, 1].map(f =>
    pts.map((_, i) => coord(i, f * 100).join(",")).join(" ")
  )
  const poly = pts.map((t, i) => coord(i, t.pct).join(",")).join(" ")
  return (
    <svg viewBox="0 0 200 190" width="100%" style={{ maxWidth: 240 }}>
      {grid.map((g, i) => <polygon key={i} points={g} fill="none" stroke="#e2e8f0" strokeWidth={0.75} />)}
      <polygon points={poly} fill="rgba(55,138,221,0.28)" stroke="#185FA5" strokeWidth={1.5} />
      {pts.map((t, i) => {
        const [x, y] = coord(i, 116)
        return <text key={i} x={x} y={y} textAnchor="middle" fontSize={7} fill="#64748b">{t.topic.length > 16 ? t.topic.slice(0, 15) + "…" : t.topic}</text>
      })}
    </svg>
  )
}

export default function StudentCourseReportView({ params }: { params: Promise<{ courseId: string; studentId: string }> }) {
  const { courseId, studentId } = use(params)
  const [report, setReport] = useState<CourseReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [showOptIn, setShowOptIn] = useState(true)
  const [includeSecurity, setIncludeSecurity] = useState(false)

  useEffect(() => {
    fetch(`/api/lms/reports/student/${studentId}/${courseId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setReport(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [studentId, courseId])

  async function generateAssessment() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/lms/reports/student/${studentId}/${courseId}/expert-assessment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ includeSecurity }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed to generate"); return }
      // re-fetch so per-module AI is attached server-side
      const fresh = await fetch(`/api/lms/reports/student/${studentId}/${courseId}`).then(r => r.json())
      setReport(fresh)
      toast.success("Expert assessment generated")
    } catch { toast.error("Failed to generate") }
    finally { setGenerating(false) }
  }

  async function downloadPDF() {
    setDownloading(true)
    toast.info("Generating PDF…")
    try {
      const res = await fetch(`/api/lms/reports/student/${studentId}/${courseId}/pdf`)
      if (!res.ok) { toast.error("PDF generation failed"); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url
      a.download = `${report?.student.name ?? "Student"} - ${report?.course.title ?? "Course"} - Report.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
      toast.success("PDF downloaded")
    } catch { toast.error("Failed to download PDF") }
    finally { setDownloading(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
  if (!report) return (
    <div className="max-w-3xl mx-auto py-16 text-center text-slate-400">
      <p>Report not found for this student.</p>
      <Link href={`/lms-admin/reports/${courseId}`} className="text-sm text-[#1B4F8A] underline mt-3 inline-block">← Back to course report</Link>
    </div>
  )

  const { student, course, enrollment, overall, modules, exam, examSections, topicMastery, assessment, security,
          examTrajectory, cohort, feedback, assignments } = report
  const completed = enrollment.status === "completed"
  const overallScore = overall.score ?? 0
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  const hasAI = !!assessment
  const showSecurity = includeSecurity && !!security
  const hasJourney = modules.length > 0
  const hasAssignments = assignments.length > 0
  const hasAttendance = overall.sessionTotal > 0
  const hasFeedback = !!feedback && (feedback.ratings.length > 0 || !!feedback.comment)

  // Mastery is measured per MODULE (topics just inherit their module's score, so a
  // topic list is redundant and hides the spread). Show one bar per module + a radar.
  const moduleBars = modules
    .filter(m => m.masteryScore !== null)
    .map(m => ({ label: m.title, pct: m.masteryScore as number }))
    .sort((a, b) => b.pct - a.pct)
  const moduleRadar = modules
    .filter(m => m.masteryScore !== null)
    .map(m => ({ topic: m.title.replace(/^Module\s*\d+\s*[-–:]\s*/i, ""), pct: m.masteryScore as number }))

  // Dynamic page order — a page only exists when it has data to show.
  const pageOrder: string[] = [
    "cover", "summary",
    ...(hasJourney ? ["journey"] : []),
    ...modules.map(m => `mod-${m.id}`),
    ...(exam ? ["exam"] : []),
    ...(hasAssignments ? ["assignments"] : []),
    ...(hasAttendance ? ["attendance"] : []),
    ...(hasFeedback ? ["feedback"] : []),
    ...(hasAI && assessment ? ["reco"] : []),
    ...(showSecurity && security ? ["security"] : []),
  ]
  const pageNo = (k: string) => pageOrder.indexOf(k) + 1
  const totalPages = pageOrder.length
  const riskColor = (r: string) => r === "clean" ? { t: "#059669", b: "#d1fae5" } : r === "medium" ? { t: "#D97706", b: "#fef3c7" } : { t: "#DC2626", b: "#fee2e2" }

  return (
    <>
      {/* ── Report options popup ── */}
      {showOptIn && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="h-5 w-5 text-[#1B4F8A]" />
              <p className="font-bold text-slate-800 text-base">Report options</p>
            </div>
            <p className="text-sm text-slate-500 mb-4">Choose what to include before viewing the report.</p>
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
              <input type="checkbox" checked={includeSecurity} onChange={e => setIncludeSecurity(e.target.checked)} className="mt-0.5 accent-[#1B4F8A]" />
              <div>
                <p className="text-sm font-medium text-slate-700">Include security &amp; integrity analysis</p>
                <p className="text-xs text-slate-400 mt-0.5">Adds the final-exam behavioral events (tab switches, fullscreen exits, right-clicks, copy attempts) and an AI integrity assessment.</p>
              </div>
            </label>
            <div className="flex justify-end gap-2 mt-5">
              <Button size="sm" onClick={() => setShowOptIn(false)} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> View report
              </Button>
            </div>
          </div>
        </div>
      )}

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
          <Link href={`/lms-admin/reports/${courseId}`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
          <span className="font-medium text-slate-800">{student.name}</span>
          <span className="text-slate-300">·</span>
          <span className="truncate max-w-[240px]">{course.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {assessment ? (
            <Button size="sm" variant="outline" onClick={generateAssessment} disabled={generating} className="gap-1.5 text-xs">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Regenerate
            </Button>
          ) : (
            <Button size="sm" onClick={generateAssessment} disabled={generating} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
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

      {/* ── Report ── */}
      <div id="report-root" style={{ width: 794, margin: "0 auto", boxShadow: "0 0 0 1px #e2e8f0", background: "white" }}>

        {/* PAGE 1 — COVER */}
        <Page dark first>
          <div className="absolute top-0 right-0 w-80 h-80 rounded-full pointer-events-none opacity-10" style={{ background: "radial-gradient(circle, #60a5fa, transparent)", transform: "translate(35%,-35%)" }} />
          <div className="flex items-center justify-between px-12 pt-10 shrink-0">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36} className="object-contain" />
            <p className="text-white/40 text-xs">{today}</p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-12 text-center gap-7">
            <p className="text-white/50 text-[11px] uppercase tracking-[0.4em]">Individual Course Report</p>
            <div>
              <h1 className="text-4xl font-extrabold text-white tracking-tight">{student.name}</h1>
              {(student.job_title || student.company) && <p className="text-white/50 text-sm mt-2">{[student.job_title, student.company].filter(Boolean).join(" · ")}</p>}
            </div>
            <CoverRing score={overallScore} />
            <div className="flex items-center gap-10">
              <div className="text-center"><p className="text-2xl font-bold text-white">{overall.completionPct}%</p><p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Completion</p></div>
              {overall.timeSpent > 0 && <><div className="h-10 w-px bg-white/15" /><div className="text-center"><p className="text-2xl font-bold text-white">{fmtTime(overall.timeSpent)}</p><p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Time on task</p></div></>}
              {exam && <><div className="h-10 w-px bg-white/15" /><div className="text-center"><p className="text-2xl font-bold text-white">{exam.pct}%</p><p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Final Exam</p></div></>}
              {cohort && <><div className="h-10 w-px bg-white/15" /><div className="text-center"><p className="text-2xl font-bold text-white flex items-center gap-1 justify-center"><Medal className="h-5 w-5 text-amber-300" />#{cohort.rank}<span className="text-white/40 text-sm font-normal">/{cohort.total}</span></p><p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Cohort rank</p></div></>}
            </div>
            <div className="px-8 py-4 rounded-2xl border border-white/10 bg-white/5 text-center">
              <p className="text-white/80 text-sm font-semibold">{course.title}</p>
              <div className="mt-1.5"><span className="inline-block text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full" style={{ background: completed ? "rgba(52,211,153,0.18)" : "rgba(96,165,250,0.18)", color: completed ? "#6ee7b7" : "#93c5fd" }}>{completed ? "● Completed" : "● In progress"}</span></div>
              <p className="text-white/30 text-[10px] mt-1.5">Enrolled {new Date(enrollment.enrolled_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}{enrollment.completed_at && ` · Completed ${new Date(enrollment.completed_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}</p>
            </div>
          </div>
          <div className="px-12 py-6 border-t border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2"><BrainCircuit className="h-3.5 w-3.5 text-purple-300/60" /><p className="text-white/30 text-[10px]">Generated by ICS Expert Analytics</p></div>
            <p className="text-white/20 text-[9px]">Page 1 of {totalPages}</p>
          </div>
        </Page>

        {/* PAGE 2 — SUMMARY + EXPERT + TOPICS */}
        <Page>
          <PageHeader title="Performance Summary" subtitle={course.title} today={today} />
          <div className="px-12 py-7 space-y-6">
            <div className="avoid-break">
              <p className={`${SECTION} mb-3`}>Score Summary</p>
              <div className="grid grid-cols-3 divide-x divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                {[
                  { label: "Overall Score", value: overall.score !== null ? `${overall.score}%` : "—", color: sc(overall.score).text, sub: completed ? "Completed" : "In progress" },
                  { label: "Completion", value: `${overall.completionPct}%`, color: "#1B4F8A", sub: `${modules.filter(m => ["passed", "completed"].includes(m.status)).length}/${modules.length} modules completed` },
                  { label: "Final Exam", value: exam?.pct != null ? `${exam.pct}%` : "—", color: exam ? (exam.passed ? "#059669" : "#DC2626") : "#94a3b8", sub: exam ? `${exam.passed ? "Passed" : "Not passed"} · ${exam.attempts}/${exam.maxAttempts}` : "Not attempted" },
                ].map(s => (
                  <div key={s.label} className="py-4 px-3 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{s.label}</p>
                    <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{s.sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {cohort && (
              <div className="avoid-break">
                <p className={`${SECTION} mb-3`}>Cohort Benchmark</p>
                <div className="grid grid-cols-3 divide-x divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                  <div className="py-4 px-3 text-center"><p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Your course score</p><p className="text-xl font-bold" style={{ color: sc(cohort.selfScore).text }}>{cohort.selfScore}%</p></div>
                  <div className="py-4 px-3 text-center"><p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Cohort average</p><p className="text-xl font-bold text-[#1B4F8A]">{cohort.classAvg}%</p><p className="text-[10px] text-slate-400 mt-1">{cohort.total} students</p></div>
                  <div className="py-4 px-3 text-center"><p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Rank</p><p className="text-xl font-bold text-slate-700 flex items-center justify-center gap-1"><Medal className="h-4 w-4 text-amber-400" />#{cohort.rank}</p><p className="text-[10px] text-slate-400 mt-1">of {cohort.total}</p></div>
                </div>
              </div>
            )}

            <div className="avoid-break">
              <p className={`${SECTION} mb-3`}>Expert Assessment</p>
              {assessment ? (
                <div className="space-y-3">
                  <div className="bg-[#1B4F8A]/5 border border-[#1B4F8A]/10 rounded-xl p-4">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#1B4F8A] mb-1">Executive Summary</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{assessment.executiveSummary}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2"><Trophy className="h-3 w-3 text-emerald-600" /><p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">Key Strengths</p></div>
                      {assessment.strengths.map((s, i) => <p key={i} className="text-[10px] text-emerald-800 leading-relaxed mb-1">· {s}</p>)}
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2"><Target className="h-3 w-3 text-red-500" /><p className="text-[9px] font-bold uppercase tracking-wider text-red-600">Weakness Areas</p></div>
                      {assessment.weaknesses.map((s, i) => <p key={i} className="text-[10px] text-red-800 leading-relaxed mb-1">· {s}</p>)}
                    </div>
                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2"><Lightbulb className="h-3 w-3 text-purple-600" /><p className="text-[9px] font-bold uppercase tracking-wider text-purple-700">Development</p></div>
                      {assessment.recommendations.map((r, i) => <p key={i} className="text-[10px] text-purple-800 leading-relaxed mb-1">· {r.action}</p>)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="no-print flex items-center gap-2 text-sm text-slate-400 bg-slate-50 rounded-xl p-4">
                  <Sparkles className="h-4 w-4 shrink-0 text-purple-400" /> Click <strong className="mx-1 text-purple-600">Generate Expert Report</strong> to add the AI analysis.
                </div>
              )}
            </div>

            {moduleBars.length > 0 && (
              <div className="avoid-break">
                <p className={`${SECTION} mb-3`}>Mastery by Module <span className="text-slate-300 font-normal normal-case">· exam-weighted</span></p>
                <div className={moduleRadar.length >= 3 ? "grid grid-cols-3 gap-5 items-center" : ""}>
                  <div className="col-span-2 space-y-3">
                    {moduleBars.map(m => <ScoreBar key={m.label} label={m.label} score={m.pct} detail={m.pct >= 80 ? "Strong" : m.pct >= 60 ? "Developing" : "Weak"} />)}
                  </div>
                  {moduleRadar.length >= 3 && (
                    <div className="flex flex-col items-center">
                      <TopicRadar topics={moduleRadar} />
                      <p className="text-[9px] text-slate-400 uppercase tracking-wider mt-1">Mastery by module</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {examTrajectory.length > 1 && (
              <div className="avoid-break">
                <p className={`${SECTION} mb-3`}>Final Exam — Improvement Trajectory</p>
                <div className="flex items-end gap-4 border border-slate-100 rounded-xl p-4" style={{ height: 130 }}>
                  {examTrajectory.map((a, i) => {
                    const col = sc(a.pct)
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                        <p className="text-xs font-bold mb-1" style={{ color: col.text }}>{a.pct}%</p>
                        <div className="w-full rounded-t-md" style={{ height: `${Math.max(4, a.pct)}%`, background: col.text }} />
                        <p className="text-[9px] text-slate-400 mt-1 uppercase tracking-wide">{i === examTrajectory.length - 1 ? "Final" : `Attempt ${a.attemptNo}`}</p>
                      </div>
                    )
                  })}
                </div>
                {(() => { const g = examTrajectory[examTrajectory.length - 1].pct - examTrajectory[0].pct; return g !== 0 ? <p className={`text-[10px] mt-1.5 ${g > 0 ? "text-emerald-600" : "text-red-500"}`}>{g > 0 ? "▲" : "▼"} {Math.abs(g)} pts from first attempt to final</p> : null })()}
              </div>
            )}
          </div>
          <PageFooter page={pageNo("summary")} total={totalPages} />
        </Page>

        {/* LEARNING JOURNEY — time on task + activities practiced */}
        {hasJourney && (
          <Page>
            <PageHeader title="Learning Journey" subtitle={course.title} today={today} />
            <div className="px-12 py-7 space-y-6">
              <div className="avoid-break">
                <p className={`${SECTION} mb-3`}>Time on Task</p>
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-[#1B4F8A]/5 border-b border-slate-100">
                    <span className="text-xs font-bold text-[#1B4F8A] flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Total time on task</span>
                    <span className="text-sm font-bold text-[#1B4F8A]">{overall.timeSpent > 0 ? fmtTime(overall.timeSpent) : "—"}</span>
                  </div>
                  {modules.map((m, mi) => (
                    <div key={m.id} className={`flex items-center justify-between px-4 py-2 border-b border-slate-50 last:border-0 ${mi % 2 ? "bg-slate-50/60" : ""}`}>
                      <span className="text-[11px] text-slate-600">Module {mi + 1} · {m.title}</span>
                      <span className="text-[11px] font-semibold text-slate-700">{m.timeSpent > 0 ? fmtTime(m.timeSpent) : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>

              {modules.some(m => m.activities.length > 0) && (
                <div className="avoid-break space-y-3">
                  <p className={SECTION}>Activities Practiced</p>
                  {modules.filter(m => m.activities.length > 0).map(m => (
                    <div key={m.id} className="border border-slate-100 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-700">{m.title}</span>
                        <span className="text-[10px] text-slate-400">{statusLabel(m.status)}{m.timeSpent > 0 ? ` · ${fmtTime(m.timeSpent)}` : ""}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {m.activities.map((a, ai) => (
                          <span key={ai} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{a.type.replace(/_/g, " ")} ×{a.count}{a.avgPct != null ? ` · ${a.avgPct}%` : ""}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <PageFooter page={pageNo("journey")} total={totalPages} />
          </Page>
        )}

        {/* PAGES — MODULES */}
        {modules.map((m, mi) => {
          const col = sc(m.masteryScore)
          const es = m.examSection
          return (
            <Page key={m.id}>
              <PageHeader title={`Module ${mi + 1}`} subtitle={course.title} today={today} />
              <div className="px-12 py-7 space-y-5">
                <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-slate-100">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A] bg-blue-50 px-2 py-0.5 rounded-full">Module {mi + 1} of {modules.length}</span>
                    <h2 className="text-xl font-bold text-slate-800 mt-2">{m.title}</h2>
                    <p className="text-[10px] font-bold uppercase mt-1" style={{ color: col.text }}>{statusLabel(m.status)}{m.timeSpent > 0 ? ` · ${fmtTime(m.timeSpent)}` : ""}</p>
                  </div>
                  <div className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center shrink-0" style={{ background: col.bg, border: `1.5px solid ${col.border}` }}>
                    <span className="text-xl font-extrabold" style={{ color: col.text }}>{m.masteryScore !== null ? `${m.masteryScore}%` : "—"}</span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: col.text }}>Mastery</span>
                  </div>
                </div>

                {(m.summary || m.topics.length > 0) && (
                  <div className="avoid-break">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-[#1B4F8A] mb-1.5">Module Overview</p>
                    {m.summary && <p className="text-xs text-slate-500 leading-relaxed mb-2 italic">{m.summary}</p>}
                    <div className="flex flex-wrap gap-1">{m.topics.slice(0, 6).map(t => <span key={t} className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{t}</span>)}</div>
                  </div>
                )}

                {m.masteryScore === null && (
                  <div className="avoid-break flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-purple-400" />
                    Not assessed by the final exam — no exam questions map to this module. Run <strong className="mx-1 text-purple-600">Expert Analyze</strong> in the course builder if you expect exam coverage here.
                  </div>
                )}

                {m.ai && m.masteryScore !== null && (
                  <div className="avoid-break space-y-2">
                    <div className="rounded-xl overflow-hidden border border-blue-100">
                      <div className="bg-[#1B4F8A] px-4 py-2 flex items-center gap-2"><BrainCircuit className="h-3.5 w-3.5 text-white/70" /><p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Expert Analysis</p></div>
                      {m.ai.summary && <div className="bg-blue-50/60 px-4 py-3"><p className="text-xs text-blue-900 leading-relaxed">{m.ai.summary}</p></div>}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3"><p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 mb-1.5">Strengths</p>{m.ai.strengths.map((s, i) => <p key={i} className="text-[10px] text-emerald-800 leading-relaxed mb-1">· {s}</p>)}</div>
                      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3"><p className="text-[9px] font-bold uppercase tracking-wider text-amber-700 mb-1.5">Weaknesses</p>{m.ai.weaknesses.map((s, i) => <p key={i} className="text-[10px] text-amber-800 leading-relaxed mb-1">· {s}</p>)}</div>
                      <div className="bg-purple-50 border border-purple-100 rounded-xl p-3"><p className="text-[9px] font-bold uppercase tracking-wider text-purple-700 mb-1.5">Development</p>{m.ai.development.map((s, i) => <p key={i} className="text-[10px] text-purple-800 leading-relaxed mb-1">· {s}</p>)}</div>
                    </div>
                  </div>
                )}

                {m.items.length > 0 && (
                  <div className="avoid-break">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-[#1B4F8A] mb-2">Coursework — What the learner did</p>
                    <div className="rounded-xl border border-slate-100 overflow-hidden">
                      {m.items.map((it, ii) => {
                        const ok = it.passed === true || (it.pct ?? 0) >= 70
                        const partial = !ok && (it.pct ?? 0) >= 40
                        return (
                          <div key={ii}>
                            <div className={`flex items-center gap-2 px-3 py-1.5 border-b border-slate-50 last:border-0 ${ii % 2 ? "bg-slate-50/60" : ""}`}>
                              {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> : partial ? <MinusCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                              <span className="text-[11px] text-slate-600 flex-1">{it.title}</span>
                              {it.activity_type && <span className="text-[8px] font-bold uppercase bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">{it.activity_type.replace(/_/g, " ")}</span>}
                              <span className="text-[11px] font-bold w-9 text-right" style={{ color: sc(it.pct).text }}>{it.pct != null ? `${it.pct}%` : "✓"}</span>
                            </div>
                            {it.ai && <div className="bg-blue-50 border-t border-blue-100 px-3 py-2"><p className="text-[8px] font-bold uppercase tracking-wider text-blue-700 mb-0.5">Expert evaluation</p><p className="text-[10px] text-blue-800 leading-relaxed">{it.ai}</p></div>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {es && es.questions.length > 0 && (
                  <div className="avoid-break space-y-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-[#1B4F8A]">Final Exam — this module&apos;s section</p>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { label: "Questions", val: es.questions.length, color: "bg-slate-100 text-slate-700" },
                        { label: "Correct", val: es.correct, color: "bg-emerald-50 text-emerald-700" },
                        { label: "Zero", val: es.zero, color: "bg-red-50 text-red-600" },
                        { label: "Points", val: `${es.earned}/${es.possible}`, color: "bg-blue-50 text-blue-700" },
                      ].map(s => <div key={s.label} className={`px-3 py-1.5 rounded-lg text-center ${s.color}`}><p className="text-xs font-bold">{s.val}</p><p className="text-[9px] uppercase tracking-wide opacity-70">{s.label}</p></div>)}
                    </div>
                    <ScoreBar label="Exam section score" score={es.pct} detail={`${es.correct}/${es.questions.length} correct`} />
                    <div className="rounded-xl border border-slate-100 overflow-hidden">
                      {es.questions.map((q, qi) => {
                        const full = q.scoreAchieved >= q.points && q.points > 0
                        return (
                          <div key={qi} className={`flex items-start gap-3 px-4 py-2 border-b border-slate-50 last:border-0 ${qi % 2 ? "bg-slate-50/60" : ""}`}>
                            <div className="mt-0.5 shrink-0">{full ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />}</div>
                            <p className="flex-1 text-[11px] text-slate-600 leading-relaxed">{q.text}</p>
                            <span className="text-[11px] font-bold text-slate-700 shrink-0">{q.scoreAchieved}<span className="text-slate-300 font-normal">/{q.points}</span></span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              <PageFooter page={pageNo(`mod-${m.id}`)} total={totalPages} />
            </Page>
          )
        })}

        {/* FINAL EXAM — overall result + per-section analysis (from the course-builder sections) */}
        {exam && (
          <Page>
            <PageHeader title="Final Exam Analysis" subtitle={course.title} today={today} />
            <div className="px-12 py-7 space-y-6">
              <div className="avoid-break flex items-start justify-between gap-4 pb-4 border-b-2 border-slate-100">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A] bg-blue-50 px-2 py-0.5 rounded-full">Final Exam</span>
                  <h2 className="text-xl font-bold text-slate-800 mt-2">{exam.title}</h2>
                  <p className="text-xs text-slate-400 mt-1">{exam.attempts}/{exam.maxAttempts} attempt(s) · pass mark {exam.passMark}%</p>
                </div>
                <div className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center shrink-0" style={{ background: exam.passed ? "#d1fae5" : "#fee2e2" }}>
                  <span className="text-xl font-extrabold" style={{ color: exam.passed ? "#059669" : "#DC2626" }}>{exam.pct}%</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: exam.passed ? "#059669" : "#DC2626" }}>{exam.passed ? "Passed" : "Failed"}</span>
                </div>
              </div>

              {examSections.length > 0 ? (
                <div className="avoid-break space-y-4">
                  <p className={SECTION}>Performance by Section</p>
                  {examSections.map((s, si) => {
                    const col = sc(s.pct)
                    return (
                      <div key={si} className="border border-slate-100 rounded-xl overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                          <span className="text-xs font-bold text-slate-800 flex-1">{s.title}</span>
                          <div className="flex gap-1.5">
                            <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">{s.correct} full</span>
                            {s.partial > 0 && <span className="text-[9px] px-2 py-0.5 rounded bg-amber-50 text-amber-700">{s.partial} partial</span>}
                            <span className="text-[9px] px-2 py-0.5 rounded bg-red-50 text-red-600">{s.zero} zero</span>
                          </div>
                          <span className="text-sm font-bold w-12 text-right" style={{ color: col.text }}>{s.pct}%</span>
                        </div>
                        <div className="px-4 py-2">
                          <ScoreBar label={`${s.correct}/${s.questionCount} correct`} score={s.pct} detail={`${s.earned}/${s.possible} pts`} />
                          <div className="mt-2 rounded-lg border border-slate-100 overflow-hidden">
                            {s.questions.map((q, qi) => {
                              const full = q.scoreAchieved >= q.points && q.points > 0
                              const part = q.scoreAchieved > 0 && !full
                              return (
                                <div key={qi} className={`flex items-start gap-2 px-3 py-1.5 border-b border-slate-50 last:border-0 ${qi % 2 ? "bg-slate-50/60" : ""}`}>
                                  {full ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" /> : part ? <MinusCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" /> : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />}
                                  <p className="flex-1 text-[11px] text-slate-600 leading-relaxed">{q.text}</p>
                                  <span className="text-[11px] font-bold text-slate-700 shrink-0">{q.scoreAchieved}<span className="text-slate-300 font-normal">/{q.points}</span></span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="no-print flex items-center gap-2 text-sm text-slate-400 bg-slate-50 rounded-xl p-4">
                  <Sparkles className="h-4 w-4 shrink-0 text-purple-400" /> Run <strong className="mx-1 text-purple-600">Expert Analyze</strong> in the course builder to break the exam into sections mapped to the course modules.
                </div>
              )}
            </div>
            <PageFooter page={pageNo("exam")} total={totalPages} />
          </Page>
        )}

        {/* ASSIGNMENTS */}
        {hasAssignments && (
          <Page>
            <PageHeader title="Assignments" subtitle={course.title} today={today} />
            <div className="px-12 py-7 space-y-4">
              <p className={SECTION}>Submitted Work &amp; Instructor Feedback</p>
              {assignments.map((a, i) => {
                const pct = a.score != null && a.maxScore ? Math.round((a.score / a.maxScore) * 100) : null
                return (
                  <div key={i} className="avoid-break border border-slate-100 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-[#1B4F8A]" /><p className="text-sm font-semibold text-slate-700">{a.title}</p></div>
                      {a.score != null
                        ? <p className="text-lg font-bold" style={{ color: sc(pct).text }}>{a.score}{a.maxScore ? <span className="text-slate-300 text-sm font-normal">/{a.maxScore}</span> : ""}</p>
                        : <span className="text-[10px] uppercase tracking-wide text-slate-400 capitalize">{a.status}</span>}
                    </div>
                    {a.note && <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2"><p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 mb-0.5">Instructor note</p><p className="text-[11px] text-emerald-900 leading-relaxed">{a.note}</p></div>}
                  </div>
                )
              })}
            </div>
            <PageFooter page={pageNo("assignments")} total={totalPages} />
          </Page>
        )}

        {/* ATTENDANCE */}
        {hasAttendance && (
          <Page>
            <PageHeader title="Attendance" subtitle={course.title} today={today} />
            <div className="px-12 py-7 space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0" style={{ background: sc(overall.attendancePct).bg }}>
                  <span className="text-lg font-extrabold" style={{ color: sc(overall.attendancePct).text }}>{overall.attendancePct ?? 0}%</span>
                </div>
                <div>
                  <p className={SECTION}>Attendance Rate</p>
                  <p className="text-sm text-slate-600 mt-1 flex items-center gap-1.5"><CalendarCheck className="h-4 w-4 text-slate-400" />{overall.presentCount} of {overall.sessionTotal} sessions attended</p>
                </div>
              </div>
            </div>
            <PageFooter page={pageNo("attendance")} total={totalPages} />
          </Page>
        )}

        {/* LEARNER FEEDBACK — only when the course collects it by name */}
        {hasFeedback && feedback && (
          <Page>
            <PageHeader title="Learner Feedback" subtitle={course.title} today={today} />
            <div className="px-12 py-7 space-y-5">
              <p className={SECTION}>Course Feedback — in the learner&apos;s words</p>
              {feedback.ratings.length > 0 && (
                <div className="space-y-2 max-w-md">
                  {feedback.ratings.map((r, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-xs text-slate-600">{r.label}</span>
                      <span className="flex gap-0.5">{[1, 2, 3, 4, 5].map(n => <Star key={n} className={`h-3.5 w-3.5 ${r.value != null && n <= Math.round(r.value) ? "text-amber-400 fill-amber-400" : "text-slate-200"}`} />)}</span>
                    </div>
                  ))}
                </div>
              )}
              {feedback.comment && (
                <div className="border-l-2 border-[#1B4F8A]/30 pl-4"><MessageSquareText className="h-4 w-4 text-slate-300 mb-1" /><p className="text-sm text-slate-600 italic leading-relaxed">&ldquo;{feedback.comment}&rdquo;</p></div>
              )}
            </div>
            <PageFooter page={pageNo("feedback")} total={totalPages} />
          </Page>
        )}

        {/* RECOMMENDATIONS */}
        {hasAI && assessment && (
          <Page>
            <PageHeader title="Recommendations" subtitle={course.title} today={today} />
            <div className="px-12 py-7 space-y-3">
              <div className="flex items-center gap-2 mb-2"><TrendingUp className="h-4 w-4 text-[#1B4F8A]" /><p className={SECTION}>Recommendations based on results</p></div>
              {assessment.recommendations.map((rec, i) => {
                const col = sc(rec.score)
                return (
                  <div key={i} className="avoid-break flex items-start gap-4 p-4 border border-slate-100 rounded-xl bg-slate-50/80">
                    <div className="w-8 h-8 rounded-full bg-[#1B4F8A] flex items-center justify-center text-white text-sm font-bold shrink-0">{i + 1}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-slate-700">{rec.area}</p>
                        {rec.score !== null && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: col.bg, color: col.text }}>{rec.score}%</span>}
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{rec.action}</p>
                    </div>
                  </div>
                )
              })}
              <div className="avoid-break border-t border-slate-100 pt-6 mt-4 flex flex-col items-center gap-2 text-center">
                <Image src="/logo/logo-dark-blue.png" alt="ICS" width={80} height={22} className="object-contain opacity-20" />
                <p className="text-[10px] text-slate-300 uppercase tracking-widest">ICS Aviation · Integrated Consulting Services</p>
              </div>
            </div>
            <PageFooter page={pageNo("reco")} total={totalPages} />
          </Page>
        )}

        {/* SECURITY PAGE */}
        {showSecurity && security && (
          <Page>
            <PageHeader title="Security & Integrity" subtitle={course.title} today={today} />
            <div className="px-12 py-7 space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0" style={{ background: riskColor(security.riskLevel).b }}>
                  <ShieldAlert className="h-7 w-7" style={{ color: riskColor(security.riskLevel).t }} />
                </div>
                <div>
                  <p className={SECTION}>Integrity Risk</p>
                  <p className="text-2xl font-bold capitalize" style={{ color: riskColor(security.riskLevel).t }}>{security.riskLevel}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[["Tab switches", security.tabs], ["Fullscreen exits", security.fs], ["Right-clicks", security.rightClicks], ["Copy / paste", security.copyAttempts]].map(([l, v]) => (
                  <div key={l as string} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-center"><p className="text-lg font-bold">{v as number}</p><p className="text-[9px] uppercase tracking-wide opacity-70">{l as string}</p></div>
                ))}
              </div>
              {security.analysis ? (
                <div className="rounded-xl overflow-hidden border border-blue-100">
                  <div className="bg-[#1B4F8A] px-4 py-2 flex items-center gap-2"><BrainCircuit className="h-3.5 w-3.5 text-white/70" /><p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Expert Integrity Assessment</p></div>
                  <div className="bg-blue-50/60 px-4 py-3"><p className="text-sm text-blue-900 leading-relaxed">{security.analysis}</p></div>
                </div>
              ) : (
                <div className="no-print flex items-center gap-2 text-sm text-slate-400 bg-slate-50 rounded-xl p-4">
                  <Sparkles className="h-4 w-4 shrink-0 text-purple-400" /> Click <strong className="mx-1 text-purple-600">Generate Expert Report</strong> (with the security option enabled) to add the AI integrity assessment.
                </div>
              )}
            </div>
            <PageFooter page={pageNo("security")} total={totalPages} />
          </Page>
        )}
      </div>
    </>
  )
}
