"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Plus, Trash2, ChevronDown, ChevronUp, ArrowLeft,
  Loader2, Save, Layers, ListChecks, Info, TrendingUp, TrendingDown,
  AlertTriangle, ShieldAlert, Star, Trophy, Target, Zap,
  CheckCircle, XCircle, Flame, Award, BarChart2, Lightbulb,
  ThumbsUp, ThumbsDown,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

type Competency = {
  id: string
  name: string
  description?: string | null
  weight: number
  order_index: number
}
type Pillar = {
  id: string
  name: string
  weight: number
  order_index: number
  applicable_track_ids: string[]
  knockout_threshold: number | null
  competencies: Competency[]
}
type InsightThreshold = { key: string; label: string; min: number; max: number; color?: string; icon?: string }
type VerdictThreshold = { key: string; label: string; min: number; max: number; color?: string; icon?: string }
type Track  = { id: string; name: string }
type Config = {
  id: string; name: string; description: string | null
  assessor_weights: Record<string, Record<string, number>>
  verdict_thresholds: VerdictThreshold[]
  insight_thresholds: InsightThreshold[]
  rater_divergence_threshold: number | null
  pillars: Pillar[]
}

// ── Color palette ─────────────────────────────────────────────────────────────
const COLOR_PALETTE = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
  "#1B4F8A", "#059669", "#dc2626", "#64748b",
]

// ── Icon set ──────────────────────────────────────────────────────────────────
const ICON_SET = [
  { name: "TrendingUp",    Icon: TrendingUp    },
  { name: "TrendingDown",  Icon: TrendingDown  },
  { name: "Star",          Icon: Star          },
  { name: "Trophy",        Icon: Trophy        },
  { name: "Target",        Icon: Target        },
  { name: "Zap",           Icon: Zap           },
  { name: "CheckCircle",   Icon: CheckCircle   },
  { name: "AlertTriangle", Icon: AlertTriangle },
  { name: "ShieldAlert",   Icon: ShieldAlert   },
  { name: "XCircle",       Icon: XCircle       },
  { name: "Flame",         Icon: Flame         },
  { name: "Award",         Icon: Award         },
  { name: "BarChart2",     Icon: BarChart2     },
  { name: "Lightbulb",     Icon: Lightbulb     },
  { name: "ThumbsUp",      Icon: ThumbsUp      },
  { name: "ThumbsDown",    Icon: ThumbsDown    },
]
function getIconComponent(name?: string) {
  return ICON_SET.find(i => i.name === name)?.Icon ?? BarChart2
}

// ── Default color + icon by tier position ─────────────────────────────────────
const TIER_DEFAULTS = [
  { color: "#10b981", icon: "TrendingUp"    },
  { color: "#3b82f6", icon: "CheckCircle"   },
  { color: "#f59e0b", icon: "AlertTriangle" },
  { color: "#ef4444", icon: "XCircle"       },
]
function tierDefault(idx: number) {
  return TIER_DEFAULTS[idx] ?? TIER_DEFAULTS[TIER_DEFAULTS.length - 1]
}

// ── ColorPicker ───────────────────────────────────────────────────────────────
function ColorPicker({ value, onChange }: { value?: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  const effective = value || "#64748b"
  return (
    <div className="relative">
      <button
        onMouseDown={e => { e.preventDefault(); setOpen(o => !o) }}
        className="w-7 h-7 rounded-md border-2 border-white ring-1 ring-slate-200 shadow-sm hover:scale-110 transition-transform"
        style={{ background: effective }}
        title="Choose colour"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-9 left-0 bg-white border border-slate-200 rounded-xl shadow-xl p-2 grid grid-cols-4 gap-1.5">
            {COLOR_PALETTE.map(c => (
              <button
                key={c}
                onClick={() => { onChange(c); setOpen(false) }}
                className={`w-6 h-6 rounded-md border-2 transition-transform hover:scale-110 ${effective === c ? "border-slate-700 scale-110" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── IconPicker ────────────────────────────────────────────────────────────────
function IconPicker({ value, color, onChange }: { value?: string; color?: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const IconComp = getIconComponent(value)
  const hex = color || "#64748b"
  return (
    <div className="relative">
      <button
        onMouseDown={e => { e.preventDefault(); setOpen(o => !o) }}
        className="w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all hover:scale-105"
        style={{ background: hex + "20", borderColor: hex + "60" }}
        title="Choose icon"
      >
        <IconComp className="h-3.5 w-3.5" style={{ color: hex }} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-10 left-0 bg-white border border-slate-200 rounded-xl shadow-xl p-2 grid grid-cols-4 gap-1.5 w-[140px]">
            {ICON_SET.map(({ name, Icon }) => (
              <button
                key={name}
                onClick={() => { onChange(name); setOpen(false) }}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-110 ${value === name ? "bg-slate-100 ring-2 ring-slate-400" : "hover:bg-slate-50"}`}
                title={name}
              >
                <Icon className="h-3.5 w-3.5 text-slate-600" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Insight type definitions (icon + colour per semantic key)
const INSIGHT_TYPES = [
  { key: "top_strength",     Icon: TrendingUp,    colorClass: "text-emerald-600", bgClass: "bg-emerald-50 border-emerald-200" },
  { key: "watch_list",       Icon: AlertTriangle, colorClass: "text-amber-500",   bgClass: "bg-amber-50 border-amber-200"   },
  { key: "development_area", Icon: ShieldAlert,   colorClass: "text-red-500",     bgClass: "bg-red-50 border-red-200"       },
]
function getInsightType(key: string) {
  return INSIGHT_TYPES.find(t => t.key === key) ?? INSIGHT_TYPES[2]
}

/* ── PillarCard ──────────────────────────────────────────────────────────── */
function PillarCard({
  pillar, tracks, totalPillarWeight,
  onUpdate, onDelete, onAddCompetency, onUpdateCompetency, onDeleteCompetency,
  onSaveCompetency, onSavePillarKnockout,
}: {
  pillar: Pillar
  tracks: Track[]
  totalPillarWeight: number
  onUpdate: (id: string, field: string, value: any) => void
  onDelete: (id: string) => void
  onAddCompetency: (pillarId: string, name: string) => Promise<void>
  onUpdateCompetency: (pillarId: string, compId: string, field: string, value: any) => void
  onDeleteCompetency: (pillarId: string, compId: string) => void
  onSaveCompetency: (pillarId: string, compId: string) => void
  onSavePillarKnockout: (id: string, value: number | null) => void
}) {
  const [open, setOpen] = useState(true)
  const [newCompName, setNewCompName] = useState("")
  const [addingComp, setAddingComp] = useState(false)

  const pillarPct       = totalPillarWeight > 0 ? (pillar.weight / totalPillarWeight) * 100 : 0
  const totalCompWeight = pillar.competencies.reduce((s, c) => s + c.weight, 0)

  async function handleAddComp() {
    if (!newCompName.trim()) return
    setAddingComp(true)
    await onAddCompetency(pillar.id, newCompName.trim())
    setNewCompName("")
    setAddingComp(false)
  }

  const toggleTrack = (trackId: string) => {
    const curr = pillar.applicable_track_ids
    const next = curr.includes(trackId) ? curr.filter(t => t !== trackId) : [...curr, trackId]
    onUpdate(pillar.id, "applicable_track_ids", next)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Pillar header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
        <button onClick={() => setOpen(o => !o)} className="text-slate-400 hover:text-slate-600">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <Layers className="h-4 w-4 text-[#1B4F8A] shrink-0" />
        <input
          className="flex-1 text-sm font-semibold bg-transparent border-none outline-none text-slate-800 placeholder:text-slate-400"
          value={pillar.name}
          onChange={e => onUpdate(pillar.id, "name", e.target.value)}
          placeholder="Pillar name…"
        />
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">Weight</span>
              <input
                type="number" min="0.1" step="0.1"
                className="w-16 text-sm text-center border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-[#1B4F8A]"
                value={pillar.weight}
                onChange={e => onUpdate(pillar.id, "weight", parseFloat(e.target.value) || 1)}
              />
            </div>
            <p className="text-[10px] text-[#1B4F8A] font-medium mt-0.5 text-right">
              {pillarPct.toFixed(1)}% of total
            </p>
          </div>
          <button
            onClick={() => onDelete(pillar.id)}
            className="text-slate-300 hover:text-red-500 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open && (
        <div className="p-4 space-y-4">
          {/* Knockout threshold */}
          <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
            <ShieldAlert className="h-4 w-4 text-red-400 shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-red-700">Knockout Threshold</p>
              <p className="text-[10px] text-red-400 mt-0.5">Candidate auto-fails if pillar score is below this. Leave blank to disable.</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="number" min="1" max="5" step="0.1"
                className="w-16 text-sm text-center border border-red-200 rounded-lg px-2 py-1 outline-none focus:border-red-400 bg-white"
                value={pillar.knockout_threshold ?? ""}
                onChange={e => onUpdate(pillar.id, "knockout_threshold", e.target.value === "" ? null : parseFloat(e.target.value))}
                onBlur={() => onSavePillarKnockout(pillar.id, pillar.knockout_threshold)}
                placeholder="Off"
              />
              {pillar.knockout_threshold !== null && (
                <button
                  onClick={() => { onUpdate(pillar.id, "knockout_threshold", null); onSavePillarKnockout(pillar.id, null) }}
                  className="text-red-300 hover:text-red-500"
                  title="Disable knockout"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Track filter */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Applies to tracks <span className="normal-case font-normal">(empty = all)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {tracks.map(t => (
                <button
                  key={t.id}
                  onClick={() => toggleTrack(t.id)}
                  className={`text-xs px-3 py-1 rounded-full border font-medium transition-all ${
                    pillar.applicable_track_ids.includes(t.id)
                      ? "bg-[#1B4F8A] text-white border-[#1B4F8A]"
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* Competencies */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Competencies
            </p>
            <div className="space-y-2">
              {pillar.competencies
                .sort((a, b) => a.order_index - b.order_index)
                .map(comp => {
                  const compPct     = totalCompWeight > 0 ? (comp.weight / totalCompWeight) * 100 : 0
                  const compOverall = (pillarPct * compPct) / 100
                  return (
                    <div key={comp.id} className="group bg-slate-50 rounded-lg p-3 space-y-2 border border-slate-100">
                      {/* Name row */}
                      <div className="flex items-start gap-2">
                        <ListChecks className="h-3.5 w-3.5 text-slate-400 mt-1 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <input
                            className="w-full text-sm font-medium bg-transparent border-none outline-none text-slate-700 placeholder:text-slate-400"
                            value={comp.name}
                            onChange={e => onUpdateCompetency(pillar.id, comp.id, "name", e.target.value)}
                            onBlur={() => onSaveCompetency(pillar.id, comp.id)}
                            placeholder="Competency name…"
                          />
                          <input
                            className="w-full text-xs bg-transparent border-none outline-none text-slate-400 placeholder:text-slate-300 mt-0.5"
                            value={comp.description ?? ""}
                            onChange={e => onUpdateCompetency(pillar.id, comp.id, "description", e.target.value)}
                            onBlur={() => onSaveCompetency(pillar.id, comp.id)}
                            placeholder="Add a description…"
                          />
                        </div>
                        {/* Weight + delete */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-400">W</span>
                              <input
                                type="number" min="0.1" step="0.1"
                                className="w-12 text-xs text-center border border-slate-200 rounded px-1 py-0.5 outline-none focus:border-[#1B4F8A] bg-white"
                                value={comp.weight}
                                onChange={e => onUpdateCompetency(pillar.id, comp.id, "weight", parseFloat(e.target.value) || 1)}
                                onBlur={() => onSaveCompetency(pillar.id, comp.id)}
                              />
                            </div>
                            <p className="text-[9px] text-slate-400 text-right mt-0.5">
                              <span className="font-semibold text-slate-500">{compPct.toFixed(0)}%</span>
                              {" "}of pillar · <span className="font-semibold text-[#1B4F8A]">{compOverall.toFixed(1)}%</span> overall
                            </p>
                          </div>
                          <button
                            onClick={() => onDeleteCompetency(pillar.id, comp.id)}
                            className="text-slate-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>

            {/* Add competency row */}
            <div className="flex gap-2 mt-3">
              <input
                className="flex-1 text-sm border border-dashed border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#1B4F8A] placeholder:text-slate-400"
                placeholder="Add competency…"
                value={newCompName}
                onChange={e => setNewCompName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddComp() } }}
              />
              <Button
                size="sm" variant="outline"
                onClick={handleAddComp}
                disabled={!newCompName.trim() || addingComp}
                className="shrink-0"
              >
                {addingComp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function ConfigEditorPage() {
  const { configId } = useParams<{ configId: string }>()
  const router = useRouter()
  const [config, setConfig] = useState<Config | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newPillarName, setNewPillarName] = useState("")

  useEffect(() => {
    Promise.all([
      fetch(`/api/interview/configs/${configId}`).then(r => r.json()),
      fetch("/api/interview/role-tracks").then(r => r.json()),
    ]).then(([cfg, trks]) => {
      if (cfg.error) { toast.error("Config not found"); router.push("/interview/configs"); return }
      setConfig({
        ...cfg,
        pillars: (cfg.pillars ?? []).sort((a: Pillar, b: Pillar) => a.order_index - b.order_index),
      })
      setTracks(Array.isArray(trks) ? trks : [])
      setLoading(false)
    }).catch(() => {
      toast.error("Failed to load config")
      setLoading(false)
    })
  }, [configId])

  const totalPillarWeight = config?.pillars.reduce((s, p) => s + p.weight, 0) ?? 0

  const saveConfig = useCallback(async () => {
    if (!config) return
    setSaving(true)
    const res = await fetch(`/api/interview/configs/${configId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: config.name, description: config.description }),
    })
    setSaving(false)
    if (!res.ok) { toast.error("Failed to save"); return }
    toast.success("Config saved")
  }, [config, configId])

  async function addPillar() {
    if (!newPillarName.trim()) return
    const res = await fetch(`/api/interview/configs/${configId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_pillar", name: newPillarName.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error); return }
    setConfig(c => c ? { ...c, pillars: [...c.pillars, { ...data, competencies: [] }] } : c)
    setNewPillarName("")
  }

  async function updatePillar(id: string, field: string, value: any) {
    setConfig(c => c ? { ...c, pillars: c.pillars.map(p => p.id === id ? { ...p, [field]: value } : p) } : c)
    if (field === "applicable_track_ids") {
      await fetch(`/api/interview/configs/${configId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_pillar", pillar_id: id, [field]: value }),
      })
    }
  }

  async function savePillar(id: string) {
    const pillar = config?.pillars.find(p => p.id === id)
    if (!pillar) return
    await fetch(`/api/interview/configs/${configId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_pillar", pillar_id: id, name: pillar.name, weight: pillar.weight }),
    })
  }

  async function savePillarKnockout(id: string, value: number | null) {
    await fetch(`/api/interview/configs/${configId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_pillar", pillar_id: id, knockout_threshold: value }),
    })
  }

  async function deletePillar(id: string) {
    if (!confirm("Delete this pillar and all its competencies?")) return
    const res = await fetch(`/api/interview/configs/${configId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_pillar", pillar_id: id }),
    })
    if (!res.ok) { toast.error("Failed to delete pillar"); return }
    setConfig(c => c ? { ...c, pillars: c.pillars.filter(p => p.id !== id) } : c)
  }

  async function handleAddCompetency(pillarId: string, name: string) {
    const res = await fetch(`/api/interview/configs/${configId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_competency", pillar_id: pillarId, name }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error); return }
    setConfig(c => c ? {
      ...c,
      pillars: c.pillars.map(p =>
        p.id === pillarId ? { ...p, competencies: [...p.competencies, data] } : p
      ),
    } : c)
  }

  async function updateCompetency(pillarId: string, compId: string, field: string, value: any) {
    setConfig(c => c ? {
      ...c,
      pillars: c.pillars.map(p =>
        p.id === pillarId
          ? { ...p, competencies: p.competencies.map(comp => comp.id === compId ? { ...comp, [field]: value } : comp) }
          : p
      ),
    } : c)
  }

  async function saveCompetency(pillarId: string, compId: string) {
    const comp = config?.pillars.find(p => p.id === pillarId)?.competencies.find(c => c.id === compId)
    if (!comp) return
    await fetch(`/api/interview/configs/${configId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_competency",
        competency_id: compId,
        name: comp.name,
        weight: comp.weight,
        description: comp.description ?? null,
      }),
    })
  }

  async function deleteCompetency(pillarId: string, compId: string) {
    const res = await fetch(`/api/interview/configs/${configId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_competency", competency_id: compId }),
    })
    if (!res.ok) { toast.error("Failed to delete competency"); return }
    setConfig(c => c ? {
      ...c,
      pillars: c.pillars.map(p =>
        p.id === pillarId
          ? { ...p, competencies: p.competencies.filter(comp => comp.id !== compId) }
          : p
      ),
    } : c)
  }

  // ── Verdict threshold helpers ─────────────────────────────────────────────
  async function saveVerdicts(next: Config["verdict_thresholds"]) {
    await fetch(`/api/interview/configs/${configId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict_thresholds: next }),
    })
  }

  function updateVerdict(i: number, field: string, value: any) {
    if (!config) return
    const next = config.verdict_thresholds.map((t, idx) => idx === i ? { ...t, [field]: value } : t)
    setConfig(c => c ? { ...c, verdict_thresholds: next } : c)
  }

  function addVerdict() {
    if (!config) return
    const def = tierDefault(config.verdict_thresholds.length)
    const next: Config["verdict_thresholds"] = [
      ...config.verdict_thresholds,
      { key: `tier_${Date.now()}`, label: "New Tier", min: 1, max: 1.99, color: def.color, icon: def.icon },
    ]
    setConfig(c => c ? { ...c, verdict_thresholds: next } : c)
    saveVerdicts(next)
  }

  function removeVerdict(i: number) {
    if (!config || config.verdict_thresholds.length <= 1) return
    const next = config.verdict_thresholds.filter((_, idx) => idx !== i)
    setConfig(c => c ? { ...c, verdict_thresholds: next } : c)
    saveVerdicts(next)
  }

  // ── Insight threshold helpers ─────────────────────────────────────────────
  async function saveInsights(next: Config["insight_thresholds"]) {
    await fetch(`/api/interview/configs/${configId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ insight_thresholds: next }),
    })
  }

  function updateInsight(i: number, field: string, value: any) {
    if (!config) return
    const next = (config.insight_thresholds ?? []).map((t, idx) => idx === i ? { ...t, [field]: value } : t)
    setConfig(c => c ? { ...c, insight_thresholds: next } : c)
  }

  function cycleInsightType(i: number) {
    if (!config) return
    const curr = config.insight_thresholds?.[i]
    if (!curr) return
    const currentIdx = INSIGHT_TYPES.findIndex(t => t.key === curr.key)
    const nextIdx    = (currentIdx + 1) % INSIGHT_TYPES.length
    const next = (config.insight_thresholds ?? []).map((t, idx) =>
      idx === i ? { ...t, key: INSIGHT_TYPES[nextIdx].key } : t
    )
    setConfig(c => c ? { ...c, insight_thresholds: next } : c)
    saveInsights(next)
  }

  function addInsight() {
    if (!config) return
    const existing  = config.insight_thresholds ?? []
    const usedKeys  = new Set(existing.map(t => t.key))
    const nextType  = INSIGHT_TYPES.find(t => !usedKeys.has(t.key)) ?? INSIGHT_TYPES[0]
    const def       = tierDefault(existing.length)
    const next: Config["insight_thresholds"] = [
      ...existing,
      { key: nextType.key, label: "New Insight", min: 1, max: 2.5, color: def.color, icon: def.icon },
    ]
    setConfig(c => c ? { ...c, insight_thresholds: next } : c)
    saveInsights(next)
  }

  function removeInsight(i: number) {
    if (!config) return
    const next = (config.insight_thresholds ?? []).filter((_, idx) => idx !== i)
    setConfig(c => c ? { ...c, insight_thresholds: next } : c)
    saveInsights(next)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  )
  if (!config) return null

  const divergenceThreshold = config.rater_divergence_threshold ?? 1.5

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/interview/configs">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <input
            className="text-xl font-bold bg-transparent border-none outline-none text-foreground w-full"
            value={config.name}
            onChange={e => setConfig(c => c ? { ...c, name: e.target.value } : c)}
            onBlur={saveConfig}
          />
          <input
            className="text-sm text-muted-foreground bg-transparent border-none outline-none w-full mt-0.5"
            value={config.description ?? ""}
            onChange={e => setConfig(c => c ? { ...c, description: e.target.value } : c)}
            onBlur={saveConfig}
            placeholder="Add a description…"
          />
        </div>
        <Button
          onClick={saveConfig}
          disabled={saving}
          className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2 shrink-0"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>Changes here affect <strong>draft groups only</strong>. Active groups use their own frozen snapshot.</p>
      </div>

      {/* Pillars */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Pillars &amp; Competencies</h3>
          <Badge variant="secondary">{config.pillars.length} pillar{config.pillars.length !== 1 ? "s" : ""}</Badge>
        </div>

        {config.pillars.map(pillar => (
          <div key={pillar.id} onBlur={() => savePillar(pillar.id)}>
            <PillarCard
              pillar={pillar}
              tracks={tracks}
              totalPillarWeight={totalPillarWeight}
              onUpdate={updatePillar}
              onDelete={deletePillar}
              onAddCompetency={handleAddCompetency}
              onUpdateCompetency={updateCompetency}
              onDeleteCompetency={deleteCompetency}
              onSaveCompetency={saveCompetency}
              onSavePillarKnockout={savePillarKnockout}
            />
          </div>
        ))}

        {/* Add pillar */}
        <div className="flex gap-2">
          <input
            className="flex-1 text-sm border border-dashed border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-[#1B4F8A] placeholder:text-slate-400"
            placeholder="Add a new pillar…"
            value={newPillarName}
            onChange={e => setNewPillarName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addPillar() } }}
          />
          <Button variant="outline" onClick={addPillar} disabled={!newPillarName.trim()} className="gap-2">
            <Plus className="h-4 w-4" /> Add Pillar
          </Button>
        </div>
      </div>

      {/* ── Verdict Thresholds ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Verdict Thresholds</CardTitle>
            <Button size="sm" variant="outline" onClick={addVerdict} className="gap-1.5 h-7 text-xs">
              <Plus className="h-3 w-3" /> Add Tier
            </Button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            Tiers are ranked by <strong>Min score</strong> — highest Min = first outcome (e.g. Ready), next = second outcome, etc.
            Any score below all defined Min values becomes <strong>Development Required</strong>.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Column labels */}
          <div className="grid grid-cols-[28px_32px_1fr_44px_72px_44px_72px_32px] gap-2 px-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Col</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Icon</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Label</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Min</p>
            <div />
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Max</p>
            <div /><div />
          </div>

          {config.verdict_thresholds.map((t, i) => {
            const def   = tierDefault(i)
            const color = t.color || def.color
            const icon  = t.icon  || def.icon
            return (
              <div key={t.key ?? i} className="grid grid-cols-[28px_32px_1fr_44px_72px_44px_72px_32px] gap-2 items-center">
                <ColorPicker
                  value={color}
                  onChange={c => { updateVerdict(i, "color", c); saveVerdicts(config.verdict_thresholds.map((x, idx) => idx === i ? { ...x, color: c } : x)) }}
                />
                <IconPicker
                  value={icon}
                  color={color}
                  onChange={name => { updateVerdict(i, "icon", name); saveVerdicts(config.verdict_thresholds.map((x, idx) => idx === i ? { ...x, icon: name } : x)) }}
                />
                <input
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#1B4F8A] w-full"
                  value={t.label}
                  onChange={e => updateVerdict(i, "label", e.target.value)}
                  onBlur={() => saveVerdicts(config.verdict_thresholds)}
                  placeholder="Tier name…"
                />
                <span className="text-xs text-slate-400 text-center">Min</span>
                <input
                  type="number" step="0.01"
                  className="text-sm text-center border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-[#1B4F8A] w-full"
                  value={t.min}
                  onChange={e => updateVerdict(i, "min", parseFloat(e.target.value))}
                  onBlur={() => saveVerdicts(config.verdict_thresholds)}
                />
                <span className="text-xs text-slate-400 text-center">Max</span>
                <input
                  type="number" step="0.01"
                  className="text-sm text-center border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-[#1B4F8A] w-full"
                  value={t.max}
                  onChange={e => updateVerdict(i, "max", parseFloat(e.target.value))}
                  onBlur={() => saveVerdicts(config.verdict_thresholds)}
                />
                <button
                  onClick={() => removeVerdict(i)}
                  disabled={config.verdict_thresholds.length <= 1}
                  className="flex items-center justify-center text-slate-300 hover:text-red-400 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  title={config.verdict_thresholds.length <= 1 ? "At least one tier required" : "Remove tier"}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* ── Insight Thresholds ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#1B4F8A]" />
              Insight Thresholds
              <span className="text-xs font-normal text-slate-400 ml-1">— per-pillar score flags used in reports</span>
            </CardTitle>
            <Button size="sm" variant="outline" onClick={addInsight} className="gap-1.5 h-7 text-xs">
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Click the icon on each row to cycle through flag types. Edit the label freely.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Column headers */}
          <div className="grid grid-cols-[28px_32px_1fr_44px_72px_44px_72px_32px] gap-2 px-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Col</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Icon</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Insight Label</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Min</p>
            <div />
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Max</p>
            <div /><div />
          </div>

          {(config.insight_thresholds ?? []).map((t, i) => {
            const def   = tierDefault(i)
            const color = t.color || def.color
            const icon  = t.icon  || def.icon
            return (
              <div key={i} className="grid grid-cols-[28px_32px_1fr_44px_72px_44px_72px_32px] gap-2 items-center">
                <ColorPicker
                  value={color}
                  onChange={c => {
                    const next = (config.insight_thresholds ?? []).map((x, idx) => idx === i ? { ...x, color: c } : x)
                    setConfig(cv => cv ? { ...cv, insight_thresholds: next } : cv)
                    saveInsights(next)
                  }}
                />
                <IconPicker
                  value={icon}
                  color={color}
                  onChange={name => {
                    const next = (config.insight_thresholds ?? []).map((x, idx) => idx === i ? { ...x, icon: name } : x)
                    setConfig(cv => cv ? { ...cv, insight_thresholds: next } : cv)
                    saveInsights(next)
                  }}
                />
                {/* Editable label */}
                <input
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#1B4F8A] w-full"
                  value={t.label}
                  onChange={e => updateInsight(i, "label", e.target.value)}
                  onBlur={() => saveInsights(config.insight_thresholds ?? [])}
                  placeholder="Label…"
                />
                <span className="text-xs text-slate-400 text-center">Min</span>
                <input
                  type="number" step="0.01" min="1" max="5"
                  className="text-sm text-center border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-[#1B4F8A] w-full"
                  value={t.min}
                  onChange={e => updateInsight(i, "min", parseFloat(e.target.value))}
                  onBlur={() => saveInsights(config.insight_thresholds ?? [])}
                />
                <span className="text-xs text-slate-400 text-center">Max</span>
                <input
                  type="number" step="0.01" min="1" max="5"
                  className="text-sm text-center border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-[#1B4F8A] w-full"
                  value={t.max}
                  onChange={e => updateInsight(i, "max", parseFloat(e.target.value))}
                  onBlur={() => saveInsights(config.insight_thresholds ?? [])}
                />
                <button
                  onClick={() => removeInsight(i)}
                  className="flex items-center justify-center text-slate-300 hover:text-red-400 transition-colors"
                  title="Remove insight"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}

          {(config.insight_thresholds ?? []).length === 0 && (
            <p className="text-xs text-slate-400 text-center py-3">No insight thresholds defined. Add one above.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Rater Divergence Threshold ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Rater Divergence Flag
            <span className="text-xs font-normal text-slate-400 ml-1">— flags assessor disagreement in reports</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* ── What is this? note ── */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" /> What is this?
            </p>
            <p className="text-sm text-blue-900 leading-relaxed">
              When multiple assessors score the same candidate on the same competency, their scores should
              be reasonably close. If the gap between the <strong>highest</strong> and <strong>lowest</strong> score
              is too large, it means the assessors disagreed significantly — and simply averaging those scores
              could give a misleading result.
            </p>
            <p className="text-sm text-blue-900 leading-relaxed">
              The <strong>Divergence Flag</strong> detects this and marks the competency with a{" "}
              <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                <AlertTriangle className="h-3 w-3" /> ⚠ warning
              </span>{" "}
              in the report — so the panel can have a calibration discussion before finalising the result.
            </p>
            <div className="bg-blue-100 rounded-lg px-3 py-2 mt-1">
              <p className="text-xs text-blue-800 font-medium">
                📌 The flag only looks at the <strong>raw score gap</strong> (max − min).
                Assessor weights have <em>no effect</em> on whether something gets flagged —
                a minority assessor who saw something very different is just as important to flag.
              </p>
            </div>
          </div>

          {/* ── Enable / Disable toggle + threshold input ── */}
          <div className="flex items-center justify-between gap-4 bg-slate-50 rounded-xl border border-slate-100 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700">
                {config.rater_divergence_threshold !== null ? "Flag enabled" : "Flag disabled"}
              </p>
              <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                {config.rater_divergence_threshold !== null
                  ? `A ⚠ warning appears when any two assessors differ by more than ${config.rater_divergence_threshold} pts on the same competency.`
                  : "No divergence warnings will appear in any report."}
              </p>
            </div>

            {/* Toggle */}
            <button
              type="button"
              onClick={async () => {
                const next = config.rater_divergence_threshold !== null ? null : 1.5
                setConfig(c => c ? { ...c, rater_divergence_threshold: next } : c)
                await fetch(`/api/interview/configs/${configId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ rater_divergence_threshold: next }),
                })
                toast.success(next !== null ? "Divergence flag enabled" : "Divergence flag disabled")
              }}
              className={[
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
                "transition-colors duration-200 ease-in-out focus:outline-none",
                config.rater_divergence_threshold !== null
                  ? "bg-[#1B4F8A]"
                  : "bg-slate-200",
              ].join(" ")}
            >
              <span
                className={[
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm",
                  "transition duration-200 ease-in-out",
                  config.rater_divergence_threshold !== null ? "translate-x-5" : "translate-x-0",
                ].join(" ")}
              />
            </button>
          </div>

          {/* ── Threshold input — only shown when enabled ── */}
          {config.rater_divergence_threshold !== null && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-700">Flag threshold</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Flag triggers when <strong>max score − min score &gt; threshold</strong>.
                  Recommended: <strong>1.5</strong> (flags gaps larger than 1.5 pts on a 1–5 scale).
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number" min="0.5" max="4" step="0.1"
                  className="w-20 text-sm text-center border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-[#1B4F8A] font-semibold"
                  value={config.rater_divergence_threshold}
                  onChange={e => {
                    const v = parseFloat(e.target.value)
                    if (!isNaN(v)) setConfig(c => c ? { ...c, rater_divergence_threshold: v } : c)
                  }}
                  onBlur={async () => {
                    await fetch(`/api/interview/configs/${configId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ rater_divergence_threshold: config.rater_divergence_threshold }),
                    })
                    toast.success("Threshold saved")
                  }}
                />
                <span className="text-xs text-slate-400">pts</span>
              </div>
            </div>
          )}

          {/* ── Threshold quick-reference ── only shown when enabled ── */}
          {config.rater_divergence_threshold !== null && (
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { val: "1.0", label: "Strict",    note: "Flags any notable gap",         color: "border-red-200 bg-red-50 text-red-700" },
                { val: "1.5", label: "Balanced ✓", note: "Recommended default",          color: "border-[#1B4F8A] bg-blue-50 text-[#1B4F8A]" },
                { val: "2.0", label: "Relaxed",   note: "Only major disagreements",      color: "border-slate-200 bg-slate-50 text-slate-600" },
                { val: "3.0", label: "Loose",     note: "Almost never triggers",         color: "border-slate-200 bg-slate-50 text-slate-400" },
              ].map(t => (
                <button
                  key={t.val}
                  type="button"
                  onClick={async () => {
                    const v = parseFloat(t.val)
                    setConfig(c => c ? { ...c, rater_divergence_threshold: v } : c)
                    await fetch(`/api/interview/configs/${configId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ rater_divergence_threshold: v }),
                    })
                    toast.success(`Threshold set to ${v}`)
                  }}
                  className={[
                    "rounded-lg border px-2 py-2 text-left transition-all",
                    String(config.rater_divergence_threshold) === t.val
                      ? t.color + " font-bold ring-1 ring-offset-1 ring-current"
                      : "border-slate-100 bg-white text-slate-500 hover:border-slate-300",
                  ].join(" ")}
                >
                  <p className="text-xs font-bold">{t.val} pts</p>
                  <p className="text-[10px] font-semibold">{t.label}</p>
                  <p className="text-[9px] leading-tight mt-0.5 opacity-80">{t.note}</p>
                </button>
              ))}
            </div>
          )}

          {/* ── Interactive example ── */}
          {config.rater_divergence_threshold !== null && (
            <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Live Example — 3 Assessors with weights 20 / 30 / 50%
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Assessor A", weight: "20%", score: 2.0 },
                  { label: "Assessor B", weight: "30%", score: 4.5 },
                  { label: "Assessor C", weight: "50%", score: 3.0 },
                ].map(a => (
                  <div key={a.label} className="bg-white border border-slate-200 rounded-lg p-2.5 text-center">
                    <p className="text-[11px] font-bold text-slate-600">{a.label}</p>
                    <p className="text-[10px] text-slate-400">{a.weight} weight</p>
                    <p className="text-xl font-black text-[#1B4F8A] mt-1">{a.score.toFixed(1)}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Spread</span>
                    <span className="text-xs text-slate-400">= 4.5 − 2.0 =</span>
                    <span className="text-sm font-black text-slate-700">2.5 pts</span>
                  </div>
                  {divergenceThreshold < 2.5 ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-200">
                      <AlertTriangle className="h-3 w-3" /> Flagged
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">
                      ✓ No flag
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-200">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500">Weighted score</span>
                    <span className="text-xs text-slate-400">= (2.0×20%) + (4.5×30%) + (3.0×50%)</span>
                  </div>
                  <span className="text-sm font-black text-[#1B4F8A] shrink-0 ml-2">= 3.25</span>
                </div>
              </div>

              <p className="text-[10px] text-slate-400 leading-relaxed">
                {divergenceThreshold < 2.5
                  ? <>The flag <strong>triggers</strong> because 2.5 &gt; {divergenceThreshold} pts threshold — even though Assessor C (50% weight) gave a moderate 3.0, the raw gap between A and B is what matters.</>
                  : <>The flag <strong>does not trigger</strong> because 2.5 ≤ {divergenceThreshold} pts threshold — raise your threshold if you want this level of disagreement to be flagged.</>
                }
              </p>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  )
}
