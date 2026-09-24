"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, ClipboardList, Loader2, TrendingUp } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  criteriaFor, IMPACT_RATINGS, IMPACT_TEXTS, type EvalSubject,
} from "@/lib/lms-evaluation-questions"

// The participant's side of the evaluation set and the impact questionnaire,
// on their course page. Both optional; neither affects the certificate.

function Scale({ value, onChange, label }: { value: number | undefined; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <p className="flex-1 min-w-[180px] text-sm text-slate-700">{label}</p>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(n)}
            className={cn("w-8 h-8 rounded-lg border text-sm font-semibold", value === n ? "bg-[#1B4F8A] border-[#1B4F8A] text-white" : "border-slate-200 text-slate-500 hover:border-[#1B4F8A]")}>{n}</button>
        ))}
      </div>
    </div>
  )
}

export function EvaluationCard({ courseId, subjects }: { courseId: string; subjects: EvalSubject[] }) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(subjects.find(s => !s.done) ? `${subjects.find(s => !s.done)!.type}:${subjects.find(s => !s.done)!.id}` : null)
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)
  const left = subjects.filter(s => !s.done).length

  async function send(s: EvalSubject) {
    const crit = criteriaFor(s.type)
    if (crit.some(c => !ratings[c.key])) { toast.error("Give every line a rating from 1 to 5"); return }
    setBusy(true)
    const res = await fetch("/api/lms/evaluations", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_id: courseId, subject_type: s.type, subject_id: s.id, ratings, comment }) })
    setBusy(false)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? "Could not send"); return }
    toast.success("Thank you")
    const next = subjects.find(x => !x.done && !(x.type === s.type && x.id === s.id))
    setOpenId(next ? `${next.type}:${next.id}` : null); setRatings({}); setComment("")
    router.refresh()
  }

  return (
    <section id="evaluation" className="bg-white rounded-xl border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-[#1B4F8A]" />
        <div className="flex-1">
          <h2 className="font-semibold text-slate-900">Evaluate the course</h2>
          <p className="text-xs text-slate-500">{left ? `${left} left · 1 = poor, 5 = excellent · optional` : "All done — thank you."}</p>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {subjects.map(s => {
          const k = `${s.type}:${s.id}`
          const open = openId === k
          return (
            <div key={k} className="px-5 py-3">
              <button type="button" onClick={() => { setOpenId(open ? null : k); setRatings({}); setComment("") }} className="w-full flex items-center gap-2 text-left">
                {s.done ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <span className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />}
                <span className="flex-1 text-sm font-medium text-slate-800">{s.type === "instructor" ? `Instructor: ${s.title}` : s.title}</span>
                <span className="text-xs text-[#1B4F8A]">{s.done ? "Change" : open ? "" : "Rate"}</span>
              </button>
              {open && (
                <div className="mt-3 space-y-2 pl-6">
                  {criteriaFor(s.type).map(c => <Scale key={c.key} label={c.label} value={ratings[c.key]} onChange={v => setRatings(r => ({ ...r, [c.key]: v }))} />)}
                  <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} placeholder="Anything else? (optional)"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1B4F8A]/20" />
                  <div className="flex justify-end">
                    <button type="button" onClick={() => send(s)} disabled={busy} className="inline-flex items-center gap-2 bg-[#1B4F8A] hover:bg-[#163f6e] text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60">
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function ImpactCard({ courseId, answered, score }: { courseId: string; answered: boolean; score: number | null }) {
  const router = useRouter()
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function send() {
    if (IMPACT_RATINGS.some(q => !ratings[q.key])) { toast.error("Give every line a rating from 1 to 5"); return }
    setBusy(true)
    const res = await fetch("/api/lms/impact", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_id: courseId, ratings, ...texts }) })
    setBusy(false)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? "Could not send"); return }
    toast.success("Thank you — that really helps")
    router.refresh()
  }

  return (
    <section id="impact" className="bg-white rounded-xl border border-[#1B4F8A]/20">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-[#1B4F8A]" />
        <div className="flex-1">
          <h2 className="font-semibold text-slate-900">Has the course made a difference?</h2>
          <p className="text-xs text-slate-500">{answered ? "Answered — thank you." : "A few months on: 1 = strongly disagree, 5 = strongly agree. It doesn't affect your result or certificate."}</p>
        </div>
        {answered && score !== null && <span className="text-sm font-semibold text-[#1B4F8A]">Impact {score}%</span>}
      </div>
      {!answered && (
        <div className="px-5 py-4 space-y-3">
          {IMPACT_RATINGS.map(q => <Scale key={q.key} label={q.label} value={ratings[q.key]} onChange={v => setRatings(r => ({ ...r, [q.key]: v }))} />)}
          {IMPACT_TEXTS.map(t => (
            <div key={t.key} className="space-y-1">
              <p className="text-sm text-slate-700">{t.label}</p>
              <textarea value={texts[t.key] ?? ""} onChange={e => setTexts(x => ({ ...x, [t.key]: e.target.value }))} rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1B4F8A]/20" />
            </div>
          ))}
          <div className="flex justify-end">
            <button type="button" onClick={send} disabled={busy} className="inline-flex items-center gap-2 bg-[#1B4F8A] hover:bg-[#163f6e] text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}Send
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
