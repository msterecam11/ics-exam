"use client"

import { useEffect, useState } from "react"
import { Loader2, X, History, AlertTriangle, CheckCircle2, Ban, GitBranch, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { QuestionBody, createQuestion, Q_TYPE_META, type Question, type QType } from "@/components/lms/ActivityEditor"

// Step 11 — one editor for a bank question, wherever it's opened from.
//
// Nobody has answered it → Save just saves.
// Somebody has → Save asks: Correct (a mistake — re-marks everyone who had
// this version, admin only) or Update (a new version, future papers only).
// Some changes can only be updates; the server says which. Nothing that
// changes a result happens before the admin has seen the preview.

interface Report {
  checked: number; changed: number
  flips: { before: { passed: boolean }; after: { passed: boolean } }[]
  finished: { attempts: number; programs: { id: string; name: string; status: string }[] }
  openPapers: number; remarks: number; certificateReviews: number
  removed_from?: { exam: string; course: string }[]
  draw_short?: string[]
}

type Step =
  | { kind: "edit" }
  | { kind: "decide"; allowed: ("correct" | "update")[]; reason: string | null; affectsMarks: boolean; rubricChanged: boolean }
  | { kind: "preview"; action: "correct" | "void"; report: Report }

const withLocalId = (p: any): Question => ({ ...p, id: p?.id ?? "q" })

export default function QuestionEditorDialog({ questionId, setId, newType, canCorrect, onClose, onSaved }: {
  questionId?: string | null
  /** Creating: the set it goes into. */
  setId?: string | null
  newType?: QType
  canCorrect: boolean
  onClose: () => void
  onSaved: (q: any) => void
}) {
  const creating = !questionId
  const [loading, setLoading] = useState(!creating)
  const [q, setQ] = useState<Question>(() => createQuestion(newType ?? "mcq_single"))
  const [difficulty, setDifficulty] = useState("medium")
  const [tags, setTags] = useState("")
  const [topic, setTopic] = useState("")
  const [meta, setMeta] = useState<{ version: number; answered: boolean; archived: boolean; used_in: any[]; history: any[] } | null>(null)
  const [step, setStep] = useState<Step>({ kind: "edit" })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")
  const [includeFinished, setIncludeFinished] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  /** null = the current version. An older version can only be corrected. */
  const [olderVersion, setOlderVersion] = useState<number | null>(null)

  useEffect(() => {
    if (creating) return
    fetch(`/api/lms/bank/questions?id=${questionId}`).then(r => r.json()).then(d => {
      if (!d?.question) { toast.error(d?.error ?? "Could not load the question"); onClose(); return }
      setQ(withLocalId({ ...d.question.payload, type: d.question.type }))
      setDifficulty(d.question.difficulty)
      setTags((d.question.tags ?? []).join(", "))
      setTopic(d.question.topic ?? "")
      setMeta({ version: d.question.version, answered: d.answered, archived: !!d.question.archived_at, used_in: d.used_in ?? [], history: d.history ?? [] })
      setLoading(false)
    })
  }, [creating, questionId, onClose])

  const body = (extra: Record<string, unknown> = {}) => ({
    id: questionId, question: { ...q, id: undefined },
    difficulty, tags: tags.split(",").map(t => t.trim()).filter(Boolean), topic,
    note: note || undefined, include_finished: includeFinished,
    ...(olderVersion !== null ? { version: olderVersion } : {}), ...extra,
  })

  async function call(method: string, payload: unknown) {
    const res = await fetch("/api/lms/bank/questions", {
      method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    })
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) }
  }

  async function save() {
    setBusy(true)
    if (creating) {
      const r = await call("POST", { set_id: setId, question: { ...q, id: undefined }, difficulty,
        tags: tags.split(",").map(t => t.trim()).filter(Boolean), topic })
      setBusy(false)
      if (!r.ok) { toast.error(r.data.error ?? "Could not save"); return }
      toast.success("Question saved"); onSaved(r.data); return
    }
    const r = await call("PATCH", body())
    setBusy(false)
    if (r.status === 409 && r.data.needs_decision) {
      setStep({ kind: "decide", allowed: r.data.allowed, reason: r.data.reason, affectsMarks: r.data.affects_marks, rubricChanged: r.data.rubric_changed })
      return
    }
    if (!r.ok) { toast.error(r.data.error ?? "Could not save"); return }
    toast.success(r.data.action === "edited" ? "Saved — nobody had answered it yet" : "Saved")
    onSaved(r.data.question)
  }

  async function chooseUpdate() {
    setBusy(true)
    const r = await call("PATCH", body({ mode: "update" }))
    setBusy(false)
    if (!r.ok) { toast.error(r.data.error ?? "Could not save"); return }
    toast.success(`Saved as version ${r.data.version} — only students who start from now on get it`)
    onSaved(r.data.question)
  }

  async function previewCorrect(finished = includeFinished) {
    setBusy(true)
    const r = await call("PATCH", body({ mode: "correct", preview: true, include_finished: finished }))
    setBusy(false)
    if (!r.ok) { toast.error(r.data.error ?? "Could not work out the effect"); return }
    setStep({ kind: "preview", action: "correct", report: r.data })
  }

  async function previewVoid(finished = includeFinished) {
    setBusy(true)
    const r = await call("PATCH", { id: questionId, void: true, preview: true, include_finished: finished })
    setBusy(false)
    if (!r.ok) { toast.error(r.data.error ?? "Could not work out the effect"); return }
    setStep({ kind: "preview", action: "void", report: r.data })
  }

  async function confirm() {
    if (step.kind !== "preview") return
    setBusy(true)
    const r = step.action === "correct"
      ? await call("PATCH", body({ mode: "correct" }))
      : await call("PATCH", { id: questionId, void: true, note: note || undefined, include_finished: includeFinished })
    setBusy(false)
    if (!r.ok) { toast.error(r.data.error ?? "That didn't work"); return }
    const rep = step.action === "correct" ? r.data.report : r.data
    toast.success(`${step.action === "correct" ? "Corrected" : "Voided"} — ${rep?.changed ?? 0} result${rep?.changed === 1 ? "" : "s"} changed` +
      (rep?.certificateReviews ? `, ${rep.certificateReviews} certificate${rep.certificateReviews === 1 ? "" : "s"} to review` : "") +
      (rep?.remarks ? `, ${rep.remarks} answer${rep.remarks === 1 ? "" : "s"} to re-mark` : ""))
    onSaved(r.data.question ?? null)
  }

  const toggleFinished = (v: boolean) => {
    setIncludeFinished(v)
    if (step.kind === "preview") (step.action === "correct" ? previewCorrect : previewVoid)(v)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              {creating ? "New question" : "Edit question"}
              {meta && <span className="text-[11px] font-mono text-slate-400">v{meta.version}</span>}
              {meta?.archived && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">archived</span>}
            </h2>
            {meta && (
              <p className="text-xs text-slate-500 mt-0.5">
                {meta.answered ? "Students have answered this — saving will ask what kind of change it is." : "Nobody has answered it yet, so it can be edited freely."}
                {meta.used_in.length > 0 && ` Used in ${new Set(meta.used_in.map(u => u.moduleId)).size} exam${new Set(meta.used_in.map(u => u.moduleId)).size === 1 ? "" : "s"}.`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {loading ? (
            <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
          ) : step.kind === "edit" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                {creating ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(Q_TYPE_META) as QType[]).map(t => (
                      <button key={t} type="button" onClick={() => { if (t !== q.type) setQ(createQuestion(t)) }}
                        className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors",
                          t === q.type ? cn(Q_TYPE_META[t].color, "border-transparent") : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
                        {Q_TYPE_META[t].icon} {Q_TYPE_META[t].label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", Q_TYPE_META[q.type]?.color)}>{Q_TYPE_META[q.type]?.label}</span>
                )}
              </div>
              {olderVersion !== null && (
                <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  You&apos;re correcting <strong>version {olderVersion}</strong> — the one earlier students had. Saving re-marks only
                  their papers; the current version is not affected.
                </p>
              )}
              <QuestionBody q={q} onChange={setQ} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                <label className="text-xs">
                  <span className="block text-slate-500 mb-1">Difficulty</span>
                  <select value={difficulty} onChange={e => setDifficulty(e.target.value)} className="w-full h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white">
                    <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                  </select>
                </label>
                <label className="text-xs">
                  <span className="block text-slate-500 mb-1">Topic</span>
                  <Input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Runway inspection" className="h-9" />
                </label>
                <label className="text-xs">
                  <span className="block text-slate-500 mb-1">Tags (comma separated)</span>
                  <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="GACAR, safety" className="h-9" />
                </label>
              </div>
              {meta && meta.history.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <button onClick={() => setShowHistory(v => !v)} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" /> History ({meta.history.length})
                  </button>
                  {showHistory && (
                    <ul className="mt-2 space-y-1">
                      {meta.history.map((h, i) => (
                        <li key={i} className="text-xs text-slate-600 flex gap-2">
                          <span className="font-mono text-slate-400 w-8">v{h.version}</span>
                          <span className="capitalize w-16">{h.change}</span>
                          <span className="text-slate-400">{new Date(h.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                          <span className="text-slate-400">{h.by ?? ""}</span>
                          {h.affected ? <span className="text-slate-500">· {h.affected} paper{h.affected === 1 ? "" : "s"}</span> : null}
                          {h.note && <span className="text-slate-500 italic truncate">· {h.note}</span>}
                          {canCorrect && h.version < (meta?.version ?? 0) && h.change !== "void" && i === meta!.history.findIndex((x: any) => x.version === h.version) && (
                            <button onClick={() => { setQ(withLocalId({ ...h.payload, type: h.payload?.type ?? q.type })); setOlderVersion(h.version); setShowHistory(false) }}
                              className="ml-auto text-[#1B4F8A] hover:underline shrink-0">Correct v{h.version}</button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : step.kind === "decide" ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">Students have already answered this question. What kind of change is this?</p>
              {step.reason && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {step.reason}, so it can only be an update.
                </p>
              )}
              {olderVersion === null && <button onClick={chooseUpdate} disabled={busy}
                className="w-full text-left rounded-xl border border-slate-200 hover:border-[#1B4F8A] hover:bg-[#1B4F8A]/5 p-4 transition-colors">
                <p className="text-sm font-semibold text-slate-800 flex items-center gap-2"><GitBranch className="h-4 w-4 text-[#1B4F8A]" /> Update — a new version</p>
                <p className="text-xs text-slate-500 mt-1">
                  A deliberate change. Only students who start the exam from now on get it. Past results and papers stay exactly as they are.
                </p>
              </button>}
              {step.allowed.includes("correct") && (
                <button onClick={() => canCorrect && previewCorrect()} disabled={busy || !canCorrect}
                  className={cn("w-full text-left rounded-xl border p-4 transition-colors",
                    canCorrect ? "border-slate-200 hover:border-amber-500 hover:bg-amber-50" : "border-slate-100 opacity-60 cursor-not-allowed")}>
                  <p className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Wrench className="h-4 w-4 text-amber-600" /> Correct — it was a mistake</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {step.affectsMarks
                      ? "Everyone who had this version is re-marked, including exams in progress. You'll see who changes before anything is applied."
                      : step.rubricChanged
                        ? "The answers marked under the old rubric go to the review list; their marks stay until someone decides."
                        : "Fixes the wording on past papers too. No marks can change."}
                    {!canCorrect && " Only an admin can correct a question students have answered."}
                  </p>
                </button>
              )}
              <label className="text-xs block pt-1">
                <span className="block text-slate-500 mb-1">Note (kept in the history)</span>
                <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Why this change?" className="h-9" />
              </label>
            </div>
          ) : (
            <PreviewPanel action={step.action} report={step.report} includeFinished={includeFinished} onToggleFinished={toggleFinished} note={note} setNote={setNote} />
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <div>
            {!creating && step.kind === "edit" && canCorrect && meta?.answered && (
              <Button variant="outline" size="sm" onClick={() => previewVoid()} disabled={busy} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
                <Ban className="h-3.5 w-3.5" /> Void this question
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step.kind !== "edit" && <Button variant="outline" onClick={() => setStep({ kind: "edit" })} disabled={busy}>Back</Button>}
            {step.kind === "edit" && (
              <Button onClick={save} disabled={busy || loading} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </Button>
            )}
            {step.kind === "preview" && (
              <Button onClick={confirm} disabled={busy}
                className={cn("text-white gap-2", step.action === "void" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700")}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {step.action === "void" ? "Void it" : "Apply the correction"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewPanel({ action, report, includeFinished, onToggleFinished, note, setNote }: {
  action: "correct" | "void"; report: Report; includeFinished: boolean
  onToggleFinished: (v: boolean) => void; note: string; setNote: (v: string) => void
}) {
  const nowPass = report.flips.filter(f => !f.before.passed && f.after.passed).length
  const nowFail = report.flips.filter(f => f.before.passed && !f.after.passed).length
  const Row = ({ n, label, tone = "slate" }: { n: number; label: string; tone?: "slate" | "emerald" | "red" | "amber" }) => (
    <div className="flex items-baseline gap-2">
      <span className={cn("text-xl font-bold", { slate: "text-slate-900", emerald: "text-emerald-600", red: "text-red-600", amber: "text-amber-600" }[tone])}>{n}</span>
      <span className="text-sm text-slate-600">{label}</span>
    </div>
  )
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">
        {action === "void"
          ? "Voiding removes this question from the total of everyone who had it. Nobody gains or loses marks from it."
          : "Applying this correction re-marks everyone who had this version of the question."}
        {" "}Nothing has changed yet.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 rounded-xl p-4">
        <Row n={report.checked} label="papers re-marked" />
        <Row n={report.changed} label="results change" tone="amber" />
        <Row n={nowPass} label="now pass" tone="emerald" />
        <Row n={nowFail} label="now fail" tone="red" />
        <Row n={report.openPapers} label="exams in progress" />
        {report.remarks > 0 && <Row n={report.remarks} label="answers to re-mark" tone="amber" />}
      </div>
      {nowFail > 0 && (
        <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
          Anyone who now fails keeps their certificate. They go on the review list for you to decide.
        </p>
      )}
      {report.finished.attempts > 0 && (
        <label className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 cursor-pointer">
          <input type="checkbox" checked={includeFinished} onChange={e => onToggleFinished(e.target.checked)} className="mt-0.5" />
          <span className="text-xs text-amber-900">
            <strong>Also correct finished programs</strong> — {report.finished.attempts} attempt{report.finished.attempts === 1 ? "" : "s"} in{" "}
            {report.finished.programs.map(p => p.name).join(", ")}. Their reports and certificates have already gone to the client, so they're left alone unless you tick this.
          </span>
        </label>
      )}
      {!!report.removed_from?.length && (
        <p className="text-xs text-slate-600">
          It will also be taken out of: {report.removed_from.map(r => `${r.exam} (${r.course})`).join(", ")}.
        </p>
      )}
      {!!report.draw_short?.length && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          Heads up: {report.draw_short.join("; ")}. Add questions to that set, or new students can&apos;t start the exam.
        </p>
      )}
      <label className="text-xs block">
        <span className="block text-slate-500 mb-1">Note (kept in the history)</span>
        <Input value={note} onChange={e => setNote(e.target.value)} placeholder={action === "void" ? "e.g. two answers are correct" : "e.g. wrong option marked as correct"} className="h-9" />
      </label>
    </div>
  )
}
