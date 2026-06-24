"use client"

import { useEffect, useState } from "react"
import {
  Route, Plus, Edit2, Trash2, Loader2, ChevronRight,
  Search, BookOpen, MoreVertical,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import Link from "next/link"

interface LearningPath {
  id:           string
  title:        string
  description:  string | null
  course_count: number
  created_at:   string
}

function PathModal({ open, editing, onClose, onSaved }: {
  open: boolean; editing: LearningPath | null; onClose: () => void; onSaved: (p: LearningPath) => void
}) {
  const [title,   setTitle]   = useState("")
  const [desc,    setDesc]    = useState("")
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    if (open) { setTitle(editing?.title ?? ""); setDesc(editing?.description ?? "") }
  }, [open, editing])

  async function save() {
    if (!title.trim()) return toast.error("Title is required")
    setSaving(true)
    try {
      const method = editing ? "PATCH" : "POST"
      const body: Record<string, unknown> = { title: title.trim(), description: desc.trim() }
      if (editing) body.id = editing.id

      const res  = await fetch("/api/lms/learning-paths", {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed"); return }
      toast.success(editing ? "Updated" : "Learning path created")
      onSaved({ ...data, course_count: editing?.course_count ?? 0 }); onClose()
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Learning Path" : "New Learning Path"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Title *</label>
            <Input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. ATPL Ground School" autoFocus
              onKeyDown={e => e.key === "Enter" && save()} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Description</label>
            <Textarea value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Optional description…" rows={3} className="resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
            {saving ? "Saving…" : (editing ? "Save" : "Create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PathCard({ path, onEdit, onDelete }: {
  path: LearningPath; onEdit: (p: LearningPath) => void; onDelete: (p: LearningPath) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-slate-200 hover:border-[#1B4F8A]/30 hover:shadow-sm transition-all group flex flex-col">
      <div className="h-1.5 rounded-t-xl bg-gradient-to-r from-emerald-500 to-teal-600" />

      <div className="p-5 flex-1 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <Route className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm leading-tight">{path.title}</p>
              {path.description && (
                <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{path.description}</p>
              )}
            </div>
          </div>

          <div className="relative shrink-0">
            <button onClick={() => setMenuOpen(m => !m)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors opacity-0 group-hover:opacity-100">
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-8 w-36 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20">
                  <button onClick={() => { setMenuOpen(false); onEdit(path) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-slate-700">
                    <Edit2 className="h-3.5 w-3.5 text-slate-400" /> Edit
                  </button>
                  <button onClick={() => { setMenuOpen(false); onDelete(path) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 text-red-600">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-sm text-slate-500">
          <BookOpen className="h-4 w-4 text-slate-400" />
          {path.course_count} course{path.course_count !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="px-4 pb-4">
        <Link href={`/lms-admin/learning-paths/${path.id}`}
          className="w-full flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
          Edit Courses <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}

export default function LearningPathsPage() {
  const [paths,   setPaths]   = useState<LearningPath[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState("")
  const [modal,   setModal]   = useState(false)
  const [editing, setEditing] = useState<LearningPath | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch("/api/lms/learning-paths")
    if (res.ok) setPaths(await res.json())
    setLoading(false)
  }

  async function deletePath(p: LearningPath) {
    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return
    const res = await fetch(`/api/lms/learning-paths?id=${p.id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Failed to delete"); return }
    toast.success("Deleted")
    setPaths(prev => prev.filter(x => x.id !== p.id))
  }

  const filtered = paths.filter(p =>
    !search || p.title.toLowerCase().includes(search.toLowerCase()) ||
    (p.description ?? "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Route className="h-6 w-6 text-emerald-600" /> Learning Paths
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {paths.length} path{paths.length !== 1 ? "s" : ""} · ordered sequences of courses assigned to cohorts
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setModal(true) }}
          className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
          <Plus className="h-4 w-4" /> New Learning Path
        </Button>
      </div>

      <div className="relative w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input placeholder="Search learning paths…" className="pl-8 h-9" value={search}
          onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Route className="h-8 w-8 text-slate-300" />
          </div>
          <h3 className="font-semibold text-slate-700 text-lg mb-1">
            {search ? "No learning paths match" : "No learning paths yet"}
          </h3>
          {!search && (
            <p className="text-sm text-slate-400 mb-6 max-w-xs">
              Create a learning path by adding courses in order. Assign them to cohorts or tracks.
            </p>
          )}
          {!search && (
            <Button onClick={() => { setEditing(null); setModal(true) }}
              className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
              <Plus className="h-4 w-4" /> Create First Path
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(p => (
            <PathCard key={p.id} path={p}
              onEdit={p => { setEditing(p); setModal(true) }}
              onDelete={deletePath}
            />
          ))}
        </div>
      )}

      <PathModal
        open={modal}
        editing={editing}
        onClose={() => { setModal(false); setEditing(null) }}
        onSaved={p => {
          setPaths(prev => editing ? prev.map(x => x.id === p.id ? p : x) : [p, ...prev])
        }}
      />
    </div>
  )
}
