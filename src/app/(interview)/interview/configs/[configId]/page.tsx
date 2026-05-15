"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Plus, Trash2, ChevronDown, ChevronUp, ArrowLeft,
  Loader2, Save, Layers, ListChecks, Info
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

type Competency = { id: string; name: string; weight: number; order_index: number }
type Pillar     = { id: string; name: string; weight: number; order_index: number; applicable_track_ids: string[]; competencies: Competency[] }
type Track      = { id: string; name: string }
type Config     = {
  id: string; name: string; description: string | null
  assessor_weights: Record<string, Record<string, number>>
  verdict_thresholds: { key: string; label: string; min: number; max: number }[]
  pillars: Pillar[]
}

function PillarCard({
  pillar, tracks, onUpdate, onDelete, onAddCompetency, onUpdateCompetency, onDeleteCompetency,
}: {
  pillar: Pillar
  tracks: Track[]
  onUpdate: (id: string, field: string, value: any) => void
  onDelete: (id: string) => void
  onAddCompetency: (pillarId: string) => void
  onUpdateCompetency: (pillarId: string, compId: string, field: string, value: any) => void
  onDeleteCompetency: (pillarId: string, compId: string) => void
}) {
  const [open, setOpen] = useState(true)
  const [newCompName, setNewCompName] = useState("")
  const [addingComp, setAddingComp] = useState(false)

  async function handleAddComp() {
    if (!newCompName.trim()) return
    setAddingComp(true)
    await onAddCompetency(pillar.id)
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
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400">Weight</span>
          <input
            type="number" min="0.1" step="0.1"
            className="w-16 text-sm text-center border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-[#1B4F8A]"
            value={pillar.weight}
            onChange={e => onUpdate(pillar.id, "weight", parseFloat(e.target.value) || 1)}
          />
          <button
            onClick={() => onDelete(pillar.id)}
            className="text-slate-300 hover:text-red-500 transition-colors ml-1"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open && (
        <div className="p-4 space-y-4">
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
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Competencies</p>
            <div className="space-y-2">
              {pillar.competencies.sort((a, b) => a.order_index - b.order_index).map(comp => (
                <div key={comp.id} className="flex items-center gap-2 group">
                  <ListChecks className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                  <input
                    className="flex-1 text-sm bg-transparent border-none outline-none text-slate-700 placeholder:text-slate-400"
                    value={comp.name}
                    onChange={e => onUpdateCompetency(pillar.id, comp.id, "name", e.target.value)}
                    placeholder="Competency name…"
                  />
                  <span className="text-xs text-slate-400 shrink-0">W</span>
                  <input
                    type="number" min="0.1" step="0.1"
                    className="w-14 text-xs text-center border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-[#1B4F8A]"
                    value={comp.weight}
                    onChange={e => onUpdateCompetency(pillar.id, comp.id, "weight", parseFloat(e.target.value) || 1)}
                  />
                  <button
                    onClick={() => onDeleteCompetency(pillar.id, comp.id)}
                    className="text-slate-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add competency */}
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
      setConfig({ ...cfg, pillars: (cfg.pillars ?? []).sort((a: Pillar, b: Pillar) => a.order_index - b.order_index) })
      setTracks(Array.isArray(trks) ? trks : [])
      setLoading(false)
    })
  }, [configId])

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
    // Debounced save handled via blur — immediate API call for track_ids
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

  async function addCompetency(pillarId: string) {
    const name = (document.querySelector(`[data-new-comp="${pillarId}"]`) as HTMLInputElement)?.value?.trim()
    // Name passed from child via state — handled inside PillarCard, we just need an API call approach
    // We'll use a re-fetch after add
    return pillarId
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
      pillars: c.pillars.map(p => p.id === pillarId ? { ...p, competencies: [...p.competencies, data] } : p)
    } : c)
  }

  async function updateCompetency(pillarId: string, compId: string, field: string, value: any) {
    setConfig(c => c ? {
      ...c,
      pillars: c.pillars.map(p => p.id === pillarId
        ? { ...p, competencies: p.competencies.map(comp => comp.id === compId ? { ...comp, [field]: value } : comp) }
        : p)
    } : c)
  }

  async function saveCompetency(pillarId: string, compId: string) {
    const comp = config?.pillars.find(p => p.id === pillarId)?.competencies.find(c => c.id === compId)
    if (!comp) return
    await fetch(`/api/interview/configs/${configId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_competency", competency_id: compId, name: comp.name, weight: comp.weight }),
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
      pillars: c.pillars.map(p => p.id === pillarId
        ? { ...p, competencies: p.competencies.filter(comp => comp.id !== compId) }
        : p)
    } : c)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
  if (!config) return null

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

      {/* Info */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>Changes here affect <strong>draft groups only</strong>. Active groups use their own frozen snapshot.</p>
      </div>

      {/* Pillars */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Pillars & Competencies</h3>
          <Badge variant="secondary">{config.pillars.length} pillar{config.pillars.length !== 1 ? "s" : ""}</Badge>
        </div>

        {config.pillars.map(pillar => (
          <div
            key={pillar.id}
            onBlur={() => { savePillar(pillar.id) }}
          >
            <PillarCard
              pillar={pillar}
              tracks={tracks}
              onUpdate={updatePillar}
              onDelete={deletePillar}
              onAddCompetency={(pid) => {
                // trigger via PillarCard internal state — handled in handleAddCompetency
                return Promise.resolve(pid)
              }}
              onUpdateCompetency={(pid, cid, field, value) => {
                updateCompetency(pid, cid, field, value)
              }}
              onDeleteCompetency={deleteCompetency}
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

      {/* Verdict thresholds */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Verdict Thresholds</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {config.verdict_thresholds.map((t, i) => (
            <div key={t.key} className="flex items-center gap-3">
              <input
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#1B4F8A]"
                value={t.label}
                onChange={e => {
                  const next = [...config.verdict_thresholds]
                  next[i] = { ...t, label: e.target.value }
                  setConfig(c => c ? { ...c, verdict_thresholds: next } : c)
                }}
                onBlur={async () => {
                  await fetch(`/api/interview/configs/${configId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ verdict_thresholds: config.verdict_thresholds }),
                  })
                }}
              />
              <span className="text-xs text-slate-400">Min</span>
              <input
                type="number" step="0.01"
                className="w-20 text-sm text-center border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-[#1B4F8A]"
                value={t.min}
                onChange={e => {
                  const next = [...config.verdict_thresholds]
                  next[i] = { ...t, min: parseFloat(e.target.value) }
                  setConfig(c => c ? { ...c, verdict_thresholds: next } : c)
                }}
                onBlur={async () => {
                  await fetch(`/api/interview/configs/${configId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ verdict_thresholds: config.verdict_thresholds }),
                  })
                }}
              />
              <span className="text-xs text-slate-400">Max</span>
              <input
                type="number" step="0.01"
                className="w-20 text-sm text-center border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-[#1B4F8A]"
                value={t.max}
                onChange={e => {
                  const next = [...config.verdict_thresholds]
                  next[i] = { ...t, max: parseFloat(e.target.value) }
                  setConfig(c => c ? { ...c, verdict_thresholds: next } : c)
                }}
                onBlur={async () => {
                  await fetch(`/api/interview/configs/${configId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ verdict_thresholds: config.verdict_thresholds }),
                  })
                }}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
