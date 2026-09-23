"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Lock, Unlock, PencilLine, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

// The group screen's Final exam tab, and the Open / lock switches it shares
// with the Assignments tab.

type AccessItem = { id: string; title: string; module_type: string; open: boolean; changed_by: string | null; changed_at: string | null }

/** Open or lock the final exam / assignments for this group. */
export function AccessPanel({ groupId, type }: { groupId: string; type: "final_exam" | "assignment" }) {
  const [items, setItems] = useState<AccessItem[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(async () => {
    const res = await fetch(`/api/lms/groups/${groupId}/access`)
    const j = await res.json().catch(() => ({}))
    setItems(res.ok ? (j.items ?? []).filter((i: AccessItem) => i.module_type === type) : [])
  }, [groupId, type])
  useEffect(() => { load() }, [load])

  async function toggle(i: AccessItem) {
    const open = !i.open
    if (open && type === "final_exam" && !confirm(`Open "${i.title}" now? Participants of this group can start it straight away.`)) return
    setBusy(i.id)
    const res = await fetch(`/api/lms/groups/${groupId}/access`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module_id: i.id, open }) })
    setBusy(null)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? "Could not change it"); return }
    toast.success(open ? "Open for this group" : "Locked for this group")
    load()
  }

  if (!items?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
      {items.map(i => (
        <div key={i.id} className="flex items-center gap-3 px-4 py-3">
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", i.open ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500")}>
            {i.open ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800">{i.title} · <span className={i.open ? "text-emerald-700" : "text-slate-500"}>{i.open ? "Open" : "Locked"}</span></p>
            <p className="text-xs text-slate-400">
              {i.changed_at ? `${i.open ? "Opened" : "Locked"} by ${i.changed_by ?? "staff"} · ${new Date(i.changed_at).toLocaleString("en-GB")}`
                : type === "final_exam" ? "Locked until you open it — no access code needed." : "Open by default."}
            </p>
          </div>
          <Button size="sm" variant={i.open ? "outline" : "default"} onClick={() => toggle(i)} disabled={busy === i.id}
            className={cn("gap-1.5", !i.open && "bg-emerald-600 hover:bg-emerald-700 text-white")}>
            {busy === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : i.open ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            {i.open ? "Lock" : "Open now"}
          </Button>
        </div>
      ))}
    </div>
  )
}

type Attempt = { id: string; attempt_no: number; score: number; max_score: number; passed: boolean; submitted_at: string | null; pct: number | null; changed: number }
type Row = { enrollment_id: string; student: { id: string; name: string; email: string } | null; attempts: Attempt[] }

export function GroupExam({ groupId }: { groupId: string }) {
  const [d, setD] = useState<{ exam: { id: string; title: string } | null; participants: Row[] } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const load = useCallback(async () => {
    const res = await fetch(`/api/lms/groups/${groupId}/exam`)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? "Could not load the exam"); return }
    setD(j)
  }, [groupId])
  useEffect(() => { load() }, [load])

  if (!d) return <div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
  if (!d.exam) return <div className="border-2 border-dashed border-slate-200 rounded-xl py-12 text-center text-sm text-slate-400">This course has no final exam.</div>

  return (
    <div className="space-y-4">
      <AccessPanel groupId={groupId} type="final_exam" />
      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {d.participants.map(p => (
          <div key={p.enrollment_id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
            <p className="flex-1 min-w-[160px] text-sm font-medium text-slate-800">{p.student?.name}</p>
            {p.attempts.length === 0 ? <span className="text-xs text-slate-400">Not taken</span> : p.attempts.map(a => (
              <button key={a.id} onClick={() => setOpen(a.id)} title="Open the paper to review or change a mark"
                className={cn("text-xs font-semibold px-2.5 py-1 rounded-lg border flex items-center gap-1.5",
                  a.passed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600")}>
                #{a.attempt_no} · {a.pct ?? "—"}% {a.passed ? "passed" : "not passed"}
                {a.changed > 0 && <span className="flex items-center gap-0.5 text-amber-700"><PencilLine className="h-3 w-3" />{a.changed}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
      {open && <RescoreDialog attemptId={open} onClose={() => { setOpen(null); load() }} />}
    </div>
  )
}

type Q = { id: string; n: number; type: string; text: string; points: number; voided: boolean; answer: string; correct: string | null; auto: number; ai_note: string | null
  override: { score: number; reason: string; by_name?: string | null; at?: string } | null }
type Paper = { attempt: { id: string; attempt_no: number; score: number; max_score: number; passed: boolean; student: string | null; exam: string; time_limit_exceeded: boolean }
  questions: Q[]; history: { question_id: string; from: number; to: number; reason: string; by: string; at: string; cleared?: boolean }[] }

function RescoreDialog({ attemptId, onClose }: { attemptId: string; onClose: () => void }) {
  const [p, setP] = useState<Paper | null>(null)
  const [edit, setEdit] = useState<{ q: Q; score: string; reason: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const res = await fetch(`/api/lms/exam-rescore?attempt_id=${attemptId}`)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? "Could not load the paper"); onClose(); return }
    setP(j)
  }, [attemptId, onClose])
  useEffect(() => { load() }, [load])

  async function save(score: number | null) {
    if (!edit) return
    if (edit.reason.trim().length < 3) { toast.error("Give a reason for changing the mark"); return }
    setBusy(true)
    const res = await fetch("/api/lms/exam-rescore", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attempt_id: attemptId, question_id: edit.q.id, score, reason: edit.reason }) })
    setBusy(false)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? "Could not save"); return }
    toast.success(`Now ${j.pct}% · ${j.passed ? "passed" : "not passed"} (pass ${j.pass_mark}%)`)
    if (j.warning) toast.warning(j.warning, { duration: 10000 })
    setEdit(null); load()
  }

  const a = p?.attempt
  const pct = a && a.max_score ? Math.round((a.score / a.max_score) * 100) : null
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{a ? `${a.exam} — ${a.student} · attempt ${a.attempt_no}` : "Exam paper"}</DialogTitle></DialogHeader>
        {!p ? <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div> : (
          <div className="space-y-3">
            <p className={cn("text-sm font-semibold", a!.passed ? "text-emerald-700" : "text-red-600")}>
              {a!.score} / {a!.max_score} = {pct}% · {a!.passed ? "Passed" : "Not passed"}{a!.time_limit_exceeded ? " · over the time limit (can't pass)" : ""}
            </p>
            {p.questions.map(q => {
              const mark = q.override ? q.override.score : q.auto
              return (
                <div key={q.id} className={cn("border rounded-lg p-3 space-y-1.5", q.voided ? "border-slate-100 opacity-50" : q.override ? "border-amber-200 bg-amber-50/30" : "border-slate-200")}>
                  <div className="flex items-start gap-3">
                    <p className="flex-1 text-sm text-slate-800"><b>Q{q.n}.</b> {q.text}{q.voided && <span className="ml-2 text-xs text-slate-400">(voided)</span>}</p>
                    <p className="text-sm font-semibold text-slate-700 shrink-0">{mark} / {q.points}</p>
                    {!q.voided && <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEdit({ q, score: String(mark), reason: "" })}><PencilLine className="h-3 w-3" />Change</Button>}
                  </div>
                  <p className="text-xs text-slate-600"><span className="text-slate-400">Answer:</span> {q.answer || <i className="text-slate-400">no answer</i>}</p>
                  {q.correct && <p className="text-xs text-slate-500"><span className="text-slate-400">{q.type === "open_ended" ? "Rubric:" : "Correct:"}</span> {q.correct}</p>}
                  {q.ai_note && <p className="text-xs text-violet-700">AI: {q.ai_note}</p>}
                  {q.override && <p className="text-xs text-amber-700">Changed from {q.auto} by {q.override.by_name ?? "staff"} — {q.override.reason}</p>}
                </div>
              )
            })}
            {p.history.length > 0 && (
              <div className="text-xs text-slate-500 space-y-0.5 pt-2 border-t border-slate-100">
                <p className="font-semibold">Mark changes</p>
                {p.history.map((h, i) => <p key={i}>{new Date(h.at).toLocaleString("en-GB")} · {h.by} · Q{p.questions.find(q => q.id === h.question_id)?.n ?? "?"}: {h.from} → {h.to}{h.cleared ? " (automatic mark back)" : ""} — {h.reason}</p>)}
              </div>
            )}
          </div>
        )}
        {edit && (
          <div className="border-t border-slate-200 pt-3 space-y-2">
            <p className="text-sm font-semibold text-slate-800">Change Q{edit.q.n} (automatic mark {edit.q.auto} / {edit.q.points})</p>
            <div className="flex items-center gap-2">
              <Input type="number" min={0} max={edit.q.points} value={edit.score} onChange={e => setEdit({ ...edit, score: e.target.value })} className="w-24 h-9" />
              <span className="text-sm text-slate-500">/ {edit.q.points}</span>
            </div>
            <Input value={edit.reason} onChange={e => setEdit({ ...edit, reason: e.target.value })} placeholder="Reason (kept in the record), e.g. Answer is correct in local procedure AD-12" />
            <div className="flex justify-end gap-2">
              {edit.q.override && <Button variant="outline" disabled={busy} onClick={() => save(null)} className="gap-1.5"><RotateCcw className="h-3.5 w-3.5" />Automatic mark back</Button>}
              <Button variant="outline" disabled={busy} onClick={() => setEdit(null)}>Cancel</Button>
              <Button disabled={busy} onClick={() => save(Number(edit.score))} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save mark</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
