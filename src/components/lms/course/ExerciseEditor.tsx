"use client"

import { useState } from "react"
import { Loader2, Plus, Trash2, Wrench } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import MaterialsManager from "@/components/lms/groups/MaterialsManager"

// An exercise: practical work done in class and marked by the instructor —
// nothing is submitted. Marked either Passed / Not passed, or against a rubric
// (points per criterion, passed at a threshold). The sheet participants
// download is uploaded here too.

export type ExerciseCriterion = { id: string; title: string; maxScore: number }
export type ExerciseSettings = { marking: "pass_fail" | "rubric"; pass_pct: number; weight?: number }

const uid = () => Math.random().toString(36).slice(2, 10)

export default function ExerciseEditor({ moduleId, courseId, initial }: {
  moduleId: string; courseId: string
  initial: { instructions: string | null; rubric: ExerciseCriterion[] | null; settings: Partial<ExerciseSettings> | null }
}) {
  const [instructions, setInstructions] = useState(initial.instructions ?? "")
  const [marking, setMarking] = useState<ExerciseSettings["marking"]>(initial.settings?.marking ?? (initial.rubric?.length ? "rubric" : "pass_fail"))
  const [passPct, setPassPct] = useState(initial.settings?.pass_pct ?? 60)
  const [weight, setWeight] = useState(initial.settings?.weight ?? 1)
  const [criteria, setCriteria] = useState<ExerciseCriterion[]>(initial.rubric?.length ? initial.rubric : [{ id: uid(), title: "", maxScore: 5 }])
  const [saving, setSaving] = useState(false)

  const total = criteria.reduce((t, c) => t + (Number(c.maxScore) || 0), 0)

  async function save() {
    const clean = criteria.filter(c => c.title.trim()).map(c => ({ ...c, title: c.title.trim(), maxScore: Math.max(1, Math.round(Number(c.maxScore) || 1)) }))
    if (marking === "rubric" && !clean.length) { toast.error("Add at least one criterion, or mark it Passed / Not passed"); return }
    setSaving(true)
    const res = await fetch("/api/lms/modules", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: moduleId,
        assignment_brief_html: instructions.trim() || null,
        assignment_rubric: marking === "rubric" ? clean : null,
        activity_settings: { marking, pass_pct: passPct, weight },
      }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? "Could not save"); return }
    toast.success("Exercise saved")
  }

  return (
    <div className="max-w-3xl mx-auto pb-20 space-y-6">
      <div className="pb-4 border-b border-slate-100">
        <p className="text-xs font-bold text-[#1B4F8A] uppercase tracking-wider flex items-center gap-2"><Wrench className="h-3.5 w-3.5" /> Exercise</p>
        <p className="text-sm text-slate-500 mt-1">Practical work in class, marked by the instructor on the group&apos;s Exercises screen. Participants don&apos;t submit anything.</p>
      </div>

      <section className="space-y-2">
        <label className="text-sm font-semibold text-slate-800">Instructions participants see</label>
        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={5}
          placeholder="e.g. In pairs, walk apron stand 12 and record every hazard you find on the sheet."
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1B4F8A]/20" />
      </section>

      <section className="space-y-3">
        <label className="text-sm font-semibold text-slate-800">How it's marked</label>
        <div className="grid sm:grid-cols-2 gap-2">
          {([["pass_fail", "Passed / Not passed", "One tick per participant."], ["rubric", "Rubric", "Points per criterion; passed at a threshold."]] as const).map(([v, t, d]) => (
            <button key={v} type="button" onClick={() => setMarking(v)}
              className={cn("text-left rounded-xl border px-4 py-3", marking === v ? "border-[#1B4F8A] bg-[#1B4F8A]/5" : "border-slate-200 hover:border-slate-300")}>
              <p className="text-sm font-semibold text-slate-800">{t}</p><p className="text-xs text-slate-500 mt-0.5">{d}</p>
            </button>
          ))}
        </div>
        {marking === "rubric" && (
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            {criteria.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-5">{i + 1}.</span>
                <Input value={c.title} onChange={e => setCriteria(p => p.map(x => x.id === c.id ? { ...x, title: e.target.value } : x))} placeholder="e.g. Checks FOD at every taxiway" className="flex-1" />
                <Input type="number" min={1} max={100} value={c.maxScore} onChange={e => setCriteria(p => p.map(x => x.id === c.id ? { ...x, maxScore: parseInt(e.target.value) || 1 } : x))} className="w-20" title="Points" />
                <span className="text-xs text-slate-400">pts</span>
                <button type="button" onClick={() => setCriteria(p => p.filter(x => x.id !== c.id))} className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => setCriteria(p => [...p, { id: uid(), title: "", maxScore: 5 }])} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Criterion</Button>
              <p className="text-sm text-slate-600 flex items-center gap-2">Passed at
                <Input type="number" min={0} max={100} value={passPct} onChange={e => setPassPct(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))} className="w-16 h-8" />% of {total} pts</p>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <label className="text-sm font-semibold text-slate-800">Weight among exercises</label>
        <div className="flex items-center gap-3">
          <Input type="number" min={1} max={100} value={weight} onChange={e => setWeight(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))} className="w-20" />
          <p className="text-xs text-slate-500">Used by the course&apos;s pass rule when exercises count differently. All 1 = equal.</p>
        </div>
      </section>

      <section className="space-y-2">
        <label className="text-sm font-semibold text-slate-800">Exercise sheet</label>
        <MaterialsManager courseId={courseId} modules={[]} onlyModuleId={moduleId} />
      </section>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save exercise</Button>
      </div>
    </div>
  )
}
