"use client"

import { useEffect, useState } from "react"
import { Loader2, Scale, Info } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Course Settings → Completion & grading: how a participant completes the
// course. Either "pass the final exam" (as before), or a pass rule —
// requirements that must be met, plus a weighted score that must reach the
// course's pass mark.

type Key = "exam" | "assignments" | "exercises" | "attendance" | "modules"
type Comp = { on: boolean; weight: number; required: boolean; pass?: number; min?: number }
type Rules = { pass_mark: number; components: Partial<Record<Key, { weight: number; required: boolean; pass?: number; min?: number }>> }

const ROWS: { key: Key; label: string; hint: string; requirement: (c: Comp, examMark: number) => string }[] = [
  { key: "exam",        label: "Final exam",     hint: "Best attempt",                                  requirement: (_c, m) => `Pass it (${m}%, or the program's mark)` },
  { key: "assignments", label: "Assignments",    hint: "Average of the marked assignments",             requirement: c => `Each required one ≥ ${c.pass ?? 60}%` },
  { key: "exercises",   label: "Exercises",      hint: "Marked by the instructor",                      requirement: () => "Every required one passed" },
  { key: "attendance",  label: "Attendance",     hint: "Hours in the room / meeting, excused days not counted", requirement: c => `At least ${c.min ?? 80}%` },
  { key: "modules",     label: "Online modules", hint: "Share of the course's online modules completed", requirement: () => "All required ones completed" },
]

export default function CompletionRulesPanel({ courseId }: { courseId: string }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [useRule, setUseRule] = useState(false)
  const [passMark, setPassMark] = useState(70)
  const [comps, setComps] = useState<Record<Key, Comp>>({} as any)
  const [contains, setContains] = useState<Record<Key, number | boolean>>({} as any)
  const [examMark, setExamMark] = useState(70)

  useEffect(() => {
    fetch(`/api/lms/courses/${courseId}/completion`).then(r => r.json()).then(d => {
      const rules: Rules = d.rules ?? d.suggested
      setUseRule(!!d.rules)
      setPassMark(rules.pass_mark ?? 70)
      setExamMark(d.exam_pass_mark ?? 70)
      setContains(d.contains ?? {})
      const next = {} as Record<Key, Comp>
      for (const r of ROWS) {
        const c = rules.components?.[r.key]
        next[r.key] = { on: !!c, weight: c?.weight ?? 0, required: c?.required ?? false, pass: c?.pass ?? (r.key === "assignments" ? 60 : undefined), min: c?.min ?? (r.key === "attendance" ? 80 : undefined) }
      }
      setComps(next)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [courseId])

  const set = (k: Key, patch: Partial<Comp>) => setComps(p => ({ ...p, [k]: { ...p[k], ...patch } }))
  const total = ROWS.reduce((t, r) => t + (comps[r.key]?.on ? comps[r.key].weight || 0 : 0), 0)

  async function save() {
    let body: { rules: Rules | null } = { rules: null }
    if (useRule) {
      if (total !== 100) { toast.error(`The weights add up to ${total} — they must add up to 100`); return }
      const components: Rules["components"] = {}
      for (const r of ROWS) {
        const c = comps[r.key]
        if (!c?.on) continue
        components[r.key] = { weight: c.weight, required: c.required, ...(r.key === "assignments" ? { pass: c.pass } : {}), ...(r.key === "attendance" ? { min: c.min } : {}) }
      }
      body = { rules: { pass_mark: passMark, components } }
    }
    setSaving(true)
    const res = await fetch(`/api/lms/courses/${courseId}/completion`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast.error(d.error ?? "Could not save"); return }
    toast.success(useRule ? "Pass rule saved" : "Back to: pass the final exam")
  }

  if (loading) return <div className="bg-white rounded-xl border p-5 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>

  return (
    <div className="bg-white rounded-xl border p-5 space-y-4">
      <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><Scale className="h-4 w-4 text-[#1B4F8A]" /> Completion & grading</h3>

      <div className="grid sm:grid-cols-2 gap-2">
        {[{ v: false, t: "Pass the final exam", d: "As now: passing the exam completes the course." },
          { v: true, t: "Pass rule", d: "Requirements + a weighted score (exam, assignments, exercises, attendance…)." }].map(o => (
          <button key={String(o.v)} type="button" onClick={() => setUseRule(o.v)}
            className={cn("text-left rounded-xl border px-4 py-3 transition-colors", useRule === o.v ? "border-[#1B4F8A] bg-[#1B4F8A]/5" : "border-slate-200 hover:border-slate-300")}>
            <p className="text-sm font-semibold text-slate-800">{o.t}</p>
            <p className="text-xs text-slate-500 mt-0.5">{o.d}</p>
          </button>
        ))}
      </div>

      {useRule && (
        <>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr><th className="text-left px-3 py-2 font-medium">Component</th><th className="px-3 py-2 font-medium w-24">Weight %</th><th className="px-3 py-2 font-medium w-24">Required</th><th className="text-left px-3 py-2 font-medium">Requirement</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ROWS.map(r => {
                  const c = comps[r.key]; if (!c) return null
                  const has = !!contains[r.key]
                  return (
                    <tr key={r.key} className={cn(!c.on && "opacity-50")}>
                      <td className="px-3 py-2.5">
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input type="checkbox" checked={c.on} onChange={e => set(r.key, { on: e.target.checked, ...(e.target.checked ? {} : { weight: 0, required: false }) })} className="mt-1 accent-[#1B4F8A]" />
                          <span><span className="font-medium text-slate-800">{r.label}</span>
                            <span className="block text-[11px] text-slate-400">{r.hint}{!has && " · none in this course yet"}</span></span>
                        </label>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <input type="number" min={0} max={100} disabled={!c.on} value={c.weight} onChange={e => set(r.key, { weight: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
                          className="w-16 h-8 rounded-md border border-slate-200 px-2 text-sm text-center" />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <input type="checkbox" disabled={!c.on} checked={c.required} onChange={e => set(r.key, { required: e.target.checked })} className="accent-[#1B4F8A]" />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {r.key === "assignments" && c.on ? (
                          <span className="flex items-center gap-1.5">Each required one ≥
                            <input type="number" min={0} max={100} value={c.pass ?? 60} onChange={e => set(r.key, { pass: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })} className="w-14 h-7 rounded-md border border-slate-200 px-1.5 text-center" />%</span>
                        ) : r.key === "attendance" && c.on ? (
                          <span className="flex items-center gap-1.5">At least
                            <input type="number" min={0} max={100} value={c.min ?? 80} onChange={e => set(r.key, { min: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })} className="w-14 h-7 rounded-md border border-slate-200 px-1.5 text-center" />%</span>
                        ) : r.requirement(c, examMark)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50">
                  <td className="px-3 py-2 text-xs font-medium text-slate-600">Total</td>
                  <td className={cn("px-3 py-2 text-center text-sm font-bold", total === 100 ? "text-emerald-700" : "text-red-600")}>{total}%</td>
                  <td colSpan={2} className="px-3 py-2 text-xs text-slate-500">{total === 100 ? "Weights add up to 100" : "Weights must add up to 100"}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700">Course pass mark</label>
            <input type="number" min={0} max={100} value={passMark} onChange={e => setPassMark(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
              className="w-20 h-9 rounded-md border border-slate-200 px-2 text-sm text-center" />
            <span className="text-sm text-slate-500">% weighted score</span>
          </div>

          <p className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" />
            A participant completes the course — and gets the certificate — when every <b>required</b> component is met <b>and</b> the weighted score reaches the pass mark.
            Components the course doesn&apos;t have are left out and the other weights scaled up. Nothing is decided while something can still change (days to come, work not marked, attempts left).
          </p>
        </>
      )}

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}Save completion rule
        </Button>
      </div>
    </div>
  )
}
