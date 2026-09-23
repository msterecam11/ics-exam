"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, XCircle, Loader2, Sparkles, FileText, Send, MessageSquare } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

// The group screen's marking tabs:
//   GroupExercises   — a grid, participant × exercise; click a cell to mark it
//   GroupAssignments — per assignment, who submitted; open one to mark / release

type Student = { id: string; name: string; email: string } | null
type Participant = { enrollment_id: string; student: Student }
type Criterion = { id: string; title: string; maxScore: number }

// ─── Exercises ────────────────────────────────────────────────────────────────

type Exercise = { id: string; title: string; required: boolean; instructions: string | null; marking: "pass_fail" | "rubric"; rubric: Criterion[]; pass_pct: number }
type Mark = { enrollment_id: string; module_id: string; passed: boolean; score_pct: number | null; ratings: Record<string, number> | null; comment: string | null; marked_at: string; marked_by: string | null }

export function GroupExercises({ groupId }: { groupId: string }) {
  const [d, setD] = useState<{ exercises: Exercise[]; participants: Participant[]; marks: Mark[] } | null>(null)
  const [open, setOpen] = useState<{ p: Participant; e: Exercise } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/lms/groups/${groupId}/exercises`)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? "Could not load exercises"); return }
    setD(j)
  }, [groupId])
  useEffect(() => { load() }, [load])

  if (!d) return <div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
  if (!d.exercises.length) return <Empty text="This course has no exercises. Add one in the course builder (type: Exercise)." />
  if (!d.participants.length) return <Empty text="Nobody in this group yet" />

  const markOf = (enr: string, mod: string) => d.marks.find(m => m.enrollment_id === enr && m.module_id === mod)

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Click a box to mark the exercise. Marks count towards the course&apos;s pass rule straight away.</p>
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-500">
              <th className="text-left font-medium px-4 py-2.5 sticky left-0 bg-white">Participant</th>
              {d.exercises.map(e => <th key={e.id} className="font-medium px-3 py-2.5 text-center min-w-[110px]">{e.title}{!e.required && <span className="block text-[10px] text-slate-400">optional</span>}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {d.participants.map(p => (
              <tr key={p.enrollment_id}>
                <td className="px-4 py-2.5 sticky left-0 bg-white"><p className="font-medium text-slate-800">{p.student?.name}</p><p className="text-xs text-slate-400">{p.student?.email}</p></td>
                {d.exercises.map(e => {
                  const m = markOf(p.enrollment_id, e.id)
                  return (
                    <td key={e.id} className="px-3 py-2 text-center">
                      <button onClick={() => setOpen({ p, e })} title={m?.comment ?? undefined}
                        className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold border",
                          !m ? "border-dashed border-slate-300 text-slate-400 hover:border-[#1B4F8A] hover:text-[#1B4F8A]"
                            : m.passed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600")}>
                        {!m ? "Mark" : m.passed ? <><CheckCircle2 className="h-3.5 w-3.5" />{e.marking === "rubric" ? `${m.score_pct}%` : "Passed"}</> : <><XCircle className="h-3.5 w-3.5" />{e.marking === "rubric" ? `${m.score_pct}%` : "Not passed"}</>}
                        {m?.comment && <MessageSquare className="h-3 w-3 opacity-60" />}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <MarkExercise groupId={groupId} p={open.p} e={open.e} mark={markOf(open.p.enrollment_id, open.e.id)} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load() }} />}
    </div>
  )
}

function MarkExercise({ groupId, p, e, mark, onClose, onSaved }: { groupId: string; p: Participant; e: Exercise; mark?: Mark; onClose: () => void; onSaved: () => void }) {
  const [passed, setPassed] = useState<boolean | null>(mark ? mark.passed : null)
  const [ratings, setRatings] = useState<Record<string, string>>(() => Object.fromEntries(e.rubric.map(c => [c.id, mark?.ratings?.[c.id] !== undefined ? String(mark.ratings[c.id]) : ""])))
  const [comment, setComment] = useState(mark?.comment ?? "")
  const [busy, setBusy] = useState(false)
  const rubric = e.marking === "rubric"
  const max = e.rubric.reduce((t, c) => t + c.maxScore, 0)
  const got = e.rubric.reduce((t, c) => t + (Number(ratings[c.id]) || 0), 0)
  const pct = max ? Math.round((got / max) * 100) : 0

  async function save() {
    if (!rubric && passed === null) { toast.error("Passed or not passed?"); return }
    if (rubric && e.rubric.some(c => ratings[c.id] === "")) { toast.error("Give points for each criterion"); return }
    setBusy(true)
    const res = await fetch(`/api/lms/groups/${groupId}/exercises`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollment_id: p.enrollment_id, module_id: e.id, comment, ...(rubric ? { ratings: Object.fromEntries(Object.entries(ratings).map(([k, v]) => [k, Number(v)])) } : { passed }) }),
    })
    setBusy(false)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? "Could not save"); return }
    toast.success("Marked"); onSaved()
  }
  async function clear() {
    if (!confirm("Clear this mark?")) return
    setBusy(true)
    await fetch(`/api/lms/groups/${groupId}/exercises?enrollment_id=${p.enrollment_id}&module_id=${e.id}`, { method: "DELETE" })
    setBusy(false); onSaved()
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{e.title} — {p.student?.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {e.instructions && <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 whitespace-pre-wrap">{e.instructions}</p>}
          {rubric ? (
            <div className="space-y-2">
              {e.rubric.map(c => (
                <div key={c.id} className="flex items-center gap-3">
                  <p className="flex-1 text-sm text-slate-700">{c.title}</p>
                  <Input type="number" min={0} max={c.maxScore} value={ratings[c.id]} onChange={ev => setRatings(r => ({ ...r, [c.id]: ev.target.value }))} className="w-20 h-8" />
                  <span className="text-xs text-slate-400 w-12">/ {c.maxScore}</span>
                </div>
              ))}
              <p className={cn("text-sm font-semibold text-right", pct >= e.pass_pct ? "text-emerald-700" : "text-red-600")}>{got} / {max} = {pct}% · {pct >= e.pass_pct ? "Passed" : "Not passed"} (needs {e.pass_pct}%)</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setPassed(true)} className={cn("rounded-xl border px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2", passed === true ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600")}><CheckCircle2 className="h-4 w-4" /> Passed</button>
              <button onClick={() => setPassed(false)} className={cn("rounded-xl border px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2", passed === false ? "border-red-300 bg-red-50 text-red-600" : "border-slate-200 text-slate-600")}><XCircle className="h-4 w-4" /> Not passed</button>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700">Comment for the participant <span className="text-slate-400 font-normal">(optional)</span></p>
            <textarea value={comment} onChange={ev => setComment(ev.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1B4F8A]/20" />
          </div>
          {mark && <p className="text-xs text-slate-400">Last marked {new Date(mark.marked_at).toLocaleString("en-GB")}{mark.marked_by ? ` by ${mark.marked_by}` : ""}</p>}
          <div className="flex justify-between gap-2">
            {mark ? <Button variant="outline" onClick={clear} disabled={busy} className="text-red-600">Clear mark</Button> : <span />}
            <Button onClick={save} disabled={busy} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save mark</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Assignments ──────────────────────────────────────────────────────────────

type Assignment = { id: string; title: string; required: boolean; pass_mark: number; due: string | null; rubric: Criterion[] }
type Submission = {
  id: string; enrollment_id: string; module_id: string; attempt_no: number; status: string
  score: number | null; max_score: number | null; passed: boolean | null; submitted_at: string | null
  text: string | null; file_name: string | null; file_url: string | null; confirmed: boolean
  ai: { comment: string | null; criteria: { id: string; title: string; max: number; score: number; comment: string }[] | null } | null
  rescores: { from: number; to: number; reason: string; by: string; at: string }[]
}

export function GroupAssignments({ groupId }: { groupId: string }) {
  const [d, setD] = useState<{ assignments: Assignment[]; participants: Participant[]; submissions: Submission[] } | null>(null)
  const [open, setOpen] = useState<{ s: Submission; a: Assignment; p: Participant } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/lms/groups/${groupId}/assignments`)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? "Could not load assignments"); return }
    setD(j)
  }, [groupId])
  useEffect(() => { load() }, [load])

  if (!d) return <div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
  if (!d.assignments.length) return <Empty text="This course has no assignments." />
  if (!d.participants.length) return <Empty text="Nobody in this group yet" />

  return (
    <div className="space-y-5">
      {d.assignments.map(a => {
        const subs = d.submissions.filter(s => s.module_id === a.id)
        const toMark = subs.filter(s => !s.confirmed).length
        return (
          <div key={a.id} className="bg-white border border-slate-200 rounded-xl">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
              <p className="flex-1 font-semibold text-slate-800">{a.title}{!a.required && <span className="ml-2 text-[10px] text-slate-400 font-normal">optional</span>}</p>
              <p className="text-xs text-slate-500">{subs.length}/{d.participants.length} submitted{toMark ? ` · ${toMark} to confirm` : ""} · pass {a.pass_mark}%</p>
            </div>
            <div className="divide-y divide-slate-100">
              {d.participants.map(p => {
                const s = subs.find(x => x.enrollment_id === p.enrollment_id)
                return (
                  <div key={p.enrollment_id} className="flex items-center gap-3 px-4 py-2.5">
                    <p className="flex-1 min-w-0 text-sm text-slate-800 truncate">{p.student?.name}</p>
                    {!s ? <span className="text-xs text-slate-400">Not submitted</span> : (
                      <>
                        <StatusChip s={s} />
                        <Button size="sm" variant="outline" onClick={() => setOpen({ s, a, p })} className="h-7 text-xs">{s.confirmed ? "View" : "Mark"}</Button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      {open && <MarkAssignment {...open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load() }} />}
    </div>
  )
}

function StatusChip({ s }: { s: Submission }) {
  const pct = s.score !== null && s.max_score ? Math.round((s.score / s.max_score) * 100) : null
  if (s.status === "released") return <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", s.passed ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>{pct ?? "—"}% · released</span>
  if (s.confirmed) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{pct ?? "—"}% · not released</span>
  if (s.status === "graded") return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">AI suggests {pct ?? "—"}%</span>
  return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Submitted</span>
}

function MarkAssignment({ s, a, p, onClose, onSaved }: { s: Submission; a: Assignment; p: Participant; onClose: () => void; onSaved: () => void }) {
  const max = s.max_score ?? (a.rubric.length ? a.rubric.reduce((t, c) => t + c.maxScore, 0) : 100)
  const [score, setScore] = useState(s.score !== null ? String(s.score) : "")
  const [feedback, setFeedback] = useState(s.ai?.comment ?? "")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState<"" | "ai" | "save" | "release">("")
  const [ai, setAi] = useState(s.ai)
  const needsReason = s.confirmed && score !== "" && Number(score) !== s.score
  const pct = score !== "" && max ? Math.round((Number(score) / max) * 100) : null

  async function askAi() {
    setBusy("ai")
    const res = await fetch("/api/lms/grade-assignment-ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attempt_id: s.id, module_id: a.id }) })
    setBusy("")
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? "The AI could not mark it"); return }
    setAi({ comment: j.ai_feedback?.overall_comment ?? null, criteria: j.ai_feedback?.criteria ?? null })
    setScore(String(j.score ?? "")); setFeedback(j.ai_feedback?.overall_comment ?? "")
    toast.success(j.status === "released" ? "AI marked and released it (this course releases automatically)" : "AI suggestion ready — check it, then Confirm")
  }
  async function save(release: boolean) {
    const n = Number(score)
    if (score === "" || !Number.isFinite(n) || n < 0 || n > max) { toast.error(`Score must be 0–${max}`); return }
    if (needsReason && !reason.trim()) { toast.error("Give a reason for changing the mark"); return }
    setBusy(release ? "release" : "save")
    const res = await fetch("/api/lms/module-assignment", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attempt_id: s.id, score: n, max_score: max, passed: (n / max) * 100 >= a.pass_mark, feedback, reason: reason.trim() || undefined }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setBusy(""); toast.error(j.error ?? "Could not save"); return }
    if (release) {
      const r2 = await fetch("/api/lms/module-assignment", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attempt_id: s.id, release: true }) })
      if (!r2.ok) { setBusy(""); toast.error("Saved, but could not release"); return }
    }
    setBusy(""); toast.success(release ? "Confirmed and released to the participant" : "Mark confirmed (not released yet)"); onSaved()
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{a.title} — {p.student?.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-slate-400">Attempt {s.attempt_no}{s.submitted_at ? ` · submitted ${new Date(s.submitted_at).toLocaleString("en-GB")}` : ""}</p>
          {s.file_url && <a href={s.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-[#1B4F8A] hover:underline"><FileText className="h-4 w-4" />{s.file_name ?? "Submitted file"}</a>}
          {s.text && <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 whitespace-pre-wrap max-h-60 overflow-y-auto">{s.text}</div>}

          {ai?.criteria?.length ? (
            <div className="border border-violet-200 bg-violet-50/40 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> AI suggestion</p>
              {ai.criteria.map(c => <p key={c.id} className="text-xs text-slate-600"><b>{c.title}</b>: {c.score}/{c.max} — {c.comment}</p>)}
            </div>
          ) : s.status === "submitted" && (
            <Button variant="outline" onClick={askAi} disabled={!!busy} className="gap-2">{busy === "ai" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Ask the AI for a suggested mark</Button>
          )}

          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-slate-700">Score</p>
            <Input type="number" min={0} max={max} value={score} onChange={e => setScore(e.target.value)} className="w-24 h-9" />
            <span className="text-sm text-slate-500">/ {max}</span>
            {pct !== null && <span className={cn("text-sm font-semibold", pct >= a.pass_mark ? "text-emerald-700" : "text-red-600")}>{pct}% · {pct >= a.pass_mark ? "Passed" : "Not passed"}</span>}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700">Feedback for the participant</p>
            <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={4} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1B4F8A]/20" />
          </div>
          {needsReason && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-700">Reason for changing the mark (kept in the record)</p>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Re-checked section 3 — hazards were identified correctly" />
            </div>
          )}
          {s.rescores.length > 0 && (
            <div className="text-xs text-slate-500 space-y-0.5">
              <p className="font-semibold">Mark changes</p>
              {s.rescores.map((r, i) => <p key={i}>{new Date(r.at).toLocaleDateString("en-GB")} · {r.by}: {r.from} → {r.to} — {r.reason}</p>)}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => save(false)} disabled={!!busy} className="gap-2">{busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}Confirm mark</Button>
            <Button onClick={() => save(true)} disabled={!!busy} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">{busy === "release" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Confirm &amp; release</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="border-2 border-dashed border-slate-200 rounded-xl py-12 text-center text-sm text-slate-400">{text}</div>
}

