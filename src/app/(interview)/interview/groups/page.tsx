"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  Plus, Users, CalendarDays, ArrowRight,
  MoreHorizontal, Pencil, Trash2, Check, X, Loader2, Settings2, AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<string, string> = {
  draft:     "bg-slate-100 text-slate-600",
  active:    "bg-emerald-100 text-emerald-700",
  complete:  "bg-blue-100 text-blue-700",
  published: "bg-purple-100 text-purple-700",
}

export default function GroupsPage() {
  const [groups,  setGroups]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Menu state
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName,  setEditName]  = useState("")
  const [editLoc,   setEditLoc]   = useState("")
  const [editDate,  setEditDate]  = useState("")
  const [saving,    setSaving]    = useState(false)

  // Typed-name delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null)
  const [confirmInput,  setConfirmInput]  = useState("")
  const [deleting,      setDeleting]      = useState(false)

  const menuRef    = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/api/interview/groups")
      .then(r => r.json())
      .then(d => { setGroups(Array.isArray(d) ? d : []); setLoading(false) })
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

  function startEdit(g: any) {
    setEditingId(g.id)
    setEditName(g.name ?? "")
    setEditLoc(g.location ?? "")
    setEditDate(g.scheduled_date ? g.scheduled_date.slice(0, 10) : "")
    setOpenMenu(null)
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return
    setSaving(true)
    const res = await fetch(`/api/interview/groups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:           editName.trim(),
        location:       editLoc.trim() || null,
        scheduled_date: editDate || null,
      }),
    })
    setSaving(false)
    if (!res.ok) { toast.error("Failed to save changes"); return }
    setGroups(gs => gs.map(g => g.id === id
      ? { ...g, name: editName.trim(), location: editLoc.trim() || null, scheduled_date: editDate || null }
      : g
    ))
    setEditingId(null)
    toast.success("Group updated")
  }

  async function doDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    const res  = await fetch(`/api/interview/groups/${confirmDelete.id}`, { method: "DELETE" })
    const data = await res.json()
    setDeleting(false)
    if (!res.ok) { toast.error(data.error ?? "Failed to delete"); return }
    setGroups(gs => gs.filter(g => g.id !== confirmDelete.id))
    setConfirmDelete(null)
    setConfirmInput("")
    toast.success("Group and all its data deleted")
  }

  const nameMatches = confirmInput.trim() === confirmDelete?.name

  return (
    <div className="space-y-6 max-w-5xl mx-auto">

      {/* ── Typed-name confirm overlay ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div ref={confirmRef} className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="bg-red-100 p-2 rounded-xl shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">Delete group permanently?</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  This will permanently erase <span className="font-semibold text-slate-700">all candidates, scores, assessor assignments, and AI reports</span> for this group. This cannot be undone.
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
              placeholder="Type the group name…"
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
          <h2 className="text-xl font-bold text-foreground">Interview Groups</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage cohort sessions — candidates, assessors, and scoring.</p>
        </div>
        <Link href="/interview/groups/new">
          <Button className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
            <Plus className="h-4 w-4" /> New Group
          </Button>
        </Link>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      )}

      {!loading && groups.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-slate-100 p-4 rounded-2xl mb-4">
              <Users className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-base font-semibold text-slate-700">No groups yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">Create an interview group to start managing candidates and scoring.</p>
            <Link href="/interview/groups/new">
              <Button className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
                <Plus className="h-4 w-4" /> Create Group
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {!loading && groups.length > 0 && (
        <div className="space-y-3" ref={menuRef}>
          {groups.map((g: any) => {
            const isEditing      = editingId === g.id
            const menuOpen       = openMenu === g.id
            const candidateCount = (g.interview_candidates as any[])?.length ?? 0

            return (
              <div
                key={g.id}
                className="relative bg-white border border-slate-200 rounded-xl hover:shadow-md hover:border-[#1B4F8A]/30 transition-all group"
              >
                {/* ── Edit form ── */}
                {isEditing ? (
                  <div className="p-4" onClick={e => e.preventDefault()}>
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center gap-2">
                        <Input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") saveEdit(g.id)
                            if (e.key === "Escape") setEditingId(null)
                          }}
                          placeholder="Group name"
                          className="h-8 text-sm font-semibold flex-1"
                          autoFocus
                        />
                        <button
                          onClick={() => saveEdit(g.id)}
                          disabled={saving}
                          className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors shrink-0"
                        >
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          value={editLoc}
                          onChange={e => setEditLoc(e.target.value)}
                          placeholder="Location (optional)"
                          className="h-8 text-xs flex-1"
                        />
                        <Input
                          type="date"
                          value={editDate}
                          onChange={e => setEditDate(e.target.value)}
                          className="h-8 text-xs w-40"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Normal row ── */
                  <Link href={`/interview/groups/${g.id}`}>
                    <div className="p-4 flex items-center gap-4">
                      <div className="bg-[#1B4F8A]/8 p-3 rounded-xl shrink-0">
                        <Users className="h-5 w-5 text-[#1B4F8A]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-800">{g.name}</p>
                          <Badge className={cn("text-xs border-0 capitalize", STATUS_STYLES[g.status] ?? "bg-slate-100")}>
                            {g.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">{(g.assessment_configs as any)?.name}</span>
                          {g.location && (
                            <>
                              <span className="text-muted-foreground/40">·</span>
                              <span className="text-xs text-muted-foreground">{g.location}</span>
                            </>
                          )}
                          {g.scheduled_date && (
                            <>
                              <span className="text-muted-foreground/40">·</span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <CalendarDays className="h-3 w-3" />
                                {new Date(g.scheduled_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {candidateCount} candidate{candidateCount !== 1 ? "s" : ""}
                        </span>
                        <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-[#1B4F8A] transition-colors" />
                      </div>
                    </div>
                  </Link>
                )}

                {/* ── ⋯ Menu (always top-right) ── */}
                {!isEditing && (
                  <div className="absolute top-3 right-3">
                    <button
                      onClick={e => { e.preventDefault(); setOpenMenu(menuOpen ? null : g.id) }}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>

                    {menuOpen && (
                      <div className="absolute right-0 top-8 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 text-sm">
                        <button
                          onClick={() => startEdit(g)}
                          className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-slate-50 text-slate-700 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5 text-slate-400" /> Edit Details
                        </button>
                        <Link href={`/interview/groups/${g.id}`}>
                          <button
                            onClick={() => setOpenMenu(null)}
                            className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-slate-50 text-slate-700 transition-colors"
                          >
                            <Settings2 className="h-3.5 w-3.5 text-slate-400" /> Open Group
                          </button>
                        </Link>
                        <div className="border-t border-slate-100 mt-1 pt-1">
                          <button
                            onClick={() => { setOpenMenu(null); setConfirmDelete({ id: g.id, name: g.name }); setConfirmInput("") }}
                            className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-red-50 text-red-600 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
