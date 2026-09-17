"use client"

import { useState } from "react"
import { Star, Eye, X, MessageSquare, ThumbsUp } from "lucide-react"
import { cn } from "@/lib/utils"

// Shared admin view of feedback responses (course feedback and program surveys).

export type ResponseRow = {
  id: string
  ratings: Record<string, number | null>
  recommend: "yes" | "maybe" | "no" | null
  comments: { wentWell?: string | null; improve?: string | null; general?: string | null }
  is_anonymous: boolean
  submitted_at: string
  asked_reason?: "completed" | "attempts_exhausted"
  program?: { id: string; name: string } | null
  student: { id: string; name: string; email: string } | null
}

export function Stars({ rating }: { rating: number | null }) {
  if (rating === null || rating === undefined) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} of 5`}>
      {[1, 2, 3, 4, 5].map(n => <Star key={n} className={cn("h-3.5 w-3.5", n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-200 fill-slate-100")} />)}
    </span>
  )
}

const fmt = (d: string, long = false) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: long ? "long" : "short", year: "numeric" })

export default function FeedbackResponses({ rows, dimensions }: { rows: ResponseRow[]; dimensions: { key: string; label: string }[] }) {
  const [modal, setModal] = useState<ResponseRow | null>(null)

  const avg = (key: string) => {
    const vals = rows.map(r => r.ratings[key]).filter((v): v is number => typeof v === "number")
    return vals.length ? { value: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10, n: vals.length } : null
  }
  const dims = dimensions.filter(d => avg(d.key))
  const rec = rows.filter(r => r.recommend)
  const recYes = rec.filter(r => r.recommend === "yes").length
  const comments = rows.flatMap(r => [
    r.comments.wentWell && { kind: "Went well", text: r.comments.wentWell, id: r.id },
    r.comments.improve && { kind: "Improve", text: r.comments.improve, id: r.id },
    r.comments.general && { kind: "Comment", text: r.comments.general, id: r.id },
  ].filter(Boolean) as { kind: string; text: string; id: string }[])

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-border rounded-xl py-20 text-center text-muted-foreground">
        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
        No feedback submitted yet.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {dims.map(d => {
          const a = avg(d.key)!
          return (
            <div key={d.key} className="bg-white border border-border rounded-xl p-4 flex flex-col gap-2">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{d.label}</p>
              <p className="text-2xl font-bold text-slate-800">{a.value.toFixed(1)}</p>
              <Stars rating={Math.round(a.value)} />
              <p className="text-[10px] text-muted-foreground">{a.n} rating{a.n !== 1 ? "s" : ""}</p>
            </div>
          )
        })}
        {rec.length > 0 && (
          <div className="bg-white border border-border rounded-xl p-4 flex flex-col gap-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Would recommend</p>
            <p className="text-2xl font-bold text-emerald-700">{Math.round((recYes / rec.length) * 100)}%</p>
            <p className="text-[11px] text-muted-foreground">
              {recYes} yes · {rec.filter(r => r.recommend === "maybe").length} maybe · {rec.filter(r => r.recommend === "no").length} no
            </p>
          </div>
        )}
      </div>

      {comments.length > 0 && (
        <div className="bg-white border border-border rounded-xl p-5 space-y-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Comments</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {comments.map((c, i) => (
              <div key={i} className={cn("rounded-lg px-3 py-2 text-sm leading-relaxed border-l-2",
                c.kind === "Went well" ? "border-emerald-300 bg-emerald-50/40" : c.kind === "Improve" ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-slate-50")}>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">{c.kind}</p>
                <p className="text-slate-700 whitespace-pre-line">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-slate-50 border-b border-border">
            <tr>
              {["#", "Student", "Overall", "Recommend", "Submitted", ""].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3.5 text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-3.5">
                  {r.is_anonymous || !r.student
                    ? <span className="italic text-muted-foreground">Anonymous</span>
                    : <div><p className="font-medium text-slate-800">{r.student.name}</p><p className="text-xs text-muted-foreground">{r.student.email}</p></div>}
                  {(r.program || r.asked_reason === "attempts_exhausted") && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {[r.program?.name, r.asked_reason === "attempts_exhausted" ? "after exam attempts ran out" : null].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3.5"><Stars rating={r.ratings.overall ?? null} /></td>
                <td className="px-4 py-3.5 text-xs capitalize">{r.recommend ?? "—"}</td>
                <td className="px-4 py-3.5 text-muted-foreground text-xs">{fmt(r.submitted_at)}</td>
                <td className="px-4 py-3.5">
                  <button onClick={() => setModal(r)}
                    className="inline-flex items-center gap-1 text-xs font-medium border border-border rounded-lg px-2.5 py-1 hover:bg-slate-100 transition-colors text-muted-foreground hover:text-slate-800">
                    <Eye className="h-3.5 w-3.5" /> View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-white rounded-2xl border border-border w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true">
            <div className="px-6 pt-6 pb-4 border-b border-border flex items-start justify-between">
              <div>
                <p className="font-semibold text-slate-800">{modal.is_anonymous || !modal.student ? "Anonymous" : modal.student.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Submitted {fmt(modal.submitted_at, true)}</p>
              </div>
              <button onClick={() => setModal(null)} aria-label="Close" className="p-1 rounded-lg hover:bg-slate-100 text-muted-foreground hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-1">
              {dimensions.map(d => {
                const val = modal.ratings[d.key] ?? null
                if (val === null && d.key === "instructor") return null
                return (
                  <div key={d.key} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                    <span className="text-sm text-muted-foreground">{d.label}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-700 w-8 text-right">{val !== null ? `${val}/5` : "—"}</span>
                      <Stars rating={val} />
                    </span>
                  </div>
                )
              })}
              {modal.recommend && (
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5"><ThumbsUp className="h-3.5 w-3.5" /> Would recommend</span>
                  <span className="text-sm font-semibold capitalize">{modal.recommend}</span>
                </div>
              )}
            </div>
            <div className="px-6 pb-6 space-y-3">
              {[["What went well", modal.comments.wentWell], ["What to improve", modal.comments.improve], ["Comment", modal.comments.general]]
                .filter(([, t]) => t)
                .map(([label, t]) => (
                  <div key={label as string}>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">{label}</p>
                    <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-700 leading-relaxed whitespace-pre-line">{t}</div>
                  </div>
                ))}
              {!modal.comments.wentWell && !modal.comments.improve && !modal.comments.general && (
                <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm italic text-muted-foreground">No comments left.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
