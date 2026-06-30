"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Printer, BrainCircuit, RefreshCw, Loader2,
  CheckCircle2, XCircle, MinusCircle, Sparkles, Award,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { CourseReport } from "@/lib/lms-course-report"

function scoreColor(p: number | null) { return p === null ? "#94a3b8" : p >= 80 ? "#059669" : p >= 60 ? "#D97706" : "#DC2626" }
function statusLabel(s: string) { return ({ passed: "Passed", failed: "Failed", in_progress: "In progress", not_started: "Not started" } as Record<string, string>)[s] ?? s }
function fmtTime(s: number) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m` }

function Ring({ score, completed }: { score: number; completed: boolean }) {
  const size = 120, sw = 10, r = (size - sw) / 2, circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(score, 100) / 100)
  const col = completed ? "#34d399" : "#60a5fa"
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={sw} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white leading-none">{score}%</span>
        <span className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: col }}>{completed ? "Completed" : "In progress"}</span>
      </div>
    </div>
  )
}

const LBL = "text-[11px] font-bold uppercase tracking-widest text-slate-400"

export default function StudentCourseReportView({ params }: { params: Promise<{ courseId: string; studentId: string }> }) {
  const { courseId, studentId } = use(params)
  const [report, setReport] = useState<CourseReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetch(`/api/lms/reports/student/${studentId}/${courseId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setReport(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [studentId, courseId])

  async function generateAssessment() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/lms/reports/student/${studentId}/${courseId}/expert-assessment`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed to generate"); return }
      setReport(prev => prev ? { ...prev, assessment: { ...data.assessment, generated_at: data.generated_at } } : prev)
      toast.success("Expert assessment generated")
    } catch { toast.error("Failed to generate") }
    finally { setGenerating(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
  if (!report) return (
    <div className="max-w-3xl mx-auto py-16 text-center text-slate-400">
      <p>Report not found for this student.</p>
      <Link href={`/lms-admin/reports/${courseId}`} className="text-sm text-[#1B4F8A] underline mt-3 inline-block">← Back to course report</Link>
    </div>
  )

  const { student, course, enrollment, overall, modules, exam, topicMastery, assessment } = report
  const completed = enrollment.status === "completed"
  const overallScore = overall.score ?? 0

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-12">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href={`/lms-admin/reports/${courseId}`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
          <span className="font-medium text-slate-800">{student.name}</span>
        </div>
        <Link href={`/print/lms/student/${studentId}/${courseId}`} target="_blank">
          <Button size="sm" variant="outline" className="gap-1.5"><Printer className="h-3.5 w-3.5" /> Print / PDF</Button>
        </Link>
      </div>

      {/* Hero */}
      <div className="rounded-2xl bg-[#1B4F8A] text-white p-6 flex items-center gap-6 flex-wrap">
        <Ring score={overallScore} completed={completed} />
        <div className="flex-1 min-w-[200px]">
          <p className="text-[11px] uppercase tracking-[0.3em] text-white/50 mb-1">Individual Course Report</p>
          <h1 className="text-2xl font-bold">{student.name}</h1>
          <p className="text-white/60 text-sm mt-0.5">{[student.job_title, student.company].filter(Boolean).join(" · ")}</p>
          <p className="text-white/80 text-sm mt-2 font-medium">{course.title}</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center"><p className="text-xl font-bold">{overall.completionPct}%</p><p className="text-white/40 text-[10px] uppercase tracking-wider">Completion</p></div>
          {overall.timeSpent > 0 && <div className="text-center"><p className="text-xl font-bold">{fmtTime(overall.timeSpent)}</p><p className="text-white/40 text-[10px] uppercase tracking-wider">Time</p></div>}
        </div>
      </div>

      {/* Score summary */}
      <div className="grid grid-cols-3 divide-x divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white">
        {[
          { label: "Overall Score", value: overall.score !== null ? `${overall.score}%` : "—", color: scoreColor(overall.score), sub: completed ? "Completed" : "In progress" },
          { label: "Completion", value: `${overall.completionPct}%`, color: "#1B4F8A", sub: `${modules.filter(m => m.status === "passed").length}/${modules.length} modules passed` },
          { label: "Final Exam", value: exam?.pct != null ? `${exam.pct}%` : "—", color: exam ? (exam.passed ? "#059669" : "#DC2626") : "#94a3b8", sub: exam ? `${exam.passed ? "Passed" : "Not passed"} · ${exam.attempts}/${exam.maxAttempts}` : "Not attempted" },
        ].map(s => (
          <div key={s.label} className="py-4 px-3 text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] text-slate-400 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Expert assessment */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-purple-600" />
            <p className={LBL}>Expert Assessment</p>
          </div>
          {assessment ? (
            <Button size="sm" variant="outline" onClick={generateAssessment} disabled={generating} className="gap-1.5 text-xs">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Regenerate
            </Button>
          ) : (
            <Button size="sm" onClick={generateAssessment} disabled={generating} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Generating…" : "Generate AI assessment"}
            </Button>
          )}
        </div>
        {assessment ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700 leading-relaxed">{assessment.narrative}</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1.5">Strengths</p>
                <div className="flex flex-wrap gap-1.5">{assessment.strengths.map((s, i) => <span key={i} className="text-[11px] bg-white text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">{s}</span>)}</div>
              </div>
              <div className="bg-purple-50 border border-purple-100 rounded-lg p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700 mb-1.5">Development areas</p>
                <div className="flex flex-wrap gap-1.5">{assessment.development.map((s, i) => <span key={i} className="text-[11px] bg-white text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">{s}</span>)}</div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No expert assessment yet. Click <span className="text-purple-600 font-medium">Generate AI assessment</span> to produce an AI summary grounded in this learner&apos;s results.</p>
        )}
      </div>

      {/* Topic mastery */}
      {topicMastery.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className={`${LBL} mb-3`}>Topic Mastery</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            {topicMastery.slice(0, 12).map(t => (
              <div key={t.topic} className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-600 truncate">{t.topic}</span>
                <span className="text-[10px] font-bold shrink-0" style={{ color: t.level === "strong" ? "#059669" : t.level === "developing" ? "#D97706" : "#DC2626" }}>
                  {t.level === "strong" ? "Strong" : t.level === "developing" ? "Developing" : "Weak"} · {t.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Module breakdown */}
      <div className="space-y-3">
        <p className={LBL}>Module Breakdown</p>
        {modules.map((m, mi) => (
          <div key={m.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <span className="w-5 h-5 rounded-md bg-[#1B4F8A] text-white text-[10px] font-bold flex items-center justify-center">{mi + 1}</span>
              <span className="text-sm font-semibold text-slate-800 flex-1">{m.title}</span>
              <span className="text-sm font-bold" style={{ color: scoreColor(m.score) }}>{m.score !== null ? `${m.score}%` : "—"}</span>
              <span className="text-[10px] font-bold uppercase" style={{ color: scoreColor(m.score) }}>{statusLabel(m.status)}</span>
            </div>
            {(m.summary || m.topics.length > 0) && (
              <div className="px-4 py-3 border-b border-dashed border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#1B4F8A] mb-1.5">Module overview</p>
                {m.summary && <p className="text-xs text-slate-500 leading-relaxed mb-2 italic">{m.summary}</p>}
                <div className="flex flex-wrap gap-1">{m.topics.slice(0, 6).map(t => <span key={t} className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{t}</span>)}</div>
              </div>
            )}
            <div className="px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#1B4F8A] mb-2">What the learner did{m.timeSpent > 0 ? ` · ${fmtTime(m.timeSpent)}` : ""}</p>
              {m.items.length > 0 ? (
                <div className="rounded-lg border border-slate-100 overflow-hidden">
                  {m.items.map((it, ii) => {
                    const ok = it.passed === true || (it.pct ?? 0) >= 70
                    const partial = !ok && (it.pct ?? 0) >= 40
                    return (
                      <div key={ii}>
                        <div className={cn("flex items-center gap-2 px-3 py-1.5 border-b border-slate-50 last:border-0", ii % 2 && "bg-slate-50/60")}>
                          {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> : partial ? <MinusCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                          <span className="text-xs text-slate-600 flex-1">{it.title}</span>
                          {it.activity_type && <span className="text-[8px] font-bold uppercase bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">{it.activity_type.replace(/_/g, " ")}</span>}
                          <span className="text-xs font-bold w-9 text-right" style={{ color: scoreColor(it.pct) }}>{it.pct != null ? `${it.pct}%` : "✓"}</span>
                        </div>
                        {it.ai && (
                          <div className="bg-blue-50 border-t border-blue-100 px-3 py-2">
                            <p className="text-[8px] font-bold uppercase tracking-wider text-blue-700 mb-0.5">Expert evaluation</p>
                            <p className="text-[11px] text-blue-800 leading-relaxed">{it.ai}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : <p className="text-[11px] text-slate-300 italic">No graded items recorded.</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
