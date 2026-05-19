"use client"

import React, { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ArrowLeft, Plus, Trash2, Users, UserCheck, Loader2,
  Play, Lock, Globe, RotateCcw, ClipboardList, CalendarDays, MapPin,
  LayoutGrid, ShieldAlert, BarChart3, CheckCircle2, Circle, AlertCircle,
  RefreshCw, Pencil
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
  const [progress, setProgress] = useState<any>(null)
  const [progressLoading, setProgressLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  // Matrix edit mode
  const [matrixEditing, setMatrixEditing] = useState(false)
  const [draftWeights,  setDraftWeights]  = useState<Record<string, Record<string, number>>>({})
  const [matrixSaving,  setMatrixSaving]  = useState(false)

  // Add candidate form
  const [showAddCandidate, setShowAddCandidate] = useState(false)
  const [addMode, setAddMode]                   = useState<"single" | "bulk">("single")
  const [candidateForm, setCandidateForm]       = useState({ full_name: "", employment_id: "", position: "", track_id: "", years_experience: "" })
  // Bulk CSV
  const [bulkRows,    setBulkRows]    = useState<any[]>([])
  const [bulkFile,    setBulkFile]    = useState<string>("")
  const [bulkImporting, setBulkImporting] = useState(false)

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
      // Load progress for active/complete/published groups
      if (g.status && g.status !== "draft") {
        fetchProgress()
      }
    }).catch(() => {
      toast.error("Failed to load group data")
      setLoading(false)
    })
  }, [groupId])

  async function fetchProgress() {
    setProgressLoading(true)
    try {
      const res = await fetch(`/api/interview/groups/${groupId}/progress`)
      if (res.ok) setProgress(await res.json())
    } finally {
      setProgressLoading(false)
    }
  }

  const isLocked = group?.locked
  const status = group?.status ?? "draft"
  const candidates: any[] = group?.interview_candidates ?? []
  const groupAssessors: any[] = group?.group_assessors ?? []
  const assignedAssessors: any[] = groupAssessors.map((ga: any) => ga.admin_users)
  const assignedIds = new Set(assignedAssessors.map((a: any) => a?.id).filter(Boolean))
  const availableAssessors = allAssessors.filter(a => !assignedIds.has(a.id))

  async function addCandidate() {
    if (!candidateForm.full_name.trim()) return
    setActionLoading("add-candidate")
    const res = await fetch(`/api/interview/groups/${groupId}/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name:        candidateForm.full_name.trim(),
        employment_id:    candidateForm.employment_id.trim() || null,
        position:         candidateForm.position.trim() || null,
        track_id:         candidateForm.track_id || null,
        years_experience: candidateForm.years_experience ? parseFloat(candidateForm.years_experience) : null,
      }),
    })
    const data = await res.json()
    setActionLoading(null)
    if (!res.ok) { toast.error(data.error); return }
    setGroup((g: any) => ({ ...g, interview_candidates: [...(g.interview_candidates ?? []), data] }))
    setCandidateForm({ full_name: "", employment_id: "", position: "", track_id: "", years_experience: "" })
    setShowAddCandidate(false)
    toast.success("Candidate added")
  }

  function downloadSampleCsv() {
    const header = "full_name,employment_id,position,track_name,years_experience"
    const example = tracks.length > 0
      ? `John Smith,EMP-001,Safety Officer,${tracks[0].name},3`
      : "John Smith,EMP-001,Safety Officer,Operations,3"
    const csv = [header, example].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url; a.download = "candidates_sample.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  function parseCsv(text: string) {
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) return []
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase())
    return lines.slice(1).map(line => {
      // Handle quoted fields
      const cols: string[] = []
      let cur = "", inQ = false
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ }
        else if (ch === "," && !inQ) { cols.push(cur.trim()); cur = "" }
        else cur += ch
      }
      cols.push(cur.trim())
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h] = cols[i] ?? "" })
      return row
    }).filter(r => r.full_name)
  }

  function onCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBulkFile(file.name)
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      setBulkRows(parseCsv(text))
    }
    reader.readAsText(file)
  }

  async function importBulk() {
    if (bulkRows.length === 0) return
    setBulkImporting(true)
    const res = await fetch(`/api/interview/groups/${groupId}/candidates/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidates: bulkRows }),
    })
    const data = await res.json()
    setBulkImporting(false)
    if (!res.ok) { toast.error(data.error ?? "Import failed"); return }
    setGroup((g: any) => ({ ...g, interview_candidates: [...(g.interview_candidates ?? []), ...(data.candidates ?? [])] }))
    if (data.warnings?.length) toast.warning(`Imported with warnings: ${data.warnings.join("; ")}`)
    else toast.success(`${data.inserted} candidate(s) imported`)
    setBulkRows([]); setBulkFile(""); setShowAddCandidate(false)
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
    const result = await res.json()
    setActionLoading(null)
    if (!res.ok) { toast.error("Failed to add assessor"); return }
    const assessor = allAssessors.find(a => a.id === assessorId)
    if (assessor) {
      setGroup((g: any) => ({
        ...g,
        group_assessors: [
          ...(g.group_assessors ?? []),
          { assessor_id: assessorId, pillar_weights: result.pillar_weights ?? {}, admin_users: assessor },
        ],
      }))
    }
    toast.success("Assessor added")
  }

  function enterMatrixEdit() {
    const draft: Record<string, Record<string, number>> = {}
    for (const ga of groupAssessors) {
      draft[ga.assessor_id] = { ...(ga.pillar_weights ?? {}) }
    }
    setDraftWeights(draft)
    setMatrixEditing(true)
  }

  function cancelMatrixEdit() {
    setDraftWeights({})
    setMatrixEditing(false)
  }

  async function saveMatrix(sortedPillars: any[]) {
    // Validate: each pillar column must sum to 100 (excluding disabled = 0)
    for (const p of sortedPillars) {
      const colSum = groupAssessors.reduce((s, ga) => s + (draftWeights[ga.assessor_id]?.[p.id] ?? 0), 0)
      if (colSum !== 100) {
        toast.error(`Pillar "${p.name}" weights must total 100 (currently ${colSum})`)
        return
      }
    }
    setMatrixSaving(true)
    await Promise.all(
      groupAssessors.map(ga =>
        fetch(`/api/interview/groups/${groupId}/assessors`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assessor_id: ga.assessor_id, pillar_weights: draftWeights[ga.assessor_id] ?? {} }),
        })
      )
    )
    // Commit to group state
    setGroup((g: any) => ({
      ...g,
      group_assessors: g.group_assessors.map((ga: any) => ({
        ...ga,
        pillar_weights: draftWeights[ga.assessor_id] ?? ga.pillar_weights,
      })),
    }))
    setMatrixSaving(false)
    setMatrixEditing(false)
    toast.success("Assessor matrix saved")
  }

  async function updateAssessorWeights(assessorId: string, pillarWeights: Record<string, number>) {
    // Optimistic update
    setGroup((g: any) => ({
      ...g,
      group_assessors: g.group_assessors.map((ga: any) =>
        ga.assessor_id === assessorId ? { ...ga, pillar_weights: pillarWeights } : ga
      ),
    }))
    const res = await fetch(`/api/interview/groups/${groupId}/assessors`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessor_id: assessorId, pillar_weights: pillarWeights }),
    })
    if (!res.ok) toast.error("Failed to save weights")
  }

  async function removeAssessor(assessorId: string) {
    const res = await fetch(`/api/interview/groups/${groupId}/assessors?assessor_id=${assessorId}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Failed to remove assessor"); return }
    setGroup((g: any) => ({ ...g, group_assessors: g.group_assessors.filter((ga: any) => ga.assessor_id !== assessorId) }))
  }

  async function resyncSnapshot() {
    if (!confirm(
      "Re-sync config into this group?\n\n" +
      "This pulls the latest thresholds, weights, and pillar settings from the config and applies them to this group.\n\n" +
      "✅ Scores and qualitative data are NOT affected.\n" +
      "✅ Group status does NOT change.\n" +
      "✅ Reports will immediately reflect the updated config."
    )) return
    setActionLoading("resync")
    const res  = await fetch(`/api/interview/groups/${groupId}/resync-snapshot`, { method: "POST" })
    const data = await res.json()
    setActionLoading(null)
    if (!res.ok) { toast.error(data.error ?? "Failed to re-sync"); return }
    setGroup((g: any) => ({ ...g, config_snapshot: data.config_snapshot }))
    toast.success("Config re-synced — reports now reflect the updated settings")
  }

  async function resetProgress() {
    if (!confirm(
      `Reset ALL candidate progress for "${group?.name}"?\n\n` +
      `This will permanently delete:\n` +
      `• All competency scores\n` +
      `• All remarks, gap analysis & recommendations\n` +
      `• All confirmations\n\n` +
      `Candidates, assessors, and group status will NOT change.`
    )) return
    setActionLoading("reset")
    const res  = await fetch(`/api/interview/groups/${groupId}/reset`, { method: "POST" })
    const data = await res.json()
    setActionLoading(null)
    if (!res.ok) { toast.error(data.error ?? "Reset failed"); return }
    setProgress(null)
    toast.success(`Progress reset — ${data.cleared} candidate(s) cleared`)
    // Refresh progress stats
    fetchProgress()
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
    // Refresh progress after any status change
    fetchProgress()
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
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
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
          {["active", "complete", "published"].includes(status) && (
            <Button
              variant="outline"
              onClick={resyncSnapshot}
              disabled={!!actionLoading}
              title="Re-read config and apply latest thresholds, weights and pillar settings to this group"
              className="gap-2 text-slate-600 text-xs"
            >
              {actionLoading === "resync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Re-sync Config
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
          {status !== "draft" && !isLocked && (
            <Button
              variant="outline"
              onClick={resetProgress}
              disabled={!!actionLoading}
              className="gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
            >
              {actionLoading === "reset" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Reset Progress
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
              <Button size="sm" variant="outline" onClick={() => { setShowAddCandidate(v => !v); setAddMode("single"); setBulkRows([]); setBulkFile("") }} className="gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {showAddCandidate && (
              <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                {/* Tab bar */}
                <div className="flex border-b border-slate-200">
                  {(["single", "bulk"] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setAddMode(m)}
                      className={cn(
                        "flex-1 py-2 text-xs font-semibold transition-colors",
                        addMode === m
                          ? "bg-white text-[#1B4F8A] border-b-2 border-[#1B4F8A]"
                          : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      {m === "single" ? "Single Candidate" : "Bulk Import (CSV)"}
                    </button>
                  ))}
                </div>

                {/* ── Single tab ── */}
                {addMode === "single" && (
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Full name *"
                        value={candidateForm.full_name}
                        onChange={e => setCandidateForm(f => ({ ...f, full_name: e.target.value }))}
                      />
                      <Input
                        placeholder="Employment ID"
                        value={candidateForm.employment_id}
                        onChange={e => setCandidateForm(f => ({ ...f, employment_id: e.target.value }))}
                      />
                    </div>
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

                {/* ── Bulk tab ── */}
                {addMode === "bulk" && (
                  <div className="p-4 space-y-3">
                    {/* Download sample */}
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500">Fill the sample CSV then upload it below.</p>
                      <Button size="sm" variant="outline" onClick={downloadSampleCsv} className="gap-1.5 text-xs h-7">
                        <ArrowLeft className="h-3 w-3 rotate-[270deg]" /> Sample CSV
                      </Button>
                    </div>

                    {/* File input */}
                    <label className={cn(
                      "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-5 cursor-pointer transition-colors",
                      bulkFile ? "border-[#1B4F8A]/40 bg-[#1B4F8A]/5" : "border-slate-300 hover:border-slate-400"
                    )}>
                      <input type="file" accept=".csv" className="hidden" onChange={onCsvFile} />
                      <Users className="h-5 w-5 text-slate-400" />
                      {bulkFile
                        ? <span className="text-xs font-medium text-[#1B4F8A]">{bulkFile} — {bulkRows.length} row(s)</span>
                        : <span className="text-xs text-slate-500">Click to select a CSV file</span>
                      }
                    </label>

                    {/* Preview */}
                    {bulkRows.length > 0 && (
                      <div className="overflow-x-auto rounded-lg border border-slate-200 text-xs">
                        <table className="w-full">
                          <thead className="bg-slate-50 text-slate-500">
                            <tr>
                              {["full_name","employment_id","position","track_name","years_experience"].map(h => (
                                <th key={h} className="px-3 py-1.5 text-left font-medium">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {bulkRows.slice(0, 5).map((r, i) => (
                              <tr key={i} className="border-t border-slate-100">
                                <td className="px-3 py-1.5">{r.full_name}</td>
                                <td className="px-3 py-1.5 text-slate-400">{r.employment_id || "—"}</td>
                                <td className="px-3 py-1.5 text-slate-400">{r.position || "—"}</td>
                                <td className="px-3 py-1.5 text-slate-400">{r.track_name || "—"}</td>
                                <td className="px-3 py-1.5 text-slate-400">{r.years_experience || "—"}</td>
                              </tr>
                            ))}
                            {bulkRows.length > 5 && (
                              <tr className="border-t border-slate-100 bg-slate-50">
                                <td colSpan={5} className="px-3 py-1.5 text-slate-400 text-center">
                                  …and {bulkRows.length - 5} more row(s)
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={importBulk}
                        disabled={bulkImporting || bulkRows.length === 0}
                        className="bg-[#1B4F8A] text-white flex-1"
                      >
                        {bulkImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Import ${bulkRows.length} Candidate(s)`}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowAddCandidate(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
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
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{c.full_name}</p>
                    {c.employment_id && (
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">{c.employment_id}</span>
                    )}
                  </div>
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
                No assessors available. <Link href="/interview/assessors" className="text-[#1B4F8A] underline">Create assessor accounts</Link> first.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Assessor × Pillar Weight Matrix ── */}
      {groupAssessors.length > 0 && (() => {
        const pillars: any[] = (group?.assessment_configs as any)?.pillars ?? []
        if (pillars.length === 0) return null
        const sortedPillars = [...pillars].sort((a, b) => a.order_index - b.order_index)

        // Column sums (live data or draft)
        const colSum = (pillarId: string) =>
          groupAssessors.reduce((s, ga) => {
            const w = matrixEditing
              ? (draftWeights[ga.assessor_id]?.[pillarId] ?? 0)
              : (ga.pillar_weights?.[pillarId] ?? 0)
            return s + w
          }, 0)

        const allColumnsValid = sortedPillars.every(p => colSum(p.id) === 100)

        return (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4 text-[#1B4F8A]" />
                  Assessor Scoring Matrix
                  <span className="text-xs font-normal text-slate-400 ml-1">— each pillar column must total 100</span>
                </CardTitle>
                {!isLocked && (
                  <div className="flex items-center gap-2">
                    {matrixEditing ? (
                      <>
                        <Button size="sm" variant="outline" onClick={cancelMatrixEdit} disabled={matrixSaving} className="text-xs h-8">
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => saveMatrix(sortedPillars)}
                          disabled={matrixSaving || !allColumnsValid}
                          className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white text-xs h-8 gap-1.5"
                        >
                          {matrixSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          Save Matrix
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={enterMatrixEdit} className="text-xs h-8 gap-1.5">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {matrixEditing && !allColumnsValid && (
                <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Each pillar column must sum to exactly 100 before you can save.
                </p>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left pr-4 pb-3 text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                      Assessor
                    </th>
                    {sortedPillars.map((p: any) => (
                      <th key={p.id} className="pb-3 px-2 text-center">
                        <div className="text-xs font-semibold text-slate-700 whitespace-nowrap">{p.name}</div>
                        {p.knockout_threshold && (
                          <div className="flex items-center justify-center gap-0.5 mt-0.5">
                            <ShieldAlert className="h-2.5 w-2.5 text-red-400" />
                            <span className="text-[9px] text-red-400">KO≥{p.knockout_threshold}</span>
                          </div>
                        )}
                      </th>
                    ))}
                    <th className="pb-3 px-2 text-center text-xs font-bold uppercase tracking-wider text-slate-400">Active</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {groupAssessors.map((ga: any) => {
                    const assessor = ga.admin_users
                    if (!assessor) return null
                    const savedWeights: Record<string, number>  = ga.pillar_weights ?? {}
                    const editWeights:  Record<string, number>  = draftWeights[ga.assessor_id] ?? {}
                    const weights = matrixEditing ? editWeights : savedWeights
                    const activeCount = sortedPillars.filter(p => (weights[p.id] ?? 0) > 0).length

                    return (
                      <tr key={ga.assessor_id} className="hover:bg-slate-50/50 transition-colors">
                          {/* Assessor name */}
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 shrink-0">
                                {assessor.name?.[0]?.toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-slate-700 truncate text-sm">{assessor.name}</p>
                                <p className="text-[10px] text-slate-400 truncate">{assessor.email}</p>
                              </div>
                            </div>
                          </td>

                          {/* Weight cells */}
                          {sortedPillars.map((p: any) => {
                            const w     = weights[p.id] ?? 0
                            const isOff = w === 0
                            return (
                              <td key={p.id} className="py-3 px-2 text-center">
                                {matrixEditing ? (
                                  <input
                                    type="number"
                                    min={0} max={100} step={5}
                                    value={w}
                                    onChange={e => {
                                      const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                                      setDraftWeights(prev => ({
                                        ...prev,
                                        [ga.assessor_id]: { ...(prev[ga.assessor_id] ?? {}), [p.id]: val },
                                      }))
                                    }}
                                    className={cn(
                                      "w-16 text-sm text-center rounded-lg border px-2 py-1.5 outline-none transition-all font-semibold",
                                      isOff
                                        ? "bg-slate-100 border-slate-200 text-slate-400"
                                        : w > 0 && colSum(p.id) === 100
                                        ? "bg-emerald-50 border-emerald-300 text-emerald-700 focus:border-emerald-500"
                                        : "bg-amber-50 border-amber-200 text-amber-700 focus:border-amber-400",
                                    )}
                                  />
                                ) : (
                                  <span className={cn(
                                    "inline-flex items-center justify-center w-14 h-8 rounded-lg text-sm font-semibold",
                                    isOff
                                      ? "bg-slate-100 text-slate-400"
                                      : w === 100
                                      ? "bg-[#1B4F8A]/8 text-[#1B4F8A]"
                                      : "bg-amber-50 text-amber-700",
                                  )}>
                                    {isOff ? "—" : `${w}%`}
                                  </span>
                                )}
                              </td>
                            )
                          })}

                          {/* Active pillars badge */}
                          <td className="py-3 px-2 text-center">
                            <span className={cn(
                              "text-xs font-semibold px-2 py-0.5 rounded-full",
                              activeCount === sortedPillars.length ? "bg-emerald-100 text-emerald-700"
                              : activeCount === 0 ? "bg-red-100 text-red-600"
                              : "bg-amber-100 text-amber-700",
                            )}>
                              {activeCount}/{sortedPillars.length}
                            </span>
                          </td>

                        </tr>
                    )
                  })}
                </tbody>

                {/* Column total row */}
                <tfoot>
                  <tr className="border-t-2 border-slate-200">
                    <td className="pt-2.5 pr-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Total</td>
                    {sortedPillars.map((p: any) => {
                      const sum = colSum(p.id)
                      const ok  = sum === 100
                      return (
                        <td key={p.id} className="pt-2.5 px-2 text-center">
                          <span className={cn(
                            "inline-flex items-center justify-center w-14 h-7 rounded-lg text-sm font-bold",
                            ok ? "bg-emerald-100 text-emerald-700" : sum === 0 ? "bg-slate-100 text-slate-400" : "bg-red-100 text-red-600",
                          )}>
                            {sum}%
                          </span>
                        </td>
                      )
                    })}
                    <td className="pt-2.5 px-2 text-[10px] text-slate-400 text-center">
                      {allColumnsValid ? "✓ All columns valid" : "Each column must = 100%"}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <div className="w-8 h-5 rounded bg-emerald-100 flex items-center justify-center text-[9px] font-bold text-emerald-700">100%</div>
                  <span>Column total valid</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-8 h-5 rounded bg-red-100 flex items-center justify-center text-[9px] font-bold text-red-600">85%</div>
                  <span>Column total invalid</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-8 h-5 rounded bg-slate-100 flex items-center justify-center text-[9px] font-bold text-slate-400">—</div>
                  <span>Not scoring this pillar</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* ── Scoring Progress ── */}
      {status !== "draft" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[#1B4F8A]" />
                Scoring Progress
                {progress?.all_done && (
                  <span className="text-xs font-normal text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 ml-1">
                    ✓ All confirmed
                  </span>
                )}
              </CardTitle>
              <button
                onClick={fetchProgress}
                disabled={progressLoading}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                title="Refresh"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", progressLoading && "animate-spin")} />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {progressLoading && !progress && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
              </div>
            )}

            {!progressLoading && progress && progress.assessors.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No assessors assigned.</p>
            )}

            {progress && progress.assessors.length > 0 && (
              <div className="space-y-4">
                {/* Overall summary */}
                <div className="flex items-center gap-3 text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
                  <span className="font-medium text-slate-700">
                    {progress.assessors.filter((a: any) => a.total > 0 && a.confirmed === a.total).length}
                    /{progress.assessors.length}
                  </span>
                  <span>assessors fully confirmed</span>
                </div>

                {/* Per-assessor rows */}
                <div className="space-y-3">
                  {progress.assessors.map((a: any) => {
                    const pct        = a.total > 0 ? Math.round((a.confirmed / a.total) * 100) : 0
                    const isDone     = a.total > 0 && a.confirmed === a.total
                    const hasPartial = a.in_progress > 0 || a.confirmed > 0
                    const partialPct = a.total > 0
                      ? Math.round(((a.confirmed + a.in_progress) / a.total) * 100)
                      : 0

                    return (
                      <div key={a.assessor_id} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          {/* Status icon */}
                          {isDone
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                            : hasPartial
                            ? <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                            : <Circle className="h-4 w-4 text-slate-300 shrink-0" />
                          }

                          {/* Name */}
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-slate-700 truncate block">{a.name}</span>
                          </div>

                          {/* Count badge */}
                          <span className={cn(
                            "text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full",
                            isDone
                              ? "bg-emerald-100 text-emerald-700"
                              : hasPartial
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-500"
                          )}>
                            {a.confirmed}/{a.total} confirmed
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="ml-6 h-2 bg-slate-100 rounded-full overflow-hidden relative">
                          {/* In-progress layer (amber) */}
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-amber-200 transition-all duration-300"
                            style={{ width: `${partialPct}%` }}
                          />
                          {/* Confirmed layer (green, on top) */}
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        {/* Sub-label */}
                        {!isDone && (a.in_progress > 0 || a.not_started > 0) && (
                          <div className="ml-6 flex items-center gap-3 text-[10px] text-slate-400">
                            {a.in_progress > 0 && <span className="text-amber-600">{a.in_progress} in progress</span>}
                            {a.not_started > 0 && <span>{a.not_started} not started</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Readiness hint for active groups */}
                {status === "active" && (
                  <div className={cn(
                    "rounded-lg p-3 text-xs mt-2",
                    progress.all_done
                      ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                      : "bg-amber-50 border border-amber-200 text-amber-700"
                  )}>
                    {progress.all_done
                      ? "✓ All assessors have confirmed all candidates. You can now mark this group as Complete."
                      : "⏳ Waiting for all assessors to confirm all candidates before marking Complete."}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

      {/* Reports link (complete/published only) */}
      {(status === "complete" || status === "published") && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-purple-700">Assessment Reports</p>
            <p className="text-xs text-slate-500 mt-0.5">
              View computed scores, AI insights, and generate candidate reports.
            </p>
          </div>
          <Link href={`/interview/reports/${groupId}`}>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white gap-2">
              <BarChart3 className="h-4 w-4" /> View Reports
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}
