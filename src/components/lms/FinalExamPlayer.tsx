"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import {
  Clock, AlertTriangle, ChevronLeft, ChevronRight,
  Shield, CheckCircle2, XCircle, Maximize2, Send, RotateCcw, ArrowLeft,
} from "lucide-react"
import { cn } from "@/lib/utils"
import confetti from "canvas-confetti"

// ── Types (ActivityEditor format) ─────────────────────────────
interface MCQOption { id: string; text: string; correct: boolean }
interface OrderItem  { id: string; text: string }
interface MatchPair  { id: string; left: string; right: string }

export interface ExamQuestion {
  id: string
  type: "mcq_single" | "mcq_multiple" | "ordering" | "match_pair" | "open_ended"
  text: string; points: number; explanation?: string
  options?: MCQOption[]; items?: OrderItem[]; pairs?: MatchPair[]
  rubric?: string; max_words?: number
}

export interface ExamSettings {
  pass_mark: number; time_limit_minutes: number | null
  max_attempts: number; shuffle_questions: boolean; shuffle_options: boolean
  show_results: boolean; show_correct_answers: boolean
}

type Phase = "intro" | "running" | "submitted"
type AnswerMap = Record<string, string | string[] | Record<string, string>>

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

// ── Question renderers ────────────────────────────────────────

function MCQSingle({ q, value, onChange }: { q: ExamQuestion; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2 mt-4">
      {(q.options ?? []).map(opt => {
        const sel = value === opt.id
        return (
          <button key={opt.id} onClick={() => onChange(opt.id)}
            className={cn(
              "w-full text-left px-4 py-3 rounded-xl border text-sm transition-all",
              sel ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            )}>
            <span className={cn(
              "inline-flex items-center justify-center w-5 h-5 rounded-full mr-2 border text-xs shrink-0",
              sel ? "bg-[#1B4F8A] border-[#1B4F8A] text-white" : "border-slate-300"
            )}>{sel ? "●" : ""}</span>
            {opt.text}
          </button>
        )
      })}
    </div>
  )
}

function MCQMultiple({ q, value, onChange }: { q: ExamQuestion; value?: string[]; onChange: (v: string[]) => void }) {
  const sel = value ?? []
  function toggle(id: string) { onChange(sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]) }
  return (
    <div className="space-y-2 mt-4">
      {(q.options ?? []).map(opt => {
        const isSelected = sel.includes(opt.id)
        return (
          <button key={opt.id} onClick={() => toggle(opt.id)}
            className={cn(
              "w-full text-left px-4 py-3 rounded-xl border text-sm transition-all",
              isSelected ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium"
                         : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            )}>
            <span className={cn(
              "inline-flex items-center justify-center w-5 h-5 rounded mr-2 border text-xs shrink-0",
              isSelected ? "bg-[#1B4F8A] border-[#1B4F8A] text-white" : "border-slate-300"
            )}>{isSelected ? "✓" : ""}</span>
            {opt.text}
          </button>
        )
      })}
      <p className="text-xs text-slate-400 mt-1">Select all that apply</p>
    </div>
  )
}

function OrderingQ({ q, value, onChange }: { q: ExamQuestion; value?: string[]; onChange: (v: string[]) => void }) {
  const items = q.items ?? []
  const order = value ?? items.map(i => i.id)
  function move(from: number, to: number) {
    const arr = [...order]; const [item] = arr.splice(from, 1); arr.splice(to, 0, item); onChange(arr)
  }
  return (
    <div className="space-y-2 mt-4">
      <p className="text-xs text-slate-400">Arrange in the correct order</p>
      {order.map((id, idx) => {
        const item = items.find(i => i.id === id)
        return (
          <div key={id} className="flex items-center gap-2 px-3 py-2.5 bg-white rounded-xl border border-slate-200">
            <span className="w-6 h-6 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] text-xs font-bold flex items-center justify-center shrink-0">
              {idx + 1}
            </span>
            <span className="flex-1 text-sm text-slate-700">{item?.text}</span>
            <div className="flex flex-col gap-0.5">
              <button disabled={idx === 0} onClick={() => move(idx, idx - 1)}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-20 text-xs leading-none">▲</button>
              <button disabled={idx === order.length - 1} onClick={() => move(idx, idx + 1)}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-20 text-xs leading-none">▼</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MatchPairQ({ q, value, onChange }: { q: ExamQuestion; value?: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const pairs = q.pairs ?? []
  const sel   = value ?? {}
  const [activePairId, setActivePairId] = useState<string | null>(null)
  // Shuffle right column independently so it doesn't align with left
  const [rightOrder] = useState<string[]>(() => shuffleArray(pairs.map(p => p.right)))

  const usedRights = new Set(Object.values(sel))

  function clickLeft(pairId: string) {
    if (activePairId === pairId) {
      setActivePairId(null)
    } else {
      if (sel[pairId]) {
        const next = { ...sel }
        delete next[pairId]
        onChange(next)
      }
      setActivePairId(pairId)
    }
  }

  function clickRight(right: string) {
    if (!activePairId) return
    onChange({ ...sel, [activePairId]: right })
    setActivePairId(null)
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-slate-400">
        {activePairId
          ? "Now click the matching item on the right"
          : "Click a left item to select it, then click its match"}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {/* Left column */}
        <div className="space-y-2">
          {pairs.map(p => {
            const isActive  = activePairId === p.id
            const isMatched = !!sel[p.id]
            return (
              <button key={p.id} onClick={() => clickLeft(p.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-xl border text-sm font-medium transition-all",
                  isActive  ? "bg-[#1B4F8A] text-white border-[#1B4F8A] shadow-sm"
                  : isMatched ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                  :             "bg-blue-50 border-blue-200 text-blue-800 hover:border-blue-400"
                )}>
                {p.left}
                {isMatched && !isActive && (
                  <span className="block text-xs font-normal opacity-60 mt-0.5 truncate">→ {sel[p.id]}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Right column — independently shuffled */}
        <div className="space-y-2">
          {rightOrder.map(right => {
            const isUsed = usedRights.has(right)
            if (isUsed) {
              return (
                <div key={right}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50 text-sm text-slate-300 line-through select-none">
                  {right}
                </div>
              )
            }
            return (
              <button key={right} onClick={() => clickRight(right)}
                disabled={!activePairId}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all",
                  activePairId
                    ? "border-[#1B4F8A]/40 bg-[#1B4F8A]/5 text-slate-700 hover:bg-[#1B4F8A]/10 hover:border-[#1B4F8A] cursor-pointer"
                    : "border-slate-200 bg-white text-slate-500 opacity-50 cursor-not-allowed"
                )}>
                {right}
              </button>
            )
          })}
        </div>
      </div>

      {/* Matched pairs summary */}
      {Object.keys(sel).length > 0 && (
        <div className="pt-2 border-t border-slate-100 space-y-1.5">
          <p className="text-xs text-slate-400">Your matches:</p>
          {Object.entries(sel).map(([pairId, right]) => {
            const pair = pairs.find(p => p.id === pairId)
            return (
              <div key={pairId} className="flex items-center gap-2 text-xs">
                <span className="px-2 py-1 bg-blue-50 rounded-lg text-blue-700 font-medium">{pair?.left}</span>
                <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
                <span className="px-2 py-1 bg-emerald-50 rounded-lg text-emerald-700 font-medium">{right}</span>
                <button onClick={() => {
                  const next = { ...sel }
                  delete next[pairId]
                  onChange(next)
                  setActivePairId(pairId)
                }} className="ml-auto text-slate-300 hover:text-red-400 transition-colors text-base leading-none">✕</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function OpenEndedQ({ q, value, onChange }: { q: ExamQuestion; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-4">
      <textarea value={value ?? ""} onChange={e => onChange(e.target.value)} rows={6}
        placeholder="Write your answer here…"
        style={{ userSelect: "text", WebkitUserSelect: "text" } as React.CSSProperties}
        className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white resize-none focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/20" />
      <p className="text-xs text-slate-400 mt-1">Expert-scored · {(value ?? "").length} chars</p>
    </div>
  )
}

// ── Fisher-Yates shuffle ──────────────────────────────────────
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Scoring ────────────────────────────────────────────────────
function score(questions: ExamQuestion[], answers: AnswerMap) {
  let total = 0; let earned = 0
  const details: Record<string, { earned: number; max: number }> = {}
  for (const q of questions) {
    total += q.points
    let pts = 0
    const ans = answers[q.id]
    if (q.type === "mcq_single" && q.options) {
      const correctId = q.options.find(o => o.correct)?.id
      const given = Array.isArray(ans) ? ans[0] : (ans as string)
      if (correctId && given === correctId) pts = q.points
    } else if (q.type === "mcq_multiple" && q.options) {
      const corrIds = q.options.filter(o => o.correct).map(o => o.id)
      const sel = (Array.isArray(ans) ? ans : []) as string[]
      if (corrIds.length > 0 && sel.length === corrIds.length && corrIds.every(id => sel.includes(id))) pts = q.points
    } else if (q.type === "ordering" && q.items) {
      const correct = q.items.map(i => i.id)
      const given = (Array.isArray(ans) ? ans : []) as string[]
      const ok = correct.filter((id, i) => id === given[i]).length
      pts = given.length > 0 ? Math.round((ok / correct.length) * q.points) : 0
    } else if (q.type === "match_pair" && q.pairs) {
      const given = (typeof ans === "object" && !Array.isArray(ans) ? ans : {}) as Record<string, string>
      const ok = q.pairs.filter(p => given[p.id] === p.right).length
      pts = Math.round((ok / q.pairs.length) * q.points)
    }
    earned += pts
    details[q.id] = { earned: pts, max: q.points }
  }
  return { score: earned, total, details, pct: total > 0 ? Math.round(earned / total * 100) : 0 }
}

type SubmitPayload = {
  score: number; maxScore: number; pct: number; passed: boolean
  answers: AnswerMap; timeSpentS: number
  securityEvents: { tabs: number; fs: number; rightClicks: number; copyAttempts: number }
}

// ── Main component ─────────────────────────────────────────────
export default function FinalExamPlayer({
  questions, settings, examTitle,
  previewMode = false, onPass, onSubmit, attemptNo = 1, courseUrl,
}: {
  questions:    ExamQuestion[]
  settings:     ExamSettings | null
  examTitle:    string
  previewMode?: boolean
  onPass?:      () => void
  onSubmit?:    (data: SubmitPayload) => Promise<{ score: number; max_score: number; pct: number; passed: boolean; ai_scores?: Record<string, { score: number; justification: string }> } | null | void>
  attemptNo?:   number
  courseUrl?:   string
}) {
  const passMark    = settings?.pass_mark ?? 70
  const timeLimitMin = settings?.time_limit_minutes ?? null
  const maxAttempts = settings?.max_attempts ?? 3
  const showResults = settings?.show_results         ?? true
  const showCorrect = settings?.show_correct_answers ?? false

  // Shuffle once on mount — stable across re-renders
  const [activeQuestions] = useState<ExamQuestion[]>(() => {
    let qs = settings?.shuffle_questions ? shuffleArray(questions) : [...questions]
    if (settings?.shuffle_options) {
      qs = qs.map(q => {
        if ((q.type === "mcq_single" || q.type === "mcq_multiple") && q.options) {
          return { ...q, options: shuffleArray(q.options) }
        }
        if (q.type === "ordering" && q.items) {
          return { ...q, items: shuffleArray(q.items) }
        }
        if (q.type === "match_pair" && q.pairs) {
          return { ...q, pairs: shuffleArray(q.pairs) }
        }
        return q
      })
    }
    return qs
  })

  const [phase,   setPhase]   = useState<Phase>("intro")
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [tabWarn, setTabWarn] = useState(false)
  const [fsWarn,  setFsWarn]  = useState(false)
  const [attempt, setAttempt] = useState(attemptNo)
  const [result,  setResult]  = useState<ReturnType<typeof score> & { passed: boolean } | null>(null)
  const [aiScoring, setAiScoring] = useState(false)
  const [aiScores, setAiScores] = useState<Record<string, { score: number; justification: string }>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const tabLeft   = useRef<number | null>(null)
  const done      = useRef(false)
  const secRef    = useRef({ tabs: 0, fs: 0, rightClicks: 0, copyAttempts: 0 })
  const startTime = useRef<number | null>(null)

  // ── Confetti on pass ──────────────────────────────────────
  useEffect(() => {
    if (phase !== "submitted" || !result?.passed) return
    const fire = (particleRatio: number, opts: confetti.Options) =>
      confetti({ origin: { y: 0.6 }, ...opts, particleCount: Math.floor(200 * particleRatio) })
    fire(0.25, { spread: 26, startVelocity: 55 })
    fire(0.2,  { spread: 60 })
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 })
    fire(0.1,  { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 })
    fire(0.1,  { spread: 120, startVelocity: 45 })
  }, [phase, result?.passed])

  // ── Anti-cheating (running phase only) ────────────────────
  useEffect(() => {
    if (phase !== "running") return

    function onVis() {
      if (document.visibilityState === "hidden") {
        tabLeft.current = Date.now()
        secRef.current.tabs++
      } else if (tabLeft.current) {
        tabLeft.current = null
        setTabWarn(true)
        setTimeout(() => setTabWarn(false), 4000)
      }
    }
    function onFs() {
      if (!document.fullscreenElement) { secRef.current.fs++; setFsWarn(true) }
      else setFsWarn(false)
    }
    function onCtx(e: MouseEvent) { e.preventDefault(); secRef.current.rightClicks++ }
    function onCopy(e: ClipboardEvent) { e.preventDefault(); secRef.current.copyAttempts++ }
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && ["c","x","v","a"].includes(e.key.toLowerCase())) {
        e.preventDefault()
        secRef.current.copyAttempts++
      }
    }

    document.addEventListener("visibilitychange", onVis)
    document.addEventListener("fullscreenchange", onFs)
    document.addEventListener("contextmenu", onCtx)
    document.addEventListener("copy", onCopy)
    document.addEventListener("cut", onCopy)
    document.addEventListener("paste", onCopy)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("visibilitychange", onVis)
      document.removeEventListener("fullscreenchange", onFs)
      document.removeEventListener("contextmenu", onCtx)
      document.removeEventListener("copy", onCopy)
      document.removeEventListener("cut", onCopy)
      document.removeEventListener("paste", onCopy)
      document.removeEventListener("keydown", onKey)
    }
  }, [phase])

  // ── Timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running" || timeLeft === null || timeLeft <= 0) return
    const t = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) { clearInterval(t); submit(); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft !== null])

  function start() {
    document.documentElement.requestFullscreen?.().catch(() => {})
    if (timeLimitMin) setTimeLeft(timeLimitMin * 60)
    startTime.current = Date.now()
    secRef.current = { tabs: 0, fs: 0, rightClicks: 0, copyAttempts: 0 }
    done.current = false
    setPhase("running")
  }

  const submit = useCallback(async () => {
    if (done.current) return
    done.current = true
    const r = score(activeQuestions, answers)
    const passed = r.pct >= passMark
    setResult({ ...r, passed })
    setPhase("submitted")
    document.exitFullscreen?.().catch(() => {})
    if (!previewMode && onSubmit) {
      setAiScoring(true)
      const timeSpentS = startTime.current ? Math.round((Date.now() - startTime.current) / 1000) : 0
      try {
        const serverResult = await onSubmit({
          score:          r.score,
          maxScore:       r.total,
          pct:            r.pct,
          passed,
          answers,
          timeSpentS,
          securityEvents: { tabs: secRef.current.tabs, fs: secRef.current.fs, rightClicks: secRef.current.rightClicks, copyAttempts: secRef.current.copyAttempts },
        })
        if (serverResult && serverResult.ai_scores) {
          setAiScores(serverResult.ai_scores)
          // Overwrite displayed result with server-corrected values
          setResult({ ...r, score: serverResult.score, total: serverResult.max_score, pct: serverResult.pct, passed: serverResult.passed })
          if (serverResult.passed) onPass?.()
        } else {
          if (passed) onPass?.()
        }
      } catch { if (passed) onPass?.() } finally { setAiScoring(false) }
    } else {
      if (passed) onPass?.()
    }
  }, [answers, activeQuestions, passMark, onPass, onSubmit, previewMode])

  function retry() {
    setAnswers({}); setCurrent(0); setTimeLeft(null); setResult(null); setAiScores({})
    setPhase("intro"); done.current = false; setAttempt(a => a + 1)
  }

  const q = activeQuestions[current]
  const isLast = current === activeQuestions.length - 1
  const answeredCount = activeQuestions.filter(q => answers[q.id] !== undefined).length
  const timerWarn = timeLeft !== null && timeLeft < 300

  // ── Intro ──────────────────────────────────────────────────
  if (phase === "intro") {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏆</span>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{examTitle}</h2>
              <p className="text-sm text-amber-700 font-medium">Final Examination</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            {[
              { label: "Questions", value: String(activeQuestions.length) },
              { label: "Pass Mark",  value: `${passMark}%` },
              ...(timeLimitMin ? [{ label: "Time Limit", value: `${timeLimitMin} min` }] : []),
              { label: "Attempts",   value: maxAttempts >= 99 ? "Unlimited" : String(maxAttempts) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl border border-amber-200 p-3 text-center">
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-0.5">{label}</p>
                <p className="font-bold text-slate-900 text-xl">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-slate-700">
            <Shield className="h-4 w-4 text-[#1B4F8A]" /> Exam Rules
          </div>
          <ul className="space-y-1.5 text-sm text-slate-600">
            {[
              "Exam runs in fullscreen — exiting is recorded",
              "Tab switching is monitored and logged",
              "Copy, paste, and right-click are disabled",
              "Answers are submitted automatically when time runs out",
              "Do not refresh or close this tab during the exam",
            ].map((rule, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[#1B4F8A] font-bold shrink-0 mt-0.5">›</span>{rule}
              </li>
            ))}
          </ul>
        </div>

        {previewMode && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Preview mode — security events are shown but not saved to the database.
          </p>
        )}
        {attempt > 1 && (
          <p className="text-center text-xs text-slate-400">
            Attempt {attempt}{maxAttempts < 99 ? ` of ${maxAttempts}` : ""}
          </p>
        )}

        <button onClick={start}
          className="w-full py-3.5 bg-[#1B4F8A] text-white font-bold rounded-xl text-sm hover:bg-[#163f6f] transition-colors flex items-center justify-center gap-2">
          <Maximize2 className="h-4 w-4" /> Begin Exam
        </button>
      </div>
    )
  }

  // ── Results ────────────────────────────────────────────────
  if (phase === "submitted" && result) {
    const canRetry = !result.passed && attempt < maxAttempts
    return (
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Celebration widget */}
        {result.passed && showResults && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1B4F8A] to-[#2563EB] p-6 text-white text-center shadow-lg">
            <div className="absolute inset-0 opacity-10 pointer-events-none select-none text-[120px] leading-none flex items-center justify-center">🏆</div>
            <p className="text-4xl mb-2">🎉</p>
            <h2 className="text-2xl font-black mb-1">Congratulations!</h2>
            <p className="text-blue-100 text-sm">You passed the final exam and completed this course.</p>
            <div className="mt-4 inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-1.5 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4" /> Course Complete
            </div>
          </div>
        )}

        <div className={cn(
          "rounded-2xl border p-8 text-center",
          aiScoring                                              ? "bg-slate-50 border-slate-200"
            : !showResults                                       ? "bg-slate-50 border-slate-200"
            : result.passed                                      ? "bg-emerald-50 border-emerald-200"
            :                                                      "bg-red-50 border-red-200"
        )}>
          {aiScoring ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="h-12 w-12 rounded-full border-4 border-[#1B4F8A]/30 border-t-[#1B4F8A] animate-spin" />
              <p className="text-slate-600 font-medium text-sm">AI is grading open-ended questions…</p>
              <p className="text-slate-400 text-xs">This takes a few seconds</p>
            </div>
          ) : showResults ? (
            <>
              {result.passed
                ? <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-3" />
                : <XCircle     className="h-16 w-16 text-red-400 mx-auto mb-3" />}
              <p className={cn("text-5xl font-black mb-2", result.passed ? "text-emerald-700" : "text-red-600")}>
                {result.pct}%
              </p>
              <p className={cn("text-xl font-bold mb-1", result.passed ? "text-emerald-700" : "text-red-600")}>
                {result.passed ? "Passed!" : "Not Passed"}
              </p>
              <p className="text-sm text-slate-600">
                Score: {result.score} / {result.total} pts · Pass mark: {passMark}%
              </p>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-16 w-16 text-slate-400 mx-auto mb-3" />
              <p className="text-xl font-bold mb-1 text-slate-700">Submitted</p>
              <p className="text-sm text-slate-500">Your exam has been submitted successfully.</p>
            </>
          )}
          {previewMode && (secRef.current.tabs > 0 || secRef.current.fs > 0) && (
            <p className="mt-3 text-xs text-slate-400 border-t border-slate-200 pt-3">
              Security events: {secRef.current.tabs} tab switch{secRef.current.tabs !== 1 ? "es" : ""}
              {secRef.current.fs > 0 && `, ${secRef.current.fs} fullscreen exit${secRef.current.fs !== 1 ? "s" : ""}`}
            </p>
          )}
        </div>

        {/* Back to Course — hard navigation to bypass Next.js router cache */}
        {courseUrl && !previewMode && (
          <a
            href={courseUrl}
            className={cn(
              "flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition-colors",
              result.passed
                ? "bg-[#1B4F8A] text-white hover:bg-[#163f6e]"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Course
          </a>
        )}

        {showCorrect && (
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-700 text-sm">Answer Review</h4>
            {activeQuestions.map((q, qi) => {
              const d        = result.details[q.id]
              const aiResult = aiScores[q.id]
              const earned   = q.type === "open_ended" && aiResult ? aiResult.score : (d?.earned ?? 0)
              const max      = d?.max ?? q.points
              const correct  = earned === max
              return (
                <div key={q.id} className={cn(
                  "bg-white rounded-xl border p-4 space-y-2",
                  correct ? "border-emerald-200" : "border-red-200"
                )}>
                  <div className="flex items-start gap-2">
                    <span className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                      correct ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                    )}>{qi + 1}</span>
                    <p className="flex-1 text-sm font-medium text-slate-800">{q.text}</p>
                    <span className="text-xs text-slate-400 shrink-0">{earned}/{max}pt</span>
                  </div>
                  {(q.type === "mcq_single" || q.type === "mcq_multiple") && q.options && (
                    <div className="space-y-1 ml-8">
                      {q.options.map(opt => {
                        const ans = answers[q.id]
                        const selected = Array.isArray(ans) ? ans.includes(opt.id) : ans === opt.id
                        return (
                          <div key={opt.id} className={cn(
                            "text-xs px-2 py-1 rounded",
                            opt.correct ? "bg-emerald-50 text-emerald-700 font-medium" :
                            selected    ? "bg-red-50 text-red-600" : "text-slate-400"
                          )}>
                            {opt.correct ? "✓ " : selected ? "✗ " : "○ "}{opt.text}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {q.type === "ordering" && q.items && (
                    <div className="ml-8 space-y-1">
                      <p className="text-xs text-slate-400 mb-1">Correct order:</p>
                      {q.items.map((item, idx) => {
                        const given   = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : []
                        const givenId = given[idx]
                        const correct = givenId === item.id
                        return (
                          <div key={item.id} className={cn(
                            "text-xs px-2 py-1 rounded flex items-center gap-2",
                            correct ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                          )}>
                            <span className="font-bold w-4">{idx + 1}.</span>
                            <span>{item.text}</span>
                            {!correct && givenId && (
                              <span className="ml-auto text-slate-400 line-through">
                                {q.items?.find(i => i.id === givenId)?.text}
                              </span>
                            )}
                            <span className="ml-auto">{correct ? "✓" : "✗"}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {q.type === "match_pair" && q.pairs && (
                    <div className="ml-8 space-y-1">
                      <p className="text-xs text-slate-400 mb-1">Correct matches:</p>
                      {q.pairs.map(pair => {
                        const givenMap = (answers[q.id] as Record<string, string>) ?? {}
                        const given    = givenMap[pair.id]
                        const correct  = given === pair.right
                        return (
                          <div key={pair.id} className={cn(
                            "text-xs px-2 py-1 rounded flex items-center gap-2",
                            correct ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                          )}>
                            <span className="font-medium">{pair.left}</span>
                            <span className="text-slate-300">→</span>
                            <span>{pair.right}</span>
                            {!correct && (
                              <span className="ml-auto text-slate-400">
                                your answer: <span className="line-through">{given ?? "—"}</span>
                              </span>
                            )}
                            <span className="ml-auto">{correct ? "✓" : "✗"}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {q.type === "open_ended" && (
                    <div className="ml-8 space-y-1.5">
                      <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 whitespace-pre-wrap">
                        {(answers[q.id] as string) || <span className="italic text-slate-400">No answer provided</span>}
                      </div>
                      {aiScores[q.id] ? (
                        <div className={cn("text-xs px-3 py-2 rounded-lg border",
                          aiScores[q.id].score >= q.points * 0.5
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-red-200 bg-red-50 text-red-800"
                        )}>
                          <span className="font-semibold">AI Score: {aiScores[q.id].score}/{q.points}</span>{" — "}{aiScores[q.id].justification}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No open-ended AI feedback available.</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {canRetry && (
          <button onClick={retry}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1B4F8A] text-white text-sm font-medium rounded-xl hover:bg-[#163f6f] transition-colors">
            <RotateCcw className="h-4 w-4" />
            Retry (Attempt {attempt + 1}{maxAttempts < 99 ? `/${maxAttempts}` : ""})
          </button>
        )}
      </div>
    )
  }

  // ── Running exam ───────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-slate-50 flex flex-col z-50"
      style={{ userSelect: "none", WebkitUserSelect: "none" } as React.CSSProperties}
    >
      {/* Security banners */}
      {tabWarn && (
        <div className="bg-amber-500 text-white text-sm font-medium text-center py-2 px-4 flex items-center justify-center gap-2 shrink-0">
          <AlertTriangle className="h-4 w-4" /> Warning: Tab switching has been recorded.
        </div>
      )}
      {fsWarn && (
        <div className="bg-red-600 text-white text-sm font-medium text-center py-2 px-4 flex items-center justify-center gap-2 shrink-0">
          <AlertTriangle className="h-4 w-4" />
          You exited fullscreen — this has been recorded.
          <button onClick={() => document.documentElement.requestFullscreen?.()} className="underline ml-2 font-bold">
            Return to fullscreen
          </button>
        </div>
      )}

      {/* Header */}
      <header className="bg-[#1B4F8A] text-white shadow-lg shrink-0">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-white/60">Final Exam</p>
            <p className="text-sm font-semibold truncate max-w-[300px]">{examTitle}</p>
          </div>
          {timeLeft !== null && (
            <div className={cn(
              "flex items-center gap-1.5 font-mono font-bold text-lg",
              timerWarn ? "text-red-300" : "text-white"
            )}>
              <Clock className="h-4 w-4" />
              {fmt(timeLeft)}
            </div>
          )}
        </div>
        <div className="h-1 bg-white/20">
          <div className="h-1 bg-white transition-all"
            style={{ width: `${((current + 1) / activeQuestions.length) * 100}%` }} />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500 font-medium">Question {current + 1} of {activeQuestions.length}</span>
            <span className="text-xs bg-white border border-slate-200 px-2 py-0.5 rounded-full text-slate-500">
              {q?.points} pt{q?.points !== 1 ? "s" : ""}
            </span>
          </div>

          {q && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <p className="font-semibold text-slate-900 text-base leading-relaxed">{q.text}</p>
              {q.type === "mcq_single"   && <MCQSingle   q={q} value={answers[q.id] as string | undefined}                    onChange={v => setAnswers(p => ({ ...p, [q.id]: v }))} />}
              {q.type === "mcq_multiple" && <MCQMultiple q={q} value={answers[q.id] as string[] | undefined}                  onChange={v => setAnswers(p => ({ ...p, [q.id]: v }))} />}
              {q.type === "ordering"     && <OrderingQ   q={q} value={answers[q.id] as string[] | undefined}                  onChange={v => setAnswers(p => ({ ...p, [q.id]: v }))} />}
              {q.type === "match_pair"   && <MatchPairQ  q={q} value={answers[q.id] as Record<string, string> | undefined}    onChange={v => setAnswers(p => ({ ...p, [q.id]: v }))} />}
              {q.type === "open_ended"   && <OpenEndedQ  q={q} value={answers[q.id] as string | undefined}                    onChange={v => setAnswers(p => ({ ...p, [q.id]: v }))} />}
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrent(i => Math.max(0, i - 1))} disabled={current === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <span className="text-xs text-slate-400">{answeredCount}/{activeQuestions.length} answered</span>
            {isLast ? (
              <button onClick={() => setConfirmOpen(true)}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors">
                <Send className="h-4 w-4" /> Submit Exam
              </button>
            ) : (
              <button onClick={() => setCurrent(i => Math.min(activeQuestions.length - 1, i + 1))}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1B4F8A] text-white text-sm hover:bg-[#163f6f] transition-colors">
                Next <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Question dot grid */}
          <div className="flex flex-wrap gap-1.5 justify-center pt-2 pb-4">
            {activeQuestions.map((qd, i) => (
              <button key={i} onClick={() => setCurrent(i)}
                className={cn(
                  "w-7 h-7 rounded-full text-xs font-medium transition-colors",
                  i === current           ? "bg-[#1B4F8A] text-white" :
                  answers[qd.id] !== undefined ? "bg-emerald-100 text-emerald-700 border border-emerald-300" :
                  "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
                )}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* Submit confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-900 text-lg">Submit Exam?</h3>
            <p className="text-sm text-slate-600">
              {answeredCount < activeQuestions.length
                ? `You have ${activeQuestions.length - answeredCount} unanswered question${activeQuestions.length - answeredCount !== 1 ? "s" : ""}. You cannot change answers after submission.`
                : "All questions answered. This cannot be undone."}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmOpen(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                Go Back
              </button>
              <button onClick={() => { setConfirmOpen(false); submit() }}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors">
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
