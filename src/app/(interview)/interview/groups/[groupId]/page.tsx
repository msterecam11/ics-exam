"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ArrowLeft, Plus, Trash2, Users, UserCheck, Loader2,
  Play, Lock, Globe, RotateCcw, ClipboardList, CalendarDays, MapPin
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<string, { badge: string; label: string }> = {
  draft:     { badge: "bg-slate-100 text-slate-600",   label: "Draft"     },
  active:    { badge: "bg-emerald-100 text-emerald-700", label: "Active"    },
  complete:  { badge: "bg-blue-100 text-blue-700",     label: "Complete"  },
  published: { badge: "bg-purple-100 text-purple-700", label: "Published" },
}

const SCORE_LABELS: Record<number, string> = { 1: "Poor", 2: "Below Standard", 3: "Meeting Standard", 4: "Exceeding Standard", 5: "Exemplary" }

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const router = useRouter()
  const [group, setGroup] = useState<any>(null)
  const [allAssessors, setAllAssessors] = useState<any[]>([])
  const [tracks, setTracks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Add candidate form
  const [showAddCandidate, setShowAddCandidate] = useState(false)
  const [candidateForm, setCandidateForm] = useState({ full_name: "", position: "", track_id: "", years_experience: "" })

  useEffect(() => {
    Promise.all([
      fetch(`/api/interview/groups/${groupId}`).then(r => r.json()),
      fetch(`/api/interview/groups/${groupId}/assessors`).then(r => r.json()),
      fetch("/api/interview/role-tracks").then(r => r.json()),
    ]).then(([g, assessors, trks]) => {
      if (g.error) { toast.error("Group not found"); router.push("/interview/groups"); return }
      setGroup(g)
      setAllAssessors(Array.isArray(assessors) ? assessors : [])
      setTracks(Array.isArray(trks) ? trks : [])
      setLoading(false)
    })
  }, [groupId])

  const isLocked = group?.locked
  const status = group?.status ?? "draft"
  const candidates: any[] = group?.interview_candidates ?? []
  const assignedAssessors: any[] = (group?.group_assessors ?? []).map((ga: any) => ga.admin_users)
  const assignedIds = new Set(assignedAssessors.map((a: any) => a?.id).filter(Boolean))
  const availableAssessors = allAssessors.filter(a => !assignedIds.has(a.id))

  async function addCandidate() {
    if (!candidateForm.full_name.trim()) return
    setActionLoading("add-candidate")
    const res = await fetch(`/api/interview/groups/${groupId}/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: candidateForm.full_name.trim(),
        position: candidateForm.position.trim() || null,
        track_id: candidateForm.track_id || null,
        years_experience: candidateForm.years_experience ? parseFloat(candidateForm.years_experience) : null,
      }),
    })
    const data = await res.json()
    setActionLoading(null)
    if (!res.ok) { toast.error(data.error); return }
    setGroup((g: any) => ({ ...g, interview_candidates: [...(g.interview_candidates ?? []), data] }))
    setCandidateForm({ full_name: "", position: "", track_id: "", years_experience: "" })
    setShowAddCandidate(false)
    toast.success("Candidate added")
  }

  async function removeCandidate(id: string) {
    if (!confirm("Remove this candidate?")) return
    const res = await fetch(`/api/interview/groups/${groupId}/candidates?id=${id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Failed to remove candidate"); return }
    setGroup((g: any) => ({ ...g, interview_candidates: g.interview_candidates.filter((c: any) => c.id !== id) }))
  }

  async function addAssessor(assessorId: string) {
    setActionLoading(`add-assessor-${assessorId}`)
    const res = await fetch(`/api/interview/groups/${groupId}/assessors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessor_id: assessorId }),
    })
    setActionLoading(null)
    if (!res.ok) { toast.error("Failed to add assessor"); return }
    const assessor = allAssessors.find(a => a.id === assessorId)
    if (assessor) {
      setGroup((g: any) => ({ ...g, group_assessors: [...(g.group_assessors ?? []), { assessor_id: assessorId, admin_users: assessor }] }))
    }
    toast.success("Assessor added")
  }

  async function removeAssessor(assessorId: string) {
    const res = await fetch(`/api/interview/groups/${groupId}/assessors?assessor_id=${assessorId}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Failed to remove assessor"); return }
    setGroup((g: any) => ({ ...g, group_assessors: g.group_assessors.filter((ga: any) => ga.assessor_id !== assessorId) }))
  }

  async function handleAction(action: string, label: string) {
    if (!confirm(`${label} this group?`)) return
    setActionLoading(action)

    let res: Response
    if (action === "activate") {
      res = await fetch(`/api/interview/groups/${groupId}/activate`, { method: "POST" })
    } else {
      res = await fetch(`/api/interview/groups/${groupId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
    }
    const data = await res.json()
    setActionLoading(null)
    if (!res.ok) { toast.error(data.error); return }
    setGroup((g: any) => ({ ...g, status: data.status, locked: data.locked, config_snapshot: data.config_snapshot ?? g.config_snapshot }))
    toast.success(`Group ${label.toLowerCase()}d`)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
  if (!group) return null

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/interview/groups">
          <Button variant="ghost" size="icon" className="h-8 w-8 mt-0.5"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-foreground">{group.name}</h2>
            <Badge className={cn("border-0 capitalize text-xs", STATUS_STYLES[status]?.badge)}>
              {STATUS_STYLES[status]?.label}
            </Badge>
            {isLocked && <Badge className="bg-red-50 text-red-600 border-0 text-xs gap-1"><Lock className="h-3 w-3" />Locked</Badge>}
          </div>
          <div className="flex items-center gap-4 mt-1.5 flex-wrap text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><ClipboardList className="h-3 w-3" />{(group.assessment_configs as any)?.name}</span>
            {group.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{group.location}</span>}
            {group.scheduled_date && <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{new Date(group.scheduled_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>}
          </div>
        </div>

        {/* Status actions */}
        <div className="flex items-center gap-2 shrink-0">
          {status === "draft" && (
            <Button
              onClick={() => handleAction("activate", "Activate")}
              disabled={!!actionLoading || candidates.length === 0 || assignedAssessors.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {actionLoading === "activate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Activate
            </Button>
          )}
          {status === "active" && (
            <Button
              onClick={() => handleAction("complete", "Complete")}
              disabled={!!actionLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              {actionLoading === "complete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Complete
            </Button>
          )}
          {status === "complete" && (
            <Button
              onClick={() => handleAction("publish", "Publish")}
              disabled={!!actionLoading}
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
            >
              {actionLoading === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              Publish
            </Button>
          )}
          {status !== "draft" && (
            <Button
              variant="outline"
              onClick={() => handleAction("reopen", "Reopen")}
              disabled={!!actionLoading}
              className="gap-2 text-slate-600"
            >
              {actionLoading === "reopen" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Reopen
            </Button>
          )}
        </div>
      </div>

      {/* Draft warning */}
      {status === "draft" && (candidates.length === 0 || assignedAssessors.length === 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          ⚠️ To activate this group you need at least <strong>1 candidate</strong> and <strong>1 assessor</strong> assigned.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Candidates */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-[#1B4F8A]" /> Candidates
              <Badge variant="secondary" className="text-xs">{candidates.length}</Badge>
            </CardTitle>
            {!isLocked && (
              <Button size="sm" variant="outline" onClick={() => setShowAddCandidate(v => !v)} className="gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {showAddCandidate && (
              <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
                <Input
                  placeholder="Full name *"
                  value={candidateForm.full_name}
                  onChange={e => setCandidateForm(f => ({ ...f, full_name: e.target.value }))}
                />
                <Input
                  placeholder="Position / role title"
                  value={candidateForm.position}
                  onChange={e => setCandidateForm(f => ({ ...f, position: e.target.value }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="border border-input rounded-lg px-3 py-2 text-sm bg-white outline-none"
                    value={candidateForm.track_id}
                    onChange={e => setCandidateForm(f => ({ ...f, track_id: e.target.value }))}
                  >
                    <option value="">Select track…</option>
                    {tracks.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <Input
                    type="number" min="0" step="0.5"
                    placeholder="Years exp."
                    value={candidateForm.years_experience}
                    onChange={e => setCandidateForm(f => ({ ...f, years_experience: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addCandidate} disabled={actionLoading === "add-candidate" || !candidateForm.full_name.trim()} className="bg-[#1B4F8A] text-white flex-1">
                    {actionLoading === "add-candidate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add Candidate"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddCandidate(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {candidates.length === 0 && !showAddCandidate && (
              <p className="text-sm text-muted-foreground text-center py-4">No candidates added yet.</p>
            )}

            {candidates.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 group">
                <div className="w-8 h-8 rounded-full bg-[#1B4F8A]/10 flex items-center justify-center text-xs font-bold text-[#1B4F8A] shrink-0">
                  {c.full_name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.full_name}</p>
                  <div className="flex items-center gap-2">
                    {c.position && <p className="text-xs text-muted-foreground truncate">{c.position}</p>}
                    {c.role_tracks && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{(c.role_tracks as any).name}</Badge>
                    )}
                  </div>
                </div>
                {!isLocked && (
                  <button onClick={() => removeCandidate(c.id)} className="text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Assessors */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-indigo-600" /> Assessors
              <Badge variant="secondary" className="text-xs">{assignedAssessors.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {assignedAssessors.map((a: any) => a && (
              <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 group">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 shrink-0">
                  {a.name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                </div>
                {!isLocked && (
                  <button onClick={() => removeAssessor(a.id)} className="text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}

            {/* Add assessor dropdown */}
            {!isLocked && availableAssessors.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-400 mb-2">Add assessor</p>
                <div className="space-y-1">
                  {availableAssessors.map((a: any) => (
                    <button
                      key={a.id}
                      onClick={() => addAssessor(a.id)}
                      disabled={actionLoading === `add-assessor-${a.id}`}
                      className="flex items-center gap-2 w-full text-left p-2 rounded-lg hover:bg-slate-50 transition-colors text-sm"
                    >
                      {actionLoading === `add-assessor-${a.id}`
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                        : <Plus className="h-3.5 w-3.5 text-slate-400" />
                      }
                      <span className="font-medium">{a.name}</span>
                      <span className="text-muted-foreground text-xs ml-auto">{a.email}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isLocked && availableAssessors.length === 0 && assignedAssessors.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No assessors available. <Link href="/interview/settings" className="text-[#1B4F8A] underline">Create assessor accounts</Link> first.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Score viewing link (active+) */}
      {status !== "draft" && (
        <div className="bg-[#1B4F8A]/5 border border-[#1B4F8A]/15 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-[#1B4F8A]">Scoring Interface</p>
            <p className="text-xs text-slate-500 mt-0.5">Share this link with assessors to score candidates.</p>
          </div>
          <Link href={`/interview/score/${groupId}`}>
            <Button className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
              <ClipboardList className="h-4 w-4" /> Open Scoring
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}
