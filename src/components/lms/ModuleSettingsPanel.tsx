"use client"

import { useState, useRef, useCallback } from "react"
import {
  MousePointerClick, Clock, CheckSquare,
  Lock, Calendar, Eye, Plus, Trash2, Check,
  Loader2, CheckCircle2, X, ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// ── Types ─────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

type CompletionMethod = "button" | "time" | "check"

export interface CheckQuestion {
  id:       string
  question: string
  options:  string[]   // 2–4 options
  correct:  number     // index of correct option
}

export interface ModuleSettings {
  completion_method:        CompletionMethod
  completion_time_minutes:  number | null
  completion_check:         CheckQuestion[]
  is_mandatory:             boolean
  lock_until_previous:      boolean
  available_from:           string | null
  available_until:          string | null
  show_in_progress:         boolean
  estimated_duration:       number | null
}

// ── Toggle helper ─────────────────────────────────────────────────
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

// ── Completion method cards ───────────────────────────────────────
const METHODS: { value: CompletionMethod; icon: React.ElementType; label: string; desc: string }[] = [
  {
    value: "button",
    icon:  MousePointerClick,
    label: "Button",
    desc:  "Student clicks \"Mark as Complete\" when ready",
  },
  {
    value: "time",
    icon:  Clock,
    label: "Time-based",
    desc:  "Automatically completes after a set viewing duration",
  },
  {
    value: "check",
    icon:  CheckSquare,
    label: "Inline Check",
    desc:  "Student must answer 1–5 quick questions correctly",
  },
]

// ── Inline check question editor ──────────────────────────────────
function CheckQuestionEditor({
  q, index, onChange, onDelete,
}: {
  q: CheckQuestion; index: number
  onChange: (q: CheckQuestion) => void; onDelete: () => void
}) {
  function setOpt(i: number, text: string) {
    const opts = [...q.options]
    opts[i] = text
    onChange({ ...q, options: opts })
  }
  function addOpt() {
    if (q.options.length >= 4) return
    onChange({ ...q, options: [...q.options, ""] })
  }
  function delOpt(i: number) {
    if (q.options.length <= 2) { toast.error("Minimum 2 options"); return }
    const opts = q.options.filter((_, idx) => idx !== i)
    const correct = q.correct >= opts.length ? opts.length - 1 : q.correct
    onChange({ ...q, options: opts, correct })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Question header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-100">
        <span className="w-6 h-6 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] text-xs font-bold flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <input
          type="text"
          value={q.question}
          onChange={e => onChange({ ...q, question: e.target.value })}
          placeholder="Enter your check question…"
          className="flex-1 text-sm font-medium bg-transparent border-none outline-none text-slate-800 placeholder:text-slate-300"
        />
        <button
          type="button"
          onClick={onDelete}
          className="p-1 rounded text-slate-300 hover:text-red-400 transition-colors shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Options */}
      <div className="px-3 py-2.5 space-y-1.5">
        {q.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange({ ...q, correct: i })}
              className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0",
                q.correct === i
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : "border-slate-300 text-transparent hover:border-emerald-300"
              )}
            >
              <Check className="h-2.5 w-2.5" />
            </button>
            <span className="text-xs text-slate-400 w-4 font-mono shrink-0">
              {String.fromCharCode(65 + i)}
            </span>
            <input
              type="text"
              value={opt}
              onChange={e => setOpt(i, e.target.value)}
              placeholder={`Option ${String.fromCharCode(65 + i)}`}
              className="flex-1 px-2.5 h-7 text-xs border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 transition-all"
            />
            <button
              type="button"
              onClick={() => delOpt(i)}
              className="p-1 text-slate-200 hover:text-red-400 transition-colors shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {q.options.length < 4 && (
          <button
            type="button"
            onClick={addOpt}
            className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1 mt-1"
          >
            <Plus className="h-3 w-3" /> Add option
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// MAIN: ModuleSettingsPanel
// ─────────────────────────────────────────────────────────────────

export default function ModuleSettingsPanel({
  moduleId,
  initialSettings,
}: {
  moduleId:        string
  initialSettings: ModuleSettings
}) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [s, setS]           = useState<ModuleSettings>(initialSettings)
  const [saveStatus, setSave] = useState<"saved" | "saving" | "unsaved">("saved")

  // ── Auto-save ─────────────────────────────────────────────────
  const scheduleAutoSave = useCallback((next: ModuleSettings) => {
    setSave("unsaved")
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSave("saving")
      const res = await fetch("/api/lms/modules", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          id:                      moduleId,
          completion_method:       next.completion_method,
          completion_time_minutes: next.completion_time_minutes,
          completion_check:        next.completion_check,
          is_mandatory:            next.is_mandatory,
          lock_until_previous:     next.lock_until_previous,
          available_from:          next.available_from,
          available_until:         next.available_until,
          show_in_progress:        next.show_in_progress,
          estimated_duration:      next.estimated_duration,
        }),
      })
      setSave(res.ok ? "saved" : "unsaved")
      if (!res.ok) toast.error("Settings auto-save failed")
    }, 1200)
  }, [moduleId])

  function apply(patch: Partial<ModuleSettings>) {
    const next = { ...s, ...patch }
    setS(next)
    scheduleAutoSave(next)
  }

  // ── Inline check question helpers ─────────────────────────────
  function addCheckQuestion() {
    if (s.completion_check.length >= 5) {
      toast.error("Maximum 5 check questions")
      return
    }
    apply({
      completion_check: [
        ...s.completion_check,
        { id: uid(), question: "", options: ["", "", "", ""], correct: 0 },
      ],
    })
  }
  function updateCheckQuestion(updated: CheckQuestion) {
    apply({ completion_check: s.completion_check.map(q => q.id === updated.id ? updated : q) })
  }
  function deleteCheckQuestion(id: string) {
    apply({ completion_check: s.completion_check.filter(q => q.id !== id) })
  }

  return (
    <div className="max-w-2xl mx-auto pb-20 space-y-8">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="pb-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-[#1B4F8A] uppercase tracking-wider mb-1">
            ⚙ Module Settings
          </p>
          <p className="text-sm text-slate-500">Completion rules, access control, and display options</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
          {saveStatus === "saving"  && <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>}
          {saveStatus === "saved"   && <><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Saved</>}
          {saveStatus === "unsaved" && <span className="text-amber-500">Unsaved</span>}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          SECTION 1 — Completion Method
      ════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">Completion Method</p>
          <p className="text-xs text-slate-400 mt-0.5">How does a student mark this module as complete?</p>
        </div>

        {/* Method cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {METHODS.map(({ value, icon: Icon, label, desc }) => (
            <button
              key={value}
              type="button"
              onClick={() => apply({ completion_method: value })}
              className={cn(
                "flex flex-col items-start gap-2.5 p-4 rounded-2xl border-2 text-left transition-all",
                s.completion_method === value
                  ? "border-[#1B4F8A] bg-[#1B4F8A]/5 shadow-sm"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              <div className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center transition-colors",
                s.completion_method === value
                  ? "bg-[#1B4F8A] text-white"
                  : "bg-slate-100 text-slate-500"
              )}>
                <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
              </div>
              <div>
                <p className={cn(
                  "text-sm font-semibold",
                  s.completion_method === value ? "text-[#1B4F8A]" : "text-slate-700"
                )}>
                  {label}
                </p>
                <p className="text-xs text-slate-400 mt-0.5 leading-snug">{desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Time config */}
        {s.completion_method === "time" && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> Minimum Viewing Time
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number" min="1" max="480"
                value={s.completion_time_minutes ?? ""}
                onChange={e => apply({ completion_time_minutes: e.target.value ? Number(e.target.value) : null })}
                placeholder="e.g. 10"
                className="w-24 px-3 h-9 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
              />
              <span className="text-sm text-slate-500">minutes</span>
            </div>
            <p className="text-xs text-slate-400">
              The completion button appears automatically after the student has been on the module for this long.
            </p>
          </div>
        )}

        {/* Inline check questions */}
        {s.completion_method === "check" && (
          <div className="space-y-3">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Students must answer all questions correctly before the module is marked complete.
                Maximum <strong>5 questions</strong>. These are shown <em>inline</em> at the bottom of the module — no separate quiz needed.
              </p>
            </div>

            {s.completion_check.length === 0 && (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl py-8 flex flex-col items-center gap-2 text-center">
                <CheckSquare className="h-8 w-8 text-slate-200" />
                <p className="text-sm text-slate-500 font-medium">No check questions yet</p>
                <p className="text-xs text-slate-400">Add up to 5 quick MCQ questions below</p>
              </div>
            )}

            <div className="space-y-2">
              {s.completion_check.map((q, i) => (
                <CheckQuestionEditor
                  key={q.id}
                  q={q}
                  index={i}
                  onChange={updateCheckQuestion}
                  onDelete={() => deleteCheckQuestion(q.id)}
                />
              ))}
            </div>

            {s.completion_check.length < 5 && (
              <button
                type="button"
                onClick={addCheckQuestion}
                className="flex items-center gap-2 px-4 py-2.5 w-full border-2 border-dashed border-slate-200 rounded-2xl text-sm text-slate-500 hover:border-[#1B4F8A]/40 hover:text-[#1B4F8A] hover:bg-[#1B4F8A]/2 transition-all"
              >
                <Plus className="h-4 w-4" />
                Add Check Question
                <span className="text-xs text-slate-400 ml-auto">
                  {s.completion_check.length}/5
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════
          SECTION 2 — Access & Restrictions
      ════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">Access & Restrictions</p>
          <p className="text-xs text-slate-400 mt-0.5">Control when and how students can access this module</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <Toggle
            value={s.is_mandatory}
            onChange={v => apply({ is_mandatory: v })}
            label="Mandatory Module"
            desc="Students cannot skip this module — it blocks course completion"
          />

          <div className="border-t border-slate-100" />

          <Toggle
            value={s.lock_until_previous}
            onChange={v => apply({ lock_until_previous: v })}
            label="Lock Until Previous Complete"
            desc="Students must complete the module above this one first"
          />

          <div className="border-t border-slate-100" />

          {/* Available from / until */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> Available From
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={s.available_from ? s.available_from.slice(0, 16) : ""}
                  onChange={e => apply({ available_from: e.target.value ? e.target.value + ":00Z" : null })}
                  className="flex-1 px-3 h-9 text-xs border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
                />
                {s.available_from && (
                  <button onClick={() => apply({ available_from: null })}
                    className="p-1.5 text-slate-300 hover:text-red-400 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> Available Until
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={s.available_until ? s.available_until.slice(0, 16) : ""}
                  onChange={e => apply({ available_until: e.target.value ? e.target.value + ":00Z" : null })}
                  className="flex-1 px-3 h-9 text-xs border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
                />
                {s.available_until && (
                  <button onClick={() => apply({ available_until: null })}
                    className="p-1.5 text-slate-300 hover:text-red-400 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          SECTION 3 — Display
      ════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">Display</p>
          <p className="text-xs text-slate-400 mt-0.5">How this module appears in the course player</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <Toggle
            value={s.show_in_progress}
            onChange={v => apply({ show_in_progress: v })}
            label="Show in Progress Bar"
            desc="Include this module in the course completion percentage"
          />

          <div className="border-t border-slate-100" />

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> Estimated Duration
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="1" max="600"
                value={s.estimated_duration ?? ""}
                onChange={e => apply({ estimated_duration: e.target.value ? Number(e.target.value) : null })}
                placeholder="e.g. 20"
                className="w-24 px-3 h-9 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
              />
              <span className="text-sm text-slate-500">minutes — shown to students</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
