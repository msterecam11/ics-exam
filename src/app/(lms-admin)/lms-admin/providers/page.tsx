"use client"

import { useCallback, useEffect, useState } from "react"
import { Handshake, Plus, Pencil, Archive, ArchiveRestore, Trash2, Loader2, Search, Globe, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import ImageUploadField from "@/components/lms/ImageUploadField"
import { toast } from "sonner"

// Who DELIVERS a course — us or a training partner. Deliberately separate from
// Companies, which is who RECEIVES the training: a client never belongs to a
// provider, and one program can mix them course by course.

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
  const [showArchived, setShowArchived] = useState(false)
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

  async function setStatus(p: Provider, status: "active" | "archived") {
    if (status === "archived" && p.course_count > 0 && !confirm(
      `Archive ${p.name}?\n\n${p.course_count} course${p.course_count === 1 ? "" : "s"} stay with it — ` +
      "it only stops appearing when you pick a provider.")) return
    const res = await fetch("/api/lms/providers", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: p.id, status }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? "Could not change status"); return }
    toast.success(status === "archived" ? "Archived" : "Restored"); load()
  }

  async function remove(p: Provider) {
    if (!confirm(`Delete ${p.name}? This cannot be undone.`)) return
    const res = await fetch(`/api/lms/providers?id=${p.id}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? "Could not delete"); return }
    toast.success("Deleted"); load()
  }

  const q = search.trim().toLowerCase()
  const visible = (rows ?? []).filter(p =>
    (showArchived || p.status === "active") &&
    (!q || p.name.toLowerCase().includes(q)
        || (p.short_code ?? "").toLowerCase().includes(q)
        || (p.country ?? "").toLowerCase().includes(q)))

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Service Providers</h1>
          <p className="text-sm text-slate-500 mt-0.5">Who delivers a course — us, or a training partner.</p>
        </div>
        <Button onClick={() => open(null)} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
          <Plus className="h-4 w-4" /> Add provider
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search providers…" className="pl-9 h-9" />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="accent-[#1B4F8A]" />
          Show archived
        </label>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 py-16 text-center">
          <Handshake className="h-8 w-8 text-slate-300 mx-auto" />
          <p className="text-sm text-slate-500 mt-3">{q ? "Nothing matches." : "No providers yet."}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/60 text-xs font-semibold text-slate-400 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-2.5">Provider</th>
                <th className="text-left px-3 py-2.5">Country</th>
                <th className="text-left px-3 py-2.5">Contact</th>
                <th className="text-center px-3 py-2.5">Courses</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {visible.map(p => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {p.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.logo_url} alt="" className="w-8 h-8 rounded object-contain bg-slate-50 shrink-0" />
                      ) : (
                        <span className="w-8 h-8 rounded bg-slate-100 text-slate-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                          {(p.short_code || p.name).slice(0, 3).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-800">{p.name}</span>
                          {p.is_self && <span className="text-[10px] font-semibold uppercase bg-[#1B4F8A]/10 text-[#1B4F8A] px-2 py-0.5 rounded-full">Us</span>}
                          {p.status === "archived" && <span className="text-[10px] font-semibold uppercase bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Archived</span>}
                        </span>
                        {p.website && (
                          <a href={p.website} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-slate-400 hover:text-[#1B4F8A] flex items-center gap-1 mt-0.5">
                            <Globe className="h-3 w-3" />{p.website.replace(/^https?:\/\//, "")}
                          </a>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600 text-xs">{p.country ?? "—"}</td>
                  <td className="px-3 py-3 text-xs text-slate-600">
                    {p.contact_name || p.contact_email ? (
                      <span className="block">
                        {p.contact_name && <span className="block text-slate-700">{p.contact_name}</span>}
                        {p.contact_email && <span className="flex items-center gap-1 text-slate-400"><Mail className="h-3 w-3" />{p.contact_email}</span>}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-3 text-center text-slate-600">{p.course_count || "—"}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <button onClick={() => open(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-[#1B4F8A] hover:bg-slate-50" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                    {!p.is_self && (p.status === "active" ? (
                      <button onClick={() => setStatus(p, "archived")} title="Archive" aria-label="Archive"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50"><Archive className="h-4 w-4" /></button>
                    ) : (
                      <button onClick={() => setStatus(p, "active")} title="Restore" aria-label="Restore"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"><ArchiveRestore className="h-4 w-4" /></button>
                    ))}
                    {!p.is_self && p.course_count === 0 && (
                      <button onClick={() => remove(p)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editing !== undefined} onOpenChange={o => !o && setEditing(undefined)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit provider" : "Add provider"}</DialogTitle></DialogHeader>
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
