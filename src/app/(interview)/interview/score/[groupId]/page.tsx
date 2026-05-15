"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Loader2, CheckCircle2, Lock, ChevronDown, ChevronUp, MessageSquare } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type Competency = { id: string; name: string; weight: number; order_index: number }
type Pillar     = { id: string; name: string; weight: number; applicable_track_ids: string[]; competencies: Competency[] }
type Candidate  = { id: string; full_name: string; position: string | null; track_id: string | null; role_tracks: { id: string; name: string } | null }
type Score      = { candidate_id: string; competency_id: string; value: number; notes?: string }

const SCORE_OPTIONS = [
  { value: 1, label: "1", desc: "Poor" },
  { value: 2, label: "2", desc: "Below Standard" },
  { value: 3, label: "3", desc: "Meeting Standard" },
  { value: 4, label: "4", desc: "Exceeding Standard" },
  { value: 5, label: "5", desc: "Exemplary" },
]

const SCORE_COLORS: Record<number, string> = {
  1: "border-red-400 bg-red-400 text-white",
  2: "border-orange-400 bg-orange-400 text-white",
  3: "border-amber-400 bg-amber-400 text-white",
  4: "border-emerald-500 bg-emerald-500 text-white",
  5: "border-blue-600 bg-blue-600 text-white",
}

const SCORE_UNSELECTED = "border-slate-200 bg-white text-slate-600 hover:border-slate-400"

function ScoreButton({ value, selected, disabled, onClick }: {
  value: number; selected: boolean; disabled: boolean; onClick: () => void
}) {
  const opt = SCORE_OPTIONS.find(o => o.value === value)!
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={opt.desc}
      className={cn(
        "flex-1 h-12 rounded-xl border-2 font-bold text-lg transition-all duration-150",
        selected ? SCORE_COLORS[value] : SCORE_UNSELECTED,
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {opt.label}
    </button>
  )
}

function CompetencyRow({ competency, score, disabled, onScore, onNote }: {
  competency: Competency
  score: Score | undefined
  disabled: boolean
  onScore: (compId: string, value: number) => void
  onNote: (compId: string, notes: string) => void
}) {
  const [showNote, setShowNote] = useState(false)
  const [noteText, setNoteText] = useState(score?.notes ?? "")

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">{competency.name}</p>
        <button
          onClick={() => setShowNote(v => !v)}
          className={cn("text-xs flex items-center gap-1 transition-colors", showNote || score?.notes ? "text-[#1B4F8A]" : "text-slate-400 hover:text-slate-600")}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {score?.notes ? "Note" : "Add note"}
        </button>
      </div>

      <div className="flex gap-2">
        {SCORE_OPTIONS.map(opt => (
          <ScoreButton
            key={opt.value}
            value={opt.value}
            selected={score?.value === opt.value}
            disabled={disabled}
            onClick={() => onScore(competency.id, opt.value)}
          />
        ))}
      </div>

      {score?.value && (
        <p className="text-xs text-muted-foreground text-center">{SCORE_OPTIONS.find(o => o.value === score.value)?.desc}</p>
      )}

      {showNote && (
        <textarea
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#1B4F8A] resize-none"
          rows={2}
          placeholder="Add observation or note…"
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          onBlur={() => onNote(competency.id, noteText)}
          disabled={disabled}
        />
      )}
    </div>
  )
}

function PillarSection({ pillar, scores, candidateTrackId, disabled, onScore, onNote }: {
  pillar: Pillar
  scores: Score[]
  candidateTrackId: string | null
  disabled: boolean
  onScore: (compId: string, value: number) => void
  onNote: (compId: string, notes: string) => void
}) {
  const [open, setOpen] = useState(true)

  // Check if this pillar applies to this candidate's track
  const applies = pillar.applicable_track_ids.length === 0 || (candidateTrackId ? pillar.applicable_track_ids.includes(candidateTrackId) : true)
  if (!applies) return null

  const pillarScores = scores.filter(s => pillar.competencies.some(c => c.id === s.competency_id))
  const scored = pillarScores.length
  const total  = pillar.competencies.length
  const complete = scored === total

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-800">{pillar.name}</span>
          <Badge variant="secondary" className={cn("text-xs", complete ? "bg-emerald-100 text-emerald-700" : "")}>
            {scored}/{total}
          </Badge>
          {complete && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {open && (
        <div className="p-4 space-y-5">
          {pillar.competencies.sort((a, b) => a.order_index - b.order_index).map(comp => (
            <CompetencyRow
              key={comp.id}
              competency={comp}
              score={scores.find(s => s.competency_id === comp.id)}
              disabled={disabled}
              onScore={onScore}
              onNote={onNote}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ScoringPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const [data, setData] = useState<{ group: any; candidates: Candidate[]; scores: Score[] } | null>(null)
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/interview/score/${groupId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { toast.error(d.error); return }
        setData(d)
        if (d.candidates?.length > 0) setSelectedCandidate(d.candidates[0])
        setLoading(false)
      })
  }, [groupId])

  const snapshot = data?.group?.config_snapshot
  const pillars: Pillar[] = (snapshot?.pillars ?? [])
  const isLocked = data?.group?.locked

  const candidateScores = useCallback((candidateId: string) =>
    (data?.scores ?? []).filter(s => s.candidate_id === candidateId),
    [data?.scores]
  )

  const completionPct = useCallback((candidateId: string, trackId: string | null) => {
    const applicable = pillars.flatMap(p =>
      (p.applicable_track_ids.length === 0 || (trackId ? p.applicable_track_ids.includes(trackId) : true))
        ? p.competencies : []
    )
    const scored = candidateScores(candidateId).filter(s => applicable.some(c => c.id === s.competency_id))
    return applicable.length === 0 ? 100 : Math.round((scored.length / applicable.length) * 100)
  }, [pillars, candidateScores])

  async function handleScore(compId: string, value: number) {
    if (!selectedCandidate || isLocked) return
    setSaving(compId)

    // Optimistic update
    setData(d => {
      if (!d) return d
      const existing = d.scores.findIndex(s => s.candidate_id === selectedCandidate.id && s.competency_id === compId)
      const updated = [...d.scores]
      if (existing >= 0) updated[existing] = { ...updated[existing], value }
      else updated.push({ candidate_id: selectedCandidate.id, competency_id: compId, value })
      return { ...d, scores: updated }
    })

    const res = await fetch(`/api/interview/score/${groupId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate_id: selectedCandidate.id, competency_id: compId, value }),
    })
    setSaving(null)
    if (!res.ok) toast.error("Failed to save score")
  }

  async function handleNote(compId: string, notes: string) {
    if (!selectedCandidate || isLocked) return
    await fetch(`/api/interview/score/${groupId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate_id: selectedCandidate.id,
        competency_id: compId,
        value: data?.scores.find(s => s.candidate_id === selectedCandidate.id && s.competency_id === compId)?.value ?? 3,
        notes,
      }),
    })
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
  if (!data) return null

  const group = data.group
  const candidates = data.candidates

  return (
    <div className="max-w-4xl mx-auto space-y-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/interview/groups">
          <button className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-foreground truncate">{group.name}</h2>
          <p className="text-xs text-muted-foreground">{snapshot?.name}</p>
        </div>
        {isLocked && (
          <Badge className="bg-red-50 text-red-600 border-red-200 gap-1">
            <Lock className="h-3 w-3" /> Locked
          </Badge>
        )}
        {saving && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div>

      <div className="flex gap-6">
        {/* Candidate list sidebar */}
        <div className="w-56 shrink-0 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Candidates</p>
          {candidates.map(c => {
            const pct = completionPct(c.id, c.track_id)
            const isSelected = selectedCandidate?.id === c.id
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCandidate(c)}
                className={cn(
                  "w-full text-left p-3 rounded-xl border transition-all",
                  isSelected
                    ? "bg-[#1B4F8A] border-[#1B4F8A] text-white shadow-md"
                    : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold truncate">{c.full_name}</span>
                  {pct === 100
                    ? <CheckCircle2 className={cn("h-4 w-4 shrink-0", isSelected ? "text-emerald-300" : "text-emerald-500")} />
                    : <span className={cn("text-[10px] font-bold", isSelected ? "text-white/70" : "text-slate-400")}>{pct}%</span>
                  }
                </div>
                {/* Progress bar */}
                <div className={cn("h-1.5 rounded-full overflow-hidden", isSelected ? "bg-white/20" : "bg-slate-100")}>
                  <div
                    className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-400" : isSelected ? "bg-white/60" : "bg-[#1B4F8A]/40")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {c.role_tracks && (
                  <p className={cn("text-[10px] mt-1.5 truncate", isSelected ? "text-white/70" : "text-slate-400")}>
                    {c.role_tracks.name}
                  </p>
                )}
              </button>
            )
          })}
        </div>

        {/* Scoring area */}
        <div className="flex-1 min-w-0">
          {!selectedCandidate ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Select a candidate to score</div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">{selectedCandidate.full_name}</h3>
                    {selectedCandidate.position && <p className="text-xs text-muted-foreground mt-0.5">{selectedCandidate.position}</p>}
                  </div>
                  {selectedCandidate.role_tracks && (
                    <Badge variant="secondary">{selectedCandidate.role_tracks.name}</Badge>
                  )}
                </div>
              </div>

              {pillars.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No pillars defined in the config snapshot.</p>
              )}

              {pillars.map(pillar => (
                <PillarSection
                  key={pillar.id}
                  pillar={pillar}
                  scores={candidateScores(selectedCandidate.id)}
                  candidateTrackId={selectedCandidate.track_id}
                  disabled={!!isLocked}
                  onScore={handleScore}
                  onNote={handleNote}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
