"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Briefcase, Plus, Search, Loader2, Users, Calendar, ChevronRight, BookOpen, Route, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { PROGRAM_STATUS_STYLE } from "@/components/lms/programs/shared"

type Program = {
  id: string; name: string; status: "draft" | "active" | "completed" | "archived"
  structure: "course" | "path" | "tracks"; start_date: string | null; end_date: string | null
  is_individual: boolean; reference: string | null
  lms_companies: { id: string; name: string; code: string } | null
  member_counts: { active: number; completed: number; withdrawn: number; tracks: number }
}
type CompanyOption = { id: string; name: string; code: string }

const STRUCTURE_META = {
  course: { label: "One course",        icon: BookOpen, hint: "Everyone takes one course" },
  path:   { label: "One learning path", icon: Route,    hint: "Everyone follows one path" },
  tracks: { label: "Tracks",            icon: Layers,   hint: "Groups with their own courses, plus shared ones" },
} as const

const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null

function NewProgramDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [name, setName] = useState("")
  const [client, setClient] = useState("")            // company id | "individual"
  const [structure, setStructure] = useState<Program["structure"]>("course")
  const [reference, setReference] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(""); setClient(""); setStructure("course"); setReference(""); setStartDate(""); setEndDate("")
    fetch("/api/lms/companies?status=active").then(r => r.ok ? r.json() : []).then(d => setCompanies(Array.isArray(d) ? d : []))
  }, [open])

  async function create() {
    if (!name.trim()) { toast.error("Program name is required"); return }
    if (!client) { toast.error("Choose the client"); return }
    setSaving(true)
    const res = await fetch("/api/lms/programs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, structure, reference: reference || null,
        start_date: startDate || null, end_date: endDate || null,
        ...(client === "individual" ? { is_individual: true } : { company_id: client }),
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast.error(data.error ?? "Could not create program"); return }
    toast.success("Program created as a draft — add its courses next")
    router.push(`/lms-admin/programs/${data.id}?tab=structure`)
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>New Program</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Program name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="ALEP 2026 – Group 1" autoFocus />
          </div>
          <div className="space-y-1">
            <Label>Client *</Label>
            <select value={client} onChange={e => setClient(e.target.value)}
              className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white text-slate-700">
              <option value="">Choose…</option>
              <option value="individual">Individual learners (no company)</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Structure *</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.keys(STRUCTURE_META) as Program["structure"][]).map(k => {
                const m = STRUCTURE_META[k]
                return (
                  <button key={k} type="button" onClick={() => setStructure(k)}
                    className={cn("p-3 rounded-lg border-2 text-left transition-all",
                      structure === k ? "border-[#1B4F8A] bg-[#1B4F8A]/5" : "border-slate-200 hover:border-slate-300")}>
                    <m.icon className={cn("h-4 w-4 mb-1", structure === k ? "text-[#1B4F8A]" : "text-slate-400")} />
                    <p className={cn("text-sm font-semibold", structure === k ? "text-[#1B4F8A]" : "text-slate-700")}>{m.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{m.hint}</p>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-slate-400">The structure can&apos;t be changed after students are added.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Reference / PO</Label>
              <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>End date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={create} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ProgramsPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user.role === "admin"
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<"live" | Program["status"] | "all">("live")
  const [modal, setModal] = useState(false)

  useEffect(() => {
    fetch("/api/lms/programs")
      .then(async r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setPrograms(Array.isArray(d) ? d : []))
      .catch(() => setError("Could not load programs"))
      .finally(() => setLoading(false))
  }, [])

  const q = search.trim().toLowerCase()
  const filtered = programs
    .filter(p => status === "all" ? true : status === "live" ? (p.status === "draft" || p.status === "active") : p.status === status)
    .filter(p => !q || p.name.toLowerCase().includes(q) || (p.lms_companies?.name ?? "individual").toLowerCase().includes(q) || (p.reference ?? "").toLowerCase().includes(q))

  return (
    <div className="space-y-6">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-[#1B4F8A]" /> Program Manager
          </h1>
          <p className="text-sm text-slate-500 mt-1">Deliver courses and learning paths to a client&apos;s group — without copying courses.</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setModal(true)} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
            <Plus className="h-4 w-4" /> New Program
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search by program, client or reference…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm overflow-x-auto">
          {([["live", "Draft & active"], ["completed", "Completed"], ["archived", "Archived"], ["all", "All"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setStatus(k)}
              className={cn("px-3 py-1.5 rounded-md whitespace-nowrap", status === k ? "bg-[#1B4F8A] text-white" : "text-slate-600 hover:bg-slate-50")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : error ? (
        <p className="text-sm text-red-500 py-10 text-center">{error}</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Briefcase className="h-12 w-12 text-slate-200 mb-3" />
          <p className="text-slate-600 font-medium">{programs.length ? "No programs match" : "No programs yet"}</p>
          {!programs.length && (
            <p className="text-sm text-slate-400 mt-1 max-w-sm">
              A program delivers courses to one client&apos;s group — for example &quot;ALEP 2026 – Group 1&quot; for RAC, with a track per specialisation.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => {
            const S = STRUCTURE_META[p.structure]
            return (
              <Link key={p.id} href={`/lms-admin/programs/${p.id}`}
                className="bg-white rounded-xl border border-slate-200 hover:border-[#1B4F8A]/30 hover:shadow-sm transition-all p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">{p.name}</p>
                    <p className="text-xs text-slate-400 truncate">{p.is_individual ? "Individual learners" : p.lms_companies?.name ?? "—"}{p.reference ? ` · ${p.reference}` : ""}</p>
                  </div>
                  <span className={cn("text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full shrink-0", PROGRAM_STATUS_STYLE[p.status])}>{p.status}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                  <span className="flex items-center gap-1"><S.icon className="h-3.5 w-3.5" /> {S.label}{p.structure === "tracks" ? ` · ${p.member_counts.tracks}` : ""}</span>
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {p.member_counts.active + p.member_counts.completed} students</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  {p.start_date || p.end_date ? `${fmt(p.start_date) ?? "–"} → ${fmt(p.end_date) ?? "–"}` : "No dates set"}
                  <ChevronRight className="h-4 w-4 ml-auto text-slate-300" />
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <NewProgramDialog open={modal} onClose={() => setModal(false)} />
    </div>
  )
}
