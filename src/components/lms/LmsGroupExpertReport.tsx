"use client"

import { useState } from "react"
import { BrainCircuit, Loader2, RefreshCw, Sparkles, TrendingUp, AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react"
import { toast } from "sonner"

type Assessment = {
  executive_summary: string
  strengths: string[]
  improvements: string[]
  recommendations: string[]
  at_risk_patterns: string
}

export default function LmsGroupExpertReport({
  courseId, initial, initialAt,
}: {
  courseId: string
  initial: Assessment | null
  initialAt: string | null
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(initial)
  const [generatedAt, setGeneratedAt] = useState<string | null>(initialAt)
  const [loading, setLoading] = useState(false)

  async function generate() {
    setLoading(true)
    try {
      const res = await fetch(`/api/lms/reports/course/${courseId}/expert-assessment`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed to generate"); return }
      setAssessment(data.assessment)
      setGeneratedAt(data.generated_at)
      toast.success("Expert report generated")
    } catch { toast.error("Failed to generate report") }
    finally { setLoading(false) }
  }

  if (!assessment) {
    return (
      <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
            <BrainCircuit className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-800 text-sm">Expert Cohort Report</p>
            <p className="text-xs text-slate-500 mt-0.5">AI-written analysis of how the whole class performed — strengths, weak modules, and what to do next.</p>
          </div>
        </div>
        <button onClick={generate} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 shrink-0">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Generating…" : "Generate Expert Report"}
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-purple-200 bg-white overflow-hidden">
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-white" />
          <span className="text-sm font-semibold text-white">Expert Cohort Report</span>
        </div>
        <button onClick={generate} disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium text-white/90 hover:text-white transition-colors">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {loading ? "Regenerating…" : "Regenerate"}
        </button>
      </div>

      <div className="p-5 space-y-5">
        {assessment.executive_summary && (
          <p className="text-sm text-slate-700 leading-relaxed">{assessment.executive_summary}</p>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {assessment.strengths.length > 0 && (
            <Panel icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} title="Cohort Strengths" tint="emerald">
              {assessment.strengths.map((s, i) => <li key={i}>{s}</li>)}
            </Panel>
          )}
          {assessment.improvements.length > 0 && (
            <Panel icon={<TrendingUp className="h-4 w-4 text-rose-600" />} title="Needs Attention" tint="rose">
              {assessment.improvements.map((s, i) => <li key={i}>{s}</li>)}
            </Panel>
          )}
        </div>

        {assessment.recommendations.length > 0 && (
          <Panel icon={<Lightbulb className="h-4 w-4 text-amber-600" />} title="Recommendations for the Instructor" tint="amber">
            {assessment.recommendations.map((s, i) => <li key={i}>{s}</li>)}
          </Panel>
        )}

        {assessment.at_risk_patterns && assessment.at_risk_patterns !== "None significant." && (
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 p-3.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-0.5">At-Risk Pattern</p>
              <p className="text-sm text-slate-700">{assessment.at_risk_patterns}</p>
            </div>
          </div>
        )}

        {generatedAt && (
          <p className="text-[11px] text-slate-400">Generated {new Date(generatedAt).toLocaleString("en-GB")}</p>
        )}
      </div>
    </div>
  )
}

const TINTS: Record<string, string> = {
  emerald: "bg-emerald-50/40 border-emerald-100",
  rose:    "bg-rose-50/40 border-rose-100",
  amber:   "bg-amber-50/40 border-amber-100",
}
function Panel({ icon, title, tint, children }: { icon: React.ReactNode; title: string; tint: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-4 ${TINTS[tint] ?? TINTS.emerald}`}>
      <div className="flex items-center gap-1.5 mb-2">{icon}<p className="text-xs font-bold uppercase tracking-wider text-slate-600">{title}</p></div>
      <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-4">{children}</ul>
    </div>
  )
}
