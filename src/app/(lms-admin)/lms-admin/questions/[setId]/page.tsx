"use client"

import { useCallback, useEffect, useState, use } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { Loader2, Plus, ChevronLeft, Search, Archive, ArchiveRestore, Pencil, Upload } from "lucide-react"
import BankCsvImport from "@/components/lms/bank/BankCsvImport"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import QuestionEditorDialog from "@/components/lms/bank/QuestionEditorDialog"
import { Q_TYPE_META, type QType } from "@/components/lms/ActivityEditor"

// Step 11 — the questions of one set. Editing goes through the shared dialog,
// which asks "correct or update?" once students have answered a question.

interface Q {
  id: string; type: string; difficulty: string; tags: string[]; topic: string | null
  version: number; payload: any; archived_at: string | null
}

export default function QuestionSetPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = use(params)
  const { data: session } = useSession()
  const isAdmin = session?.user.role === "admin"
  const [set, setSet] = useState<{ id: string; name: string; description: string | null; archived_at: string | null } | null>(null)
  const [questions, setQuestions] = useState<Q[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [difficulty, setDifficulty] = useState("")
  const [showArchived, setShowArchived] = useState(false)
  // undefined = closed, null = creating, string = editing that question
  const [editing, setEditing] = useState<string | null | undefined>(undefined)
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [setsRes, qRes] = await Promise.all([
      fetch("/api/lms/bank/sets?archived=1"),
      fetch(`/api/lms/bank/questions?set_id=${setId}${showArchived ? "&archived=1" : ""}`),
    ])
    const sets = await setsRes.json().catch(() => [])
    setSet(Array.isArray(sets) ? sets.find((s: any) => s.id === setId) ?? null : null)
    const qs = await qRes.json().catch(() => [])
    setQuestions(Array.isArray(qs) ? qs : [])
    setLoading(false)
  }, [setId, showArchived])
  useEffect(() => { load() }, [load])

  async function setArchived(q: Q, archived: boolean) {
    const res = await fetch("/api/lms/bank/questions", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: q.id, archived }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(d.error ?? "Could not change the question"); return }
    toast.success(archived ? "Archived — it won't be drawn for new papers" : "Restored")
    load()
  }

  const term = search.trim().toLowerCase()
  const visible = questions.filter(q =>
    (!difficulty || q.difficulty === difficulty)
    && (!term || String(q.payload?.text ?? "").toLowerCase().includes(term) || (q.topic ?? "").toLowerCase().includes(term)
        || q.tags.some(t => t.toLowerCase().includes(term))))

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link href="/lms-admin/questions" className="text-xs text-slate-500 hover:text-[#1B4F8A] flex items-center gap-1">
            <ChevronLeft className="h-3.5 w-3.5" /> Question Bank
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1 flex items-center gap-2">
            {set?.name ?? "Question set"}
            {set?.archived_at && <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">archived</span>}
          </h1>
          {set?.description && <p className="text-sm text-slate-500 mt-0.5">{set.description}</p>}
        </div>
        {set && !set.archived_at && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImporting(true)} className="gap-2">
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
            <Button onClick={() => setEditing(null)} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
              <Plus className="h-4 w-4" /> New question
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search text, topic or tag…" className="pl-9 h-9" />
        </div>
        <select value={difficulty} onChange={e => setDifficulty(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white">
          <option value="">Any difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived
        </label>
        <span className="text-xs text-slate-400 ml-auto">{visible.length} question{visible.length === 1 ? "" : "s"}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 py-16 text-center">
          <p className="font-medium text-slate-500">{questions.length ? "No questions match" : "No questions in this set yet"}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {visible.map((q, i) => {
            const meta = Q_TYPE_META[q.type as QType]
            return (
              <div key={q.id} className={cn("flex items-start gap-3 px-4 py-3", q.archived_at && "opacity-60")}>
                <span className="text-xs text-slate-300 w-6 shrink-0 mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 line-clamp-2">{q.payload?.text ?? "(no text)"}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]">
                    {meta && <span className={cn("font-semibold px-1.5 py-0.5 rounded-full", meta.color)}>{meta.label}</span>}
                    <span className="text-slate-500 capitalize">{q.difficulty}</span>
                    <span className="text-slate-400">{q.payload?.points ?? 1} pt</span>
                    <span className="text-slate-400 font-mono">v{q.version}</span>
                    {q.topic && <span className="text-slate-500">{q.topic}</span>}
                    {q.tags.map(t => <span key={t} className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{t}</span>)}
                    {q.archived_at && <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">archived</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setEditing(q.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setArchived(q, !q.archived_at)} title={q.archived_at ? "Restore" : "Archive"}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                    {q.archived_at ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {importing && set && (
        <BankCsvImport setId={setId} setName={set.name} onClose={() => setImporting(false)} onDone={() => { setImporting(false); load() }} />
      )}
      {editing !== undefined && (
        <QuestionEditorDialog
          questionId={editing}
          setId={setId}
          canCorrect={isAdmin}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); load() }}
        />
      )}
    </div>
  )
}
