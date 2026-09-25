import { CheckCircle2, XCircle, Clock, Scale } from "lucide-react"
import type { PassResult, ComponentResult } from "@/lib/lms-pass-rule"

// A participant's standing against the course's pass rule. Plain markup, so it
// renders on the server (participant's course page) and in client screens.

export function ComponentBadge({ c }: { c: ComponentResult }) {
  if (c.met === true) return <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
  if (c.met === false) return <XCircle className="h-4 w-4 text-red-500 shrink-0" />
  return <Clock className="h-4 w-4 text-slate-400 shrink-0" />
}

export function ResultPill({ r }: { r: PassResult | null }) {
  if (!r) return <span className="text-xs text-slate-400">—</span>
  if (r.passed) return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Passed</span>
  if (r.pending) return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">In progress</span>
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">Not passed</span>
}

/** The participant's own result card (only for a course with a pass rule). */
export function PassResultCard({ r }: { r: PassResult }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2"><Scale className="h-5 w-5 text-[#1B4F8A]" /> Your result</h2>
        <div className="flex items-center gap-3">
          {r.score !== null && <p className="text-sm text-slate-600">Score <b className="text-slate-900">{r.score}%</b>{r.passMark !== null && <span className="text-slate-400"> / pass {r.passMark}%</span>}</p>}
          <ResultPill r={r} />
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {r.components.map(c => (
          <div key={c.key} className="flex items-center gap-3 px-5 py-2.5">
            <ComponentBadge c={c} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">{c.label}
                <span className="text-xs font-normal text-slate-400"> · {c.weight > 0 ? `${c.weight}% of the score` : "not scored"}{c.required ? " · required" : ""}</span></p>
              <p className="text-xs text-slate-500 truncate">{c.detail}{c.required && c.requirement && c.key !== "result" ? ` — needs: ${c.requirement}` : ""}</p>
            </div>
            <p className="text-sm font-semibold text-slate-700 shrink-0">{c.score !== null ? `${c.score}%` : "—"}</p>
          </div>
        ))}
      </div>
      {!r.passed && r.reasons.length > 0 && (
        <p className="px-5 py-2.5 text-xs text-slate-500 bg-slate-50 border-t border-slate-100">{r.pending ? "Still to come: " : ""}{r.reasons.slice(0, 4).join(" · ")}</p>
      )}
    </div>
  )
}
