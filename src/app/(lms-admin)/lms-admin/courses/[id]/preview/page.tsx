"use client"

import { useEffect, useState, use, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ChevronLeft, ChevronRight, BookOpen, Video, FileText,
  Globe, HelpCircle, ClipboardList, GraduationCap, FlaskConical,
  File, Loader2, CheckCircle2, Lock, AlertCircle,
  RotateCcw, Award,
} from "lucide-react"
import { cn } from "@/lib/utils"
import FinalExamPlayer, { type ExamQuestion, type ExamSettings } from "@/components/lms/FinalExamPlayer"
import PackagePlayer from "@/components/lms/PackagePlayer"
import { type PackageItem } from "@/components/lms/PackageEditor"

// ── Types ──────────────────────────────────────────────────────
interface LibraryFile {
  id: string; name: string; mime_type: string; public_url: string
}

// Question formats from ActivityEditor
interface MCQOption { id: string; text: string; correct: boolean }
interface OrderItem { id: string; text: string }
interface MatchPair { id: string; left: string; right: string }
interface Question {
  id: string; type: string; text: string; points: number; explanation?: string
  options?: MCQOption[]; items?: OrderItem[]; pairs?: MatchPair[]
  rubric?: string; max_words?: number
}
interface ActivitySettings {
  pass_mark: number; time_limit_minutes: number | null
  max_attempts: number; shuffle_questions: boolean
  shuffle_options: boolean; show_results: boolean; show_correct_answers: boolean
}

// Completion check format from ModuleSettingsPanel
interface CheckQuestion {
  id: string; question: string; options: string[]; correct: number
}

interface Module {
  id:                    string
  title:                 string
  module_type:           string
  order_index:           number
  estimated_duration:    number | null
  is_mandatory:          boolean
  lock_until_previous:   boolean
  download_allowed?:     boolean
  content_body:          unknown
  web_url:               string | null
  library_file:          LibraryFile | null
  questions:             Question[]
  activity_settings:     ActivitySettings | null
  assignment_brief_html: string | null
  completion_method:     string | null
  completion_check:      CheckQuestion[]
}

interface Course {
  id: string; title: string; description: string | null; status: string
}

// ── Module type meta ───────────────────────────────────────────
function moduleIcon(type: string) {
  switch (type) {
    case "content":       return FileText
    case "web":           return Globe
    case "video":         return Video
    case "presentation":  return FileText
    case "document":      return FileText
    case "quiz":          return HelpCircle
    case "progress_test": return FlaskConical
    case "test":          return ClipboardList
    case "final_exam":    return GraduationCap
    case "assignment":    return ClipboardList
    default:              return File
  }
}

function moduleLabel(type: string) {
  const map: Record<string, string> = {
    content: "Content", web: "Web Page",
    video: "Video", presentation: "Slides", document: "Document",
    quiz: "Quiz", progress_test: "Progress Test", test: "Test",
    final_exam: "Final Exam", assignment: "Assignment",
  }
  return map[type] ?? type
}

function EmptyModuleState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
      <BookOpen className="h-10 w-10 mb-3 opacity-30" />
      <p className="text-sm">No content added yet.</p>
    </div>
  )
}

// ── Package preview — fetches blocks and renders the real player ──
function PackagePreview({ moduleId, courseId }: { moduleId: string; courseId: string }) {
  const [pkg,     setPkg]     = useState<{ id: string; title: string; pass_mark: number; items: PackageItem[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/lms/packages?module_id=${moduleId}`)
      .then(r => r.json())
      .then((d: any) => {
        if (!d || d.error) { setError(d?.error ?? "Package not found"); return }
        const items: PackageItem[] = (d.lms_package_items ?? [])
          .sort((a: any, b: any) => a.order_index - b.order_index)
          .map((item: any): PackageItem => ({
            id: item.id, type: item.type,
            title: item.title ?? item.type,
            required: item.required ?? true,
            order_index: item.order_index,
            config: item.config ?? {},
          }))
        setPkg({ id: d.id, title: d.title, pass_mark: d.pass_mark ?? 70, items })
      })
      .catch(() => setError("Failed to load package"))
      .finally(() => setLoading(false))
  }, [moduleId])

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
    </div>
  )

  if (error || !pkg) return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <span className="text-4xl">📦</span>
      <p className="text-slate-500 text-sm">{error ?? "No package configured yet."}<br />Open the module in the course builder to add content.</p>
    </div>
  )

  if (!pkg.items.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <span className="text-4xl">📦</span>
      <p className="text-slate-500 text-sm">Package is empty.<br />Import a PDF or PPTX in the PackageEditor to add content.</p>
    </div>
  )

  return (
    <PackagePlayer
      packageId={pkg.id}
      moduleId={moduleId}
      courseId={courseId}
      studentId="preview"
      studentName="Admin Preview"
      courseTitle="Admin Preview"
      packageTitle={pkg.title}
      passMark={pkg.pass_mark}
      items={pkg.items}
      initialProgress={null}
      previewMode
    />
  )
}

// ── Interactive Quiz Player (preview-only, no DB writes) ───────
type QuizPhase = "taking" | "submitted"

function PreviewQuizPlayer({
  questions, settings, moduleType, onPass,
}: {
  questions: Question[]
  settings:  ActivitySettings | null
  moduleType: string
  onPass: () => void
}) {
  const passMark = settings?.pass_mark ?? 70
  const showCorrect = settings?.show_correct_answers ?? false

  const [answers,  setAnswers]  = useState<Record<string, string[]>>({})
  const [orderSel, setOrderSel] = useState<Record<string, string[]>>({})
  const [pairSel,  setPairSel]  = useState<Record<string, string>>({})
  const [openText, setOpenText] = useState<Record<string, string>>({})
  const [phase,    setPhase]    = useState<QuizPhase>("taking")
  const [score,    setScore]    = useState(0)
  const [total,    setTotal]    = useState(0)
  const [pct,      setPct]      = useState(0)
  const [passed,   setPassed]   = useState(false)
  const [attempt,  setAttempt]  = useState(1)

  if (!questions.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <HelpCircle className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">No questions added yet.</p>
      </div>
    )
  }

  const typeLabel: Record<string, { color: string; icon: string }> = {
    quiz:          { color: "bg-amber-50 border-amber-200 text-amber-800",  icon: "💬" },
    progress_test: { color: "bg-blue-50 border-blue-200 text-blue-800",     icon: "📋" },
    test:          { color: "bg-slate-50 border-slate-200 text-slate-800",  icon: "📝" },
    final_exam:    { color: "bg-amber-50 border-amber-200 text-amber-800",  icon: "🏆" },
  }
  const meta = typeLabel[moduleType] ?? typeLabel.quiz

  function toggleMcq(qId: string, optId: string, single: boolean) {
    setAnswers(prev => {
      const cur = prev[qId] ?? []
      if (single) return { ...prev, [qId]: [optId] }
      const has = cur.includes(optId)
      return { ...prev, [qId]: has ? cur.filter(x => x !== optId) : [...cur, optId] }
    })
  }

  function handleSubmit() {
    let earned = 0; let max = 0
    for (const q of questions) {
      max += q.points
      if (q.type === "mcq_single" && q.options) {
        const sel = answers[q.id]?.[0]
        const correct = q.options.find(o => o.correct)
        if (sel && correct && sel === correct.id) earned += q.points
      } else if (q.type === "mcq_multiple" && q.options) {
        const sel   = new Set(answers[q.id] ?? [])
        const corrIds = q.options.filter(o => o.correct).map(o => o.id)
        const allCorrect = corrIds.every(id => sel.has(id)) && sel.size === corrIds.length
        if (allCorrect) earned += q.points
      } else if (q.type === "ordering" && q.items) {
        const sel = orderSel[q.id] ?? q.items.map(i => i.id)
        const correct = q.items.map(i => i.id)
        const isCorrect = sel.every((id, idx) => id === correct[idx])
        if (isCorrect) earned += q.points
      } else if (q.type === "match_pair" && q.pairs) {
        const allMatch = q.pairs.every(p => pairSel[`${q.id}-${p.id}`] === p.right)
        if (allMatch) earned += q.points
      }
      // open_ended: not auto-graded
    }
    const p   = max > 0 ? Math.round(earned / max * 100) : 0
    const pass = p >= passMark
    setScore(earned); setTotal(max); setPct(p); setPassed(pass)
    setPhase("submitted")
    if (pass) onPass()
  }

  function retry() {
    setAnswers({}); setOrderSel({}); setPairSel({}); setOpenText({})
    setPhase("taking"); setAttempt(a => a + 1)
  }

  const maxAttempts = settings?.max_attempts ?? 99
  const canRetry = !passed && attempt < maxAttempts

  // ── Submitted result view ──────────────────────────────────────
  if (phase === "submitted") {
    return (
      <div className="space-y-5">
        {/* Banner */}
        <div className={cn(
          "rounded-2xl border p-6 text-center",
          passed ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
        )}>
          <div className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl font-bold",
            passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
          )}>
            {pct}%
          </div>
          <h3 className={cn("text-xl font-bold mb-1", passed ? "text-emerald-700" : "text-red-600")}>
            {passed ? "Passed! 🎉" : "Not Passed"}
          </h3>
          <p className="text-sm text-slate-600">
            Score: {score} / {total} pts &nbsp;·&nbsp; Pass mark: {passMark}%
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Attempt {attempt}{maxAttempts < 99 ? ` of ${maxAttempts}` : ""}
          </p>
        </div>

        {/* Answer review */}
        {showCorrect && (
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-700 text-sm">Answer Review</h4>
            {questions.map(q => {
              const isOpen = q.type === "open_ended"
              return (
                <div key={q.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                  <p className="text-sm font-medium text-slate-800">{q.text}</p>
                  {(q.type === "mcq_single" || q.type === "mcq_multiple") && q.options && (
                    <div className="space-y-1">
                      {q.options.map(opt => {
                        const selected = answers[q.id]?.includes(opt.id)
                        return (
                          <div key={opt.id} className={cn(
                            "text-xs px-3 py-1.5 rounded-lg",
                            opt.correct ? "bg-emerald-50 text-emerald-700 font-medium" :
                            selected    ? "bg-red-50 text-red-600" : "text-slate-500"
                          )}>
                            {opt.correct ? "✓" : selected ? "✗" : "○"} {opt.text}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {isOpen && (
                    <p className="text-xs text-slate-400 italic">Open-ended — manual grading required</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {canRetry && (
            <button onClick={retry}
              className="flex items-center gap-2 px-4 py-2 bg-[#1B4F8A] text-white text-sm font-medium rounded-xl hover:bg-[#163f6f] transition-colors">
              <RotateCcw className="h-4 w-4" /> Retry
            </button>
          )}
          {passed && (
            <div className="flex items-center gap-2 text-emerald-600 font-medium text-sm">
              <CheckCircle2 className="h-4 w-4" /> Module marked complete — proceed to next
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Taking phase ───────────────────────────────────────────────
  const answered = questions.filter(q => {
    if (q.type === "mcq_single" || q.type === "mcq_multiple") return (answers[q.id]?.length ?? 0) > 0
    if (q.type === "open_ended") return (openText[q.id]?.trim().length ?? 0) > 0
    return true
  }).length

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className={cn("flex items-center gap-3 p-3 rounded-xl border text-sm", meta.color)}>
        <span className="text-xl">{meta.icon}</span>
        <div>
          <p className="font-semibold">{moduleLabel(moduleType)}</p>
          <p className="text-xs opacity-75">
            {questions.length} question{questions.length !== 1 ? "s" : ""} · Pass: {passMark}%
            {settings?.time_limit_minutes ? ` · ${settings.time_limit_minutes} min limit` : ""}
          </p>
        </div>
        <span className="ml-auto text-xs font-medium bg-white/60 px-2 py-0.5 rounded-full">
          Preview — answers not recorded
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-[#1B4F8A] rounded-full transition-all"
          style={{ width: questions.length > 0 ? `${(answered / questions.length) * 100}%` : "0%" }} />
      </div>

      {/* Questions */}
      {questions.map((q, qi) => (
        <QuestionCard
          key={q.id} question={q} index={qi}
          answers={answers} orderSel={orderSel} pairSel={pairSel} openText={openText}
          onToggleMcq={toggleMcq}
          onOrderSel={setOrderSel}
          onPairSel={setPairSel}
          onOpenText={setOpenText}
        />
      ))}

      {/* Submit bar */}
      <div className="sticky bottom-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            {answered < questions.length
              ? `${questions.length - answered} question${questions.length - answered !== 1 ? "s" : ""} unanswered`
              : "All answered — ready to submit"}
          </p>
          <button onClick={handleSubmit}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1B4F8A] text-white text-sm font-medium rounded-xl hover:bg-[#163f6f] transition-colors shrink-0">
            <Award className="h-4 w-4" /> Submit
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Individual question card ───────────────────────────────────
function QuestionCard({
  question: q, index,
  answers, orderSel, pairSel, openText,
  onToggleMcq, onOrderSel, onPairSel, onOpenText,
}: {
  question:    Question
  index:       number
  answers:     Record<string, string[]>
  orderSel:    Record<string, string[]>
  pairSel:     Record<string, string>
  openText:    Record<string, string>
  onToggleMcq: (qId: string, optId: string, single: boolean) => void
  onOrderSel:  React.Dispatch<React.SetStateAction<Record<string, string[]>>>
  onPairSel:   React.Dispatch<React.SetStateAction<Record<string, string>>>
  onOpenText:  React.Dispatch<React.SetStateAction<Record<string, string>>>
}) {
  const isSingle   = q.type === "mcq_single"
  const isMultiple = q.type === "mcq_multiple"

  // For ordering: track order of items (student rearranges)
  const orderedItems = orderSel[q.id] ?? q.items?.map(i => i.id) ?? []

  function moveItem(from: number, to: number) {
    const newArr = [...orderedItems]
    const [item] = newArr.splice(from, 1)
    newArr.splice(to, 0, item)
    onOrderSel(prev => ({ ...prev, [q.id]: newArr }))
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="w-7 h-7 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1">
          <p className="text-slate-800 font-medium leading-snug">{q.text}</p>
          <p className="text-xs text-slate-400 mt-0.5">{q.points} pt{q.points !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* MCQ single */}
      {isSingle && q.options && (
        <div className="space-y-2 pl-10">
          {q.options.map(opt => {
            const sel = answers[q.id]?.[0] === opt.id
            return (
              <button key={opt.id} onClick={() => onToggleMcq(q.id, opt.id, true)}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-xl border text-sm transition-all",
                  sel ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium"
                      : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                )}>
                <span className={cn(
                  "inline-flex items-center justify-center w-5 h-5 rounded-full mr-2 border text-xs shrink-0",
                  sel ? "bg-[#1B4F8A] border-[#1B4F8A] text-white" : "border-slate-300"
                )}>
                  {sel ? "●" : ""}
                </span>
                {opt.text}
              </button>
            )
          })}
        </div>
      )}

      {/* MCQ multiple */}
      {isMultiple && q.options && (
        <div className="space-y-2 pl-10">
          {q.options.map(opt => {
            const sel = answers[q.id]?.includes(opt.id) ?? false
            return (
              <button key={opt.id} onClick={() => onToggleMcq(q.id, opt.id, false)}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-xl border text-sm transition-all",
                  sel ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium"
                      : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                )}>
                <span className={cn(
                  "inline-flex items-center justify-center w-5 h-5 rounded mr-2 border text-xs shrink-0",
                  sel ? "bg-[#1B4F8A] border-[#1B4F8A] text-white" : "border-slate-300"
                )}>
                  {sel ? "✓" : ""}
                </span>
                {opt.text}
              </button>
            )
          })}
          <p className="text-xs text-slate-400 pl-1">Select all that apply</p>
        </div>
      )}

      {/* Ordering */}
      {q.type === "ordering" && q.items && (
        <div className="space-y-2 pl-10">
          <p className="text-xs text-slate-400 mb-1">Drag or use arrows to reorder</p>
          {orderedItems.map((itemId, oi) => {
            const item = q.items!.find(i => i.id === itemId)
            return (
              <div key={itemId} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                <span className="w-5 h-5 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] text-xs font-bold flex items-center justify-center shrink-0">{oi + 1}</span>
                <span className="text-sm text-slate-700 flex-1">{item?.text}</span>
                <div className="flex flex-col gap-0.5">
                  <button disabled={oi === 0} onClick={() => moveItem(oi, oi - 1)}
                    className="text-slate-400 hover:text-slate-600 disabled:opacity-20 text-xs leading-none">▲</button>
                  <button disabled={oi === orderedItems.length - 1} onClick={() => moveItem(oi, oi + 1)}
                    className="text-slate-400 hover:text-slate-600 disabled:opacity-20 text-xs leading-none">▼</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Match pair */}
      {q.type === "match_pair" && q.pairs && (
        <div className="space-y-3 pl-10">
          <p className="text-xs text-slate-400 mb-1">Match each item with its pair</p>
          {q.pairs.map(p => {
            const sel = pairSel[`${q.id}-${p.id}`] ?? ""
            return (
              <div key={p.id} className="flex items-center gap-3">
                <div className="flex-1 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                  {p.left}
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                <select
                  value={sel}
                  onChange={e => onPairSel(prev => ({ ...prev, [`${q.id}-${p.id}`]: e.target.value }))}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
                >
                  <option value="">Select…</option>
                  {q.pairs!.map(rp => (
                    <option key={rp.id} value={rp.right}>{rp.right}</option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      )}

      {/* Open ended */}
      {q.type === "open_ended" && (
        <div className="pl-10">
          <textarea
            value={openText[q.id] ?? ""}
            onChange={e => onOpenText(prev => ({ ...prev, [q.id]: e.target.value }))}
            rows={4}
            placeholder="Type your answer here…"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 resize-none outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 focus:border-[#1B4F8A]/40"
          />
          <p className="text-xs text-slate-400 mt-1">Open-ended — not auto-graded in preview</p>
        </div>
      )}
    </div>
  )
}

// ── Inline completion check ────────────────────────────────────
function CompletionCheckBlock({ checks, onPass }: { checks: CheckQuestion[]; onPass: () => void }) {
  const [answers,   setAnswers]   = useState<Record<string, number | null>>({})
  const [submitted, setSubmitted] = useState(false)
  const [passed,    setPassed]    = useState(false)

  if (!checks.length) return null

  function submit() {
    const allCorrect = checks.every(q => answers[q.id] === q.correct)
    setPassed(allCorrect)
    setSubmitted(true)
    if (allCorrect) onPass()
  }

  function retry() {
    setAnswers({}); setSubmitted(false); setPassed(false)
  }

  return (
    <div className="mt-8 pt-8 border-t border-dashed border-slate-200 space-y-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-blue-600" />
        <p className="font-semibold text-slate-800 text-sm">Knowledge Check</p>
        <span className="text-xs text-slate-400">Answer all to proceed</span>
      </div>

      {checks.map((q, qi) => (
        <div key={q.id} className="bg-white rounded-xl border border-blue-100 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              {qi + 1}
            </span>
            <p className="text-sm font-medium text-slate-800">{q.question}</p>
          </div>
          <div className="space-y-1.5 pl-7">
            {q.options.map((opt, oi) => {
              const sel = answers[q.id] === oi
              const isCorrect = oi === q.correct
              return (
                <button key={oi} disabled={submitted}
                  onClick={() => setAnswers(prev => ({ ...prev, [q.id]: oi }))}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg border text-xs transition-all",
                    submitted
                      ? isCorrect ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : sel     ? "border-red-300 bg-red-50 text-red-600"
                        :           "border-slate-200 text-slate-500"
                      : sel ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A]"
                            : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  )}>
                  {submitted ? (isCorrect ? "✓ " : sel ? "✗ " : "  ") : (sel ? "● " : "○ ")}
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {!submitted ? (
        <button onClick={submit}
          disabled={Object.keys(answers).length < checks.length}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <CheckCircle2 className="h-4 w-4" /> Submit Check
        </button>
      ) : passed ? (
        <div className="flex items-center gap-2 text-emerald-600 font-medium text-sm">
          <CheckCircle2 className="h-4 w-4" /> All correct! You can continue.
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="h-4 w-4" /> Some answers incorrect — review and retry.
          </div>
          <button onClick={retry}
            className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 text-slate-600 text-xs rounded-lg hover:bg-slate-50 transition-colors">
            <RotateCcw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}
    </div>
  )
}

// ── Module content renderer ────────────────────────────────────
function ModuleContent({
  module, courseId, onComplete,
}: {
  module:     Module
  courseId:   string
  onComplete: () => void
}) {
  const type = module.module_type
  const isQuiz = ["quiz", "progress_test", "test"].includes(type)
  const checks = Array.isArray(module.completion_check) ? module.completion_check as CheckQuestion[] : []
  const questions = Array.isArray(module.questions) ? module.questions : []

  // Final exam: full anti-cheating exam player
  if (type === "final_exam") {
    return (
      <FinalExamPlayer
        questions={questions as ExamQuestion[]}
        settings={module.activity_settings as ExamSettings | null}
        examTitle={module.title || "Final Exam"}
        previewMode={true}
        onPass={onComplete}
      />
    )
  }

  if (isQuiz) {
    return (
      <PreviewQuizPlayer
        questions={questions}
        settings={module.activity_settings}
        moduleType={type}
        onPass={onComplete}
      />
    )
  }

  if (type === "content") {
    const html = (() => {
      try {
        const b = module.content_body as Record<string, unknown>
        return typeof b?.html === "string" ? b.html : ""
      } catch { return "" }
    })()
    return (
      <div className="space-y-6">
        <div className="prose prose-slate max-w-none
          [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold
          [&_p]:text-slate-700 [&_p]:leading-relaxed [&_li]:text-slate-700"
          dangerouslySetInnerHTML={{ __html: html }} />
        {checks.length > 0 && <CompletionCheckBlock checks={checks} onPass={onComplete} />}
        {checks.length === 0 && (
          <div className="pt-4 border-t border-slate-100">
            <button onClick={onComplete}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors">
              <CheckCircle2 className="h-4 w-4" /> Mark Complete
            </button>
          </div>
        )}
      </div>
    )
  }

  if (type === "web") {
    if (!module.web_url) return <EmptyModuleState />
    return (
      <div className="space-y-4">
        <div className="rounded-xl overflow-hidden border border-slate-200" style={{ height: "70vh" }}>
          <iframe src={module.web_url} className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation" />
        </div>
        <button onClick={onComplete}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors">
          <CheckCircle2 className="h-4 w-4" /> Mark Complete
        </button>
      </div>
    )
  }

  if (["video", "presentation", "document"].includes(type)) {
    const file = module.library_file
    if (!file) return <EmptyModuleState />

    const isPptx = file.mime_type.includes("presentationml") || file.mime_type.includes("powerpoint") ||
      file.name?.toLowerCase().endsWith(".pptx") || file.name?.toLowerCase().endsWith(".ppt")
    const isVideo = file.mime_type.startsWith("video/")
    const allowDl = module.download_allowed !== false
    // PDF: suppress toolbar when download not allowed
    // PPTX: route through Office Online viewer
    const viewerSrc = isPptx
      ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(file.public_url)}`
      : allowDl
        ? file.public_url
        : `${file.public_url}#toolbar=0&navpanes=0`

    return (
      <div className="space-y-4">
        {isVideo ? (
          <div className="rounded-xl overflow-hidden bg-slate-900 aspect-video">
            <video
              src={file.public_url}
              controls
              className="w-full h-full"
              controlsList={allowDl ? undefined : "nodownload"}
              onContextMenu={allowDl ? undefined : e => e.preventDefault()}
            />
          </div>
        ) : (
          <div
            className="rounded-xl overflow-hidden border border-slate-200"
            style={{ height: "70vh" }}
            onContextMenu={allowDl ? undefined : e => e.preventDefault()}
          >
            <iframe src={viewerSrc} className="w-full h-full border-0" title={file.name}
              allowFullScreen />
          </div>
        )}
        <button onClick={onComplete}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors">
          <CheckCircle2 className="h-4 w-4" /> Mark Complete
        </button>
      </div>
    )
  }

  if (type === "package") {
    return <PackagePreview moduleId={module.id} courseId={courseId} />
  }

  if (type === "assignment") {
    return (
      <div className="space-y-6">
        {module.assignment_brief_html ? (
          <div className="prose prose-slate max-w-none
            [&_h2]:text-xl [&_h2]:font-semibold [&_p]:text-slate-700 [&_li]:text-slate-700"
            dangerouslySetInnerHTML={{ __html: module.assignment_brief_html }} />
        ) : <EmptyModuleState />}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Assignment submission is not available in preview mode.
        </div>
      </div>
    )
  }

  return <EmptyModuleState />
}

// ── Main preview page ──────────────────────────────────────────
export default function CoursePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()

  const [course,       setCourse]       = useState<Course | null>(null)
  const [modules,      setModules]      = useState<Module[]>([])
  const [active,       setActive]       = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  // Reset the quiz/content key when switching modules
  const [moduleKey,    setModuleKey]    = useState(0)

  useEffect(() => {
    const startModuleId = searchParams.get("module")
    async function load() {
      const [cRes, mRes] = await Promise.all([
        fetch(`/api/lms/courses`),
        fetch(`/api/lms/modules?course_id=${courseId}`),
      ])
      const cData = await cRes.json()
      const mData = await mRes.json()
      const allCourses = Array.isArray(cData) ? cData : []
      setCourse(allCourses.find((c: Course) => c.id === courseId) ?? null)
      const mods = Array.isArray(mData) ? mData : []
      setModules(mods)
      if (mods.length) {
        const initial = startModuleId && mods.find((m: Module) => m.id === startModuleId)
          ? startModuleId
          : mods[0].id
        setActive(initial)
      }
      setLoading(false)
    }
    load()
  }, [courseId, searchParams])

  const markCompleted = useCallback((moduleId: string) => {
    setCompletedIds(prev => new Set([...prev, moduleId]))
  }, [])

  function isLocked(mod: Module, index: number): boolean {
    if (index === 0) return false
    // Final exam is locked until all preceding mandatory modules are done
    if (mod.module_type === "final_exam") {
      const prevMandatory = modules.slice(0, index).filter(m => m.is_mandatory)
      return prevMandatory.length > 0 && prevMandatory.some(m => !completedIds.has(m.id))
    }
    if (!mod.lock_until_previous) return false
    const prev = modules[index - 1]
    return !completedIds.has(prev.id)
  }

  function navigateTo(modId: string) {
    setActive(modId)
    setModuleKey(k => k + 1)
  }

  const activeModule = modules.find(m => m.id === active) ?? null
  const activeIndex  = modules.findIndex(m => m.id === active)
  const prevModule   = activeIndex > 0 ? modules[activeIndex - 1] : null
  const nextModule   = activeIndex < modules.length - 1 ? modules[activeIndex + 1] : null

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1B4F8A]" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-white flex flex-col z-50">

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 bg-white shrink-0">
        <button onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <div className="h-5 w-px bg-slate-200" />
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800 truncate">{course?.title}</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">Preview</span>
        </div>
        <div className="flex-1" />
        <span className="text-xs text-slate-400 hidden sm:block">Student view — answers not saved</span>
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-72 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Course Modules</p>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {modules.map((mod, i) => {
              const Icon      = moduleIcon(mod.module_type)
              const isActive  = mod.id === active
              const locked    = isLocked(mod, i)
              const completed = completedIds.has(mod.id)
              return (
                <button key={mod.id}
                  disabled={locked}
                  onClick={() => !locked && navigateTo(mod.id)}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors",
                    locked  ? "opacity-50 cursor-not-allowed" :
                    isActive ? "bg-[#1B4F8A] text-white" :
                    "text-slate-600 hover:bg-slate-100"
                  )}>
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold",
                    isActive  ? "bg-white/20 text-white" :
                    completed ? "bg-emerald-100 text-emerald-600" :
                    "bg-slate-200 text-slate-500"
                  )}>
                    {completed ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium leading-snug truncate",
                      isActive ? "text-white" : "text-slate-800")}>
                      {mod.title || "Untitled"}
                    </p>
                    <div className={cn("flex items-center gap-1.5 mt-0.5",
                      isActive ? "text-white/70" : "text-slate-400")}>
                      <Icon className="h-3 w-3 shrink-0" />
                      <span className="text-[11px]">{moduleLabel(mod.module_type)}</span>
                      {mod.estimated_duration && (
                        <span className="text-[11px]">· {mod.estimated_duration} min</span>
                      )}
                    </div>
                  </div>
                  {locked ? (
                    <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-1.5" />
                  ) : completed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-1.5" />
                  ) : (
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 shrink-0 mt-2",
                      isActive ? "border-white/40" : "border-slate-300"
                    )} />
                  )}
                </button>
              )
            })}
          </div>
        </aside>

        {/* Content area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeModule ? (
            <>
              {/* Module header */}
              <div className="px-8 py-5 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-[#1B4F8A] uppercase tracking-wider">
                    {moduleLabel(activeModule.module_type)}
                  </span>
                  {activeModule.estimated_duration && (
                    <span className="text-xs text-slate-400">· {activeModule.estimated_duration} min</span>
                  )}
                  {activeModule.is_mandatory && (
                    <span className="text-xs font-semibold bg-red-50 text-red-600 px-2 py-0.5 rounded-full">Required</span>
                  )}
                  {completedIds.has(activeModule.id) && (
                    <span className="text-xs font-semibold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Completed
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-slate-900">{activeModule.title || "Untitled Module"}</h1>
              </div>

              {/* Module content */}
              <div className="flex-1 overflow-y-auto px-8 py-6">
                <div className="max-w-3xl mx-auto">
                  <ModuleContent
                    key={`${activeModule.id}-${moduleKey}`}
                    module={activeModule}
                    courseId={courseId}
                    onComplete={() => markCompleted(activeModule.id)}
                  />
                </div>
              </div>

              {/* Prev / Next nav */}
              <div className="flex items-center justify-between px-8 py-4 border-t border-slate-100 shrink-0 bg-white">
                {prevModule ? (
                  <button onClick={() => navigateTo(prevModule.id)}
                    className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors">
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:block truncate max-w-[200px]">{prevModule.title}</span>
                  </button>
                ) : <div />}

                <span className="text-xs text-slate-400 tabular-nums">
                  {activeIndex + 1} / {modules.length}
                </span>

                {nextModule ? (
                  (() => {
                    const nextLocked = isLocked(nextModule, activeIndex + 1)
                    return nextLocked ? (
                      <div className="flex items-center gap-2 text-sm text-slate-400 cursor-not-allowed">
                        <span className="hidden sm:block truncate max-w-[200px]">{nextModule.title}</span>
                        <Lock className="h-4 w-4" />
                      </div>
                    ) : (
                      <button onClick={() => navigateTo(nextModule.id)}
                        className="flex items-center gap-2 text-sm font-medium text-[#1B4F8A] hover:text-[#163f6f] transition-colors">
                        <span className="hidden sm:block truncate max-w-[200px]">{nextModule.title}</span>
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    )
                  })()
                ) : (
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="hidden sm:block">End of course</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <p className="text-sm">Select a module to preview</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
