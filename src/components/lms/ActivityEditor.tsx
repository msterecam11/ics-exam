"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  GripVertical, Plus, Trash2, ChevronDown,
  Clock, Award, RefreshCw, Upload, Settings2,
  Loader2, CheckCircle2, X, AlertCircle, Check,
  Database, Search, ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// ── Helpers ──────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

// ── Types ─────────────────────────────────────────────────────────
export type QType = "mcq_single" | "mcq_multiple" | "ordering" | "match_pair" | "open_ended"

export interface MCQOption { id: string; text: string; correct: boolean }
export interface OrderItem { id: string; text: string }
export interface MatchPair { id: string; left: string; right: string }

export interface Question {
  id:           string
  type:         QType
  text:         string
  points:       number
  explanation?: string
  // MCQ
  options?:     MCQOption[]
  // Ordering
  items?:       OrderItem[]
  // Match pair
  pairs?:       MatchPair[]
  // Open ended
  rubric?:      string
  max_words?:   number
}

export interface ActivitySettings {
  pass_mark:            number
  time_limit_minutes:   number | null
  max_attempts:         number
  shuffle_questions:    boolean
  shuffle_options:      boolean
  show_results:         boolean
  show_correct_answers: boolean
}

const DEFAULT_SETTINGS: ActivitySettings = {
  pass_mark:            70,
  time_limit_minutes:   null,
  max_attempts:         3,
  shuffle_questions:    true,
  shuffle_options:      true,
  show_results:         true,
  show_correct_answers: false,
}

const Q_TYPE_META: Record<QType, { label: string; icon: string; color: string; desc: string }> = {
  mcq_single:   { label: "MCQ Single",     icon: "◉", color: "bg-blue-100 text-blue-700",    desc: "One correct answer" },
  mcq_multiple: { label: "MCQ Multiple",   icon: "☑", color: "bg-violet-100 text-violet-700", desc: "Multiple correct answers" },
  ordering:     { label: "Ordering",       icon: "↕", color: "bg-amber-100 text-amber-700",   desc: "Arrange items in correct order" },
  match_pair:   { label: "Match the Pair", icon: "⇄", color: "bg-teal-100 text-teal-700",     desc: "Connect matching items" },
  open_ended:   { label: "Open Ended",     icon: "✍", color: "bg-rose-100 text-rose-700",     desc: "Written response, AI-graded" },
}

const MODULE_TYPE_META: Record<string, { label: string; icon: string }> = {
  quiz:          { label: "Quiz",          icon: "💬" },
  progress_test: { label: "Progress Test", icon: "📈" },
  test:          { label: "Test",          icon: "📝" },
  final_exam:    { label: "Final Exam",    icon: "🎯" },
}

// ── Default question creators ─────────────────────────────────────
function createQuestion(type: QType): Question {
  const base = { id: uid(), type, text: "", points: 1 }
  switch (type) {
    case "mcq_single":
    case "mcq_multiple":
      return {
        ...base,
        options: [
          { id: uid(), text: "", correct: false },
          { id: uid(), text: "", correct: false },
          { id: uid(), text: "", correct: false },
          { id: uid(), text: "", correct: false },
        ],
      }
    case "ordering":
      return {
        ...base,
        items: [
          { id: uid(), text: "" },
          { id: uid(), text: "" },
          { id: uid(), text: "" },
        ],
      }
    case "match_pair":
      return {
        ...base,
        pairs: [
          { id: uid(), left: "", right: "" },
          { id: uid(), left: "", right: "" },
          { id: uid(), left: "", right: "" },
        ],
      }
    case "open_ended":
      return { ...base, points: 5, rubric: "", max_words: 500 }
  }
}

// ─────────────────────────────────────────────────────────────────
// SETTINGS PANEL
// ─────────────────────────────────────────────────────────────────

function Toggle({
  value, onChange, label, desc,
}: { value: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer group py-0.5">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          "w-11 h-6 rounded-full transition-colors relative shrink-0",
          value ? "bg-[#1B4F8A]" : "bg-slate-200"
        )}
      >
        <span className={cn(
          "w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all",
          value ? "left-5" : "left-0.5"
        )} />
      </button>
    </label>
  )
}

function SettingsPanel({
  settings, onChange,
}: { settings: ActivitySettings; onChange: (s: ActivitySettings) => void }) {
  const [open, setOpen] = useState(false)
  const set = (patch: Partial<ActivitySettings>) => onChange({ ...settings, ...patch })

  const summary = [
    `Pass ${settings.pass_mark}%`,
    settings.time_limit_minutes ? `${settings.time_limit_minutes} min` : "No time limit",
    `${settings.max_attempts} attempt${settings.max_attempts !== 1 ? "s" : ""}`,
  ].join(" · ")

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Settings2 className="h-4 w-4 text-[#1B4F8A] shrink-0" />
          <span className="text-sm font-semibold text-slate-800 shrink-0">Assessment Settings</span>
          <span className="text-xs text-slate-400 truncate">{summary}</span>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform shrink-0 ml-3", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-5 grid grid-cols-1 sm:grid-cols-2 gap-5">

          {/* Pass mark */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Award className="h-3 w-3" /> Pass Mark
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range" min="0" max="100" step="5"
                value={settings.pass_mark}
                onChange={e => set({ pass_mark: Number(e.target.value) })}
                className="flex-1 accent-[#1B4F8A]"
              />
              <span className="text-sm font-bold text-[#1B4F8A] w-10 text-right">{settings.pass_mark}%</span>
            </div>
          </div>

          {/* Time limit */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> Time Limit
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" placeholder="No limit"
                value={settings.time_limit_minutes ?? ""}
                onChange={e => set({ time_limit_minutes: e.target.value ? Number(e.target.value) : null })}
                className="w-24 px-3 h-9 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
              />
              <span className="text-sm text-slate-500">minutes</span>
            </div>
          </div>

          {/* Max attempts */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3" /> Max Attempts
            </label>
            <input
              type="number" min="1" max="99"
              value={settings.max_attempts ?? 1}
              onChange={e => set({ max_attempts: Math.max(1, Number(e.target.value)) })}
              className="w-24 px-3 h-9 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
            />
          </div>

          {/* Toggles */}
          <div className="sm:col-span-2 space-y-3 pt-3 border-t border-slate-100">
            <Toggle value={settings.shuffle_questions} onChange={v => set({ shuffle_questions: v })}
              label="Shuffle Questions" desc="Randomise order for each attempt" />
            <Toggle value={settings.shuffle_options} onChange={v => set({ shuffle_options: v })}
              label="Shuffle Options" desc="Randomise MCQ option order" />
            <Toggle value={settings.show_results} onChange={v => set({ show_results: v })}
              label="Show Results" desc="Students see their score after submitting" />
            <Toggle value={settings.show_correct_answers} onChange={v => set({ show_correct_answers: v })}
              label="Show Correct Answers" desc="Students see answers in the review screen" />
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// QUESTION TYPE EDITORS
// ─────────────────────────────────────────────────────────────────

function MCQEditor({ q, onChange }: { q: Question; onChange: (q: Question) => void }) {
  const opts    = q.options ?? []
  const isMulti = q.type === "mcq_multiple"

  function setOptText(id: string, text: string) {
    onChange({ ...q, options: opts.map(o => o.id === id ? { ...o, text } : o) })
  }
  function toggleCorrect(id: string) {
    if (isMulti) {
      onChange({ ...q, options: opts.map(o => o.id === id ? { ...o, correct: !o.correct } : o) })
    } else {
      onChange({ ...q, options: opts.map(o => ({ ...o, correct: o.id === id })) })
    }
  }
  function addOption() {
    onChange({ ...q, options: [...opts, { id: uid(), text: "", correct: false }] })
  }
  function delOption(id: string) {
    if (opts.length <= 2) { toast.error("Minimum 2 options"); return }
    onChange({ ...q, options: opts.filter(o => o.id !== id) })
  }

  return (
    <div className="space-y-2 mt-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        Options — {isMulti ? "check all correct answers" : "select the one correct answer"}
      </p>
      {opts.map((opt, i) => (
        <div key={opt.id} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleCorrect(opt.id)}
            title="Toggle correct"
            className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all shrink-0",
              opt.correct
                ? "bg-emerald-500 border-emerald-500 text-white"
                : "border-slate-300 text-transparent hover:border-emerald-300"
            )}
          >
            <Check className="h-3 w-3" />
          </button>
          <span className="text-xs text-slate-400 w-5 text-center shrink-0 font-mono">
            {String.fromCharCode(65 + i)}
          </span>
          <input
            type="text"
            value={opt.text}
            onChange={e => setOptText(opt.id, e.target.value)}
            placeholder={`Option ${String.fromCharCode(65 + i)}`}
            className="flex-1 px-3 h-9 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 focus:bg-white transition-all"
          />
          <button
            type="button"
            onClick={() => delOption(opt.id)}
            className="p-1.5 text-slate-300 hover:text-red-400 transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {opts.length < 8 && (
        <button
          type="button"
          onClick={addOption}
          className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1 mt-1"
        >
          <Plus className="h-3 w-3" /> Add option
        </button>
      )}
    </div>
  )
}

function OrderingEditor({ q, onChange }: { q: Question; onChange: (q: Question) => void }) {
  const items = q.items ?? []

  function setItemText(id: string, text: string) {
    onChange({ ...q, items: items.map(it => it.id === id ? { ...it, text } : it) })
  }
  function addItem() {
    onChange({ ...q, items: [...items, { id: uid(), text: "" }] })
  }
  function delItem(id: string) {
    if (items.length <= 2) { toast.error("Minimum 2 items"); return }
    onChange({ ...q, items: items.filter(it => it.id !== id) })
  }

  return (
    <div className="space-y-2 mt-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        Items — enter in the CORRECT order (students see them shuffled)
      </p>
      {items.map((it, i) => (
        <div key={it.id} className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] text-xs font-bold flex items-center justify-center shrink-0">
            {i + 1}
          </span>
          <input
            type="text"
            value={it.text}
            onChange={e => setItemText(it.id, e.target.value)}
            placeholder={`Item ${i + 1}`}
            className="flex-1 px-3 h-9 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 focus:bg-white transition-all"
          />
          <button
            type="button"
            onClick={() => delItem(it.id)}
            className="p-1.5 text-slate-300 hover:text-red-400 transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {items.length < 10 && (
        <button
          type="button"
          onClick={addItem}
          className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1 mt-1"
        >
          <Plus className="h-3 w-3" /> Add item
        </button>
      )}
    </div>
  )
}

function MatchPairEditor({ q, onChange }: { q: Question; onChange: (q: Question) => void }) {
  const pairs = q.pairs ?? []

  function setPairSide(id: string, side: "left" | "right", text: string) {
    onChange({ ...q, pairs: pairs.map(p => p.id === id ? { ...p, [side]: text } : p) })
  }
  function addPair() {
    onChange({ ...q, pairs: [...pairs, { id: uid(), left: "", right: "" }] })
  }
  function delPair(id: string) {
    if (pairs.length <= 2) { toast.error("Minimum 2 pairs"); return }
    onChange({ ...q, pairs: pairs.filter(p => p.id !== id) })
  }

  return (
    <div className="space-y-2 mt-3">
      <div className="grid grid-cols-2 gap-2 pr-8">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Left column</p>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Right column (match)</p>
      </div>
      {pairs.map((pair, i) => (
        <div key={pair.id} className="flex items-center gap-1.5">
          <input
            type="text"
            value={pair.left}
            onChange={e => setPairSide(pair.id, "left", e.target.value)}
            placeholder={`Left ${i + 1}`}
            className="flex-1 px-3 h-9 text-sm border border-blue-200 rounded-lg bg-blue-50/40 outline-none focus:ring-2 focus:ring-blue-300/40 focus:bg-white transition-all"
          />
          <span className="text-slate-300 text-base shrink-0 select-none">⇄</span>
          <input
            type="text"
            value={pair.right}
            onChange={e => setPairSide(pair.id, "right", e.target.value)}
            placeholder={`Right ${i + 1}`}
            className="flex-1 px-3 h-9 text-sm border border-teal-200 rounded-lg bg-teal-50/40 outline-none focus:ring-2 focus:ring-teal-300/40 focus:bg-white transition-all"
          />
          <button
            type="button"
            onClick={() => delPair(pair.id)}
            className="p-1.5 text-slate-300 hover:text-red-400 transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {pairs.length < 8 && (
        <button
          type="button"
          onClick={addPair}
          className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1 mt-1"
        >
          <Plus className="h-3 w-3" /> Add pair
        </button>
      )}
    </div>
  )
}

function OpenEndedEditor({ q, onChange }: { q: Question; onChange: (q: Question) => void }) {
  return (
    <div className="space-y-4 mt-3">
      <div className="bg-rose-50 border border-rose-100 rounded-xl p-3.5 text-sm text-rose-800">
        <p className="font-semibold mb-1">✍ AI-Graded Response</p>
        <p className="text-xs leading-relaxed text-rose-600">
          Students write a free-text answer. Groq AI evaluates it against your rubric below
          and assigns a score out of the max points you set.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Grading Rubric — AI instructions
        </label>
        <textarea
          value={q.rubric ?? ""}
          onChange={e => onChange({ ...q, rubric: e.target.value })}
          placeholder={`Describe what a full-marks answer looks like.\n\nExample: "Award full marks if the student correctly identifies the three phases of flight, explains each with at least one supporting detail, and uses correct aviation terminology."`}
          rows={5}
          className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 focus:bg-white resize-none transition-all"
        />
        <p className="text-xs text-slate-400">
          Be specific — the more detail you provide, the more consistent the AI grading will be.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Max Words</label>
          <div className="flex items-center gap-2">
            <input
              type="number" min="50" max="5000" step="50"
              value={q.max_words ?? 500}
              onChange={e => onChange({ ...q, max_words: Number(e.target.value) })}
              className="w-24 px-3 h-9 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
            />
            <span className="text-xs text-slate-400">word limit shown to students</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Question body (full editor, shown when expanded) ──────────────
function QuestionBody({ q, onChange }: { q: Question; onChange: (q: Question) => void }) {
  function setField<K extends keyof Question>(key: K, val: Question[K]) {
    onChange({ ...q, [key]: val })
  }

  return (
    <div className="px-4 pb-4 space-y-3">
      {/* Question text */}
      <textarea
        value={q.text}
        onChange={e => setField("text", e.target.value)}
        placeholder="Type your question here…"
        rows={2}
        className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 resize-none font-medium text-slate-800"
      />

      {/* Type-specific editor */}
      {(q.type === "mcq_single" || q.type === "mcq_multiple") && (
        <MCQEditor q={q} onChange={onChange} />
      )}
      {q.type === "ordering"  && <OrderingEditor  q={q} onChange={onChange} />}
      {q.type === "match_pair" && <MatchPairEditor q={q} onChange={onChange} />}
      {q.type === "open_ended" && <OpenEndedEditor q={q} onChange={onChange} />}

      {/* Points + Explanation row */}
      <div className="flex items-start gap-4 pt-3 border-t border-slate-100">
        <div className="space-y-1 shrink-0">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Points</label>
          <input
            type="number" min="0.5" max="100" step="0.5"
            value={q.points}
            onChange={e => setField("points", Number(e.target.value))}
            className="w-20 px-3 h-8 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
          />
        </div>
        <div className="flex-1 space-y-1 min-w-0">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Explanation (optional)</label>
          <input
            type="text"
            value={q.explanation ?? ""}
            onChange={e => setField("explanation", e.target.value)}
            placeholder="Shown to students after answering or in the review"
            className="w-full px-3 h-8 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
          />
        </div>
      </div>
    </div>
  )
}

// ── Sortable question card ───────────────────────────────────────
function SortableQuestion({
  q, index, expanded, onToggle, onChange, onDelete,
}: {
  q: Question; index: number; expanded: boolean
  onToggle: () => void; onChange: (q: Question) => void; onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: q.id })

  const meta    = Q_TYPE_META[q.type]
  const preview = q.text.trim() || "(No question text yet)"

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "bg-white border rounded-2xl overflow-hidden transition-all",
        isDragging
          ? "shadow-2xl border-[#1B4F8A]/30 z-50 rotate-[0.5deg]"
          : "border-slate-200 shadow-sm hover:shadow-md",
      )}
    >
      {/* Card header */}
      <div
        className="flex items-center gap-2 px-3 py-3 cursor-pointer select-none"
        onClick={onToggle}
      >
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          onClick={e => e.stopPropagation()}
          className="cursor-grab active:cursor-grabbing p-1 rounded text-slate-300 hover:text-slate-500 hover:bg-slate-100 shrink-0 transition-colors"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Index bubble */}
        <span className="w-7 h-7 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] text-xs font-bold flex items-center justify-center shrink-0">
          {index + 1}
        </span>

        {/* Type badge */}
        <span className={cn("text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0", meta.color)}>
          {meta.icon} {meta.label}
        </span>

        {/* Question preview */}
        <span className="flex-1 text-sm text-slate-600 truncate min-w-0">
          {preview}
        </span>

        {/* Points */}
        <span className="text-xs text-slate-400 shrink-0 mr-1">
          {q.points} pt{q.points !== 1 ? "s" : ""}
        </span>

        {/* Delete */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="p-1.5 rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        {/* Expand chevron */}
        <ChevronDown className={cn(
          "h-4 w-4 text-slate-400 transition-transform shrink-0",
          expanded && "rotate-180"
        )} />
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/40">
          <QuestionBody q={q} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TYPE PICKER POPUP
// ─────────────────────────────────────────────────────────────────

function TypePicker({ onPick, onClose }: { onPick: (t: QType) => void; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div className="absolute left-0 bottom-full mb-2 z-[61] bg-white border border-slate-200 rounded-2xl shadow-xl p-3 w-72">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1 mb-2.5">
          Question Type
        </p>
        <div className="space-y-1">
          {(Object.entries(Q_TYPE_META) as [QType, typeof Q_TYPE_META[QType]][]).map(([type, m]) => (
            <button
              key={type}
              onClick={() => { onPick(type); onClose() }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left"
            >
              <span className={cn(
                "w-9 h-9 rounded-xl text-base flex items-center justify-center shrink-0",
                m.color
              )}>
                {m.icon}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-800">{m.label}</p>
                <p className="text-xs text-slate-400">{m.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// CSV IMPORT MODAL
// ─────────────────────────────────────────────────────────────────

/** Proper RFC-4180 CSV line splitter — handles commas inside quoted fields */
function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let cur = ""
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (ch === "," && !inQ) {
      result.push(cur.trim()); cur = ""
    } else {
      cur += ch
    }
  }
  result.push(cur.trim())
  return result
}

function CSVImportModal({
  onClose, onImport,
}: { onClose: () => void; onImport: (qs: Question[]) => void }) {
  const [raw,    setRaw]    = useState("")
  const [parsed, setParsed] = useState<Question[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // Same column format as the standalone exam CSV importer:
  // type, text, score, rubric/ai_guide, opt1, opt2, opt3, ...
  // MCQ opts  → "Text:Score"  e.g. "Paris:10" or "London:0"
  // ordering  → items in correct order, one per column
  // matching  → "Left:Right" pairs, one per column
  // open_ended → only type, text, score, rubric used
  function parseCSV(text: string) {
    setErrors([])
    setParsed([])
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
      .split("\n")
      .filter(l => l.trim() && !l.trim().startsWith("//"))
    if (!lines.length) return

    const start = lines[0].toLowerCase().includes("type") ? 1 : 0
    const qs: Question[] = []
    const errs: string[] = []

    for (let i = start; i < lines.length; i++) {
      const rowNum = i + 1
      const cols = splitCSVLine(lines[i])
      const [rawType, text, scoreRaw, rubric, ...opts] = cols
      if (!rawType?.trim() || !text?.trim()) continue

      const t = rawType.toLowerCase().replace(/[\s\-]/g, "_")
      const score = parseFloat(scoreRaw)
      if (isNaN(score) || score < 0) {
        errs.push(`Row ${rowNum}: invalid score "${scoreRaw}" — must be a number`); continue
      }

      const filledOpts = opts.filter(o => o.trim())

      // ── MCQ Single ────────────────────────────────────────────
      if (t === "mcq_single" || t === "mcq") {
        if (!filledOpts.length) { errs.push(`Row ${rowNum}: mcq_single needs at least 2 options`); continue }
        const choices = parseMcqOpts(filledOpts, rowNum, errs)
        if (!choices) continue
        qs.push({ id: uid(), type: "mcq_single", text, points: score, options: choices })
        continue
      }

      // ── MCQ Multiple ──────────────────────────────────────────
      if (t === "mcq_multi" || t === "mcq_multiple" || t === "multiple") {
        if (!filledOpts.length) { errs.push(`Row ${rowNum}: mcq_multiple needs at least 2 options`); continue }
        const choices = parseMcqOpts(filledOpts, rowNum, errs)
        if (!choices) continue
        qs.push({ id: uid(), type: "mcq_multiple", text, points: score, options: choices })
        continue
      }

      // ── Ordering ─────────────────────────────────────────────
      if (t === "ordering" || t === "order") {
        if (filledOpts.length < 2) { errs.push(`Row ${rowNum}: ordering needs at least 2 items`); continue }
        qs.push({
          id: uid(), type: "ordering", text, points: score,
          items: filledOpts.map(s => ({ id: uid(), text: s })),
        })
        continue
      }

      // ── Match the Pair ────────────────────────────────────────
      if (t === "matching" || t === "match_pair" || t === "match") {
        if (filledOpts.length < 2) { errs.push(`Row ${rowNum}: matching needs at least 2 pairs`); continue }
        const pairs: { id: string; left: string; right: string }[] = []
        let ok = true
        for (const ps of filledOpts) {
          const colonIdx = ps.indexOf(":")
          if (colonIdx === -1) {
            errs.push(`Row ${rowNum}: pair "${ps}" must be "Left:Right"`); ok = false; break
          }
          pairs.push({ id: uid(), left: ps.slice(0, colonIdx).trim(), right: ps.slice(colonIdx + 1).trim() })
        }
        if (!ok) continue
        qs.push({ id: uid(), type: "match_pair", text, points: score, pairs })
        continue
      }

      // ── Open Ended ────────────────────────────────────────────
      if (t === "open_ended" || t === "open") {
        qs.push({ id: uid(), type: "open_ended", text, points: score, rubric: rubric?.trim() || "" })
        continue
      }

      errs.push(`Row ${rowNum}: unknown type "${rawType}" — use mcq_single, mcq_multi, ordering, matching, or open_ended`)
    }

    if (!qs.length && !errs.length) { setErrors(["No valid questions found — check the format below"]); return }
    setErrors(errs)
    setParsed(qs)
  }

  /** Parse "Text:Score" MCQ options — returns null and pushes error on failure */
  function parseMcqOpts(opts: string[], rowNum: number, errs: string[]) {
    const choices: { id: string; text: string; correct: boolean }[] = []
    for (const opt of opts) {
      const colonIdx = opt.lastIndexOf(":")
      if (colonIdx === -1) {
        errs.push(`Row ${rowNum}: option "${opt}" must be "Text:Score" e.g. "Paris:10"`); return null
      }
      const choiceText  = opt.slice(0, colonIdx).trim()
      const choiceScore = parseFloat(opt.slice(colonIdx + 1).trim())
      if (!choiceText) { errs.push(`Row ${rowNum}: empty choice text in "${opt}"`); return null }
      if (isNaN(choiceScore)) { errs.push(`Row ${rowNum}: invalid score in "${opt}"`); return null }
      choices.push({ id: uid(), text: choiceText, correct: choiceScore > 0 })
    }
    return choices
  }

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const text = (e.target?.result as string) ?? ""
      setRaw(text)
      parseCSV(text)
    }
    reader.readAsText(file)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-900">Import Questions from CSV</h2>
            <p className="text-xs text-slate-400 mt-0.5">Supports all question types: MCQ, Ordering, Match the Pair, Open Ended</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Format reference */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">CSV Format — same as standalone exam importer</p>
            <p className="text-xs font-mono text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">
              type, text, score, rubric/ai_guide, opt1, opt2, opt3, …
            </p>

            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-2">MCQ — options as "Text:Score" (score &gt; 0 = correct)</p>
              <p className="text-xs font-mono text-slate-400">mcq_single,&quot;What is METAR?&quot;,1,,&quot;Weather report:10&quot;,&quot;Flight chart:0&quot;,&quot;ATC plan:0&quot;</p>
              <p className="text-xs font-mono text-slate-400">mcq_multi,&quot;Select valid licences&quot;,2,,&quot;PPL:5&quot;,&quot;IR:0&quot;,&quot;CPL:5&quot;,&quot;XYZ:0&quot;</p>
            </div>

            <div className="border-t border-slate-100 pt-2 space-y-0.5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Ordering — items in correct order, one per column</p>
              <p className="text-xs font-mono text-slate-400">ordering,&quot;Order the steps&quot;,4,,&quot;Pre-flight&quot;,&quot;Engine start&quot;,&quot;Taxi&quot;,&quot;Takeoff&quot;</p>
            </div>

            <div className="border-t border-slate-100 pt-2 space-y-0.5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Matching — each pair as Left:Right</p>
              <p className="text-xs font-mono text-slate-400">matching,&quot;Match country to capital&quot;,3,,&quot;France:Paris&quot;,&quot;Germany:Berlin&quot;,&quot;Italy:Rome&quot;</p>
            </div>

            <div className="border-t border-slate-100 pt-2 space-y-0.5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Open Ended — rubric in column 4</p>
              <p className="text-xs font-mono text-slate-400">open_ended,&quot;Explain VFR rules&quot;,5,&quot;Award marks if student mentions...&quot;</p>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            className="border-2 border-dashed border-slate-200 rounded-xl py-8 flex flex-col items-center gap-2 cursor-pointer hover:border-[#1B4F8A]/40 hover:bg-[#1B4F8A]/2 transition-all group"
          >
            <Upload className="h-6 w-6 text-slate-300 group-hover:text-[#1B4F8A]/50 transition-colors" />
            <p className="text-sm text-slate-500 font-medium">Drop CSV here or click to browse</p>
            <p className="text-xs text-slate-400">.csv or .txt</p>
            <input
              ref={fileRef} type="file" accept=".csv,.txt"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          {/* Paste area */}
          <textarea
            value={raw}
            onChange={e => { setRaw(e.target.value); parseCSV(e.target.value) }}
            placeholder="…or paste CSV data here"
            rows={4}
            className="w-full px-3 py-2.5 text-xs font-mono border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 resize-none"
          />

          {/* Errors */}
          {errors.length > 0 && (
            <div className="flex flex-col gap-1.5 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              {errors.map((e, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{e}</span>
                </div>
              ))}
            </div>
          )}

          {/* Preview */}
          {parsed.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {parsed.length} question{parsed.length !== 1 ? "s" : ""} ready to import
              </p>
              <div className="space-y-1.5">
                {parsed.slice(0, 6).map((q, i) => (
                  <div key={q.id} className="flex items-center gap-2.5 text-sm bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                    <span className="text-xs font-bold text-emerald-500 w-4 shrink-0">{i + 1}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full shrink-0", Q_TYPE_META[q.type].color)}>
                      {Q_TYPE_META[q.type].icon} {Q_TYPE_META[q.type].label}
                    </span>
                    <span className="text-slate-700 truncate text-xs">{q.text || "(empty)"}</span>
                  </div>
                ))}
                {parsed.length > 6 && (
                  <p className="text-xs text-slate-400 pl-2">+{parsed.length - 6} more…</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { if (parsed.length) { onImport(parsed); onClose() } }}
            disabled={!parsed.length}
            className={cn(
              "px-5 py-2 text-sm font-semibold rounded-xl transition-all",
              parsed.length
                ? "bg-[#1B4F8A] text-white hover:bg-[#163f6e] shadow-sm"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            )}
          >
            Import {parsed.length > 0 ? `${parsed.length} Question${parsed.length !== 1 ? "s" : ""}` : "Questions"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// QUESTION BANK PICKER MODAL
// ─────────────────────────────────────────────────────────────────

// Bank types match lms_questions table
interface BankSet {
  id: string
  name: string
  topic: string | null
  questions: BankQuestion[]
}
interface BankQuestion {
  id: string
  set_id: string
  type: string          // mcq_single | mcq_multi | ordering | matching | open_ended
  text_en: string
  score: number
  difficulty: string
  tags: string[]
  ordering_items: { text: string }[] | null
  matching_pairs: { left: string; right: string }[] | null
  lms_question_choices: { id: string; text_en: string; is_correct: boolean; order_index: number }[]
}

// Bank type names → ActivityEditor type names
function toBankQType(bankType: string): QType {
  if (bankType === "mcq_multi")  return "mcq_multiple"
  if (bankType === "matching")   return "match_pair"
  return bankType as QType
}

function convertBankQuestion(bq: BankQuestion): Question {
  const type = toBankQType(bq.type)
  const base = { id: uid(), text: bq.text_en, points: bq.score ?? 1, type }

  switch (type) {
    case "mcq_single":
    case "mcq_multiple": {
      const opts = [...(bq.lms_question_choices ?? [])].sort((a, b) => a.order_index - b.order_index)
      return { ...base, options: opts.map(c => ({ id: uid(), text: c.text_en, correct: c.is_correct })) }
    }
    case "ordering":
      return { ...base, items: (bq.ordering_items ?? []).map(it => ({ id: uid(), text: it.text })) }
    case "match_pair":
      return { ...base, pairs: (bq.matching_pairs ?? []).map(p => ({ id: uid(), left: p.left, right: p.right })) }
    case "open_ended":
    default:
      return { ...base, type: "open_ended", points: bq.score ?? 5 }
  }
}

const Q_TYPE_SHORT: Record<string, string> = {
  mcq_single:   "MCQ",
  mcq_multiple: "Multi",
  ordering:     "Order",
  match_pair:   "Match",
  open_ended:   "Open",
}

function QuestionBankPickerModal({
  onClose, onImport,
}: { onClose: () => void; onImport: (qs: Question[]) => void }) {
  const [sets,       setSets]      = useState<BankSet[]>([])
  const [loading,    setLoading]   = useState(true)
  const [activeSet,  setActiveSet] = useState<string | null>(null)
  const [selected,   setSelected]  = useState<Set<string>>(new Set())
  const [search,     setSearch]    = useState("")

  useEffect(() => {
    fetch("/api/lms/question-bank")
      .then(r => r.json())
      .then((data: BankSet[]) => {
        setSets(data ?? [])
        if (data?.length > 0) setActiveSet(data[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  const currentSet = sets.find(s => s.id === activeSet)
  const filtered = (currentSet?.questions ?? []).filter(q =>
    !search.trim() || q.text_en.toLowerCase().includes(search.toLowerCase())
  )

  function toggleQ(id: string) {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }
  function toggleAll() {
    const allIds = filtered.map(q => q.id)
    const allSelected = allIds.every(id => selected.has(id))
    setSelected(prev => {
      const s = new Set(prev)
      allIds.forEach(id => allSelected ? s.delete(id) : s.add(id))
      return s
    })
  }

  function handleImport() {
    const allBankQs = sets.flatMap(s => s.questions)
    const toImport  = allBankQs.filter(bq => selected.has(bq.id))
    onImport(toImport.map(convertBankQuestion))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <Database className="h-5 w-5 text-[#1B4F8A]" />
            <div>
              <h2 className="font-bold text-slate-900">Pick from Question Bank</h2>
              <p className="text-xs text-slate-400 mt-0.5">Select questions from your existing exams</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
          </div>
        ) : sets.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
            <Database className="h-10 w-10 text-slate-200" />
            <p className="font-semibold text-slate-500">No question sets yet</p>
            <p className="text-sm text-slate-400">Go to Question Bank in the sidebar to create sets and add questions.</p>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">

            {/* Sidebar — set list */}
            <div className="w-52 border-r border-slate-100 overflow-y-auto shrink-0 py-2">
              {sets.map(set => {
                const setSelectedCount = set.questions.filter(q => selected.has(q.id)).length
                return (
                  <button
                    key={set.id}
                    onClick={() => { setActiveSet(set.id); setSearch("") }}
                    className={cn(
                      "w-full text-left px-4 py-3 text-sm transition-colors flex items-center justify-between gap-2",
                      activeSet === set.id
                        ? "bg-[#1B4F8A]/8 text-[#1B4F8A] font-semibold border-r-2 border-[#1B4F8A]"
                        : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate">{set.name}</p>
                      {set.topic && <p className="text-[10px] text-slate-400 truncate">{set.topic}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {setSelectedCount > 0 && (
                        <span className="text-xs bg-[#1B4F8A] text-white rounded-full px-1.5 py-0.5 leading-none font-bold">
                          {setSelectedCount}
                        </span>
                      )}
                      <span className="text-xs text-slate-400">{set.questions.length}</span>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Question list */}
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* Search + select all */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search questions…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 h-8 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 focus:bg-white transition-all"
                  />
                </div>
                {filtered.length > 0 && (
                  <button
                    onClick={toggleAll}
                    className="text-xs text-[#1B4F8A] hover:underline shrink-0"
                  >
                    {filtered.every(q => selected.has(q.id)) ? "Deselect all" : "Select all"}
                  </button>
                )}
              </div>

              {/* Questions */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2 text-center text-slate-400">
                    <Search className="h-7 w-7 text-slate-200" />
                    <p className="text-sm">No questions match your search</p>
                  </div>
                ) : filtered.map((bq, i) => {
                  const isSelected  = selected.has(bq.id)
                  const displayType = toBankQType(bq.type)
                  return (
                    <button
                      key={bq.id}
                      onClick={() => toggleQ(bq.id)}
                      className={cn(
                        "w-full text-left px-4 py-3 flex items-start gap-3 transition-colors",
                        isSelected ? "bg-[#1B4F8A]/5" : "hover:bg-slate-50"
                      )}
                    >
                      <div className={cn(
                        "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
                        isSelected ? "bg-[#1B4F8A] border-[#1B4F8A] text-white" : "border-slate-300"
                      )}>
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-semibold text-slate-400">Q{i + 1}</span>
                          <span className={cn(
                            "text-xs px-1.5 py-0.5 rounded font-medium",
                            displayType === "mcq_single"   ? "bg-blue-100 text-blue-700" :
                            displayType === "mcq_multiple" ? "bg-violet-100 text-violet-700" :
                            displayType === "ordering"     ? "bg-amber-100 text-amber-700" :
                            displayType === "match_pair"   ? "bg-teal-100 text-teal-700" :
                                                             "bg-rose-100 text-rose-700"
                          )}>
                            {Q_TYPE_SHORT[displayType] ?? bq.type}
                          </span>
                          <span className={cn(
                            "text-xs px-1.5 py-0.5 rounded font-medium capitalize",
                            bq.difficulty === "easy" ? "bg-emerald-50 text-emerald-600" :
                            bq.difficulty === "hard" ? "bg-red-50 text-red-500" :
                                                       "bg-amber-50 text-amber-600"
                          )}>{bq.difficulty}</span>
                          <span className="text-xs text-slate-400 ml-auto shrink-0">{bq.score} pt{bq.score !== 1 ? "s" : ""}</span>
                        </div>
                        <p className="text-sm text-slate-700 line-clamp-2 text-left">{bq.text_en}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 shrink-0">
          <span className="text-sm text-slate-500">
            {selected.size > 0 ? (
              <span className="font-semibold text-[#1B4F8A]">{selected.size} selected</span>
            ) : (
              "Select questions to import"
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={selected.size === 0}
              className={cn(
                "px-5 py-2 text-sm font-semibold rounded-xl transition-all",
                selected.size > 0
                  ? "bg-[#1B4F8A] text-white hover:bg-[#163f6e] shadow-sm"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              )}
            >
              Add {selected.size > 0 ? `${selected.size} Question${selected.size !== 1 ? "s" : ""}` : "Questions"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// MAIN: ActivityEditor
// ─────────────────────────────────────────────────────────────────

export default function ActivityEditor({
  moduleId,
  moduleType,
  initialQuestions,
  initialSettings,
}: {
  moduleId:         string
  moduleType:       string
  initialQuestions: Question[] | null
  initialSettings:  ActivitySettings | null
}) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const sensors   = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const [questions,  setQuestions]  = useState<Question[]>(initialQuestions ?? [])
  const [settings,   setSettings]   = useState<ActivitySettings>({ ...DEFAULT_SETTINGS, ...(initialSettings ?? {}) })
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set())
  const [saveStatus,  setSaveStatus]  = useState<"saved" | "saving" | "unsaved">("saved")
  const [pickerOpen,  setPickerOpen]  = useState(false)
  const [csvOpen,     setCsvOpen]     = useState(false)
  const [bankOpen,    setBankOpen]    = useState(false)

  const meta        = MODULE_TYPE_META[moduleType] ?? { label: moduleType, icon: "📝" }
  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0)

  // ── Auto-save ─────────────────────────────────────────────────
  const scheduleAutoSave = useCallback((qs: Question[], st: ActivitySettings) => {
    setSaveStatus("unsaved")
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaveStatus("saving")
      const res = await fetch("/api/lms/modules", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          id:                moduleId,
          questions:         qs,
          activity_settings: st,
        }),
      })
      setSaveStatus(res.ok ? "saved" : "unsaved")
      if (!res.ok) toast.error("Auto-save failed")
    }, 1500)
  }, [moduleId])

  // ── Handlers ──────────────────────────────────────────────────
  function applyQuestions(next: Question[]) {
    setQuestions(next)
    scheduleAutoSave(next, settings)
  }
  function applySettings(next: ActivitySettings) {
    setSettings(next)
    scheduleAutoSave(questions, next)
  }
  function addQuestion(type: QType) {
    const q = createQuestion(type)
    setExpanded(prev => new Set([...prev, q.id]))
    applyQuestions([...questions, q])
  }
  function deleteQuestion(id: string) {
    if (!confirm("Delete this question?")) return
    applyQuestions(questions.filter(q => q.id !== id))
    setExpanded(prev => { const s = new Set(prev); s.delete(id); return s })
  }
  function updateQuestion(updated: Question) {
    applyQuestions(questions.map(q => q.id === updated.id ? updated : q))
  }
  function toggleExpand(id: string) {
    setExpanded(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = questions.findIndex(q => q.id === active.id)
    const to   = questions.findIndex(q => q.id === over.id)
    applyQuestions(arrayMove(questions, from, to))
  }
  function importQuestions(imported: Question[]) {
    applyQuestions([...questions, ...imported])
    toast.success(`${imported.length} question${imported.length !== 1 ? "s" : ""} imported ✓`)
  }

  return (
    <div className="max-w-3xl mx-auto pb-20 space-y-5">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="pb-5 border-b border-slate-100">
        <p className="text-xs font-bold text-[#1B4F8A] uppercase tracking-wider mb-2">
          {meta.icon} {meta.label}
        </p>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-5 text-xs text-slate-400">
            <span>
              <span className="font-bold text-slate-700 text-sm">{questions.length}</span> question{questions.length !== 1 ? "s" : ""}
            </span>
            <span>
              <span className="font-bold text-slate-700 text-sm">{totalPoints}</span> total pts
            </span>
            {settings.time_limit_minutes && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> {settings.time_limit_minutes} min
              </span>
            )}
          </div>
          {/* Save status */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
            {saveStatus === "saving"  && <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>}
            {saveStatus === "saved"   && <><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Auto-saved</>}
            {saveStatus === "unsaved" && <span className="text-amber-500">Unsaved</span>}
          </div>
        </div>
      </div>

      {/* ── Settings ──────────────────────────────────────────── */}
      <SettingsPanel settings={settings} onChange={applySettings} />

      {/* ── Question list ─────────────────────────────────────── */}
      {questions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Questions
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <button onClick={() => setExpanded(new Set(questions.map(q => q.id)))} className="hover:text-slate-700 transition-colors">
                Expand all
              </button>
              <span>·</span>
              <button onClick={() => setExpanded(new Set())} className="hover:text-slate-700 transition-colors">
                Collapse all
              </button>
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={questions.map(q => q.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <SortableQuestion
                    key={q.id}
                    q={q}
                    index={i}
                    expanded={expanded.has(q.id)}
                    onToggle={() => toggleExpand(q.id)}
                    onChange={updateQuestion}
                    onDelete={() => deleteQuestion(q.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────── */}
      {questions.length === 0 && (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl py-16 flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl">
            {meta.icon}
          </div>
          <p className="font-semibold text-slate-600">No questions yet</p>
          <p className="text-sm text-slate-400 max-w-xs">
            Click <strong>Add Question</strong> to build your first question, or import a batch from CSV.
          </p>
        </div>
      )}

      {/* ── Bottom action bar ─────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap pt-2">

        {/* Add question with type picker */}
        <div className="relative">
          <button
            onClick={() => setPickerOpen(o => !o)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1B4F8A] text-white text-sm font-semibold rounded-xl hover:bg-[#163f6e] shadow-sm transition-all"
          >
            <Plus className="h-4 w-4" />
            Add Question
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", pickerOpen && "rotate-180")} />
          </button>
          {pickerOpen && (
            <TypePicker onPick={addQuestion} onClose={() => setPickerOpen(false)} />
          )}
        </div>

        {/* CSV import */}
        <button
          onClick={() => setCsvOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 text-sm font-semibold rounded-xl border border-slate-200 hover:bg-slate-50 shadow-sm transition-all"
        >
          <Upload className="h-4 w-4" /> Import CSV
        </button>

        {/* Question bank picker */}
        <button
          onClick={() => setBankOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 text-sm font-semibold rounded-xl border border-slate-200 hover:bg-slate-50 shadow-sm transition-all"
        >
          <Database className="h-4 w-4" /> Question Bank
        </button>
      </div>

      {/* CSV modal */}
      {csvOpen && (
        <CSVImportModal onClose={() => setCsvOpen(false)} onImport={importQuestions} />
      )}

      {/* Question bank picker modal */}
      {bankOpen && (
        <QuestionBankPickerModal onClose={() => setBankOpen(false)} onImport={importQuestions} />
      )}
    </div>
  )
}
