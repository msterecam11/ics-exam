"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  Plus, ClipboardList, ChevronRight, Layers, Settings2,
  MoreHorizontal, Pencil, Trash2, Check, X, Loader2, AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

export default function ConfigsPage() {
  const [configs,  setConfigs]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  // Menu state
  const [openMenu,  setOpenMenu]  = useState<string | null>(null)

  // Inline rename state
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [editName,   setEditName]   = useState("")
  const [saving,     setSaving]     = useState(false)

  // Typed-name delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null)
  const [confirmInput,  setConfirmInput]  = useState("")
  const [deleting,      setDeleting]      = useState(false)

  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/api/interview/configs")
      .then(r => r.json())
      .then(d => { setConfigs(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Close menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  function startEdit(cfg: any) {
    setEditingId(cfg.id)
    setEditName(cfg.name)
    setOpenMenu(null)
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return
    setSaving(true)
    const res = await fetch(`/api/interview/configs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    })
    setSaving(false)
    if (!res.ok) { toast.error("Failed to rename"); return }
    setConfigs(cs => cs.map(c => c.id === id ? { ...c, name: editName.trim() } : c))
    setEditingId(null)
    toast.success("Config renamed")
  }

  async function doDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    const res  = await fetch(`/api/interview/configs/${confirmDelete.id}`, { method: "DELETE" })
    const data = await res.json()
    setDeleting(false)
    if (!res.ok) { toast.error(data.error ?? "Failed to delete"); return }
    setConfigs(cs => cs.filter(c => c.id !== confirmDelete.id))
    setConfirmDelete(null)
    setConfirmInput("")
    toast.success("Config and all related data deleted")
  }

  const nameMatches = confirmInput.trim() === confirmDelete?.name

  return (
    <div className="space-y-6 max-w-5xl mx-auto">

      {/* ── Typed-name confirm overlay ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="bg-red-100 p-2 rounded-xl shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">Delete config permanently?</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  This will permanently erase this config and <span className="font-semibold text-slate-700">all groups, candidates, scores, and AI reports</span> that use it. This cannot be undone.
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-1.5">
              Type <span className="font-mono font-semibold text-slate-700">{confirmDelete.name}</span> to confirm
            </p>
            <Input
              value={confirmInput}
              onChange={e => setConfirmInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && nameMatches) doDelete() }}
              placeholder="Type the config name…"
              className="h-9 text-sm mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setConfirmDelete(null); setConfirmInput("") }}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!nameMatches || deleting}
                onClick={doDelete}
                className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                Delete everything
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Assessment Configs</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Reusable competency frameworks — define pillars, competencies, and scoring weights.
          </p>
        </div>
        <Link href="/interview/configs/new">
          <Button className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
            <Plus className="h-4 w-4" /> New Config
          </Button>
        </Link>
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => <div key={i} className="h-36 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      )}

      {!loading && configs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-slate-100 p-4 rounded-2xl mb-4">
              <ClipboardList className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-base font-semibold text-slate-700">No configs yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              Create your first assessment config to define the competency framework.
            </p>
            <Link href="/interview/configs/new">
              <Button className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
                <Plus className="h-4 w-4" /> Create Config
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {!loading && configs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" ref={menuRef}>
          {configs.map((cfg: any) => {
            const pillarCount     = cfg.pillars?.length ?? 0
            const competencyCount = cfg.pillars?.reduce(
              (s: number, p: any) => s + (p.competencies?.length ?? 0), 0
            ) ?? 0
            const isEditing  = editingId === cfg.id
            const menuOpen   = openMenu === cfg.id

            return (
              <div
                key={cfg.id}
                className="relative bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md hover:border-[#1B4F8A]/30 transition-all group flex flex-col"
              >
                {/* Top row: icon + actions */}
                <div className="flex items-start justify-between mb-3">
                  <div className="bg-[#1B4F8A]/8 p-2.5 rounded-lg">
                    <Settings2 className="h-5 w-5 text-[#1B4F8A]" />
                  </div>

                  {/* ⋯ Menu */}
                  <div className="relative">
                    <button
                      onClick={e => { e.preventDefault(); setOpenMenu(menuOpen ? null : cfg.id) }}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>

                    {menuOpen && (
                      <div className="absolute right-0 top-8 w-40 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 text-sm">
                        <button
                          onClick={() => startEdit(cfg)}
                          className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-slate-50 text-slate-700 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5 text-slate-400" /> Rename
                        </button>
                        <Link href={`/interview/configs/${cfg.id}`}>
                          <button
                            onClick={() => setOpenMenu(null)}
                            className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-slate-50 text-slate-700 transition-colors"
                          >
                            <Settings2 className="h-3.5 w-3.5 text-slate-400" /> Edit Config
                          </button>
                        </Link>
                        <div className="border-t border-slate-100 mt-1 pt-1">
                          <button
                            onClick={() => { setOpenMenu(null); setConfirmDelete({ id: cfg.id, name: cfg.name }); setConfirmInput("") }}
                            className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-red-50 text-red-600 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Name — inline edit or link */}
                {isEditing ? (
                  <div className="flex items-center gap-2 mb-2" onClick={e => e.preventDefault()}>
                    <Input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") saveEdit(cfg.id)
                        if (e.key === "Escape") setEditingId(null)
                      }}
                      className="h-8 text-sm font-bold flex-1"
                      autoFocus
                    />
                    <button
                      onClick={() => saveEdit(cfg.id)}
                      disabled={saving}
                      className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <Link href={`/interview/configs/${cfg.id}`} className="block">
                    <p className="text-base font-bold text-slate-800 mb-1 hover:text-[#1B4F8A] transition-colors">
                      {cfg.name}
                    </p>
                  </Link>
                )}

                {cfg.description && !isEditing && (
                  <p className="text-xs text-slate-500 mb-3 line-clamp-2">{cfg.description}</p>
                )}

                {/* Footer badges + open link */}
                <div className="mt-auto flex items-center gap-3">
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Layers className="h-3 w-3" /> {pillarCount} pillar{pillarCount !== 1 ? "s" : ""}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {competencyCount} competenc{competencyCount !== 1 ? "ies" : "y"}
                  </Badge>
                  <Link href={`/interview/configs/${cfg.id}`} className="ml-auto">
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#1B4F8A] transition-colors" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
