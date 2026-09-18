"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { Loader2, Plus, Search, FolderOpen, Archive, ArchiveRestore, Shuffle, ChevronRight, X, ClipboardCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// Step 11 — the Question Bank: the one home of exam questions, grouped in sets.
// A draw section picks from a set; a fixed section holds chosen questions.
// Sets are archived, never deleted — a paper may still hold their questions.

interface SetRow {
  id: string; name: string; description: string | null; archived_at: string | null
  course: { id: string; title: string } | null
  from_exam: boolean
  counts: { total: number; easy: number; medium: number; hard: number; archived: number }
  used_by: number
}

export default function QuestionBankPage() {
  const [sets, setSets] = useState<SetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [busy, setBusy] = useState(false)
  const { data: session } = useSession()
  const isAdmin = session?.user.role === "admin"
  const [openReviews, setOpenReviews] = useState(0)

  useEffect(() => {
    if (!isAdmin) return
    fetch("/api/lms/exam-reviews?status=open").then(r => r.ok ? r.json() : []).then(d => setOpenReviews(Array.isArray(d) ? d.length : 0))
  }, [isAdmin])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/lms/bank/sets${showArchived ? "?archived=1" : ""}`)
    const d = await res.json().catch(() => [])
    if (!res.ok) toast.error(d?.error ?? "Could not load the bank")
    setSets(Array.isArray(d) ? d : [])
    setLoading(false)
  }, [showArchived])
  useEffect(() => { load() }, [load])

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    const res = await fetch("/api/lms/bank/sets", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast.error(d.error ?? "Could not create the set"); return }
    toast.success("Set created")
    setCreating(false); setName(""); setDescription("")
    load()
  }

  async function setArchived(s: SetRow, archived: boolean) {
    const res = await fetch("/api/lms/bank/sets", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: s.id, archived }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(d.error ?? "Could not change the set"); return }
    toast.success(archived ? "Set archived" : "Set restored")
    load()
  }

  const q = search.trim().toLowerCase()
  const visible = sets.filter(s => !q || s.name.toLowerCase().includes(q) || (s.course?.title ?? "").toLowerCase().includes(q))

  return (
    <div className="space-y-5">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Question Bank</h1>
          <p className="text-sm text-slate-500 mt-0.5">Every exam question lives here, grouped in sets. Exams pick from them.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link href="/lms-admin/questions/reviews"
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> Reviews
              {openReviews > 0 && <span className="bg-amber-500 text-white text-[11px] font-semibold rounded-full px-1.5">{openReviews}</span>}
            </Link>
          )}
          <Button onClick={() => setCreating(true)} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
            <Plus className="h-4 w-4" /> New set
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sets or courses…" className="pl-9 h-9" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 py-16 text-center">
          <FolderOpen className="h-9 w-9 text-slate-200 mx-auto mb-3" />
          <p className="font-medium text-slate-500">{sets.length ? "No sets match" : "The bank is empty"}</p>
          {!sets.length && (
            <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
              Create a set, or open a course&apos;s final exam and move its questions in — that makes a set from them.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visible.map(s => (
            <div key={s.id} className={cn("bg-white rounded-xl border p-4 flex flex-col gap-3", s.archived_at ? "border-slate-100 opacity-70" : "border-slate-200")}>
              <div className="flex items-start justify-between gap-3">
                <Link href={`/lms-admin/questions/${s.id}`} className="min-w-0 group">
                  <p className="font-semibold text-slate-800 group-hover:text-[#1B4F8A] truncate flex items-center gap-2">
                    {s.name}
                    {s.archived_at && <span className="text-[10px] font-medium bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">archived</span>}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {[s.course?.title, s.from_exam ? "moved in from an exam" : null].filter(Boolean).join(" · ") || s.description || "—"}
                  </p>
                </Link>
                <button onClick={() => setArchived(s, !s.archived_at)} title={s.archived_at ? "Restore" : "Archive"}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 shrink-0">
                  {s.archived_at ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                <span className="font-semibold text-slate-700">{s.counts.total} question{s.counts.total === 1 ? "" : "s"}</span>
                <span>{s.counts.easy} easy · {s.counts.medium} medium · {s.counts.hard} hard</span>
                {s.counts.archived > 0 && <span className="text-slate-400">{s.counts.archived} archived</span>}
                {s.used_by > 0 && (
                  <span className="flex items-center gap-1 text-violet-600"><Shuffle className="h-3 w-3" /> drawn by {s.used_by} exam{s.used_by === 1 ? "" : "s"}</span>
                )}
                <Link href={`/lms-admin/questions/${s.id}`} className="ml-auto text-slate-300 hover:text-slate-600"><ChevronRight className="h-4 w-4" /></Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setCreating(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">New question set</h2>
              <button onClick={() => setCreating(false)} className="p-1 rounded hover:bg-slate-100 text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Safety — Emergency procedures"
              onKeyDown={e => { if (e.key === "Enter") create() }} />
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="What it covers (optional)"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
              <Button onClick={create} disabled={busy || !name.trim()} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white">Create</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
