"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Sparkles, Plus, Trash2, ChevronDown, GripVertical,
  Loader2, MapPin, Eye, Pencil, RotateCcw, Check, X,
  Puzzle, Zap, BookOpen, ListOrdered, AlertTriangle,
  TextCursorInput, AlignLeft, GitBranch, Layers3,
  WholeWord, BarChart3, Dices, ArrowUpDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// ─── Types ────────────────────────────────────────────────────────
export type ActivityType =
  | "mcq" | "flashcard" | "ordering" | "error_spotter"
  | "gap_fill" | "word_scramble" | "scenario" | "concept_sorter"
  | "acronym" | "drag_match" | "fill_blank" | "rapid_fire"

export interface Activity {
  id?: string
  type: ActivityType
  title: string
  placement_slide: number
  placement_reason?: string
  difficulty: "easy" | "medium" | "hard"
  ai_generated: boolean
  content: Record<string, any>
  order_index?: number
}

interface Props {
  moduleId: string
  courseId: string
  slideCount: number
  hasAnalysis: boolean
}

// ─── Type metadata ─────────────────────────────────────────────────
const TYPE_META: Record<ActivityType, { label: string; icon: React.ElementType; color: string; bg: string; dot: string }> = {
  mcq:           { label: "MCQ",            icon: ListOrdered,    color: "#0C447C", bg: "#E6F1FB", dot: "#4B7EC8" },
  flashcard:     { label: "Flashcard",      icon: BookOpen,       color: "#27500A", bg: "#EAF3DE", dot: "#639922" },
  ordering:      { label: "Ordering",       icon: ArrowUpDown,    color: "#633806", bg: "#FAEEDA", dot: "#BA7517" },
  error_spotter: { label: "Error spotter",  icon: AlertTriangle,  color: "#791F1F", bg: "#FCEBEB", dot: "#E24B4A" },
  gap_fill:      { label: "Gap fill",       icon: TextCursorInput,color: "#26215C", bg: "#EEEDFE", dot: "#7F77DD" },
  word_scramble: { label: "Word scramble",  icon: WholeWord,      color: "#4B1528", bg: "#FBEAF0", dot: "#D4537E" },
  scenario:      { label: "Scenario",       icon: GitBranch,      color: "#04342C", bg: "#E1F5EE", dot: "#1D9E75" },
  concept_sorter:{ label: "Concept sorter", icon: Layers3,        color: "#3B3B00", bg: "#FFFFF0", dot: "#A0A000" },
  acronym:       { label: "Acronym",        icon: Dices,          color: "#2C1A00", bg: "#FFF3E0", dot: "#E65100" },
  drag_match:    { label: "Drag & match",   icon: Puzzle,         color: "#1A0033", bg: "#F3E5F5", dot: "#9C27B0" },
  fill_blank:    { label: "Fill in blank",  icon: AlignLeft,      color: "#002244", bg: "#E3F2FD", dot: "#1565C0" },
  rapid_fire:    { label: "Rapid fire",     icon: Zap,            color: "#4A0000", bg: "#FFEBEE", dot: "#C62828" },
}

const ALL_TYPES = Object.keys(TYPE_META) as ActivityType[]

const DIFFICULTY_STYLE = {
  easy:   { label: "Easy",   bg: "#EAF3DE", color: "#27500A" },
  medium: { label: "Medium", bg: "#FAEEDA", color: "#633806" },
  hard:   { label: "Hard",   bg: "#FCEBEB", color: "#791F1F" },
}

// ─── AI Config Panel ───────────────────────────────────────────────
function AiConfigPanel({
  slideCount, hasAnalysis, onGenerate, onClose,
}: {
  slideCount: number
  hasAnalysis: boolean
  onGenerate: (cfg: { count: number; types: ActivityType[]; difficulty: string; placement: string; language: string }) => void
  onClose: () => void
}) {
  const [count, setCount]         = useState(Math.min(4, Math.max(2, Math.round(slideCount / 10))))
  const [selTypes, setSelTypes]   = useState<Set<ActivityType>>(new Set(["flashcard", "mcq", "ordering", "error_spotter"]))
  const [difficulty, setDifficulty] = useState("medium")
  const [placement, setPlacement] = useState("ai_topic")
  const [language, setLanguage]   = useState("English")

  const AI_RECOMMENDED: ActivityType[] = ["flashcard", "mcq", "ordering", "error_spotter"]

  function toggleType(t: ActivityType) {
    setSelTypes(prev => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#E6F1FB] flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-[#1B4F8A]" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">Generate activities</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {slideCount} slides
                {hasAnalysis ? " · Expert analysis available" : " · No analysis yet"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-5">

          {!hasAnalysis && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">Run Expert Analysis first for best results. AI will use module topics and key concepts to generate more relevant activities.</p>
            </div>
          )}

          {/* Count */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Number of activities</p>
              <span className="text-[10px] bg-[#E6F1FB] text-[#185FA5] px-2 py-0.5 rounded-full font-medium">
                AI suggests {Math.min(4, Math.max(2, Math.round(slideCount / 10)))}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCount(c => Math.max(1, c - 1))}
                className="w-8 h-8 rounded-lg border border-slate-200 hover:border-[#4B7EC8] hover:bg-[#E6F1FB] text-slate-600 hover:text-[#1B4F8A] flex items-center justify-center text-lg transition-colors"
              >−</button>
              <span className="text-2xl font-semibold text-[#1B4F8A] w-8 text-center">{count}</span>
              <button
                onClick={() => setCount(c => Math.min(10, c + 1))}
                className="w-8 h-8 rounded-lg border border-slate-200 hover:border-[#4B7EC8] hover:bg-[#E6F1FB] text-slate-600 hover:text-[#1B4F8A] flex items-center justify-center text-lg transition-colors"
              >+</button>
              <p className="text-xs text-slate-400">Based on {slideCount} slides · max 10</p>
            </div>
          </div>

          {/* Types */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Activity types</p>
              <span className="text-[10px] bg-[#E6F1FB] text-[#185FA5] px-2 py-0.5 rounded-full font-medium">AI pre-selected</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {ALL_TYPES.map(t => {
                const m = TYPE_META[t]
                const Icon = m.icon
                const on = selTypes.has(t)
                const recommended = AI_RECOMMENDED.includes(t)
                return (
                  <button
                    key={t}
                    onClick={() => toggleType(t)}
                    className={cn(
                      "relative flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all",
                      on
                        ? "border-[#1B4F8A] bg-[#E6F1FB]"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    )}
                  >
                    {recommended && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: m.dot }} />
                    )}
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: on ? "#1B4F8A" : "#94a3b8" }} />
                    <span className="text-[11px] font-medium" style={{ color: on ? "#0C447C" : "#64748b" }}>{m.label}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#4B7EC8]"></span>
              Dot = AI recommended for this module
            </p>
          </div>

          {/* Difficulty */}
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Difficulty</p>
            <div className="flex gap-2">
              {(["easy","medium","hard"] as const).map(d => {
                const s = DIFFICULTY_STYLE[d]
                return (
                  <button key={d} onClick={() => setDifficulty(d)}
                    className={cn("flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all capitalize",
                      difficulty === d
                        ? "border-transparent"
                        : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300"
                    )}
                    style={difficulty === d ? { background: s.bg, color: s.color, borderColor: s.color } : {}}
                  >{s.label}</button>
                )
              })}
            </div>
          </div>

          {/* Placement */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Placement</p>
              <span className="text-[10px] bg-[#E6F1FB] text-[#185FA5] px-2 py-0.5 rounded-full font-medium">AI places by topic</span>
            </div>
            <div className="space-y-1.5">
              {[
                { value: "ai_topic", label: "AI places after each topic section" },
                { value: "end",      label: "All activities at end of module" },
                { value: "evenly",   label: "Evenly spaced throughout slides" },
              ].map(opt => (
                <button key={opt.value} onClick={() => setPlacement(opt.value)}
                  className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm text-left transition-all",
                    placement === opt.value
                      ? "border-[#1B4F8A] bg-[#E6F1FB] text-[#0C447C]"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
                  )}
                >
                  <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                    placement === opt.value ? "border-[#1B4F8A] bg-[#1B4F8A]" : "border-slate-300"
                  )}>
                    {placement === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="text-xs">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Language</p>
            <div className="flex gap-2">
              {["English", "العربية", "Both"].map(l => (
                <button key={l} onClick={() => setLanguage(l)}
                  className={cn("flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all",
                    language === l
                      ? "border-[#1B4F8A] bg-[#E6F1FB] text-[#0C447C]"
                      : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300"
                  )}
                >{l}</button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 space-y-1.5">
            {[
              ["Activities to generate", String(count)],
              ["Types selected", `${selTypes.size} of ${ALL_TYPES.length}`],
              ["Difficulty", DIFFICULTY_STYLE[difficulty as keyof typeof DIFFICULTY_STYLE]?.label ?? difficulty],
              ["Language", language],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{k}</span>
                <span className="text-xs font-medium text-slate-700">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={() => {
              if (selTypes.size === 0) { toast.error("Select at least one activity type"); return }
              onGenerate({ count, types: Array.from(selTypes), difficulty, placement, language })
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#1B4F8A] hover:bg-[#0C447C] text-white text-sm font-semibold transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Generate {count} activit{count === 1 ? "y" : "ies"}
          </button>
          <button onClick={onClose} className="w-full mt-2 py-2 text-xs text-slate-400 hover:text-slate-600 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─── Activity Card ─────────────────────────────────────────────────
function ActivityCard({
  activity, index, total, slideCount,
  onMoveUp, onMoveDown, onDelete, onChangePlacement,
}: {
  activity: Activity
  index: number
  total: number
  slideCount: number
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  onChangePlacement: (slide: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editingSlide, setEditingSlide] = useState(false)
  const [slideInput, setSlideInput] = useState(String(activity.placement_slide))

  const meta = TYPE_META[activity.type] ?? TYPE_META.mcq
  const Icon = meta.icon
  const diff = DIFFICULTY_STYLE[activity.difficulty] ?? DIFFICULTY_STYLE.medium

  function previewContent() {
    const c = activity.content
    if (activity.type === "flashcard") return `${c.cards?.length ?? 0} cards`
    if (activity.type === "mcq") return c.question ? c.question.slice(0, 80) + (c.question.length > 80 ? "…" : "") : "—"
    if (activity.type === "ordering") return `${c.items?.length ?? 0} steps to sequence`
    if (activity.type === "error_spotter") return `${c.errors?.length ?? 0} errors to find`
    if (activity.type === "word_scramble") return c.word ? `Unscramble: ${c.word}` : "—"
    if (activity.type === "scenario") return c.situation ? c.situation.slice(0, 80) + "…" : "—"
    if (activity.type === "concept_sorter") return `${c.categories?.length ?? 0} categories, ${c.items?.length ?? 0} items`
    if (activity.type === "acronym") return c.acronym ?? "—"
    if (activity.type === "drag_match") return `${c.pairs?.length ?? 0} pairs to match`
    if (activity.type === "rapid_fire") return `${c.questions?.length ?? 0} questions, ${c.time_per_question_s ?? 10}s each`
    return c.question ?? c.sentence ?? "—"
  }

  return (
    <div className={cn(
      "bg-white rounded-xl border transition-all",
      expanded ? "border-slate-300 shadow-sm" : "border-slate-200 hover:border-slate-300"
    )}>
      {/* Top row */}
      <div
        className="flex items-center gap-2.5 px-3.5 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <GripVertical className="h-4 w-4 text-slate-300 shrink-0" />

        {/* Type badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg shrink-0"
          style={{ background: meta.bg }}>
          <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
          <span className="text-[11px] font-semibold" style={{ color: meta.color }}>{meta.label}</span>
        </div>

        {/* Preview */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{activity.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <MapPin className="h-3 w-3" />After slide {activity.placement_slide}
            </span>
            <span className="text-slate-200">·</span>
            <span className="text-[11px] text-slate-400">{previewContent()}</span>
            {activity.ai_generated && (
              <>
                <span className="text-slate-200">·</span>
                <span className="text-[11px] text-[#4B7EC8] flex items-center gap-0.5">
                  <Sparkles className="h-2.5 w-2.5" /> AI
                </span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium mr-1" style={{ background: diff.bg, color: diff.color }}>
            {diff.label}
          </span>
          <button onClick={onMoveUp} disabled={index === 0}
            className="w-7 h-7 rounded-lg border border-slate-200 hover:border-slate-300 flex items-center justify-center text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <ChevronDown className="h-3.5 w-3.5 rotate-180" />
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1}
            className="w-7 h-7 rounded-lg border border-slate-200 hover:border-slate-300 flex items-center justify-center text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete}
            className="w-7 h-7 rounded-lg border border-slate-200 hover:border-red-200 hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <ChevronDown className={cn("h-4 w-4 text-slate-300 shrink-0 transition-transform", expanded && "rotate-180")} />
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-slate-100 px-3.5 py-3 bg-slate-50 rounded-b-xl">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
              <p className="text-[10px] text-slate-400 mb-0.5">Type</p>
              <p className="text-xs font-medium text-slate-700">{meta.label}</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
              <p className="text-[10px] text-slate-400 mb-0.5">Placement</p>
              {editingSlide ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" min={1} max={slideCount}
                    value={slideInput}
                    onChange={e => setSlideInput(e.target.value)}
                    className="w-14 text-xs border border-slate-200 rounded px-1 py-0.5"
                    autoFocus
                  />
                  <button onClick={() => {
                    const n = parseInt(slideInput)
                    if (!isNaN(n) && n >= 1 && n <= slideCount) onChangePlacement(n)
                    setEditingSlide(false)
                  }} className="text-[#1B4F8A]"><Check className="h-3.5 w-3.5" /></button>
                  <button onClick={() => { setSlideInput(String(activity.placement_slide)); setEditingSlide(false) }} className="text-slate-400"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <button onClick={() => setEditingSlide(true)} className="text-xs font-medium text-slate-700 hover:text-[#1B4F8A] flex items-center gap-1 transition-colors">
                  After slide {activity.placement_slide} <Pencil className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
            {activity.placement_reason && (
              <div className="col-span-2 bg-white rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-[10px] text-slate-400 mb-0.5">Placement rationale</p>
                <p className="text-xs text-slate-600">{activity.placement_reason}</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B4F8A] hover:bg-[#0C447C] text-white text-xs font-medium transition-colors">
              <Pencil className="h-3 w-3" /> Edit content
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-600 text-xs transition-colors">
              <Eye className="h-3 w-3" /> Preview
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Timeline ──────────────────────────────────────────────────────
function Timeline({ activities, slideCount }: { activities: Activity[]; slideCount: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Module timeline — {slideCount} slides
        </p>
        <p className="text-[10px] text-slate-400">{activities.length} activit{activities.length !== 1 ? "ies" : "y"} placed</p>
      </div>
      {/* Track */}
      <div className="relative h-1.5 bg-slate-100 rounded-full mb-1">
        <div className="h-full w-full rounded-full bg-[#4B7EC8] opacity-20" />
      </div>
      {/* Pins */}
      <div className="relative h-7">
        {activities.map((act, i) => {
          const meta = TYPE_META[act.type] ?? TYPE_META.mcq
          const pct = slideCount > 1 ? ((act.placement_slide - 1) / (slideCount - 1)) * 100 : 0
          return (
            <div key={i} className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: `${pct}%` }}>
              <div className="w-2.5 h-2.5 rounded-full border-2 border-white mb-0.5" style={{ background: meta.dot }} />
              <span className="text-[9px] font-semibold px-1 rounded-sm text-white" style={{ background: meta.dot }}>
                {act.placement_slide}
              </span>
            </div>
          )
        })}
      </div>
      {/* Labels */}
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-slate-300">1</span>
        <span className="text-[10px] text-slate-300">{slideCount}</span>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────
export default function ActivitySection({ moduleId, courseId, slideCount, hasAnalysis }: Props) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [dirty, setDirty]           = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showConfig, setShowConfig] = useState(false)

  // Load
  useEffect(() => {
    setLoading(true)
    fetch(`/api/lms/activities?module_id=${moduleId}`)
      .then(r => r.ok ? r.json() : { activities: [] })
      .then(d => { setActivities(d.activities ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [moduleId])

  // Save
  const save = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/lms/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module_id: moduleId, course_id: courseId, activities }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setActivities(data.activities ?? activities)
      setDirty(false)
      toast.success("Activities saved")
    } catch (e: any) {
      toast.error(e.message ?? "Save failed")
    }
    setSaving(false)
  }, [activities, moduleId, courseId])

  // Generate
  async function generate(cfg: { count: number; types: ActivityType[]; difficulty: string; placement: string; language: string }) {
    setShowConfig(false)
    setGenerating(true)
    try {
      const res = await fetch("/api/lms/activities/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module_id: moduleId, ...cfg }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Generation failed")
      const generated: Activity[] = (data.activities ?? []).map((a: any) => ({ ...a, id: undefined }))
      setActivities(generated)
      setDirty(true)
      toast.success(`Generated ${generated.length} activit${generated.length !== 1 ? "ies" : "y"} — review and save`)
    } catch (e: any) {
      toast.error(e.message ?? "Generation failed")
    }
    setGenerating(false)
  }

  function moveActivity(idx: number, dir: -1 | 1) {
    const ni = idx + dir
    if (ni < 0 || ni >= activities.length) return
    const next = [...activities]
    ;[next[idx], next[ni]] = [next[ni], next[idx]]
    setActivities(next)
    setDirty(true)
  }

  function deleteActivity(idx: number) {
    setActivities(prev => prev.filter((_, i) => i !== idx))
    setDirty(true)
  }

  function changePlacement(idx: number, slide: number) {
    setActivities(prev => prev.map((a, i) => i === idx ? { ...a, placement_slide: slide } : a))
    setDirty(true)
  }

  function addBlank(type: ActivityType) {
    const newAct: Activity = {
      type, title: `New ${TYPE_META[type].label}`,
      placement_slide: activities.length > 0
        ? Math.min(slideCount, activities[activities.length - 1].placement_slide + 5)
        : Math.round(slideCount / 2),
      difficulty: "medium", ai_generated: false, content: {},
    }
    setActivities(prev => [...prev, newAct])
    setDirty(true)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <p className="text-sm font-semibold text-slate-700">Activities</p>
          <span className="text-[11px] bg-[#E6F1FB] text-[#185FA5] px-2 py-0.5 rounded-full font-medium">
            {activities.length} activit{activities.length !== 1 ? "ies" : "y"}
          </span>
          {dirty && (
            <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">
              Unsaved changes
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 text-slate-600 text-xs font-medium transition-colors">
              <Plus className="h-3.5 w-3.5" /> Add manually
            </button>
            {/* Dropdown */}
            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-20 hidden group-hover:block">
              {ALL_TYPES.map(t => {
                const m = TYPE_META[t]
                const Icon = m.icon
                return (
                  <button key={t} onClick={() => addBlank(t)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 text-xs text-slate-700 transition-colors">
                    <Icon className="h-3.5 w-3.5" style={{ color: m.dot }} />
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>
          <button
            onClick={() => setShowConfig(true)}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B4F8A] hover:bg-[#0C447C] text-white text-xs font-semibold transition-colors disabled:opacity-60"
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {generating ? "Generating…" : "Generate with AI"}
          </button>
          {dirty && (
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-60">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {/* Timeline */}
        {activities.length > 0 && (
          <Timeline activities={activities} slideCount={slideCount} />
        )}

        {/* Activity cards */}
        {activities.length > 0 ? (
          <div className="space-y-2.5">
            {activities.map((act, i) => (
              <ActivityCard
                key={act.id ?? i}
                activity={act}
                index={i}
                total={activities.length}
                slideCount={slideCount}
                onMoveUp={() => moveActivity(i, -1)}
                onMoveDown={() => moveActivity(i, 1)}
                onDelete={() => deleteActivity(i)}
                onChangePlacement={slide => changePlacement(i, slide)}
              />
            ))}
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Puzzle className="h-7 w-7 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-600 mb-1">No activities yet</p>
            <p className="text-xs text-slate-400 mb-5 max-w-xs">
              Generate with AI to auto-create interactive activities from the module content, or add them manually.
            </p>
            <div className="flex gap-2">
              <button onClick={() => addBlank("mcq")}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-600 text-xs font-medium transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add manually
              </button>
              <button onClick={() => setShowConfig(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1B4F8A] hover:bg-[#0C447C] text-white text-xs font-semibold transition-colors">
                <Sparkles className="h-3.5 w-3.5" /> Generate with AI
              </button>
            </div>
          </div>
        )}

        {/* Quick-add row */}
        {activities.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="text-[11px] text-slate-400 self-center">Add:</span>
            {ALL_TYPES.slice(0, 6).map(t => {
              const m = TYPE_META[t]
              return (
                <button key={t} onClick={() => addBlank(t)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed border-slate-200 hover:border-[#4B7EC8] hover:bg-[#E6F1FB] text-[11px] text-slate-400 hover:text-[#185FA5] transition-all">
                  <Plus className="h-2.5 w-2.5" />{m.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* AI Config Panel */}
      {showConfig && (
        <AiConfigPanel
          slideCount={slideCount}
          hasAnalysis={hasAnalysis}
          onGenerate={generate}
          onClose={() => setShowConfig(false)}
        />
      )}
    </div>
  )
}
