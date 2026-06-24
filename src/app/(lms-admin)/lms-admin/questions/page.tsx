"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import {
  Plus, Search, Loader2, Folder, FolderOpen,
  MoreVertical, Edit2, Trash2, BookOpen, X,
} from "lucide-react"
import { Button }  from "@/components/ui/button"
import { Input }   from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast }   from "sonner"
import { cn }      from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────
interface QuestionSet {
  id:             string
  name:           string
  description:    string | null
  topic:          string | null
  created_at:     string
  question_count: number
  easy_count:     number
  medium_count:   number
  hard_count:     number
}

// ─── Set modal (create / edit) ────────────────────────────────────────────────
function SetModal({
  open, onClose, editing, onSaved,
}: {
  open:    boolean
  onClose: () => void
  editing: QuestionSet | null
  onSaved: (s: QuestionSet) => void
}) {
  const [name,   setName]  = useState("")
  const [desc,   setDesc]  = useState("")
  const [topic,  setTopic] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "")
      setDesc(editing?.description ?? "")
      setTopic(editing?.topic ?? "")
    }
  }, [open, editing])

  async function save() {
    if (!name.trim()) return toast.error("Name is required")
    setSaving(true)
    try {
      const method = editing ? "PATCH" : "POST"
      const body: Record<string, unknown> = {
        name:        name.trim(),
        description: desc.trim() || undefined,
        topic:       topic.trim() || undefined,
      }
      if (editing) body.id = editing.id

      const res  = await fetch("/api/lms/question-sets", {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed"); return }
      toast.success(editing ? "Set updated" : "Set created")
      onSaved(editing ? { ...editing, ...data } : data)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Question Set" : "New Question Set"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Set Name *</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Aviation Meteorology — Module 3"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Topic / Category</label>
            <Input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Meteorology, Navigation, Air Law…"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Description</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Brief description of what this set covers…"
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm
                         placeholder:text-muted-foreground focus:outline-none focus:ring-2
                         focus:ring-ring resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</>
              : (editing ? "Save Changes" : "Create Set")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Set card ─────────────────────────────────────────────────────────────────
function SetCard({ set, onEdit, onDelete }: {
  set: QuestionSet; onEdit: (s: QuestionSet) => void; onDelete: (s: QuestionSet) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const total = set.question_count

  return (
    <div className={cn(
      "relative bg-white rounded-2xl border border-slate-200",
      "hover:border-[#1B4F8A]/40 hover:shadow-md transition-all duration-200 group flex flex-col overflow-hidden"
    )}>
      {/* Dropdown menu */}
      <div className="absolute top-3 right-3 z-10">
        <div className="relative">
          <button
            onClick={e => { e.preventDefault(); setMenuOpen(m => !m) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100
                       transition-colors opacity-0 group-hover:opacity-100"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20">
                <button onClick={() => { setMenuOpen(false); onEdit(set) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-slate-700">
                  <Edit2 className="h-3.5 w-3.5 text-slate-400" /> Edit Set
                </button>
                <button onClick={() => { setMenuOpen(false); onDelete(set) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 text-red-600">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Clickable card body */}
      <Link href={`/lms-admin/questions/${set.id}`} className="flex flex-col flex-1 p-5 gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1B4F8A]/10 flex items-center justify-center shrink-0">
            <Folder className="h-5 w-5 text-[#1B4F8A]" />
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <h3 className="font-semibold text-slate-900 leading-tight line-clamp-2">{set.name}</h3>
            {set.topic && (
              <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A]/70 mt-0.5">
                {set.topic}
              </span>
            )}
          </div>
        </div>

        {set.description && (
          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{set.description}</p>
        )}

        <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-600">
            <BookOpen className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-sm font-semibold">{total}</span>
            <span className="text-xs text-slate-400">{total === 1 ? "question" : "questions"}</span>
          </div>
          {total > 0 && (
            <div className="flex items-center gap-1">
              {set.easy_count   > 0 && <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">{set.easy_count}E</span>}
              {set.medium_count > 0 && <span className="text-[10px] font-semibold text-amber-600  bg-amber-50  px-1.5 py-0.5 rounded-full">{set.medium_count}M</span>}
              {set.hard_count   > 0 && <span className="text-[10px] font-semibold text-red-500    bg-red-50    px-1.5 py-0.5 rounded-full">{set.hard_count}H</span>}
            </div>
          )}
        </div>
      </Link>

      <div className="h-1 bg-gradient-to-r from-[#1B4F8A] to-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function QuestionBankPage() {
  const [sets,    setSets]    = useState<QuestionSet[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState("")
  const [modalOpen, setModalOpen] = useState(false)
  const [editing,   setEditing]   = useState<QuestionSet | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    const res = await fetch(`/api/lms/question-sets?${params}`)
    if (res.ok) setSets(await res.json())
    setLoading(false)
  }, [search])

  useEffect(() => { load() }, [load])

  async function deleteSet(set: QuestionSet) {
    if (set.question_count > 0) {
      toast.error(`Remove all ${set.question_count} questions from "${set.name}" before deleting.`)
      return
    }
    if (!confirm(`Delete "${set.name}"? This cannot be undone.`)) return
    const res  = await fetch(`/api/lms/question-sets?id=${set.id}`, { method: "DELETE" })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success("Set deleted")
    setSets(prev => prev.filter(s => s.id !== set.id))
  }

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(s: QuestionSet) { setEditing(s); setModalOpen(true) }

  function onSaved(s: QuestionSet) {
    setSets(prev => editing ? prev.map(x => x.id === s.id ? s : x) : [s, ...prev])
  }

  const totalQuestions = sets.reduce((n, s) => n + s.question_count, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Question Bank</h1>
          <p className="text-slate-500 text-sm mt-1">
            {sets.length} {sets.length === 1 ? "set" : "sets"} · {totalQuestions} total questions
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
          <Plus className="h-4 w-4" /> New Set
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search sets…"
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
        </div>
      ) : sets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <FolderOpen className="h-8 w-8 text-slate-300" />
          </div>
          <h3 className="font-semibold text-slate-700 text-lg mb-1">No question sets yet</h3>
          <p className="text-sm text-slate-400 max-w-xs mb-6">
            Create a set to organise your questions by topic or module. Each set can be used to build quizzes.
          </p>
          <Button onClick={openCreate} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
            <Plus className="h-4 w-4" /> Create First Set
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sets.map(s => (
            <SetCard key={s.id} set={s} onEdit={openEdit} onDelete={deleteSet} />
          ))}
        </div>
      )}

      <SetModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} onSaved={onSaved} />
    </div>
  )
}
