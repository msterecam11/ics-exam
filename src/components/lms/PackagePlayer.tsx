"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  ChevronLeft, ChevronRight, Menu, X, Volume2, VolumeX,
  Maximize, Minimize, CheckCircle2, Award, Lock,
  Loader2, AlertTriangle, Shield, Clock, Play, Pause,
  SkipForward, CheckSquare, Square, RotateCcw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { type PackageItem, type ItemType, type PackageQuestion, type MCQOption, type OrderItem, type MatchPair } from "./PackageEditor"
import { RichTextViewer } from "./RichTextEditor"

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────
export interface PackagePlayerProps {
  packageId:    string
  moduleId:     string
  courseId:     string
  studentId:    string
  studentName:  string
  courseTitle:  string
  packageTitle: string
  passMark:     number
  items:        PackageItem[]
  initialProgress: {
    current_item_index: number
    completed_items:    string[]
    item_scores:        Record<string, { score: number; max: number; pct: number; passed: boolean }>
    status:             string
  } | null
  freeNavigation?: boolean
  previewMode?: boolean
}

// ─────────────────────────────────────────────────────────────────
// PdfSlide — browser-native PDF viewer via iframe + pointer overlay
// (prevents right-click/selection while preserving visual fidelity)
// ─────────────────────────────────────────────────────────────────
function PdfSlide({ url, page }: { url: string; page: number }) {
  const [ready, setReady] = useState(false)

  useEffect(() => { setReady(false) }, [url, page])

  // view=Fit forces the page to fill the viewer with no scrollbars.
  // The 600ms delay after onLoad lets the PDF viewer finish navigating
  // to #page=N before we reveal the iframe (otherwise page 1 flashes briefly).
  const src = `${url}#page=${page}&toolbar=0&navpanes=0&scrollbar=0&view=Fit`

  return (
    <div className="w-full h-full relative bg-slate-900 overflow-hidden"
      onContextMenu={e => e.preventDefault()}
      style={{ userSelect: "none", WebkitUserSelect: "none" }}>
      <iframe
        key={`${url}-${page}`}
        src={src}
        className="h-full border-0"
        style={{ width: "calc(100% + 20px)" }}
        title={`Slide ${page}`}
        onLoad={() => setTimeout(() => setReady(true), 600)}
      />
      {!ready && (
        <div className="absolute inset-0 bg-slate-900 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-white/30 animate-spin" />
        </div>
      )}
      <div className="absolute inset-0" onContextMenu={e => e.preventDefault()} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// PptxSlide renderer
// ─────────────────────────────────────────────────────────────────
function PptxSlide({ url, title }: { url: string; title: string }) {
  const src = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}&action=embedview`
  return (
    <div className="w-full h-full bg-slate-900 select-none" onContextMenu={e => e.preventDefault()}>
      <iframe src={src} className="w-full h-full border-0" title={title} allowFullScreen />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// VideoPlayer (library)
// ─────────────────────────────────────────────────────────────────
function VideoPlayer({
  url, mustWatchPct, allowSkip, onComplete,
}: {
  url: string; mustWatchPct: number; allowSkip: boolean; onComplete: () => void
}) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const [maxPct,  setMaxPct]  = useState(0)
  const [done,    setDone]    = useState(false)
  const [muted,   setMuted]   = useState(false)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    function onTime() {
      const pct = v!.duration > 0 ? (v!.currentTime / v!.duration) * 100 : 0
      setMaxPct(prev => Math.max(prev, pct))
      if (pct >= mustWatchPct && !done) { setDone(true); onComplete() }
    }
    function onSeeking() {
      if (allowSkip) return
      const pct = v!.duration > 0 ? (v!.currentTime / v!.duration) * 100 : 0
      if (pct > maxPct + 2) v!.currentTime = (maxPct / 100) * v!.duration
    }
    v.addEventListener("timeupdate", onTime)
    v.addEventListener("seeking", onSeeking)
    return () => { v.removeEventListener("timeupdate", onTime); v.removeEventListener("seeking", onSeeking) }
  }, [mustWatchPct, allowSkip, maxPct, done, onComplete])

  return (
    <div className="w-full h-full bg-black flex items-center justify-center relative"
      onContextMenu={e => e.preventDefault()}
      style={{ userSelect: "none", WebkitUserSelect: "none" }}>
      <video
        ref={videoRef}
        src={url}
        className="max-h-full max-w-full"
        controls
        muted={muted}
        controlsList="nodownload"
        onContextMenu={e => e.preventDefault()}
      />
      {done && (
        <div className="absolute bottom-16 right-6 bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
          <CheckCircle2 className="h-3.5 w-3.5" /> Watched
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// YouTubePlayer
// ─────────────────────────────────────────────────────────────────
function YouTubePlayer({
  url, mustWatchPct, onComplete,
}: {
  url: string; mustWatchPct: number; onComplete: () => void
}) {
  const [done, setDone] = useState(false)

  const getYtId = (u: string) => {
    const m = u.match(/(?:youtu\.be\/|v=|embed\/)([a-zA-Z0-9_-]{11})/)
    return m?.[1] ?? null
  }
  const ytId = getYtId(url)

  // Poll YouTube player via iframe API
  useEffect(() => {
    if (!ytId || done) return
    // Simplified: mark complete when the iframe fires ended event via postMessage
    function onMsg(e: MessageEvent) {
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data
        if (data?.event === "onStateChange" && data?.info === 0) {
          // 0 = ended
          setDone(true)
          onComplete()
        }
      } catch {}
    }
    window.addEventListener("message", onMsg)
    return () => window.removeEventListener("message", onMsg)
  }, [ytId, done, onComplete])

  if (!ytId) return (
    <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-400">
      Invalid YouTube URL
    </div>
  )

  return (
    <div className="w-full h-full bg-black flex items-center justify-center relative"
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
      onContextMenu={e => e.preventDefault()}>
      <div className="w-full max-w-4xl aspect-video">
        <iframe
          src={`https://www.youtube.com/embed/${ytId}?enablejsapi=1&rel=0`}
          className="w-full h-full border-0"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
      </div>
      {done && (
        <div className="absolute bottom-6 right-6 bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
          <CheckCircle2 className="h-3.5 w-3.5" /> Watched
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Quiz / Exam player
// ─────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function initAnswers(questions: PackageQuestion[]): Record<string, any> {
  const init: Record<string, any> = {}
  for (const q of questions) {
    if (q.type === "ordering") {
      init[q.id] = shuffle((q.items ?? []).map(it => it.id))
    }
  }
  return init
}

function scoreQuestions(questions: PackageQuestion[], answers: Record<string, any>) {
  let earned = 0, max = 0
  for (const q of questions) {
    max += q.points
    if (q.type === "mcq_single") {
      const correct = q.options?.find(o => o.is_correct)?.id
      if (answers[q.id] && answers[q.id] === correct) earned += q.points
    } else if (q.type === "mcq_multiple") {
      const sel = new Set((answers[q.id] as string[] | undefined) ?? [])
      const cor = new Set(q.options?.filter(o => o.is_correct).map(o => o.id) ?? [])
      if (sel.size === cor.size && [...cor].every(id => sel.has(id))) earned += q.points
    } else if (q.type === "ordering") {
      const studentOrder = (answers[q.id] as string[] | undefined) ?? []
      const correctOrder = (q.items ?? []).map(it => it.id)
      if (correctOrder.length === studentOrder.length &&
          correctOrder.every((id, i) => studentOrder[i] === id)) earned += q.points
    } else if (q.type === "match_pair") {
      const studentMap = (answers[q.id] as Record<string, string> | undefined) ?? {}
      const pairs = q.pairs ?? []
      if (pairs.length > 0 && pairs.every(p => studentMap[p.id] === p.right)) earned += q.points
    } else if (q.type === "open_ended") {
      // open_ended scored via AI — placeholder 0, will be replaced after AI call
    }
  }
  return { score: earned, max, pct: max > 0 ? Math.round(earned / max * 100) : 0 }
}

type QuizPhase = "taking" | "review"

function QuizPlayer({
  item, passMark, onComplete, previewMode,
}: {
  item: PackageItem; passMark: number; onComplete: (score: { score: number; max: number; pct: number; passed: boolean }) => void; previewMode: boolean
}) {
  const cfg       = item.config as any
  const questions: PackageQuestion[] = cfg.questions ?? []
  const isExam    = item.type === "exam"
  // Quizzes have no pass mark — submission always counts as passed (completion-only)
  const qPassMark = isExam ? (cfg.pass_mark ?? passMark) : 0
  const maxAttempts = cfg.max_attempts ?? (isExam ? 1 : 3)

  const [answers,         setAnswers]         = useState<Record<string, any>>(() => initAnswers(questions))
  const [phase,           setPhase]           = useState<QuizPhase>("taking")
  const [result,          setResult]          = useState<{ score: number; max: number; pct: number; passed: boolean } | null>(null)
  const [attempt,         setAttempt]         = useState(1)
  const [aiScoring,       setAiScoring]       = useState(false)
  const [aiJustifications, setAiJustifications] = useState<Record<string, { score: number; justification: string }>>({})

  // Exam: timer
  const [timeLeft, setTimeLeft] = useState<number | null>(
    cfg.time_limit_minutes ? cfg.time_limit_minutes * 60 : null
  )
  const [urgent, setUrgent] = useState(false)

  useEffect(() => {
    if (!timeLeft) return
    if (timeLeft <= 0) { handleSubmit(); return }
    if (timeLeft <= 60) setUrgent(true)
    const t = setTimeout(() => setTimeLeft(s => (s ?? 1) - 1), 1000)
    return () => clearTimeout(t)
  }, [timeLeft])

  function toggleAnswer(qId: string, optId: string, single: boolean) {
    setAnswers(prev => {
      if (single) return { ...prev, [qId]: optId }
      const cur = (prev[qId] as string[] | undefined) ?? []
      return { ...prev, [qId]: cur.includes(optId) ? cur.filter(x => x !== optId) : [...cur, optId] }
    })
  }

  async function handleSubmit() {
    setAiScoring(true)

    // AI-score open_ended questions
    const openEndedQs = questions.filter(q => q.type === "open_ended")
    const newAiJust: Record<string, { score: number; justification: string }> = {}

    if (openEndedQs.length > 0 && !previewMode) {
      await Promise.all(openEndedQs.map(async q => {
        const ans = answers[q.id] as string | undefined
        if (!ans?.trim()) { newAiJust[q.id] = { score: 0, justification: "No answer provided." }; return }
        try {
          const res = await fetch("/api/lms/packages/score-open-ended", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question_text: q.text, model_answer: q.model_answer ?? "", student_answer: ans, max_score: q.points }),
          })
          newAiJust[q.id] = res.ok ? await res.json() : { score: q.points, justification: "AI scoring unavailable." }
        } catch { newAiJust[q.id] = { score: q.points, justification: "AI scoring unavailable." } }
      }))
    }

    // Merge AI scores into final totals
    const base = scoreQuestions(questions, answers)
    const aiEarned = openEndedQs.reduce((sum, q) => sum + (newAiJust[q.id]?.score ?? 0), 0)
    const finalScore = base.score + aiEarned
    const finalPct   = base.max > 0 ? Math.round((finalScore / base.max) * 100) : 0
    const passed     = isExam ? finalPct >= qPassMark : true
    const r = { score: finalScore, max: base.max, pct: finalPct, passed }

    setAiJustifications(newAiJust)
    setResult(r)
    setAiScoring(false)
    setPhase("review")
    onComplete(r)
  }

  function retry() {
    setAnswers(initAnswers(questions))
    setPhase("taking")
    setResult(null)
    setAiJustifications({})
    setAttempt(a => a + 1)
    if (cfg.time_limit_minutes) setTimeLeft(cfg.time_limit_minutes * 60)
  }

  const fmtTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`

  if (!questions.length) return (
    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
      No questions added yet.
    </div>
  )

  // Review phase
  if (phase === "review" && result) {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Score card */}
          {isExam ? (
            <div className={cn(
              "rounded-2xl p-6 text-center border-2",
              result.passed ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
            )}>
              <p className={cn("text-4xl font-bold mb-1", result.passed ? "text-emerald-600" : "text-red-500")}>
                {result.pct}%
              </p>
              <p className={cn("font-semibold", result.passed ? "text-emerald-700" : "text-red-600")}>
                {result.passed ? "Passed!" : "Not passed"} — Pass mark: {qPassMark}%
              </p>
              <p className="text-sm text-slate-500 mt-1">Score: {result.score} / {result.max} points</p>
            </div>
          ) : (
            <div className="rounded-2xl p-6 text-center border-2 bg-blue-50 border-blue-200">
              <CheckCircle2 className="h-10 w-10 text-blue-500 mx-auto mb-2" />
              <p className="font-semibold text-blue-700">Quiz submitted</p>
            </div>
          )}

          {/* Question review */}
          {(cfg.show_correct ?? true) && questions.map((q, qi) => {
            const userAns = answers[q.id]

            // Determine correctness per type
            const aiResult = aiJustifications[q.id]
            let isCorrect = false
            if (q.type === "open_ended") {
              isCorrect = aiResult ? aiResult.score >= q.points * 0.5 : true
            } else if (q.type === "mcq_single") {
              const correct = q.options?.find(o => o.is_correct)?.id
              isCorrect = userAns === correct
            } else if (q.type === "mcq_multiple") {
              const sel = new Set(Array.isArray(userAns) ? userAns : [])
              const cor = new Set(q.options?.filter(o => o.is_correct).map(o => o.id) ?? [])
              isCorrect = sel.size === cor.size && [...cor].every(id => sel.has(id))
            } else if (q.type === "ordering") {
              const studentOrder = (userAns as string[] | undefined) ?? []
              const correctOrder = (q.items ?? []).map(it => it.id)
              isCorrect = correctOrder.length === studentOrder.length &&
                correctOrder.every((id, i) => studentOrder[i] === id)
            } else if (q.type === "match_pair") {
              const studentMap = (userAns as Record<string, string> | undefined) ?? {}
              isCorrect = (q.pairs ?? []).length > 0 && (q.pairs ?? []).every(p => studentMap[p.id] === p.right)
            }

            return (
              <div key={q.id} className={cn("bg-white rounded-xl border p-4 space-y-3", isCorrect ? "border-emerald-200" : "border-red-200")}>
                <div className="flex items-start gap-2">
                  <span className={cn("w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0", isCorrect ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600")}>{qi + 1}</span>
                  <p className="text-sm font-medium text-slate-800">{q.text}</p>
                </div>

                {/* MCQ review */}
                {(q.type === "mcq_single" || q.type === "mcq_multiple") && (() => {
                  const selectedIds = new Set(Array.isArray(userAns) ? userAns : userAns ? [userAns] : [])
                  return (
                    <div className="ml-7 space-y-1.5">
                      {(q.options ?? []).map(opt => {
                        const isCorr = opt.is_correct
                        const isSel  = selectedIds.has(opt.id)
                        return (
                          <div key={opt.id} className={cn(
                            "px-3 py-2 rounded-lg text-xs border",
                            isCorr ? "border-emerald-300 bg-emerald-50 text-emerald-700 font-medium" :
                            isSel  ? "border-red-300 bg-red-50 text-red-600" :
                                     "border-slate-200 text-slate-500"
                          )}>
                            {isCorr ? "✓ " : isSel ? "✗ " : "  "}{opt.text}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}

                {/* Ordering review */}
                {q.type === "ordering" && (() => {
                  const studentOrder = (userAns as string[] | undefined) ?? []
                  const itemMap = Object.fromEntries((q.items ?? []).map(it => [it.id, it.text]))
                  const correctOrder = (q.items ?? []).map(it => it.id)
                  return (
                    <div className="ml-7 space-y-1.5">
                      <p className="text-xs text-slate-400 mb-1">Correct order:</p>
                      {correctOrder.map((id, idx) => {
                        const studentPos = studentOrder.indexOf(id)
                        const posCorrect = studentPos === idx
                        return (
                          <div key={id} className={cn(
                            "px-3 py-2 rounded-lg text-xs border flex items-center gap-2",
                            posCorrect ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                       : "border-red-300 bg-red-50 text-red-600"
                          )}>
                            <span className="font-bold w-4">{idx + 1}.</span>
                            <span>{itemMap[id]}</span>
                            {!posCorrect && <span className="ml-auto text-red-400">you placed #{studentPos + 1}</span>}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}

                {/* Match pair review */}
                {q.type === "match_pair" && (() => {
                  const studentMap = (userAns as Record<string, string> | undefined) ?? {}
                  return (
                    <div className="ml-7 space-y-1.5">
                      {(q.pairs ?? []).map(pair => {
                        const chosen = studentMap[pair.id]
                        const pairOk = chosen === pair.right
                        return (
                          <div key={pair.id} className={cn(
                            "grid grid-cols-2 gap-2 px-3 py-2 rounded-lg border text-xs",
                            pairOk ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                   : "border-red-300 bg-red-50 text-red-600"
                          )}>
                            <span>{pair.left}</span>
                            <span>
                              {pairOk ? `✓ ${pair.right}` : (
                                <>✗ <span className="line-through opacity-60">{chosen || "—"}</span> → {pair.right}</>
                              )}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}

                {/* Open ended review — show answer + AI feedback */}
                {q.type === "open_ended" && (
                  <div className="ml-7 space-y-2">
                    <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap">
                      {(userAns as string) || <span className="italic text-slate-400">No answer provided</span>}
                    </div>
                    {aiResult ? (
                      <div className={cn("px-3 py-2 rounded-lg text-xs border",
                        aiResult.score >= q.points * 0.5
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-red-200 bg-red-50 text-red-800"
                      )}>
                        <span className="font-semibold">AI Score: {aiResult.score}/{q.points}</span>{" — "}
                        {aiResult.justification}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">AI scoring in progress…</p>
                    )}
                  </div>
                )}

                {q.explanation && (
                  <p className="ml-7 text-xs text-slate-500 italic">{q.explanation}</p>
                )}
              </div>
            )
          })}

          {/* Actions */}
          <div className="flex gap-3">
            {isExam && !result.passed && attempt < maxAttempts && (
              <button onClick={retry}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                <RotateCcw className="h-4 w-4" /> Retry (attempt {attempt + 1}/{maxAttempts})
              </button>
            )}
            {(!isExam || result.passed) && (
              <div className="flex items-center gap-2 text-emerald-600 font-medium text-sm">
                <CheckCircle2 className="h-4 w-4" /> Continue to next item
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Taking phase
  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      {/* Timer bar */}
      {timeLeft !== null && (
        <div className={cn("sticky top-0 flex items-center justify-center gap-2 py-2 text-sm font-mono font-bold z-10",
          urgent ? "bg-red-600 text-white animate-pulse" : "bg-slate-800 text-white")}>
          <Clock className="h-4 w-4" /> {fmtTime(timeLeft)}
        </div>
      )}
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        {questions.map((q, qi) => {
          const isSingle = q.type === "mcq_single"
          const selected = answers[q.id]
          return (
            <div key={q.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <span className="w-6 h-6 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] text-xs font-bold flex items-center justify-center shrink-0">{qi + 1}</span>
                <p className="text-sm font-medium text-slate-800 flex-1">{q.text}</p>
              </div>

              {/* MCQ */}
              {(q.type === "mcq_single" || q.type === "mcq_multiple") && (
                <div className="ml-8 space-y-1.5">
                  {(q.options ?? []).map(opt => {
                    const isSel = Array.isArray(selected) ? selected.includes(opt.id) : selected === opt.id
                    return (
                      <button key={opt.id}
                        onClick={() => toggleAnswer(q.id, opt.id, isSingle)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg border text-xs transition-all",
                          isSel ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium"
                               : "border-slate-200 text-slate-700 hover:bg-slate-50"
                        )}>
                        {isSel ? "● " : "○ "}{opt.text}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Ordering — drag-free: up/down arrows */}
              {q.type === "ordering" && (() => {
                const orderedIds = (selected as string[] | undefined) ?? (q.items ?? []).map(it => it.id)
                const itemMap = Object.fromEntries((q.items ?? []).map(it => [it.id, it.text]))
                function moveOrderItem(fromIdx: number, dir: -1 | 1) {
                  const arr = [...orderedIds]
                  const toIdx = fromIdx + dir
                  if (toIdx < 0 || toIdx >= arr.length) return
                  ;[arr[fromIdx], arr[toIdx]] = [arr[toIdx], arr[fromIdx]]
                  setAnswers(prev => ({ ...prev, [q.id]: arr }))
                }
                return (
                  <div className="ml-8 space-y-1.5">
                    <p className="text-xs text-slate-400 mb-1">Drag into the correct order using the arrows.</p>
                    {orderedIds.map((id, idx) => (
                      <div key={id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50">
                        <span className="text-xs font-bold text-slate-400 w-4 shrink-0">{idx + 1}</span>
                        <span className="text-xs text-slate-700 flex-1">{itemMap[id]}</span>
                        <button onClick={() => moveOrderItem(idx, -1)} disabled={idx === 0}
                          className="text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors p-0.5">
                          <ChevronLeft className="h-3.5 w-3.5 rotate-90" />
                        </button>
                        <button onClick={() => moveOrderItem(idx, 1)} disabled={idx === orderedIds.length - 1}
                          className="text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors p-0.5">
                          <ChevronRight className="h-3.5 w-3.5 rotate-90" />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* Match pair — left labels + right dropdowns */}
              {q.type === "match_pair" && (() => {
                const pairs = q.pairs ?? []
                const studentMap = (selected as Record<string, string> | undefined) ?? {}
                const rightOptions = pairs.map(p => p.right)
                return (
                  <div className="ml-8 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-400 mb-1 px-1">
                      <span>Prompt</span><span>Match</span>
                    </div>
                    {pairs.map(pair => (
                      <div key={pair.id} className="grid grid-cols-2 gap-2 items-center">
                        <div className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700">
                          {pair.left}
                        </div>
                        <select
                          value={studentMap[pair.id] ?? ""}
                          onChange={e => setAnswers(prev => ({
                            ...prev,
                            [q.id]: { ...(prev[q.id] ?? {}), [pair.id]: e.target.value },
                          }))}
                          className="h-9 px-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
                        >
                          <option value="">— select —</option>
                          {rightOptions.map((r, ri) => (
                            <option key={ri} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* Open ended */}
              {q.type === "open_ended" && (
                <textarea
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30 ml-8"
                  rows={3}
                  placeholder="Your answer…"
                  value={(selected as string) ?? ""}
                  onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                />
              )}
            </div>
          )
        })}

        <button onClick={handleSubmit} disabled={aiScoring}
          className="w-full py-3 bg-[#1B4F8A] text-white font-semibold rounded-xl hover:bg-[#163f6e] transition-colors disabled:opacity-70 flex items-center justify-center gap-2">
          {aiScoring ? <><Loader2 className="h-4 w-4 animate-spin" /> AI Scoring…</> : "Submit"}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// DividerCard
// ─────────────────────────────────────────────────────────────────
function DividerCard({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#1B4F8A] text-white gap-4 p-8 select-none">
      <p className="text-4xl font-bold text-center">{title}</p>
      {subtitle && <p className="text-lg text-white/70 text-center">{subtitle}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Watermark overlay
// ─────────────────────────────────────────────────────────────────
function Watermark({ name }: { name: string }) {
  const date = new Date().toLocaleDateString("en-GB")
  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden select-none">
      <div className="absolute bottom-3 right-4 text-white/20 text-[11px] font-medium">
        {name} · {date}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// ThumbnailStrip (player sidebar)
// ─────────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<ItemType, { color: string; bg: string }> = {
  slide_pdf:   { color: "text-red-400",    bg: "bg-red-900/30"    },
  slide_pptx:  { color: "text-orange-400", bg: "bg-orange-900/30" },
  video:       { color: "text-purple-400", bg: "bg-purple-900/30" },
  youtube:     { color: "text-red-400",    bg: "bg-red-900/30"    },
  audio:       { color: "text-pink-400",   bg: "bg-pink-900/30"   },
  quiz:        { color: "text-amber-400",  bg: "bg-amber-900/30"  },
  exam:        { color: "text-blue-400",   bg: "bg-blue-900/30"   },
  text:        { color: "text-slate-400",  bg: "bg-slate-800"     },
  image:       { color: "text-pink-400",   bg: "bg-pink-900/30"   },
  web_content: { color: "text-cyan-400",   bg: "bg-cyan-900/30"   },
  divider:     { color: "text-teal-400",   bg: "bg-teal-900/30"   },
}

function PlayerThumbnail({
  item, index, active, completed, locked, onClick,
}: {
  item: PackageItem; index: number; active: boolean; completed: boolean; locked: boolean; onClick: () => void
}) {
  const c = TYPE_COLORS[item.type] ?? TYPE_COLORS.text
  return (
    <button
      onClick={onClick}
      disabled={locked}
      className={cn(
        "w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors text-xs",
        active   ? "bg-white/15 text-white" :
        locked   ? "opacity-40 cursor-not-allowed text-white/50" :
        "text-white/60 hover:bg-white/10 hover:text-white"
      )}
    >
      <span className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[10px] font-bold", c.bg, c.color)}>
        {completed ? "✓" : index + 1}
      </span>
      <span className="truncate flex-1">{item.title}</span>
      {locked && <Lock className="h-3 w-3 shrink-0" />}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────
// Main PackagePlayer
// ─────────────────────────────────────────────────────────────────
export default function PackagePlayer({
  packageId, moduleId, courseId, studentId, studentName,
  courseTitle, packageTitle, passMark, freeNavigation = false, items, initialProgress, previewMode = false,
}: PackagePlayerProps) {
  // On re-entry, snap to first incomplete required item instead of last visited position
  const resolveStartIdx = () => {
    const completedSet = new Set(initialProgress?.completed_items ?? [])
    for (let i = 0; i < items.length; i++) {
      if (items[i].required && !completedSet.has(items[i].id)) return i
    }
    return initialProgress?.current_item_index ?? 0
  }
  const [currentIdx,    setCurrentIdx]    = useState(resolveStartIdx)
  const [completedIds,  setCompletedIds]  = useState<Set<string>>(new Set(initialProgress?.completed_items ?? []))
  const [itemScores,    setItemScores]    = useState<Record<string, any>>(initialProgress?.item_scores ?? {})
  const [sidebarOpen,   setSidebarOpen]   = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [pkgDone,       setPkgDone]       = useState(false)
  const [pkgResult,     setPkgResult]     = useState<{ passed: boolean; score: number } | null>(null)
  const [reviewItemId,  setReviewItemId]  = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentItem = items[currentIdx] ?? null

  // ── Autosave (debounced) ─────────────────────────────────────
  const saveProgress = useCallback(async (opts: {
    completedItemId?: string
    itemScore?: { score: number; max: number; pct: number; passed: boolean }
    status?: string
    overallScore?: number
  } = {}) => {
    if (previewMode) return
    setSaving(true)
    try {
      await fetch(`/api/lms/packages/${packageId}/progress`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module_id:          moduleId,
          course_id:          courseId,
          current_item_index: currentIdx,
          completed_item_id:  opts.completedItemId,
          item_score:         opts.itemScore,
          status:             opts.status,
          overall_score:      opts.overallScore,
        }),
      })
    } catch {}
    setSaving(false)
  }, [packageId, moduleId, courseId, currentIdx, previewMode])

  // Autosave on position change
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveProgress(), 1500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [currentIdx])

  // ── Item completion ──────────────────────────────────────────
  function handleItemComplete(itemId: string, score?: { score: number; max: number; pct: number; passed: boolean }) {
    // Keep the quiz/exam player mounted for review — parent won't switch to simple summary
    if (score !== undefined) setReviewItemId(itemId)
    setCompletedIds(prev => {
      const next = new Set([...prev, itemId])

      if (!previewMode) {
        const allDone = items.filter(it => it.required).every(it => next.has(it.id))
        if (allDone && !pkgDone) {
          const scoredItems = items.filter(it => it.type === "quiz" || it.type === "exam")
          const newScores   = score ? { ...itemScores, [itemId]: score } : itemScores
          const totalPct    = scoredItems.reduce((acc, it) => acc + (newScores[it.id]?.pct ?? 0), 0)
          const overall     = scoredItems.length > 0 ? Math.round(totalPct / scoredItems.length) : 100
          const allPassed   = scoredItems.every(it => newScores[it.id]?.passed !== false)
          const finalStatus = allPassed ? "passed" : "failed"
          setPkgDone(true)
          setPkgResult({ passed: allPassed, score: overall })
          // Single save with terminal status — no race condition
          saveProgress({ completedItemId: itemId, itemScore: score, status: finalStatus, overallScore: overall })
          toast.success(allPassed ? "Package complete — well done!" : "Package finished", { duration: 4000 })
        } else {
          saveProgress({ completedItemId: itemId, itemScore: score })
        }
      }

      return next
    })
    if (score) setItemScores(prev => ({ ...prev, [itemId]: score }))
  }

  // ── Navigation ───────────────────────────────────────────────
  function isLocked(idx: number) {
    if (previewMode || freeNavigation) return false
    for (let i = 0; i < idx; i++) {
      if (items[i].required && !completedIds.has(items[i].id)) return true
    }
    return false
  }

  function goTo(idx: number) {
    if (idx < 0 || idx >= items.length || isLocked(idx)) return
    setReviewItemId(null)
    setCurrentIdx(idx)
  }

  // Passive item types complete only when the student explicitly clicks Next
  const PASSIVE_TYPES: ItemType[] = ["slide_pdf", "slide_pptx", "text", "image", "web_content", "divider"]

  function goNext() {
    const item = items[currentIdx]
    if (!item || currentIdx >= items.length - 1) return
    // Assessed items (quiz/video) must complete themselves before advancing
    if (ASSESSED_TYPES.includes(item.type) && !completedIds.has(item.id) && !previewMode && !freeNavigation) return
    // Mark current passive item complete before advancing
    if (PASSIVE_TYPES.includes(item.type) && !completedIds.has(item.id)) {
      handleItemComplete(item.id)
    }
    setReviewItemId(null)
    setCurrentIdx(currentIdx + 1)
  }

  // ── Keyboard nav ─────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "ArrowRight") goNext()
      if (e.key === "ArrowLeft")  goTo(currentIdx - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [currentIdx, completedIds])

  // canNext: passive items are always advanceable (Next button completes them);
  // assessed items (video/quiz/exam) need to complete themselves first
  const ASSESSED_TYPES: ItemType[] = ["video", "youtube", "audio", "quiz", "exam"]
  const currentIsAssessed = currentItem ? ASSESSED_TYPES.includes(currentItem.type) : false
  const currentDone       = currentItem ? completedIds.has(currentItem.id) : true
  const canNext = currentIdx < items.length - 1 &&
    (!currentIsAssessed || currentDone || previewMode || freeNavigation)
  const canPrev = currentIdx > 0
  const progress = items.length > 0 ? Math.round((currentIdx / (items.length - 1)) * 100) : 0

  // ── Completion screen ────────────────────────────────────────
  if (pkgDone && pkgResult) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50 p-6">
        <div className="text-center max-w-md">
          <div className={cn("w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6",
            pkgResult.passed ? "bg-emerald-100" : "bg-amber-100")}>
            <Award className={cn("h-12 w-12", pkgResult.passed ? "text-emerald-600" : "text-amber-600")} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            {pkgResult.passed ? "Congratulations!" : "Module Complete"}
          </h1>
          <p className="text-slate-500 mb-4 text-base font-medium">{packageTitle}</p>
          <p className={cn("text-2xl font-bold mb-2", pkgResult.passed ? "text-emerald-600" : "text-amber-500")}>
            {pkgResult.score}%
          </p>
          <p className={cn("font-semibold mb-8", pkgResult.passed ? "text-emerald-600" : "text-red-500")}>
            {pkgResult.passed ? "Completed" : "Some assessments were not passed"}
          </p>
          <a href={`/lms/courses/${courseId}`}
            className="inline-flex items-center gap-2 bg-[#1B4F8A] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#163f6e] transition-colors">
            ← Back to Course
          </a>
        </div>
      </div>
    )
  }

  // ── Main render ──────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex flex-col bg-slate-900 z-40 overflow-hidden">

      {/* ── REVIEW MODE BANNER ──────────────────────────────── */}
      {previewMode && (
        <div className="bg-amber-500 text-white text-xs font-semibold text-center py-1.5 shrink-0 tracking-wide">
          Review mode — your progress is not being tracked
        </div>
      )}

      {/* ── TOP BAR ─────────────────────────────────────────── */}
      <div className="h-11 bg-[#1B4F8A] text-white flex items-center gap-3 px-4 shrink-0 z-10">
        <a href={`/lms/courses/${courseId}`}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0 text-white">
          ←
        </a>
        <button onClick={() => setSidebarOpen(v => !v)}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0">
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-white/50 leading-none truncate">{courseTitle}</p>
          <p className="text-sm font-semibold leading-none truncate">{packageTitle}</p>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-32 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-white/60">{currentIdx + 1}/{items.length}</span>
        </div>

        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/50 shrink-0" />}
        {previewMode && (
          <span className="text-[10px] font-bold bg-amber-400 text-amber-900 px-2 py-0.5 rounded-full shrink-0">PREVIEW</span>
        )}
      </div>

      {/* ── BODY ────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-56 shrink-0 bg-slate-800 flex flex-col overflow-hidden border-r border-white/5">
            <div className="px-3 py-2 border-b border-white/10">
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Contents</p>
            </div>
            <div className="flex-1 overflow-y-auto py-1 no-scrollbar">
              {items.map((item, idx) => (
                <PlayerThumbnail
                  key={item.id}
                  item={item}
                  index={idx}
                  active={idx === currentIdx}
                  completed={completedIds.has(item.id)}
                  locked={isLocked(idx)}
                  onClick={() => goTo(idx)}
                />
              ))}
            </div>
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 relative overflow-hidden">
          <Watermark name={previewMode ? "Preview" : studentName} />

          {currentItem ? (() => {
            const cfg = currentItem.config

            if (currentItem.type === "slide_pdf") {
              return <PdfSlide url={cfg.file_url} page={cfg.page_number ?? 1} />
            }
            if (currentItem.type === "slide_pptx") {
              return <PptxSlide url={cfg.file_url} title={currentItem.title} />
            }
            if (currentItem.type === "video") {
              return (
                <VideoPlayer
                  url={cfg.file_url}
                  mustWatchPct={cfg.must_watch_pct ?? 80}
                  allowSkip={cfg.allow_skip ?? false}
                  onComplete={() => handleItemComplete(currentItem.id)}
                />
              )
            }
            if (currentItem.type === "youtube") {
              return (
                <YouTubePlayer
                  url={cfg.url}
                  mustWatchPct={cfg.must_watch_pct ?? 80}
                  onComplete={() => handleItemComplete(currentItem.id)}
                />
              )
            }
            if (currentItem.type === "quiz" || currentItem.type === "exam") {
              const alreadyDone = completedIds.has(currentItem.id)
              const score = itemScores[currentItem.id]
              if (alreadyDone && score && currentItem.id !== reviewItemId) {
                const hasNext = currentIdx < items.length - 1
                return (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-slate-50">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center bg-emerald-100">
                      <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                    </div>
                    {currentItem.type === "exam" && (
                      <p className={cn("text-2xl font-bold", score.passed ? "text-emerald-600" : "text-red-500")}>{score.pct}%</p>
                    )}
                    <p className="text-slate-500 text-sm">
                      {currentItem.title} — {currentItem.type === "exam" ? (score.passed ? "Passed" : "Not passed") : "Completed"}
                    </p>
                    {hasNext && (
                      <button
                        onClick={goNext}
                        className="mt-2 px-6 py-2 bg-[#1B4F8A] text-white rounded-lg text-sm font-medium hover:bg-[#163f6e] transition-colors flex items-center gap-2"
                      >
                        Continue <ChevronRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )
              }
              return (
                <QuizPlayer
                  item={currentItem}
                  passMark={passMark}
                  previewMode={previewMode}
                  onComplete={s => handleItemComplete(currentItem.id, s)}
                />
              )
            }
            if (currentItem.type === "text") {
              return (
                <div className="flex-1 overflow-y-auto flex justify-center"
                  style={{ userSelect: "none", WebkitUserSelect: "none", backgroundColor: cfg.bgColor ?? "#ffffff" }}
                  onContextMenu={e => e.preventDefault()}>
                  <div className="max-w-3xl w-full">
                    <RichTextViewer html={cfg.html ?? ""} bgColor={cfg.bgColor ?? "#ffffff"} />
                  </div>
                </div>
              )
            }
            if (currentItem.type === "image") {
              return (
                <div className="flex-1 flex items-center justify-center bg-slate-900 select-none" onContextMenu={e => e.preventDefault()}>
                  <img src={cfg.file_url} alt={currentItem.title} className="max-h-full max-w-full object-contain" />
                </div>
              )
            }
            if (currentItem.type === "audio") {
              return (
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 gap-6 p-8 select-none">
                  <div className="w-28 h-28 rounded-full bg-pink-500/20 border-2 border-pink-400/40 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-pink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                  <p className="text-white/70 text-sm font-medium">{currentItem.title}</p>
                  {cfg.file_url && (
                    <audio
                      src={cfg.file_url}
                      controls
                      className="w-full max-w-lg"
                      controlsList="nodownload"
                      onEnded={() => handleItemComplete(currentItem.id)}
                    />
                  )}
                </div>
              )
            }
            if (currentItem.type === "web_content") {
              return (
                <div className="flex-1 flex flex-col min-h-0">
                  {cfg.url ? (
                    <iframe
                      src={cfg.url}
                      className="flex-1 border-0 w-full"
                      title={currentItem.title || "Web content"}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    />
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">No URL configured</div>
                  )}
                </div>
              )
            }
            if (currentItem.type === "divider") {
              return <DividerCard title={cfg.title ?? "Section"} subtitle={cfg.subtitle} />
            }
            return null
          })() : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              No content
            </div>
          )}
        </main>
      </div>

      {/* ── BOTTOM NAV ────────────────────────────────────────── */}
      <div className="h-12 bg-slate-800 border-t border-white/5 flex items-center justify-between px-4 shrink-0">
        <button
          onClick={() => goTo(currentIdx - 1)}
          disabled={!canPrev}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
        >
          <ChevronLeft className="h-4 w-4" /> Prev
        </button>

        {/* Dot progress */}
        <div className="flex items-center gap-1 max-w-xs overflow-hidden">
          {items.slice(Math.max(0, currentIdx - 6), currentIdx + 7).map((item, di) => {
            const realIdx = Math.max(0, currentIdx - 6) + di
            const done = completedIds.has(item.id)
            return (
              <button
                key={item.id}
                onClick={() => goTo(realIdx)}
                disabled={isLocked(realIdx)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  realIdx === currentIdx ? "w-5 bg-white" :
                  done ? "w-2 bg-emerald-400" : "w-2 bg-white/20 hover:bg-white/40"
                )}
              />
            )
          })}
        </div>

        {currentIdx === items.length - 1 && !pkgDone ? (
          <button
            onClick={() => {
              const item = items[currentIdx]
              if (!item) return
              // Always mark last item complete (idempotent — Set deduplicates)
              handleItemComplete(item.id)
            }}
            disabled={currentIsAssessed && !currentDone}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-semibold"
          >
            Finish <CheckCircle2 className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={goNext}
            disabled={!canNext}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
