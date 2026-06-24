"use client"

import { useEffect, useState } from "react"
import {
  Users, Plus, Edit2, Trash2, Loader2, ChevronRight,
  Search, GraduationCap, MoreVertical, Calendar, Layers,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { cn }    from "@/lib/utils"
import Link from "next/link"

interface Cohort {
  id:           string
  name:         string
  description:  string | null
  mode:         "unified" | "specialization"
  start_date:   string | null
  end_date:     string | null
  member_count: number
  created_at:   string
}

function CohortModal({ open, editing, onClose, onSaved }: {
  open: boolean; editing: Cohort | null; onClose: () => void; onSaved: (c: Cohort) => void
}) {
  const [name,      setName]      = useState("")
  const [desc,      setDesc]      = useState("")
  const [mode,      setMode]      = useState<"unified"|"specialization">("unified")
  const [startDate, setStartDate] = useState("")
  const [endDate,   setEndDate]   = useState("")
  const [saving,    setSaving]    = useState(false)

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "")
      setDesc(editing?.description ?? "")
      setMode(editing?.mode ?? "unified")
      setStartDate(editing?.start_date?.slice(0, 10) ?? "")
      setEndDate(editing?.end_date?.slice(0, 10) ?? "")
    }
  }, [open, editing])

  async function save() {
    if (!name.trim()) return toast.error("Name is required")
    setSaving(true)
    try {
      const method = editing ? "PATCH" : "POST"
      const body: Record<string, unknown> = {
        name: name.trim(), description: desc.trim(), mode,
        start_date: startDate || null, end_date: endDate || null,
      }
      if (editing) body.id = editing.id

      const res  = await fetch("/api/lms/cohorts", {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed"); return }
      toast.success(editing ? "Cohort updated" : "Cohort created")
      onSaved({ ...data, member_count: editing?.member_count ?? 0 }); onClose()
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit Cohort" : "New Cohort"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Cohort Name *</label>
            <Input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Batch 2026 — ATPL" autoFocus
              onKeyDown={e => e.key === "Enter" && save()} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Description</label>
            <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {(["unified", "specialization"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={cn(
                    "p-3 rounded-lg border-2 text-left transition-all",
                    mode === m ? "border-[#1B4F8A] bg-[#1B4F8A]/5" : "border-slate-200 hover:border-slate-300"
                  )}>
                  <p className={cn("text-sm font-semibold capitalize", mode === m ? "text-[#1B4F8A]" : "text-slate-700")}>
                    {m === "unified" ? "Unified" : "Specialization"}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {m === "unified"
                      ? "One course sequence for all students"
                      : "Multiple tracks with different courses"}
                  </p>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Start Date</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">End Date</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
            {saving ? "Saving…" : (editing ? "Save Changes" : "Create Cohort")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CohortCard({ cohort, onEdit, onDelete }: {
  cohort: Cohort; onEdit: (c: Cohort) => void; onDelete: (c: Cohort) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isSpec = cohort.mode === "specialization"

  function fmt(d: string | null) {
    if (!d) return null
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 hover:border-[#1B4F8A]/30 hover:shadow-sm transition-all group flex flex-col">
      <div className={cn("h-1.5 rounded-t-xl", isSpec
        ? "bg-gradient-to-r from-violet-500 to-purple-600"
        : "bg-gradient-to-r from-[#1B4F8A] to-[#2563EB]")} />

      <div className="p-5 flex-1 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              isSpec ? "bg-violet-100" : "bg-[#1B4F8A]/10")}>
              {isSpec ? <Layers className="h-5 w-5 text-violet-600" /> : <GraduationCap className="h-5 w-5 text-[#1B4F8A]" />}
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm leading-tight">{cohort.name}</p>
              {cohort.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{cohort.description}</p>}
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
                  <button onClick={() => { setMenuOpen(false); onEdit(cohort) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-slate-700">
                    <Edit2 className="h-3.5 w-3.5 text-slate-400" /> Edit
                  </button>
                  <button onClick={() => { setMenuOpen(false); onDelete(cohort) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 text-red-600">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full",
            isSpec ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700")}>
            {isSpec ? "Specialization" : "Unified"}
          </span>
          <span className="flex items-center gap-1 text-sm text-slate-500">
            <Users className="h-3.5 w-3.5" /> {cohort.member_count} students
          </span>
        </div>

        {(cohort.start_date || cohort.end_date) && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>{fmt(cohort.start_date) ?? "–"} → {fmt(cohort.end_date) ?? "–"}</span>
          </div>
        )}
      </div>

      <div className="px-4 pb-4">
        <Link href={`/lms-admin/cohorts/${cohort.id}`}
          className="w-full flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-lg bg-[#1B4F8A]/8 text-[#1B4F8A] hover:bg-[#1B4F8A]/15 transition-colors">
          Manage <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}

export default function CohortsPage() {
  const [cohorts,  setCohorts]  = useState<Cohort[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState("")
  const [modal,    setModal]    = useState(false)
  const [editing,  setEditing]  = useState<Cohort | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch("/api/lms/cohorts")
    if (res.ok) setCohorts(await res.json())
    setLoading(false)
  }

  async function deleteCohort(c: Cohort) {
    if (!confirm(`Delete cohort "${c.name}"? This cannot be undone.`)) return
    const res = await fetch(`/api/lms/cohorts?id=${c.id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Failed to delete"); return }
    toast.success("Cohort deleted")
    setCohorts(prev => prev.filter(x => x.id !== c.id))
  }

  const filtered = cohorts.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.description ?? "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-[#1B4F8A]" /> Cohorts
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {cohorts.length} cohort{cohorts.length !== 1 ? "s" : ""} · {cohorts.reduce((s, c) => s + c.member_count, 0)} total students
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setModal(true) }}
          className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
          <Plus className="h-4 w-4" /> New Cohort
        </Button>
      </div>

      <div className="relative w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input placeholder="Search cohorts…" className="pl-8 h-9" value={search}
          onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <GraduationCap className="h-8 w-8 text-slate-300" />
          </div>
          <h3 className="font-semibold text-slate-700 text-lg mb-1">
            {search ? "No cohorts match" : "No cohorts yet"}
          </h3>
          {!search && (
            <>
              <p className="text-sm text-slate-400 mb-6 max-w-xs">
                Create cohorts to group students and enroll them into course sequences.
              </p>
              <Button onClick={() => { setEditing(null); setModal(true) }}
                className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
                <Plus className="h-4 w-4" /> Create First Cohort
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(c => (
            <CohortCard key={c.id} cohort={c}
              onEdit={c => { setEditing(c); setModal(true) }}
              onDelete={deleteCohort}
            />
          ))}
        </div>
      )}

      <CohortModal
        open={modal} editing={editing}
        onClose={() => { setModal(false); setEditing(null) }}
        onSaved={c => setCohorts(prev => editing ? prev.map(x => x.id === c.id ? c : x) : [c, ...prev])}
      />
    </div>
  )
}
