"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft, Loader2, CheckCircle2, Lock, ChevronDown, ChevronUp,
  AlertCircle, ClipboardCheck, Users, LogIn, Clock,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

/* ── Types ───────────────────────────────────────────────────────────────── */
type Competency  = { id: string; name: string; description?: string | null; weight: number; order_index: number }
type Pillar      = { id: string; name: string; weight: number; applicable_track_ids: string[]; competencies: Competency[] }
type Candidate   = { id: string; full_name: string; position: string | null; track_id: string | null; role_tracks: { id: string; name: string } | null }
type Score       = { candidate_id: string; competency_id: string; value: number; evidence: string | null }
type Qualitative = { candidate_id: string; remarks: string | null; gap_analysis: string | null; recommendation: string | null; confirmed: boolean }
type PageData    = { group: any; candidates: Candidate[]; scores: Score[]; qualitative: Qualitative[]; pillar_weights: Record<string, number> }

/* ── Score colour helpers ────────────────────────────────────────────────── */
const QUICK = [1, 2, 3, 4, 5]

function scoreLabel(v: number) {
  if (v <= 1.5) return "Poor"
  if (v <= 2.5) return "Below Standard"
  if (v <= 3.5) return "Meeting Standard"
  if (v <= 4.5) return "Exceeding Standard"
  return "Exemplary"
}

function quickBtnCls(btn: number, current: number | null) {
  if (current === null || Math.round(current) !== btn)
    return "border-slate-200 bg-white text-slate-500 hover:border-slate-400"
  const map: Record<number, string> = {
    1: "border-red-400 bg-red-400 text-white",
    2: "border-orange-400 bg-orange-400 text-white",
    3: "border-amber-400 bg-amber-400 text-white",
    4: "border-emerald-500 bg-emerald-500 text-white",
    5: "border-blue-600 bg-blue-600 text-white",
  }
  return map[btn] ?? ""
}

/* ── CompetencyRow ───────────────────────────────────────────────────────── */
function CompetencyRow({
  competency, score, disabled, onSave,
}: {
  competency: Competency
  score: Score | undefined
  disabled: boolean
  onSave: (compId: string, value: number, evidence: string | null) => Promise<void>
}) {
  const [localVal, setLocalVal]   = useState(score?.value?.toString() ?? "")
  const [localEv,  setLocalEv]    = useState(score?.evidence ?? "")
  const [saving,   setSaving]     = useState(false)

  // Sync when parent score changes
  useEffect(() => {
    setLocalVal(score?.value?.toString() ?? "")
    setLocalEv(score?.evidence ?? "")
  }, [score?.value, score?.evidence])

  const numVal     = parseFloat(localVal)
  const hasScore   = !isNaN(numVal) && numVal >= 1 && numVal <= 5
  const hasEvidence = localEv.trim().length > 0
  const complete   = hasScore && hasEvidence

  async function doSave(v: number, ev: string | null) {
    setSaving(true)
    await onSave(competency.id, v, ev)
    setSaving(false)
  }

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3 transition-all",
      complete ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white",
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">{competency.name}</p>
          {competency.description && (
            <p className="text-xs text-slate-500 mt-0.5 italic leading-relaxed">{competency.description}</p>
          )}
        </div>
        {saving    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0 mt-0.5" />
         : complete ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
         : null}
      </div>

      {/* Score row */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          {/* Quick 1-5 buttons */}
          <div className="flex gap-1 flex-1">
            {QUICK.map(v => (
              <button
                key={v}
                disabled={disabled}
                onClick={async () => {
                  setLocalVal(v.toString())
                  await doSave(v, localEv || null)
                }}
                className={cn(
                  "flex-1 h-10 rounded-lg border-2 text-sm font-bold transition-all",
                  quickBtnCls(v, hasScore ? numVal : null),
                  disabled && "opacity-50 cursor-not-allowed",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          {/* Decimal input */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-slate-400">Score</span>
            <input
              type="number" min="1" max="5" step="0.1"
              disabled={disabled}
              className="w-16 text-sm text-center border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-[#1B4F8A] font-semibold disabled:opacity-50"
              value={localVal}
              onChange={e => setLocalVal(e.target.value)}
              onBlur={async () => {
                if (!hasScore) return
                await doSave(numVal, localEv || null)
              }}
              placeholder="–"
            />
          </div>
        </div>
        {hasScore && (
          <p className="text-[11px] text-center text-slate-400">
            <span className="font-semibold text-slate-600">{numVal.toFixed(1)}</span>
            {" · "}{scoreLabel(numVal)}
          </p>
        )}
      </div>

      {/* Evidence */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-1.5">
          Evidence <span className="text-red-500">*</span>
        </p>
        <textarea
          disabled={disabled}
          rows={2}
          placeholder="Describe the behavioural evidence observed for this competency…"
          value={localEv}
          onChange={e => setLocalEv(e.target.value)}
          onBlur={async () => {
            if (!hasScore) return
            await doSave(numVal, localEv || null)
          }}
          className={cn(
            "w-full text-sm border rounded-lg px-3 py-2 outline-none resize-none transition-colors disabled:opacity-50",
            hasScore && !hasEvidence
              ? "border-red-200 bg-red-50/60 focus:border-red-400 placeholder:text-red-300"
              : "border-slate-200 focus:border-[#1B4F8A]",
          )}
        />
        {hasScore && !hasEvidence && (
          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Evidence is required before confirming
          </p>
        )}
      </div>
    </div>
  )
}

/* ── PillarSection ───────────────────────────────────────────────────────── */
function PillarSection({
  pillar, scores, candidateTrackId, disabled, onSave,
}: {
  pillar: Pillar
  scores: Score[]
  candidateTrackId: string | null
  disabled: boolean
  onSave: (compId: string, value: number, evidence: string | null) => Promise<void>
}) {
  const [open, setOpen] = useState(false)

  const trackIds: string[] = Array.isArray(pillar.applicable_track_ids) ? pillar.applicable_track_ids : []
  const applies = trackIds.length === 0 || (candidateTrackId ? trackIds.includes(candidateTrackId) : true)
  if (!applies) return null

  const sorted  = [...pillar.competencies].sort((a, b) => a.order_index - b.order_index)
  const scored  = sorted.filter(c => scores.some(s => s.competency_id === c.id && s.value && s.evidence?.trim())).length
  const total   = sorted.length
  const allDone = scored === total

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-100"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-800">{pillar.name}</span>
          <Badge variant="secondary" className={cn("text-xs", allDone ? "bg-emerald-100 text-emerald-700" : "")}>
            {scored}/{total}
          </Badge>
          {allDone && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {open && (
        <div className="p-4 space-y-3 bg-white">
          {sorted.map(comp => (
            <CompetencyRow
              key={comp.id}
              competency={comp}
              score={scores.find(s => s.competency_id === comp.id)}
              disabled={disabled}
              onSave={onSave}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function ScoringPage() {
  const { groupId } = useParams<{ groupId: string }>()

  const [data,      setData]      = useState<PageData | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [mode,      setMode]      = useState<"list" | "scoring">("list")
  const [selected,  setSelected]  = useState<Candidate | null>(null)
  const [qualForm,  setQualForm]  = useState({ remarks: "", gap_analysis: "", recommendation: "" })
  const [confirming, setConfirming] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)

  /* ── Load ── */
  useEffect(() => {
    fetch(`/api/interview/score/${groupId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { toast.error(d.error); setLoading(false); return }
        setData(d)
        setLoading(false)
      })
      .catch(() => { toast.error("Failed to load scoring data"); setLoading(false) })
  }, [groupId])

  // When any save/confirm hits an expired session (401), show the friendly
  // re-login prompt instead of a cryptic "Unauthorized". The page stays open,
  // so nothing the assessor has typed is lost — they re-login in a new tab and
  // come back to confirm.
  const isSessionExpired = useCallback((res: Response) => {
    if (res.status === 401) { setSessionExpired(true); return true }
    return false
  }, [])

  /* ── Helpers ── */
  const snapshot  = data?.group?.config_snapshot
  const pillars: Pillar[] = snapshot?.pillars ?? []
  const isLocked  = !!data?.group?.locked
  // pillar_weights: { [pillarId]: weight } — weight === 0 means this assessor is excluded
  const myPillarWeights: Record<string, number> = data?.pillar_weights ?? {}

  const getScores = useCallback((candidateId: string) =>
    (data?.scores ?? []).filter(s => s.candidate_id === candidateId),
  [data?.scores])

  const getQual = useCallback((candidateId: string) =>
    (data?.qualitative ?? []).find(q => q.candidate_id === candidateId),
  [data?.qualitative])

  // If the assessor has a weight map (non-empty), any pillar missing from it is treated as 0 (excluded).
  // If the weight map is empty (admin preview / unassigned), all pillars are shown.
  const hasWeightMap = Object.keys(myPillarWeights).length > 0

  const getApplicablePillars = useCallback((candidate: Candidate) =>
    pillars.filter(p => {
      // 1. Track filter — null or empty means applies to all tracks
      const trackIds: string[] = Array.isArray(p.applicable_track_ids) ? p.applicable_track_ids : []
      const trackOk = trackIds.length === 0 ||
        (candidate.track_id ? trackIds.includes(candidate.track_id) : true)
      // 2. Assessor pillar matrix — if weight map exists, only show pillars explicitly > 0
      //    Missing from map = excluded (treats newly added pillars as opt-in, not auto-assigned)
      const weightOk = !hasWeightMap || (myPillarWeights[p.id] ?? 0) > 0
      return trackOk && weightOk
    }),
  [pillars, myPillarWeights, hasWeightMap])

  const getInfo = useCallback((candidate: Candidate) => {
    const applicable = getApplicablePillars(candidate).flatMap(p => p.competencies)
    const scores     = getScores(candidate.id)
    const scored     = applicable.filter(c => {
      const s = scores.find(sc => sc.competency_id === c.id)
      return s && s.value && s.evidence?.trim()
    }).length
    return { scored, total: applicable.length }
  }, [getApplicablePillars, getScores])

  const getStatus = useCallback((candidate: Candidate): "not_started" | "in_progress" | "confirmed" => {
    if (getQual(candidate.id)?.confirmed) return "confirmed"
    const { scored } = getInfo(candidate)
    return scored > 0 ? "in_progress" : "not_started"
  }, [getQual, getInfo])

  /* ── Enter scoring mode ── */
  function enterScoring(candidate: Candidate) {
    const existing = getQual(candidate.id)
    setQualForm({
      remarks:        existing?.remarks        ?? "",
      gap_analysis:   existing?.gap_analysis   ?? "",
      recommendation: existing?.recommendation ?? "",
    })
    setSelected(candidate)
    setMode("scoring")
  }

  /* ── Save score ── */
  async function saveScore(compId: string, value: number, evidence: string | null) {
    if (!selected || isLocked) return
    const candidateId = selected.id

    // Optimistic update
    setData(d => {
      if (!d) return d
      const idx = d.scores.findIndex(s => s.candidate_id === candidateId && s.competency_id === compId)
      const updated = [...d.scores]
      if (idx >= 0) updated[idx] = { ...updated[idx], value, evidence }
      else updated.push({ candidate_id: candidateId, competency_id: compId, value, evidence })
      return { ...d, scores: updated }
    })

    const res = await fetch(`/api/interview/score/${groupId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate_id: candidateId, competency_id: compId, value, evidence }),
    })
    if (isSessionExpired(res)) return
    if (!res.ok) toast.error("Failed to save score")
  }

  /* ── Save qualitative (auto-save on blur) ── */
  async function saveQualBlur(updated: typeof qualForm) {
    if (!selected) return
    const candidateId = selected.id

    // Update state immediately
    setData(d => {
      if (!d) return d
      const idx = d.qualitative.findIndex(q => q.candidate_id === candidateId)
      const entry: Qualitative = {
        candidate_id:   candidateId,
        remarks:        updated.remarks        || null,
        gap_analysis:   updated.gap_analysis   || null,
        recommendation: updated.recommendation || null,
        confirmed:      d.qualitative[idx]?.confirmed ?? false,
      }
      const qualitative = idx >= 0
        ? d.qualitative.map((q, i) => i === idx ? entry : q)
        : [...d.qualitative, entry]
      return { ...d, qualitative }
    })

    // Background save (don't confirm on auto-save)
    const res = await fetch(`/api/interview/score/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate_id: candidateId, ...updated, confirmed: false }),
    })
    isSessionExpired(res)
  }

  /* ── Confirm assessment ── */
  async function confirmAssessment() {
    if (!selected || !data) return

    const applicable = getApplicablePillars(selected).flatMap(p => p.competencies)
    const scores     = getScores(selected.id)

    const missingScore    = applicable.filter(c => !scores.some(s => s.competency_id === c.id && s.value))
    const missingEvidence = applicable.filter(c => !scores.some(s => s.competency_id === c.id && s.evidence?.trim()))

    if (missingScore.length > 0) {
      toast.error(`${missingScore.length} competency score(s) missing`)
      return
    }
    if (missingEvidence.length > 0) {
      toast.error(`${missingEvidence.length} competency evidence field(s) missing`)
      return
    }
    if (!qualForm.remarks.trim()) {
      toast.error("Remarks are required")
      return
    }
    if (!qualForm.gap_analysis.trim()) {
      toast.error("Gap Analysis is required")
      return
    }
    if (!qualForm.recommendation.trim()) {
      toast.error("Recommendation is required")
      return
    }

    setConfirming(true)
    const res = await fetch(`/api/interview/score/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate_id: selected.id, ...qualForm, confirmed: true }),
    })
    if (isSessionExpired(res)) { setConfirming(false); return }
    const result = await res.json()
    setConfirming(false)

    if (!res.ok) { toast.error(result.error); return }

    // Update qualitative state
    setData(d => {
      if (!d) return d
      const candidateId = selected.id
      const idx = d.qualitative.findIndex(q => q.candidate_id === candidateId)
      const entry: Qualitative = { candidate_id: candidateId, ...qualForm, confirmed: true }
      const qualitative = idx >= 0
        ? d.qualitative.map((q, i) => i === idx ? entry : q)
        : [...d.qualitative, entry]
      return { ...d, qualitative }
    })

    toast.success(`${selected.full_name} — assessment confirmed`)
    setMode("list")
  }

  /* ── Loading / error states ── */
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  )

  if (!data) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <p className="text-slate-500 text-sm">Could not load scoring data.</p>
      <p className="text-slate-400 text-xs">Make sure this group is active and you are assigned to it.</p>
      <Link href="/interview" className="text-sm text-[#1B4F8A] underline mt-2">← Back to dashboard</Link>
    </div>
  )

  const group      = data.group
  // Only show candidates this assessor has at least one pillar to score
  const candidates = data.candidates.filter(c => getApplicablePillars(c).length > 0)
  const confirmedCount = candidates.filter(c => getStatus(c) === "confirmed").length

  /* ── Session-expired prompt (shown over any view; keeps this page intact) ── */
  const sessionModal = sessionExpired ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-slate-800 text-base mb-1">Your session expired</p>
            <p className="text-sm text-slate-500 leading-relaxed mb-4">
              For security, you&apos;re signed out after 8 hours. Sign in again in a new tab,
              then come back here and confirm — everything you typed is still here.
              <span className="block mt-1 font-medium text-slate-600">Don&apos;t refresh or close this page.</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => window.open("/auth/login", "_blank", "noopener")}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1B4F8A] text-white text-sm font-semibold hover:bg-[#163f6f] transition-colors">
                <LogIn className="h-4 w-4" /> Sign in again
              </button>
              <button
                onClick={() => setSessionExpired(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null

  /* ══════════════════════════════════════════════════════════════════════════
     CANDIDATE LIST VIEW
  ══════════════════════════════════════════════════════════════════════════ */
  if (mode === "list") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {sessionModal}
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/interview/groups">
            <button className="text-slate-400 hover:text-slate-600 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-foreground truncate">{group.name}</h2>
              {isLocked && (
                <Badge className="bg-red-50 text-red-600 border-red-200 gap-1 text-xs">
                  <Lock className="h-3 w-3" /> Locked
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{snapshot?.name}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold text-slate-800">{confirmedCount}/{candidates.length}</p>
            <p className="text-xs text-slate-400">confirmed</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: candidates.length > 0 ? `${(confirmedCount / candidates.length) * 100}%` : "0%" }}
          />
        </div>

        {/* Candidate cards */}
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Users className="h-3.5 w-3.5" /> Candidates
          </p>

          {candidates.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">No candidates in this group.</div>
          )}

          {candidates.map(c => {
            const status   = getStatus(c)
            const { scored, total } = getInfo(c)
            const pct = total > 0 ? Math.round((scored / total) * 100) : 0
            const myPillars = getApplicablePillars(c)

            return (
              <div
                key={c.id}
                className={cn(
                  "bg-white rounded-2xl border p-5 flex items-center gap-4 transition-all",
                  status === "confirmed"
                    ? "border-emerald-200 bg-emerald-50/40"
                    : "border-slate-200 hover:border-slate-300 hover:shadow-sm",
                )}
              >
                {/* Avatar */}
                <div className={cn(
                  "w-11 h-11 rounded-full flex items-center justify-center text-base font-bold shrink-0",
                  status === "confirmed" ? "bg-emerald-500 text-white" : "bg-[#1B4F8A]/10 text-[#1B4F8A]",
                )}>
                  {status === "confirmed"
                    ? <CheckCircle2 className="h-5 w-5" />
                    : c.full_name[0]?.toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800 truncate">{c.full_name}</p>
                    {c.role_tracks && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{c.role_tracks.name}</Badge>
                    )}
                    {status === "confirmed" && (
                      <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-1.5 py-0">Confirmed</Badge>
                    )}
                    {status === "in_progress" && (
                      <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] px-1.5 py-0">In Progress</Badge>
                    )}
                    {status === "not_started" && (
                      <Badge className="bg-slate-100 text-slate-500 border-0 text-[10px] px-1.5 py-0">Not Started</Badge>
                    )}
                  </div>
                  {c.position && <p className="text-xs text-slate-400 mt-0.5 truncate">{c.position}</p>}

                  {/* Assigned pillars */}
                  {myPillars.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {myPillars.map(p => (
                        <span key={p.id} className="text-[10px] bg-[#1B4F8A]/8 text-[#1B4F8A] rounded px-1.5 py-0.5 font-medium">
                          {p.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Mini progress */}
                  {status !== "confirmed" && total > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#1B4F8A]/40 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">{scored}/{total} scored</span>
                    </div>
                  )}
                </div>

                {/* CTA */}
                <Button
                  size="sm"
                  disabled={isLocked && status !== "confirmed"}
                  onClick={() => enterScoring(c)}
                  className={cn(
                    "shrink-0 text-xs",
                    status === "confirmed"
                      ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      : status === "in_progress"
                      ? "bg-amber-500 hover:bg-amber-600 text-white"
                      : "bg-[#1B4F8A] hover:bg-[#163f6e] text-white",
                  )}
                >
                  {status === "confirmed" ? "View" : status === "in_progress" ? "Continue" : "Start"}
                </Button>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  /* ══════════════════════════════════════════════════════════════════════════
     SCORING VIEW
  ══════════════════════════════════════════════════════════════════════════ */
  if (!selected) return null

  const candidateScores = getScores(selected.id)
  const applicablePillars = getApplicablePillars(selected)
  const totalComps = applicablePillars.flatMap(p => p.competencies).length
  const scoredComps = applicablePillars.flatMap(p => p.competencies).filter(c => {
    const s = candidateScores.find(sc => sc.competency_id === c.id)
    return s && s.value && s.evidence?.trim()
  }).length
  const allScoredWithEvidence = scoredComps === totalComps && totalComps > 0
  const isConfirmed = getStatus(selected) === "confirmed"

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {sessionModal}
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setMode("list")}
          className="text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Candidates
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-foreground">{selected.full_name}</h2>
            {selected.role_tracks && <Badge variant="secondary">{selected.role_tracks.name}</Badge>}
            {isConfirmed && <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1"><CheckCircle2 className="h-3 w-3" />Confirmed</Badge>}
            {isLocked    && <Badge className="bg-red-50 text-red-600 border-red-200 gap-1"><Lock className="h-3 w-3" />Locked</Badge>}
          </div>
          {selected.position && <p className="text-xs text-muted-foreground mt-0.5">{selected.position}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400">{scoredComps}/{totalComps}</span>
          {!isLocked && (
            <Button
              onClick={confirmAssessment}
              disabled={confirming || !allScoredWithEvidence}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {confirming
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming…</>
                : <><ClipboardCheck className="h-4 w-4" /> Confirm Assessment</>}
            </Button>
          )}
        </div>
      </div>

      {/* Validation hint */}
      {!allScoredWithEvidence && !isConfirmed && totalComps > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>Score and add evidence for all {totalComps} competencies, then fill in the qualitative analysis to confirm.</p>
        </div>
      )}

      {/* Pillars */}
      {applicablePillars.map(pillar => (
        <PillarSection
          key={pillar.id}
          pillar={pillar}
          scores={candidateScores}
          candidateTrackId={selected.track_id}
          disabled={isLocked}
          onSave={saveScore}
        />
      ))}

      {applicablePillars.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-3">
          <p className="text-sm font-semibold text-amber-800">No pillars apply to this candidate&apos;s track.</p>
          <p className="text-xs text-amber-700">
            The snapshot may be stale. Ask an admin to open the group detail page and click <strong>Re-sync Config</strong>.
          </p>
          {/* Diagnostic: shows the actual IDs being compared so mismatches are visible */}
          <div className="bg-white border border-amber-100 rounded-lg p-3 space-y-2 font-mono text-[10px] text-slate-500">
            <p className="font-sans text-[10px] font-bold text-slate-400 uppercase tracking-wider">Diagnostic</p>
            <p><span className="text-slate-400">candidate.track_id: </span>
              <span className="text-slate-700">{selected.track_id ?? "null (no track assigned)"}</span>
            </p>
            {pillars.map(p => (
              <p key={p.id}>
                <span className="text-slate-400">Pillar "{p.name}" applicable_track_ids: </span>
                <span className={cn(
                  Array.isArray(p.applicable_track_ids) && p.applicable_track_ids.length === 0
                    ? "text-emerald-600"
                    : Array.isArray(p.applicable_track_ids) && selected.track_id && p.applicable_track_ids.includes(selected.track_id)
                    ? "text-emerald-600"
                    : "text-red-500"
                )}>
                  {Array.isArray(p.applicable_track_ids) && p.applicable_track_ids.length > 0
                    ? `[${p.applicable_track_ids.join(", ")}]`
                    : "[] (all tracks)"}
                </span>
                {/* Also show pillar_weights for this pillar */}
                {p.id in myPillarWeights && (
                  <span className="text-slate-400"> — weight: <span className={myPillarWeights[p.id] === 0 ? "text-red-500" : "text-slate-600"}>{myPillarWeights[p.id]}</span></span>
                )}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── Qualitative Analysis ── */}
      <div className="border-t border-slate-200 pt-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Qualitative Analysis</h3>
          <p className="text-xs text-slate-500 mt-0.5">All three fields are required to confirm the assessment.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Remarks */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 block">
              Remarks <span className="text-red-500">*</span>
            </label>
            <textarea
              disabled={isLocked}
              rows={5}
              placeholder="Overall observations and remarks about the candidate's performance…"
              value={qualForm.remarks}
              onChange={e => setQualForm(f => ({ ...f, remarks: e.target.value }))}
              onBlur={() => saveQualBlur(qualForm)}
              className={cn(
                "w-full text-sm border rounded-xl px-3 py-2.5 outline-none resize-none transition-colors disabled:opacity-50",
                "border-slate-200 focus:border-[#1B4F8A]",
              )}
            />
          </div>

          {/* Gap Analysis */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 block">
              Gap Analysis <span className="text-red-500">*</span>
            </label>
            <textarea
              disabled={isLocked}
              rows={5}
              placeholder="Key competency gaps identified during the interview…"
              value={qualForm.gap_analysis}
              onChange={e => setQualForm(f => ({ ...f, gap_analysis: e.target.value }))}
              onBlur={() => saveQualBlur(qualForm)}
              className={cn(
                "w-full text-sm border rounded-xl px-3 py-2.5 outline-none resize-none transition-colors disabled:opacity-50",
                "border-slate-200 focus:border-[#1B4F8A]",
              )}
            />
          </div>

          {/* Recommendation */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 block">
              Recommendation <span className="text-red-500">*</span>
            </label>
            <textarea
              disabled={isLocked}
              rows={5}
              placeholder="Recommend (Hire / Hold / Reject) with supporting rationale…"
              value={qualForm.recommendation}
              onChange={e => setQualForm(f => ({ ...f, recommendation: e.target.value }))}
              onBlur={() => saveQualBlur(qualForm)}
              className={cn(
                "w-full text-sm border rounded-xl px-3 py-2.5 outline-none resize-none transition-colors disabled:opacity-50",
                "border-slate-200 focus:border-[#1B4F8A]",
              )}
            />
          </div>
        </div>

        {/* Confirm button (bottom) */}
        {!isLocked && (
          <div className="flex justify-end pt-2">
            <Button
              onClick={confirmAssessment}
              disabled={confirming || !allScoredWithEvidence}
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 px-8"
            >
              {confirming
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming…</>
                : <><ClipboardCheck className="h-5 w-5" /> Confirm Assessment</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
