"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Loader2, Plus, Pencil, Trash2, ArrowUp, ArrowDown, FolderOpen, Archive, ArchiveRestore, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// Step 10 — Courses opens on categories, and the courses live inside them.
// The same categories drive the student catalogue, so this is where the shape
// of both screens is decided.

export interface Category {
  id: string
  name: string
  description: string | null
  image_url: string | null
  colour: string | null
  order_index: number
  is_active: boolean
  total: number
  published: number
}

export const UNCATEGORISED_ID = "__none__"

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [uncategorised, setUncategorised] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/lms/categories")
    if (res.ok) {
      const d = await res.json()
      setCategories(d.categories ?? [])
      setUncategorised(d.uncategorised ?? 0)
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  return { categories, uncategorised, loading, reload: load }
}

// ── The tiles ────────────────────────────────────────────────────────────────
export function CategoryTiles({ categories, uncategorised, onOpen }: {
  categories: Category[]
  uncategorised: number
  onOpen: (id: string | null) => void
}) {
  const live = categories.filter(c => c.is_active || c.total > 0)

  if (!live.length && !uncategorised)
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
        <FolderOpen className="h-8 w-8 text-slate-300 mx-auto" />
        <p className="text-sm font-medium text-slate-700 mt-3">No categories yet</p>
        <p className="text-sm text-slate-500 mt-1">Create one to start grouping your courses.</p>
      </div>
    )

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {live.map(c => (
        <button key={c.id} onClick={() => onOpen(c.id)}
          className="group text-left bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-[#1B4F8A]/40 hover:shadow-sm transition-all">
          <div className="h-24 relative" style={{ background: c.colour || "#1B4F8A" }}>
            {c.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
            )}
            {!c.is_active && (
              <span className="absolute top-2 right-2 text-[10px] font-semibold bg-white/90 text-slate-600 px-2 py-0.5 rounded-full">
                Archived
              </span>
            )}
          </div>
          <div className="p-4">
            <p className="text-sm font-semibold text-slate-800 group-hover:text-[#1B4F8A]">{c.name}</p>
            {c.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{c.description}</p>}
            <p className="text-xs text-slate-400 mt-2">
              {c.total} course{c.total === 1 ? "" : "s"}
              {c.published !== c.total && ` · ${c.published} published`}
            </p>
          </div>
        </button>
      ))}

      {uncategorised > 0 && (
        <button onClick={() => onOpen(UNCATEGORISED_ID)}
          className="group text-left bg-white rounded-xl border border-dashed border-slate-300 overflow-hidden hover:border-slate-400 transition-all">
          <div className="h-24 bg-slate-100 flex items-center justify-center">
            <FolderOpen className="h-7 w-7 text-slate-300" />
          </div>
          <div className="p-4">
            <p className="text-sm font-semibold text-slate-600">Uncategorised</p>
            <p className="text-xs text-slate-500 mt-1">Courses that haven&apos;t been filed yet</p>
            <p className="text-xs text-slate-400 mt-2">{uncategorised} course{uncategorised === 1 ? "" : "s"}</p>
          </div>
        </button>
      )}
    </div>
  )
}

// ── Managing them ────────────────────────────────────────────────────────────
export function CategoryManager({ open, onClose, categories, onChanged }: {
  open: boolean
  onClose: () => void
  categories: Category[]
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState("")
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState({ name: "", description: "", colour: "", image_url: "" })

  useEffect(() => {
    if (editing) setForm({
      name: editing.name, description: editing.description ?? "",
      colour: editing.colour ?? "", image_url: editing.image_url ?? "",
    })
  }, [editing])

  if (!open) return null

  const call = async (method: string, body: any, path = "/api/lms/categories") => {
    setBusy(true)
    const res = await fetch(path, {
      method, headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast.error(data.error ?? "That didn't work"); return null }
    onChanged()
    return data
  }

  async function add() {
    if (!newName.trim()) return
    if (await call("POST", { name: newName.trim() })) { setNewName(""); toast.success("Category created") }
  }

  async function save() {
    if (!editing) return
    if (await call("PATCH", { id: editing.id, ...form })) { setEditing(null); toast.success("Saved") }
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...categories]
    const to = index + dir
    if (to < 0 || to >= next.length) return
    ;[next[index], next[to]] = [next[to], next[index]]
    await call("PATCH", { order: next.map(c => c.id) })
  }

  async function remove(c: Category) {
    if (!confirm(`Delete "${c.name}"?`)) return
    if (await call("DELETE", undefined, `/api/lms/categories?id=${c.id}`)) toast.success("Category deleted")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Course categories</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              The order here is the order students see in the catalogue.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-3">
          <div className="flex gap-2">
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New category name"
              onKeyDown={e => { if (e.key === "Enter") add() }} />
            <Button onClick={add} disabled={busy || !newName.trim()} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-1.5 shrink-0">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          {categories.map((c, i) => (
            <div key={c.id} className={cn("rounded-xl border p-3", c.is_active ? "border-slate-200" : "border-slate-100 bg-slate-50/60")}>
              {editing?.id === c.id ? (
                <div className="space-y-2">
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name" />
                  <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description (optional)" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={form.colour} onChange={e => setForm(f => ({ ...f, colour: e.target.value }))} placeholder="#1B4F8A" />
                    <Input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="Image URL (optional)" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={save} disabled={busy} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white">Save</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-md shrink-0" style={{ background: c.colour || "#1B4F8A" }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {c.name}
                      {!c.is_active && <span className="ml-2 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">Archived</span>}
                    </p>
                    <p className="text-xs text-slate-400">{c.total} course{c.total === 1 ? "" : "s"}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => move(i, -1)} disabled={busy || i === 0} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button onClick={() => move(i, 1)} disabled={busy || i === categories.length - 1} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setEditing(c)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => call("PATCH", { id: c.id, is_active: !c.is_active })} title={c.is_active ? "Archive" : "Restore"}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                      {c.is_active ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => remove(c)} disabled={c.total > 0}
                      title={c.total > 0 ? "Move its courses out first, or archive it" : "Delete"}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 disabled:opacity-30 disabled:hover:bg-transparent">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {busy && <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Working…</p>}
        </div>
      </div>
    </div>
  )
}
