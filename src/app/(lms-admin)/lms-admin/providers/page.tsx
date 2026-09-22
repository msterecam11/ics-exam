"use client"

import { useCallback, useEffect, useState } from "react"
import { Handshake, Plus, Search, Loader2, BookOpen, Globe, MapPin, Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import ImageUploadField from "@/components/lms/ImageUploadField"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// Who DELIVERS a course — us or a training partner. Deliberately separate from
// Companies, which is who RECEIVES the training: a client never belongs to a
// provider, and one program can mix them course by course. Laid out like
// Companies on purpose — they are the two directories of organisations.

type Provider = {
  id: string; name: string; short_code: string | null; logo_url: string | null
  country: string | null; website: string | null
  contact_name: string | null; contact_email: string | null; contact_phone: string | null
  notes: string | null; is_self: boolean; status: "active" | "archived"
  course_count: number
}

const EMPTY = {
  name: "", short_code: "", logo_url: "", country: "", website: "",
  contact_name: "", contact_email: "", contact_phone: "", notes: "",
}

export default function ProvidersPage() {
  const [rows, setRows] = useState<Provider[] | null>(null)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<"active" | "archived" | "all">("active")
  const [editing, setEditing] = useState<Provider | null | undefined>(undefined) // undefined = closed, null = new
  const [form, setForm] = useState({ ...EMPTY })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch("/api/lms/providers")
    setRows(res.ok ? await res.json() : [])
  }, [])
  useEffect(() => { load() }, [load])

  function open(p: Provider | null) {
    setEditing(p)
    setForm(p ? {
      name: p.name, short_code: p.short_code ?? "", logo_url: p.logo_url ?? "", country: p.country ?? "",
      website: p.website ?? "", contact_name: p.contact_name ?? "", contact_email: p.contact_email ?? "",
      contact_phone: p.contact_phone ?? "", notes: p.notes ?? "",
    } : { ...EMPTY })
  }

  async function save() {
    if (!form.name.trim()) { toast.error("Give the provider a name"); return }
    setBusy(true)
    const res = await fetch("/api/lms/providers", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast.error(data.error ?? "Could not save"); return }
    toast.success(editing ? "Saved" : "Provider added")
    setEditing(undefined); load()
  }

  async function setProviderStatus(p: Provider, next: "active" | "archived") {
    if (next === "archived" && p.course_count > 0 && !confirm(
      `Archive ${p.name}?\n\n${p.course_count} course${p.course_count === 1 ? "" : "s"} stay with it — ` +
      "it only stops appearing when you pick a provider.")) return
    const res = await fetch("/api/lms/providers", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: p.id, status: next }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? "Could not change status"); return }
    toast.success(next === "archived" ? "Archived" : "Restored"); load()
  }

  async function remove(p: Provider) {
    if (!confirm(`Delete ${p.name}? This cannot be undone.`)) return
    const res = await fetch(`/api/lms/providers?id=${p.id}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? "Could not delete"); return }
    toast.success("Deleted"); load()
  }

  const all = rows ?? []
  const q = search.trim().toLowerCase()
  const filtered = all
    .filter(p => status === "all" || p.status === status)
    .filter(p => !q || p.name.toLowerCase().includes(q)
      || (p.short_code ?? "").toLowerCase().includes(q)
      || (p.country ?? "").toLowerCase().includes(q))

  const partners = all.filter(p => !p.is_self && p.status === "active").length

  return (
    <div className="space-y-6">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Handshake className="h-6 w-6 text-[#1B4F8A]" /> Service Providers
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {partners} training partner{partners !== 1 ? "s" : ""} · who delivers a course, us or someone else
          </p>
        </div>
        <Button onClick={() => open(null)} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
          <Plus className="h-4 w-4" /> New Provider
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search by name, code or country…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {(["active", "archived", "all"] as const).map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={cn("px-3 py-1.5 rounded-md capitalize", status === s ? "bg-[#1B4F8A] text-white" : "text-slate-600 hover:bg-slate-50")}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Handshake className="h-12 w-12 text-slate-200 mb-3" />
          <p className="text-slate-600 font-medium">{all.length ? "No providers match" : "No providers yet"}</p>
          <p className="text-sm text-slate-400 mt-1 max-w-sm">
            Add the partners who deliver training for you — ICAO, Etihad Aviation Training, and the rest.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <div key={p.id}
              className="bg-white rounded-xl border border-slate-200 hover:border-[#1B4F8A]/30 hover:shadow-sm transition-all p-5 flex flex-col gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {p.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain border border-slate-100 shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-[#1B4F8A]/10 flex items-center justify-center text-[#1B4F8A] font-bold text-xs shrink-0">
                    {(p.short_code || p.name).slice(0, 3).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm truncate">{p.name}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {p.short_code ?? "—"}{p.contact_name ? ` · ${p.contact_name}` : ""}
                  </p>
                </div>
                {p.is_self ? (
                  <span className="ml-auto text-[10px] font-semibold uppercase bg-[#1B4F8A]/10 text-[#1B4F8A] px-2 py-0.5 rounded-full shrink-0">Us</span>
                ) : p.status === "archived" ? (
                  <span className="ml-auto text-[10px] font-semibold uppercase bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full shrink-0">Archived</span>
                ) : null}
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" /> {p.course_count} course{p.course_count === 1 ? "" : "s"}</span>
                {p.country && <span className="flex items-center gap-1 truncate"><MapPin className="h-3.5 w-3.5 shrink-0" /> {p.country}</span>}
                {p.website && (
                  <a href={p.website} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 truncate hover:text-[#1B4F8A]">
                    <Globe className="h-3.5 w-3.5 shrink-0" /> {p.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>

              <div className="flex items-center gap-1 pt-1 mt-auto border-t border-slate-50">
                <button onClick={() => open(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-[#1B4F8A] hover:bg-slate-50" aria-label="Edit" title="Edit">
                  <Pencil className="h-4 w-4" />
                </button>
                {!p.is_self && (p.status === "active" ? (
                  <button onClick={() => setProviderStatus(p, "archived")} title="Archive" aria-label="Archive"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50"><Archive className="h-4 w-4" /></button>
                ) : (
                  <button onClick={() => setProviderStatus(p, "active")} title="Restore" aria-label="Restore"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"><ArchiveRestore className="h-4 w-4" /></button>
                ))}
                {!p.is_self && p.course_count === 0 && (
                  <button onClick={() => remove(p)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 ml-auto" aria-label="Delete" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editing !== undefined} onOpenChange={o => !o && setEditing(undefined)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit provider" : "New provider"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Etihad Aviation Training" />
              </div>
              <div className="space-y-1">
                <Label>Short code</Label>
                <Input value={form.short_code} onChange={e => setForm(f => ({ ...f, short_code: e.target.value }))} placeholder="EAT" />
              </div>
            </div>
            <ImageUploadField label="Logo" kind="provider" contain value={form.logo_url}
              onChange={v => setForm(f => ({ ...f, logo_url: v ?? "" }))} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Country</Label>
                <Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="United Arab Emirates" />
              </div>
              <div className="space-y-1">
                <Label>Website</Label>
                <Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://…" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Contact name</Label>
                <Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Contact email</Label>
                <Input value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                placeholder="Internal only — never shown to students or clients."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setEditing(undefined)} disabled={busy}>Cancel</Button>
              <Button onClick={save} disabled={busy} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Save" : "Add provider"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
