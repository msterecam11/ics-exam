"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, ChevronLeft, Award, PenLine, Sparkles, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// Step 11 — decisions a correction left for a person: a certificate whose exam
// now fails, or a written answer whose rubric changed. Nothing is automatic.

interface Review {
  id: string; kind: "remark" | "certificate"; status: string; resolution: string | null
  created_at: string; resolved_at: string | null
  student: { id: string; name: string } | null
  course: { id: string; title: string } | null
  details: any
  question?: { text: string; rubric: string; points: number }
  answer?: string
  current?: { score: number; justification?: string } | null
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
const pct = (r: { score: number; maxScore: number }) => r.maxScore ? Math.round((r.score / r.maxScore) * 100) : 0

export default function ExamReviewsPage() {
  const [status, setStatus] = useState<"open" | "resolved">("open")
  const [rows, setRows] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/lms/exam-reviews?status=${status}`)
    const d = await res.json().catch(() => [])
    if (!res.ok) toast.error(d?.error ?? "Could not load reviews")
    setRows(Array.isArray(d) ? d : [])
    setLoading(false)
  }, [status])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      <div>
        <Link href="/lms-admin/questions" className="text-xs text-slate-500 hover:text-[#1B4F8A] flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" /> Question Bank
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Exam reviews</h1>
        <p className="text-sm text-slate-500 mt-0.5">After a correction, anything that needs a person&apos;s decision waits here.</p>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {(["open", "resolved"] as const).map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={cn("px-3 py-1.5 rounded-md text-sm font-medium capitalize", status === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>
            {s === "open" ? "To decide" : "Decided"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 py-16 text-center">
          <CheckCircle2 className="h-9 w-9 text-emerald-200 mx-auto mb-3" />
          <p className="font-medium text-slate-500">{status === "open" ? "Nothing to decide" : "No decisions yet"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => <ReviewCard key={r.id} r={r} onDone={load} />)}
        </div>
      )}
    </div>
  )
}

function ReviewCard({ r, onDone }: { r: Review; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState("")
  const [score, setScore] = useState<string>(r.current?.score != null ? String(r.current.score) : "")
  const [suggestion, setSuggestion] = useState<{ score: number; justification: string } | null>(null)
  const open = r.status === "open"

  async function act(body: Record<string, unknown>, ok: string) {
    setBusy(true)
    const res = await fetch("/api/lms/exam-reviews", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: r.id, ...body }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast.error(d.error ?? "Could not save"); return null }
    if (ok) { toast.success(ok); onDone() }
    return d
  }

  async function suggest() {
    const d = await act({ action: "suggest" }, "")
    if (d?.suggestion) { setSuggestion(d.suggestion); setScore(String(d.suggestion.score)) }
  }

  const head = (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="flex items-start gap-3 min-w-0">
        <span className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
          r.kind === "certificate" ? "bg-amber-50 text-amber-600" : "bg-violet-50 text-violet-600")}>
          {r.kind === "certificate" ? <Award className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-slate-800">
            {r.kind === "certificate" ? "Certificate — exam now fails" : "Written answer — rubric changed"}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {r.student?.name ?? "Unknown student"} · {r.course?.title ?? "Unknown course"} · {fmt(r.created_at)}
          </p>
        </div>
      </div>
      {!open && r.resolution && (
        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{r.resolution}{r.resolved_at ? ` · ${fmt(r.resolved_at)}` : ""}</span>
      )}
    </div>
  )

  if (r.kind === "certificate") {
    const b = r.details?.before, a = r.details?.after
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        {head}
        {b && a && (
          <p className="text-sm text-slate-600">
            Score went from <b>{pct(b)}%</b> (passed) to <b>{pct(a)}%</b> (not passed) after the correction.
            {r.details?.code && <> Certificate <span className="font-mono text-xs">{r.details.code}</span>.</>}
          </p>
        )}
        {open && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (needed to revoke — kept with the record)" className="h-9 flex-1" />
            <div className="flex gap-2">
              <Button variant="outline" disabled={busy} onClick={() => act({ action: "keep" }, "Certificate kept")}>Keep</Button>
              <Button disabled={busy || !reason.trim()} onClick={() => act({ action: "revoke", reason }, "Certificate revoked")}
                className="bg-red-600 hover:bg-red-700 text-white">Revoke</Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const points = r.question?.points ?? r.details?.points ?? 0
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      {head}
      {r.question && (
        <div className="grid gap-3 md:grid-cols-2 text-sm">
          <div className="space-y-2">
            <p className="text-slate-800 font-medium">{r.question.text}</p>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[11px] font-semibold text-slate-400 uppercase mb-1">New rubric</p>
              <p className="text-slate-600 whitespace-pre-wrap">{r.question.rubric || "—"}</p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-[11px] font-semibold text-slate-400 uppercase mb-1">Student&apos;s answer</p>
            <p className="text-slate-700 whitespace-pre-wrap">{r.answer || <span className="italic text-slate-400">No answer</span>}</p>
          </div>
        </div>
      )}
      <p className="text-xs text-slate-500">Current mark: <b>{r.current?.score ?? r.details?.current_score ?? 0}/{points}</b></p>
      {suggestion && (
        <div className="rounded-lg bg-violet-50 border border-violet-100 p-3 text-sm text-violet-900">
          <b>AI suggests {suggestion.score}/{points}.</b> {suggestion.justification}
        </div>
      )}
      {open && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={busy} onClick={suggest} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Ask AI for a mark
          </Button>
          <Input type="number" min={0} max={points} step="0.5" value={score} onChange={e => setScore(e.target.value)} className="h-9 w-24" />
          <span className="text-sm text-slate-500">/ {points}</span>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" disabled={busy} onClick={() => act({ action: "keep" }, "Mark kept")}>Keep mark</Button>
            <Button disabled={busy || score === ""} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white"
              onClick={() => act({ action: "remark", score: Number(score), reason: suggestion?.justification }, "Mark saved")}>
              Save mark
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
