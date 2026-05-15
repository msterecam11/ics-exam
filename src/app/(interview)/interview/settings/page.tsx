"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Pencil, Trash2, Check, X, Loader2, Tag } from "lucide-react"
import { toast } from "sonner"

export default function SettingsPage() {
  const [tracks, setTracks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState("")
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  useEffect(() => {
    fetch("/api/interview/role-tracks")
      .then(r => r.json())
      .then(d => { setTracks(Array.isArray(d) ? d : []); setLoading(false) })
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
    </div>
  )
}
