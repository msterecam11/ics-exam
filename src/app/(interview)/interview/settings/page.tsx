"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, Check, X, Loader2, Tag, Link2 } from "lucide-react"
import { toast } from "sonner"

export default function SettingsPage() {
  // ── Role Tracks ──────────────────────────────────────────────────────────────
  const [tracks, setTracks]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState("")
  const [adding, setAdding]   = useState(false)
  const [editId, setEditId]   = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  // ── Slot Pools ───────────────────────────────────────────────────────────────
  const [pools, setPools]           = useState<any[]>([])
  const [poolsLoading, setPoolsLoading] = useState(true)
  const [newPoolName, setNewPoolName]   = useState("")
  const [addingPool, setAddingPool]     = useState(false)
  const [poolEditId, setPoolEditId]     = useState<string | null>(null)
  const [poolEditName, setPoolEditName] = useState("")

  useEffect(() => {
    fetch("/api/interview/role-tracks")
      .then(r => r.json())
      .then(d => { setTracks(Array.isArray(d) ? d : []); setLoading(false) })

    fetch("/api/interview/slot-pools")
      .then(r => r.json())
      .then(d => { setPools(Array.isArray(d) ? d : []); setPoolsLoading(false) })
  }, [])

  async function addTrack() {
    if (!newName.trim()) return
    setAdding(true)
    const res = await fetch("/api/interview/role-tracks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    })
    const data = await res.json()
    setAdding(false)
    if (!res.ok) { toast.error(data.error ?? "Failed to add track"); return }
    setTracks(t => [...t, data])
    setNewName("")
    toast.success("Track added")
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return
    const res = await fetch("/api/interview/role-tracks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: editName.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error); return }
    setTracks(t => t.map(tr => tr.id === id ? data : tr))
    setEditId(null)
    toast.success("Track updated")
  }

  async function deleteTrack(id: string) {
    if (!confirm("Delete this role track? Candidates assigned to it will lose their track association.")) return
    const res = await fetch(`/api/interview/role-tracks?id=${id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Failed to delete track"); return }
    setTracks(t => t.filter(tr => tr.id !== id))
    toast.success("Track deleted")
  }

  // ── Slot Pool handlers ───────────────────────────────────────────────────────

  async function addPool() {
    if (!newPoolName.trim()) return
    setAddingPool(true)
    const res = await fetch("/api/interview/slot-pools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPoolName.trim() }),
    })
    const data = await res.json()
    setAddingPool(false)
    if (!res.ok) { toast.error(data.error ?? "Failed to add group"); return }
    setPools(p => [{ ...data, schedule_count: 0, schedule_names: [] }, ...p])
    setNewPoolName("")
    toast.success("Availability group created")
  }

  async function savePoolEdit(id: string) {
    if (!poolEditName.trim()) return
    const res = await fetch("/api/interview/slot-pools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: poolEditName.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Failed to rename"); return }
    setPools(p => p.map(pl => pl.id === id ? { ...pl, name: data.name } : pl))
    setPoolEditId(null)
    toast.success("Group renamed")
  }

  async function deletePool(pool: any) {
    const msg = pool.schedule_count > 0
      ? `Delete "${pool.name}"? The ${pool.schedule_count} linked schedule(s) will be unlinked but not deleted.`
      : `Delete "${pool.name}"?`
    if (!confirm(msg)) return
    const res = await fetch(`/api/interview/slot-pools?id=${pool.id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Failed to delete group"); return }
    setPools(p => p.filter(pl => pl.id !== pool.id))
    toast.success("Group deleted")
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-foreground">Settings</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage platform-wide settings for the Panel Interview system.</p>
      </div>

      {/* Role Tracks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Tag className="h-4 w-4 text-[#1B4F8A]" /> Role Tracks
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Tracks are used to filter which pillars apply to each candidate. Empty pillar track filter = applies to all.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>}

          {!loading && tracks.map(tr => (
            <div key={tr.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl group">
              {editId === tr.id ? (
                <>
                  <Input
                    className="flex-1 h-8"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveEdit(tr.id); if (e.key === "Escape") setEditId(null) }}
                    autoFocus
                  />
                  <button onClick={() => saveEdit(tr.id)} className="text-emerald-600 hover:text-emerald-700">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setEditId(null)} className="text-slate-400 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-[#1B4F8A] shrink-0" />
                  <span className="flex-1 text-sm font-medium text-slate-700">{tr.name}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditId(tr.id); setEditName(tr.name) }}
                      className="text-slate-400 hover:text-slate-600 p-1"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deleteTrack(tr.id)} className="text-slate-400 hover:text-red-500 p-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Add new track */}
          <div className="flex gap-2 pt-2">
            <Input
              placeholder="New track name…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addTrack() }}
            />
            <Button
              onClick={addTrack}
              disabled={adding || !newName.trim()}
              className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2 shrink-0"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Slot Pools */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Link2 className="h-4 w-4 text-[#1B4F8A]" /> Shared Availability Groups
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Groups link schedules that share the same interview team — a booked slot in one is automatically blocked in all others.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {poolsLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>}

          {!poolsLoading && pools.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">No availability groups yet.</p>
          )}

          {!poolsLoading && pools.map(pool => (
            <div key={pool.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl group">
              {poolEditId === pool.id ? (
                <>
                  <Input
                    className="flex-1 h-8"
                    value={poolEditName}
                    onChange={e => setPoolEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") savePoolEdit(pool.id)
                      if (e.key === "Escape") setPoolEditId(null)
                    }}
                    autoFocus
                  />
                  <button onClick={() => savePoolEdit(pool.id)} className="text-emerald-600 hover:text-emerald-700">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setPoolEditId(null)} className="text-slate-400 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-[#1B4F8A] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700">{pool.name}</p>
                    {pool.schedule_count > 0 && (
                      <p className="text-xs text-muted-foreground truncate">
                        {pool.schedule_names.join(", ")}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {pool.schedule_count} schedule{pool.schedule_count !== 1 ? "s" : ""}
                  </Badge>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setPoolEditId(pool.id); setPoolEditName(pool.name) }}
                      className="text-slate-400 hover:text-slate-600 p-1"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deletePool(pool)}
                      className="text-slate-400 hover:text-red-500 p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Add new pool */}
          <div className="flex gap-2 pt-2">
            <Input
              placeholder="New group name…"
              value={newPoolName}
              onChange={e => setNewPoolName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addPool() }}
            />
            <Button
              onClick={addPool}
              disabled={addingPool || !newPoolName.trim()}
              className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2 shrink-0"
            >
              {addingPool ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
