"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Loader2, Plus, Trash2, GripVertical, AlertTriangle, CheckCircle2, Shuffle, ListChecks,
  ChevronDown, ChevronUp, Pencil, PackageOpen, RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import QuestionEditorDialog from "@/components/lms/bank/QuestionEditorDialog"
import BankQuestionPicker from "@/components/lms/bank/BankQuestionPicker"
import { SettingsPanel, DEFAULT_SETTINGS, type ActivitySettings } from "@/components/lms/ActivityEditor"

// Step 11 — the exam builder. An exam already moved into the bank is a list of
// FIXED sections (chosen questions) and DRAW sections (n at random from a set).
// An exam not yet moved shows the old editor plus a one-click "move" banner.

interface Section {
  id: string
  title: string
  kind: "fixed" | "draw"
  module_id: string | null
  question_ids?: string[]
  set_id?: string | null
  count?: number
  difficulty?: "easy" | "medium" | "hard" | null
  points_each?: number
}

interface ExamData {
  exam: { id: string; title: string; course: { id: string; title: string; status: string } }
  own_set_id: string | null
  moved: boolean
  inline_count: number
  sections: Section[]
  questions: { id: string; type: string; payload: any; difficulty: string; archived_at: string | null }[]
  sets: { id: string; name: string; own: boolean; counts: { total: number; easy: number; medium: number; hard: number } }[]
  modules: { id: string; title: string }[]
  check: { ok: boolean; problems: string[]; warnings: string[]; questionsPerPaper: number; pointsPerPaper: number } | null
  can_correct: boolean
}

function newSectionId() { return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

export default function ExamSectionsEditor({ moduleId, legacyEditor, initialSettings }: {
  moduleId: string
  /** Time limit, attempts, shuffle — still stored on the exam module. */
  initialSettings?: ActivitySettings | null
  /** The old inline editor, shown for an exam that hasn't been moved yet. */
  legacyEditor?: React.ReactNode
}) {
  const [data, setData] = useState<ExamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [moving, setMoving] = useState(false)
  const [sections, setSections] = useState<Section[]>([])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [editQuestion, setEditQuestion] = useState<{ id: string | null; setId?: string | null; sectionId?: string } | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const openedOnce = useRef(false)
  const [settings, setSettings] = useState<ActivitySettings>({ ...DEFAULT_SETTINGS, ...(initialSettings ?? {}) })

  // Settings save on their own, a moment after the last change — as they
  // always have. (Questions are the part that moved to the bank.)
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  function applySettings(next: ActivitySettings) {
    setSettings(next)
    clearTimeout(settingsTimer.current)
    settingsTimer.current = setTimeout(async () => {
      const res = await fetch("/api/lms/modules", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: moduleId, activity_settings: next }),
      })
      if (!res.ok) toast.error("Could not save the exam settings")
    }, 1000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/lms/exams/${moduleId}`)
    const d = await res.json().catch(() => null)
    if (!res.ok || !d) { toast.error(d?.error ?? "Could not load the exam"); setLoading(false); return }
    setData(d)
    setSections(d.sections ?? [])
    if (!openedOnce.current) {
      openedOnce.current = true
      if ((d.sections ?? []).length <= 3) setExpanded(new Set((d.sections ?? []).map((s: Section) => s.id)))
    }
    setDirty(false)
    setLoading(false)
  }, [moduleId])
  useEffect(() => { load() }, [load])

  async function moveToBank() {
    if (!confirm(
      "Move this exam's questions into the question bank?\n\n" +
      "Every past attempt and any exam in progress gets its paper saved first, from the questions it was marked on. " +
      "The exam becomes one fixed section holding the same questions, in the same order. Students see no difference.\n\n" +
      "This can't be undone."
    )) return
    setMoving(true)
    const res = await fetch(`/api/lms/exams/${moduleId}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "move" }),
    })
    const d = await res.json().catch(() => ({}))
    setMoving(false)
    if (!res.ok) { toast.error(d.error ?? "Could not move the exam"); return }
    toast.success(`Moved ${d.questions} question${d.questions === 1 ? "" : "s"} into the bank` +
      (d.papersSaved ? ` — ${d.papersSaved} paper${d.papersSaved === 1 ? "" : "s"} saved` : ""))
    load()
  }

  function updateSection(id: string, patch: Partial<Section>) {
    setSections(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
    setDirty(true)
  }
  function addSection(kind: "fixed" | "draw") {
    const id = newSectionId()
    setSections(prev => [...prev, kind === "fixed"
      ? { id, title: `Section ${prev.length + 1}`, kind, module_id: null, question_ids: [] }
      : { id, title: `Section ${prev.length + 1}`, kind, module_id: null, set_id: data?.sets[0]?.id ?? null, count: 5, points_each: 1, difficulty: null }])
    setExpanded(prev => new Set([...prev, id]))
    setDirty(true)
  }
  function removeSection(id: string) {
    if (!confirm("Remove this section? Its questions stay in the bank.")) return
    setSections(prev => prev.filter(s => s.id !== id))
    setDirty(true)
  }
  function moveSection(index: number, dir: -1 | 1) {
    setSections(prev => {
      const next = [...prev]
      const to = index + dir
      if (to < 0 || to >= next.length) return prev
      ;[next[index], next[to]] = [next[to], next[index]]
      return next
    })
    setDirty(true)
  }
  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function removeQuestionFromSection(sectionId: string, qid: string) {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, question_ids: (s.question_ids ?? []).filter(x => x !== qid) } : s))
    setDirty(true)
  }

  async function persist(next: Section[], successMsg = "Exam saved") {
    setSaving(true)
    const res = await fetch(`/api/lms/exams/${moduleId}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sections: next }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast.error(d.error ?? "Could not save the exam"); if (d.check) setData(prev => prev ? { ...prev, check: d.check } : prev); return false }
    toast.success(successMsg)
    load()
    return true
  }

  const save = () => persist(sections)

  async function handleRecalculate() {
    setRecalculating(true)
    try {
      const call = (body: Record<string, unknown>) => fetch(`/api/lms/modules/${moduleId}/recalculate-attempts`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Recalculation failed"); return d })

      const pv = await call({ preview: true })
      if (pv.checked === 0 && pv.finished.attempts === 0) { toast.info("No attempts to recalculate yet"); return }
      const newlyPassed = pv.flips.filter((f: any) => !f.before.passed && f.after.passed).length
      const newlyFailed = pv.flips.filter((f: any) => f.before.passed && !f.after.passed).length
      const lines = [
        `Re-mark ${pv.checked} attempt${pv.checked === 1 ? "" : "s"} against the corrected answer key?`, "",
        pv.changed === 0 ? "No scores would change."
          : `${pv.changed} score${pv.changed === 1 ? "" : "s"} would change` +
            (newlyPassed ? ` — ${newlyPassed} would now pass` : "") + (newlyFailed ? ` — ${newlyFailed} would now fail` : "") + ".",
      ]
      if (newlyFailed) lines.push("Anyone who now fails keeps their certificate until you review it.")
      if (pv.openPapers) lines.push(`${pv.openPapers} exam${pv.openPapers === 1 ? "" : "s"} in progress will be marked with the corrected key.`)
      if (!confirm(lines.join("\n"))) return

      let includeFinished = false
      if (pv.finished.attempts > 0) {
        const names = pv.finished.programs.map((p: any) => p.name).join(", ")
        includeFinished = confirm(`${pv.finished.attempts} attempt${pv.finished.attempts === 1 ? " is" : "s are"} in finished programs (${names}). OK = correct those too. Cancel = leave them.`)
      }
      const d = await call({ include_finished: includeFinished })
      toast.success(d.changed === 0 ? `Checked ${d.checked} — no scores changed`
        : `${d.changed} of ${d.checked} updated` + (d.certificateReviews ? ` — ${d.certificateReviews} certificate${d.certificateReviews === 1 ? "" : "s"} to review` : ""))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recalculation failed")
    } finally { setRecalculating(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>
  if (!data) return <p className="text-sm text-red-500 py-10 text-center">Could not load the exam</p>

  const questionById = new Map(data.questions.map(q => [q.id, q]))

  if (!data.moved) {
    return (
      <div className="space-y-4">
        <div className="max-w-3xl mx-auto bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <p className="text-sm font-semibold text-amber-900 flex items-center gap-2"><PackageOpen className="h-4 w-4" /> Move into the question bank</p>
          <p className="text-sm text-amber-800 mt-1.5">
            This exam still keeps its {data.inline_count} question{data.inline_count === 1 ? "" : "s"} inline. Move it into the bank to build
            sections with random draws, correct or update questions, and reuse them across exams. Every past attempt keeps exactly what it was marked on.
          </p>
          {data.can_correct ? (
            <Button onClick={moveToBank} disabled={moving} className="mt-3 bg-amber-600 hover:bg-amber-700 text-white gap-2">
              {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageOpen className="h-4 w-4" />} Move into the bank
            </Button>
          ) : (
            <p className="text-xs text-amber-700 mt-2">An admin can move it.</p>
          )}
        </div>
        {legacyEditor}
      </div>
    )
  }

  const totalQuestions = data.check?.questionsPerPaper ?? 0
  const totalPoints = data.check?.pointsPerPaper ?? 0

  return (
    <div className="max-w-4xl mx-auto pb-20 space-y-4">
      {/* Header + publish check */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{data.exam.title}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{totalQuestions} question{totalQuestions === 1 ? "" : "s"} · {totalPoints} point{totalPoints === 1 ? "" : "s"} per paper</p>
        </div>
        <div className="flex gap-2">
          {data.can_correct && (
            <Button variant="outline" size="sm" onClick={handleRecalculate} disabled={recalculating} className="gap-1.5">
              {recalculating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Recalculate
            </Button>
          )}
          <Button onClick={save} disabled={saving || !dirty} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save
          </Button>
        </div>
      </div>

      <SettingsPanel settings={settings} onChange={applySettings} passMarkLocked />

      {data.check && !data.check.ok && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
          <p className="text-xs font-semibold text-red-800 flex items-center gap-1.5 mb-1"><AlertTriangle className="h-3.5 w-3.5" /> Not ready to publish</p>
          <ul className="text-xs text-red-700 space-y-0.5 list-disc list-inside">
            {data.check.problems.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}
      {data.check?.warnings?.length ? (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5">
          <ul className="text-xs text-amber-800 space-y-0.5 list-disc list-inside">
            {data.check.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      ) : null}

      {/* Sections */}
      <div className="space-y-3">
        {sections.map((s, i) => {
          const isOpen = expanded.has(s.id)
          const set = data.sets.find(x => x.id === s.set_id)
          return (
            <div key={s.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-50">
                <GripVertical className="h-4 w-4 text-slate-300 shrink-0" />
                <button onClick={() => toggleExpand(s.id)} className="p-0.5 text-slate-400 hover:text-slate-700 shrink-0">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0",
                  s.kind === "fixed" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700")}>
                  {s.kind === "fixed" ? <span className="flex items-center gap-1"><ListChecks className="h-3 w-3" /> Fixed</span> : <span className="flex items-center gap-1"><Shuffle className="h-3 w-3" /> Draw</span>}
                </span>
                <Input value={s.title} onChange={e => updateSection(s.id, { title: e.target.value })}
                  className="h-7 text-sm font-medium border-transparent hover:border-slate-200 focus:border-slate-300 bg-transparent flex-1 min-w-0" />
                <span className="text-xs text-slate-400 shrink-0">
                  {s.kind === "fixed" ? `${(s.question_ids ?? []).length} question${(s.question_ids ?? []).length === 1 ? "" : "s"}`
                    : `${s.count ?? 0} × ${s.points_each ?? 0}pt${set ? ` (${set.counts.total} avail.)` : ""}`}
                </span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => moveSection(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-slate-200 text-slate-400 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                  <button onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1} className="p-1 rounded hover:bg-slate-200 text-slate-400 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                  <button onClick={() => removeSection(s.id)} className="p-1 rounded hover:bg-red-50 text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              {isOpen && (
                <div className="p-4 space-y-3">
                  <label className="text-xs block max-w-xs">
                    <span className="block text-slate-500 mb-1">Tests this module (for reports)</span>
                    <select value={s.module_id ?? ""} onChange={e => updateSection(s.id, { module_id: e.target.value || null })}
                      className="w-full h-8 rounded-lg border border-slate-200 px-2 text-sm bg-white">
                      <option value="">— none —</option>
                      {data.modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                    </select>
                  </label>

                  {s.kind === "fixed" ? (
                    <div className="space-y-2">
                      {(s.question_ids ?? []).length === 0 ? (
                        <p className="text-xs text-slate-400">No questions yet.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {(s.question_ids ?? []).map(qid => {
                            const q = questionById.get(qid)
                            return (
                              <li key={qid} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
                                <span className="flex-1 min-w-0 truncate">{q?.payload?.text ?? "(question not found)"}</span>
                                <span className="text-xs text-slate-400 shrink-0">{q?.payload?.points ?? "?"}pt</span>
                                {q?.archived_at && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full shrink-0">archived</span>}
                                <button onClick={() => setEditQuestion({ id: qid })} className="p-1 text-slate-400 hover:text-slate-700 shrink-0"><Pencil className="h-3.5 w-3.5" /></button>
                                <button onClick={() => removeQuestionFromSection(s.id, qid)} className="p-1 text-slate-400 hover:text-red-600 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => setPickerFor(s.id)} className="gap-1.5 text-xs h-8">
                          <Plus className="h-3.5 w-3.5" /> Add from bank
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditQuestion({ id: null, setId: data.own_set_id ?? data.sets[0]?.id ?? null, sectionId: s.id })} className="gap-1.5 text-xs h-8">
                          <Plus className="h-3.5 w-3.5" /> New question
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <label className="text-xs col-span-2 sm:col-span-1">
                        <span className="block text-slate-500 mb-1">Set</span>
                        <select value={s.set_id ?? ""} onChange={e => updateSection(s.id, { set_id: e.target.value || null })}
                          className="w-full h-8 rounded-lg border border-slate-200 px-2 text-sm bg-white">
                          <option value="">— choose —</option>
                          {data.sets.map(set => <option key={set.id} value={set.id}>{set.name} ({set.counts.total})</option>)}
                        </select>
                      </label>
                      <label className="text-xs">
                        <span className="block text-slate-500 mb-1">Difficulty</span>
                        <select value={s.difficulty ?? ""} onChange={e => updateSection(s.id, { difficulty: (e.target.value || null) as any })}
                          className="w-full h-8 rounded-lg border border-slate-200 px-2 text-sm bg-white">
                          <option value="">Any</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                        </select>
                      </label>
                      <label className="text-xs">
                        <span className="block text-slate-500 mb-1">How many</span>
                        <Input type="number" min={1} max={200} value={s.count ?? 0} onChange={e => updateSection(s.id, { count: Number(e.target.value) })} className="h-8" />
                      </label>
                      <label className="text-xs">
                        <span className="block text-slate-500 mb-1">Points each</span>
                        <Input type="number" min={0} step="0.5" value={s.points_each ?? 0} onChange={e => updateSection(s.id, { points_each: Number(e.target.value) })} className="h-8" />
                      </label>
                      {set && (
                        <p className="text-[11px] text-slate-400 col-span-2 sm:col-span-4">
                          Available: {set.counts.total} total ({set.counts.easy} easy · {set.counts.medium} medium · {set.counts.hard} hard)
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => addSection("fixed")} className="gap-1.5"><Plus className="h-4 w-4" /> Fixed section</Button>
        <Button variant="outline" onClick={() => addSection("draw")} className="gap-1.5"><Plus className="h-4 w-4" /> Draw section</Button>
      </div>

      {editQuestion && (
        <QuestionEditorDialog
          questionId={editQuestion.id}
          setId={editQuestion.setId ?? data.own_set_id}
          canCorrect={data.can_correct}
          onClose={() => setEditQuestion(null)}
          onSaved={(q) => {
            const creating = editQuestion.id === null
            setEditQuestion(null)
            if (creating && q?.id) {
              // A newly created question goes into the fixed section that prompted it,
              // and is saved straight away so a reload can't lose it.
              const target = sections.find(s => s.id === editQuestion.sectionId)
              if (target) {
                const next = sections.map(s => s.id === target.id ? { ...s, question_ids: [...(s.question_ids ?? []), q.id] } : s)
                persist(next, "Question added")
                return
              }
            }
            load()
          }}
        />
      )}
      {pickerFor && (
        <BankQuestionPicker
          excludeIds={sections.find(s => s.id === pickerFor)?.question_ids ?? []}
          onClose={() => setPickerFor(null)}
          onPick={(ids) => {
            updateSection(pickerFor, { question_ids: [...(sections.find(s => s.id === pickerFor)?.question_ids ?? []), ...ids] })
            setPickerFor(null)
          }}
        />
      )}
    </div>
  )
}
