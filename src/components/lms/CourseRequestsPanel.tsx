"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Check, X, Inbox, Star, Building2, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// CV-7 — Program Manager → Requests. Approve into a program (an existing one
// that delivers the course, or a new one made on the spot), or reject with a
// reason the student sees.

interface Option {
  id: string; name: string; status: string; company: string | null; isIndividual: boolean
  tracks: { id: string; name: string }[]; needsTrack: boolean; recommended: boolean; full: boolean
}
interface Req {
  id: string; status: string; note: string | null; reason: string | null
  created_at: string; decided_at: string | null
  student: { id: string; name: string; email: string | null; company: string | null; individual: boolean } | null
  course: { id: string; title: string; delivery_mode: string } | null
  program: { id: string; name: string } | null
  group?: { id: string; label: string } | null
  options: Option[]
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"
const NEW = "__new__"

export default function CourseRequestsPanel({ onCount }: { onCount?: (n: number) => void }) {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending")
  const [rows, setRows] = useState<Req[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/lms/course-requests?status=${status}`)
    const d = res.ok ? await res.json() : { requests: [], pending: 0 }
    setRows(d.requests ?? [])
    onCount?.(d.pending ?? 0)
    setLoading(false)
  }, [status, onCount])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm w-fit">
        {([["pending", "Waiting"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setStatus(k)}
            className={cn("px-3 py-1.5 rounded-md whitespace-nowrap", status === k ? "bg-[#1B4F8A] text-white" : "text-slate-600 hover:bg-slate-50")}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <Inbox className="h-8 w-8 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-700 mt-3">
            {status === "pending" ? "Nothing waiting" : "Nothing here"}
          </p>
          {status === "pending" && (
            <p className="text-sm text-slate-500 mt-1">
              Requests arrive when students ask to join a course from the catalogue.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => <RequestCard key={r.id} r={r} onDone={load} />)}
        </div>
      )}
    </div>
  )
}

function RequestCard({ r, onDone }: { r: Req; onDone: () => void }) {
  const firstRecommended = r.options.find(o => o.recommended && !o.full)
  const [choice, setChoice] = useState<string>(firstRecommended?.id ?? (r.options.length ? "" : NEW))
  const [track, setTrack] = useState("")
  const [newName, setNewName] = useState(
    `${r.course?.title ?? "Course"} — ${r.student?.company ?? "Individual"}`)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  const opt = r.options.find(o => o.id === choice)

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true)
    const res = await fetch("/api/lms/course-requests", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: r.id, ...body }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast.error(data.error ?? "That didn't work"); return }
    toast.success(done)
    if (data.groupNote) (data.groupNote.startsWith("Placed") ? toast.success : toast.warning)(data.groupNote, { duration: 8000 })
    onDone()
  }

  const approve = () => choice === NEW
    ? send({ action: "approve", create_name: newName }, "Approved — new program created and the student enrolled")
    : send({ action: "approve", program_id: choice, track_id: track || undefined }, "Approved — the student is enrolled")

  const decided = r.status !== "pending"

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{r.course?.title ?? "A course that no longer exists"}</p>
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
            {r.student?.individual ? <User className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
            <span className="font-medium text-slate-700">{r.student?.name ?? "A removed student"}</span>
            <span>· {r.student?.company ?? "Individual learner"}</span>
            <span>· asked {fmt(r.created_at)}</span>
            {r.group && <span className="text-[#1B4F8A] font-medium">· wants {r.group.label}</span>}
          </p>
        </div>
        {decided && (
          <span className={cn("text-[11px] font-medium px-2.5 py-1 rounded-full border shrink-0",
            r.status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-100"
              : r.status === "rejected" ? "bg-red-50 text-red-700 border-red-100"
              : "bg-slate-100 text-slate-500 border-slate-200")}>
            {r.status === "approved" ? "Approved" : r.status === "rejected" ? "Rejected" : "Withdrawn"} · {fmt(r.decided_at)}
          </span>
        )}
      </div>

      {r.note && <p className="text-xs text-slate-600 mt-2 italic border-l-2 border-slate-200 pl-2">&ldquo;{r.note}&rdquo;</p>}

      {decided ? (
        <div className="mt-2 text-xs text-slate-500">
          {r.status === "approved" && r.program && (
            <>Joined <Link href={`/lms-admin/programs/${r.program.id}`} className="text-[#1B4F8A] hover:underline">{r.program.name}</Link></>
          )}
          {r.status === "rejected" && r.reason && <>Reason given: {r.reason}</>}
        </div>
      ) : rejecting ? (
        <div className="mt-3 space-y-2">
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={1000}
            placeholder="Why not? The student sees this."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none" />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !reason.trim()} onClick={() => send({ action: "reject", reason }, "Request rejected")}
              className="bg-red-600 hover:bg-red-700 text-white gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Reject
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Put them into</p>
          <div className="space-y-1.5">
            {r.options.map(o => (
              <label key={o.id} className={cn("flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer",
                o.full ? "opacity-50 cursor-not-allowed" : "",
                choice === o.id ? "border-[#1B4F8A] bg-[#1B4F8A]/5" : "border-slate-200 hover:bg-slate-50")}>
                <input type="radio" disabled={o.full} checked={choice === o.id} onChange={() => { setChoice(o.id); setTrack("") }} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="text-sm text-slate-800 flex items-center gap-1.5">
                    {o.name}
                    {o.recommended && <Star className="h-3 w-3 text-amber-500 fill-amber-400" />}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    {[o.isIndividual ? "Individual learners" : o.company, o.status === "draft" ? "draft" : "running", o.full ? "full" : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </label>
            ))}
            <label className={cn("flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer",
              choice === NEW ? "border-[#1B4F8A] bg-[#1B4F8A]/5" : "border-dashed border-slate-300 hover:bg-slate-50")}>
              <input type="radio" checked={choice === NEW} onChange={() => setChoice(NEW)} className="mt-0.5" />
              <span className="flex-1 min-w-0">
                <span className="text-sm text-slate-800">A new program, just for this</span>
                <span className="block text-[11px] text-slate-500">
                  One course, for {r.student?.company ?? "individual learners"}, starting today
                </span>
                {choice === NEW && <Input className="mt-2 h-8" value={newName} onChange={e => setNewName(e.target.value)} />}
              </span>
            </label>
          </div>

          {opt && opt.tracks.length > 1 && (
            <div>
              <p className="text-[11px] text-slate-500 mb-1">Which track{opt.needsTrack ? "" : " (optional)"}</p>
              <select value={track} onChange={e => setTrack(e.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-sm bg-white">
                <option value="">{opt.needsTrack ? "Choose…" : opt.tracks[0].name}</option>
                {opt.tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button size="sm" disabled={busy || !choice || (choice === NEW && !newName.trim()) || (!!opt?.needsTrack && !track)}
              onClick={approve} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(true)} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
