"use client"

import { useEffect, useState } from "react"
import { Loader2, TrendingUp, UserCheck, BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"

// The group's Feedback tab (admins): module and instructor evaluations, and
// the impact questionnaire.

type Summary = {
  id: string; title: string; responses: number; overall: number | null
  criteria: { key: string; label: string; avg: number | null }[]
  comments: { text: string; by: string | null; at: string }[]
}
type Data = {
  settings: { evaluate_modules: boolean; evaluate_instructors: boolean; impact_enabled: boolean } | null
  anonymous: boolean
  modules: Summary[]; instructors: Summary[]
  impact: { responses: number; avg_score: number | null; answers: { score: number | null; example: string | null; barriers: string | null; by: string | null; at: string }[] }
}

const tone = (v: number | null) => (v === null ? "text-slate-400" : v >= 4 ? "text-emerald-700" : v >= 3 ? "text-amber-700" : "text-red-600")

function SummaryCard({ s }: { s: Summary }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-3">
        <p className="flex-1 font-semibold text-slate-800 text-sm">{s.title}</p>
        <p className="text-xs text-slate-500">{s.responses} response{s.responses === 1 ? "" : "s"}</p>
        <p className={cn("text-lg font-bold", tone(s.overall))}>{s.overall ?? "—"}<span className="text-xs text-slate-400 font-normal"> / 5</span></p>
      </div>
      {s.responses > 0 && (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
          {s.criteria.map(c => <p key={c.key} className="text-xs text-slate-600 flex justify-between"><span>{c.label}</span><span className={cn("font-semibold", tone(c.avg))}>{c.avg ?? "—"}</span></p>)}
        </div>
      )}
      {s.comments.length > 0 && (
        <div className="space-y-1 pt-1">
          {s.comments.map((c, i) => <p key={i} className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5">“{c.text}”{c.by && <span className="text-slate-400"> — {c.by}</span>}</p>)}
        </div>
      )}
    </div>
  )
}

export function GroupFeedback({ groupId }: { groupId: string }) {
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch(`/api/lms/groups/${groupId}/evaluations`).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setError(j.error ?? "Could not load the feedback"); else setD(j)
    })
  }, [groupId])

  if (error) return <p className="text-sm text-slate-500 py-8 text-center">{error}</p>
  if (!d) return <div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
  const s = d.settings
  const nothingOn = s && !s.evaluate_modules && !s.evaluate_instructors && !s.impact_enabled

  return (
    <div className="space-y-6">
      {nothingOn && <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">Evaluation and the impact questionnaire are off for this course. Switch them on in the course&apos;s Settings → Evaluation &amp; impact.</p>}
      {d.anonymous && <p className="text-xs text-slate-400">This course&apos;s feedback is anonymous — names are not shown.</p>}

      {(s?.evaluate_instructors || d.instructors.some(x => x.responses)) && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><UserCheck className="h-4 w-4 text-[#1B4F8A]" /> Instructors</h3>
          {d.instructors.length ? d.instructors.map(x => <SummaryCard key={x.id} s={x} />) : <p className="text-sm text-slate-400">No instructors on this group.</p>}
        </section>
      )}

      {(s?.evaluate_modules || d.modules.length > 0) && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><BookOpen className="h-4 w-4 text-[#1B4F8A]" /> Modules</h3>
          {d.modules.length ? d.modules.map(x => <SummaryCard key={x.id} s={x} />) : <p className="text-sm text-slate-400">No module ratings yet.</p>}
        </section>
      )}

      {(s?.impact_enabled || d.impact.responses > 0) && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-[#1B4F8A]" /> Impact on the job</h3>
          <div className="border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-3">
              <p className="flex-1 text-sm text-slate-700">Impact score (average) — separate from the course result</p>
              <p className="text-xs text-slate-500">{d.impact.responses} response{d.impact.responses === 1 ? "" : "s"}</p>
              <p className="text-lg font-bold text-[#1B4F8A]">{d.impact.avg_score ?? "—"}{d.impact.avg_score !== null && "%"}</p>
            </div>
            {d.impact.answers.filter(a => a.example || a.barriers).map((a, i) => (
              <div key={i} className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 space-y-0.5">
                {a.example && <p><span className="text-slate-400">Used it:</span> {a.example}</p>}
                {a.barriers && <p><span className="text-slate-400">What stopped them:</span> {a.barriers}</p>}
                <p className="text-slate-400">{a.score}%{a.by ? ` — ${a.by}` : ""}</p>
              </div>
            ))}
            {!d.impact.responses && <p className="text-xs text-slate-400">Asked some months after each participant completes the course.</p>}
          </div>
        </section>
      )}
    </div>
  )
}
