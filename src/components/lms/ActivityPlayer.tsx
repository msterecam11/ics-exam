"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  CheckCircle2, XCircle, ChevronRight, ChevronLeft, RotateCcw,
  Lightbulb, Zap, Clock, Star, ArrowRight, Check, X,
  BookOpen, ListOrdered, AlertTriangle, TextCursorInput,
  AlignLeft, GitBranch, Layers3, WholeWord, BarChart3,
  Puzzle, ArrowUpDown, Sparkles, ToggleLeft, MessageSquare, Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Activity, ActivityType } from "@/components/lms/ActivitySection"

// ─── Color palette per type ────────────────────────────────────────
const THEME: Record<ActivityType, { primary: string; light: string; text: string; icon: React.ElementType }> = {
  mcq:           { primary: "#1B4F8A", light: "#E6F1FB", text: "#0C447C", icon: ListOrdered    },
  flashcard:     { primary: "#3A7D0A", light: "#EAF3DE", text: "#27500A", icon: BookOpen        },
  ordering:      { primary: "#B06A00", light: "#FAEEDA", text: "#633806", icon: ArrowUpDown     },
  error_spotter: { primary: "#D63B3B", light: "#FCEBEB", text: "#791F1F", icon: AlertTriangle   },
  gap_fill:      { primary: "#6E67D8", light: "#EEEDFE", text: "#26215C", icon: TextCursorInput },
  word_scramble: { primary: "#C24472", light: "#FBEAF0", text: "#4B1528", icon: WholeWord       },
  scenario:      { primary: "#0D8C5C", light: "#E1F5EE", text: "#04342C", icon: GitBranch      },
  concept_sorter:{ primary: "#8A8A00", light: "#FFFFF0", text: "#3B3B00", icon: Layers3        },
  acronym:       { primary: "#E65100", light: "#FFF3E0", text: "#2C1A00", icon: Sparkles        },
  drag_match:    { primary: "#9C27B0", light: "#F3E5F5", text: "#1A0033", icon: Puzzle          },
  fill_blank:    { primary: "#1565C0", light: "#E3F2FD", text: "#002244", icon: AlignLeft       },
  rapid_fire:    { primary: "#C62828", light: "#FFEBEE", text: "#4A0000", icon: Zap             },
  true_false:    { primary: "#00838F", light: "#E0F7FA", text: "#003333", icon: ToggleLeft      },
  short_answer:  { primary: "#6A1B9A", light: "#EDE7F6", text: "#1A0040", icon: MessageSquare  },
}

// ─── Shared result screen ──────────────────────────────────────────
function ResultScreen({
  score, total, type, onRetry, onNext,
}: {
  score: number; total: number; type: ActivityType
  onRetry: () => void; onNext?: () => void
}) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 100
  const t = THEME[type]
  const passed = pct >= 60
  return (
    <div className="flex flex-col items-center justify-center py-8 px-6 text-center">
      <div className={cn(
        "w-20 h-20 rounded-full flex items-center justify-center mb-5 text-3xl",
        passed ? "bg-emerald-100" : "bg-red-100"
      )}>
        {passed ? "🎉" : "💪"}
      </div>
      <p className="text-2xl font-bold text-slate-800 mb-1">
        {pct === 100 ? "Perfect!" : passed ? "Well done!" : "Keep going!"}
      </p>
      <p className="text-slate-500 text-sm mb-6">
        {total > 0 ? `You scored ${score} / ${total}` : "Activity complete"}
      </p>
      {/* Score ring */}
      <div className="relative w-24 h-24 mb-8">
        <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15.9" fill="none"
            stroke={passed ? "#10b981" : "#f87171"}
            strokeWidth="3"
            strokeDasharray={`${pct} ${100 - pct}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1s ease" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-slate-800">
          {pct}%
        </span>
      </div>
      <div className="flex gap-3">
        <button onClick={onRetry}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
          <RotateCcw className="h-3.5 w-3.5" /> Try again
        </button>
        {onNext && (
          <button onClick={onNext}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-white text-sm font-semibold transition-colors"
            style={{ background: t.primary }}>
            Continue <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── 1. MCQ ────────────────────────────────────────────────────────
function McqPlayer({ content, onScore }: { content: any; onScore: (s: number, t: number) => void }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const opts: { text: string; is_correct: boolean }[] = content.options ?? []
  const correct = opts.findIndex(o => o.is_correct)

  function submit() {
    if (selected === null) return
    setSubmitted(true)
    onScore(selected === correct ? 1 : 0, 1)
  }

  return (
    <div className="space-y-3">
      <p className="text-base font-semibold text-slate-800 leading-snug">{content.question}</p>
      <div className="space-y-2">
        {opts.map((opt, i) => {
          const isSelected = selected === i
          const isCorrect  = submitted && i === correct
          const isWrong    = submitted && isSelected && i !== correct
          return (
            <button key={i}
              onClick={() => !submitted && setSelected(i)}
              className={cn(
                "w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-sm transition-all",
                !submitted && !isSelected && "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                !submitted && isSelected  && "border-[#1B4F8A] bg-[#E6F1FB]",
                isCorrect  && "border-emerald-500 bg-emerald-50",
                isWrong    && "border-red-400 bg-red-50",
              )}
            >
              <span className={cn(
                "w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 transition-all",
                !submitted && !isSelected && "border-slate-300 text-slate-400",
                !submitted && isSelected  && "border-[#1B4F8A] bg-[#1B4F8A] text-white",
                isCorrect && "border-emerald-500 bg-emerald-500 text-white",
                isWrong   && "border-red-400 bg-red-400 text-white",
              )}>
                {submitted && isCorrect ? <Check className="h-3.5 w-3.5" /> :
                 submitted && isWrong   ? <X className="h-3.5 w-3.5" />    :
                 ["A","B","C","D"][i]}
              </span>
              <span className={cn(
                "font-medium",
                isCorrect ? "text-emerald-700" : isWrong ? "text-red-700" : "text-slate-700"
              )}>{opt.text}</span>
            </button>
          )
        })}
      </div>
      {submitted && content.explanation && (
        <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl mt-2">
          <Lightbulb className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">{content.explanation}</p>
        </div>
      )}
      {!submitted && (
        <button onClick={submit} disabled={selected === null}
          className="w-full py-2.5 rounded-xl bg-[#1B4F8A] text-white text-sm font-semibold disabled:opacity-40 hover:bg-[#0C447C] transition-colors">
          Submit answer
        </button>
      )}
    </div>
  )
}

// ─── 2. Flashcard ──────────────────────────────────────────────────
function FlashcardPlayer({ content, onScore }: { content: any; onScore: (s: number, t: number) => void }) {
  const cards: { front: string; back: string }[] = content.cards ?? []
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [known, setKnown] = useState<Set<number>>(new Set())
  const [done, setDone] = useState(false)

  function markKnown() {
    const next = new Set(known); next.add(idx); setKnown(next)
    advance(next)
  }
  function advance(k = known) {
    if (idx < cards.length - 1) { setIdx(i => i + 1); setFlipped(false) }
    else { setDone(true); onScore(k.size, cards.length) }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
          <Check className="h-6 w-6 text-emerald-600" />
        </div>
        <p className="text-sm font-semibold text-slate-700">All {cards.length} cards reviewed</p>
        <p className="text-xs text-slate-400">You marked {known.size} as known</p>
      </div>
    )
  }

  const card = cards[idx]
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400 font-medium">{idx + 1} / {cards.length}</span>
        <div className="flex gap-1">
          {cards.map((_, i) => (
            <div key={i} className={cn("h-1.5 rounded-full transition-all",
              i < idx ? "w-4 bg-emerald-400" : i === idx ? "w-4 bg-[#3A7D0A]" : "w-4 bg-slate-200"
            )} />
          ))}
        </div>
      </div>

      {/* Card flip */}
      <div
        className="relative cursor-pointer select-none"
        style={{ perspective: "1000px", height: "200px" }}
        onClick={() => setFlipped(f => !f)}
      >
        <div style={{
          position: "absolute", inset: 0,
          transition: "transform 0.5s",
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}>
          {/* Front */}
          <div style={{ backfaceVisibility: "hidden" }}
            className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#EAF3DE] to-[#d4ecb8] border-2 border-[#3A7D0A]/20 flex flex-col items-center justify-center p-6">
            <span className="text-[10px] font-bold text-[#3A7D0A] uppercase tracking-widest mb-3">Concept</span>
            <p className="text-lg font-bold text-[#27500A] text-center leading-snug">{card.front}</p>
            <span className="text-[10px] text-[#3A7D0A]/60 mt-4">Tap to reveal</span>
          </div>
          {/* Back */}
          <div style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
            className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#27500A] to-[#3A7D0A] flex flex-col items-center justify-center p-6">
            <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest mb-3">Definition</span>
            <p className="text-base text-white text-center leading-snug font-medium">{card.back}</p>
          </div>
        </div>
      </div>

      {flipped && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { advance() }}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-red-300 bg-red-50 text-red-700 text-sm font-semibold hover:bg-red-100 transition-colors">
            <X className="h-4 w-4" /> Didn't know
          </button>
          <button onClick={markKnown}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-emerald-400 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors">
            <Check className="h-4 w-4" /> Got it!
          </button>
        </div>
      )}
    </div>
  )
}

// ─── 3. Ordering ───────────────────────────────────────────────────
function OrderingPlayer({ content, onScore }: { content: any; onScore: (s: number, t: number) => void }) {
  const items: { id: string; text: string }[] = content.items ?? []
  const correct: string[] = content.correct_order ?? []
  const [order, setOrder] = useState<string[]>(() => [...items.map(i => i.id)].sort(() => Math.random() - 0.5))
  const [submitted, setSubmitted] = useState(false)

  function move(idx: number, dir: -1 | 1) {
    const ni = idx + dir
    if (ni < 0 || ni >= order.length) return
    const next = [...order]; [next[idx], next[ni]] = [next[ni], next[idx]]
    setOrder(next)
  }

  function submit() {
    setSubmitted(true)
    const rightCount = order.filter((id, i) => id === correct[i]).length
    onScore(rightCount, correct.length)
  }

  const textOf = (id: string) => items.find(i => i.id === id)?.text ?? id

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-700">{content.question ?? "Arrange in the correct order:"}</p>
      <div className="space-y-2">
        {order.map((id, i) => {
          const isCorrect = submitted && id === correct[i]
          const isWrong   = submitted && id !== correct[i]
          return (
            <div key={id} className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 bg-white transition-all",
              !submitted && "border-slate-200",
              isCorrect && "border-emerald-400 bg-emerald-50",
              isWrong   && "border-red-300 bg-red-50",
            )}>
              <span className={cn(
                "w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0",
                isCorrect ? "bg-emerald-500 text-white" :
                isWrong   ? "bg-red-400 text-white" :
                "bg-[#FAEEDA] text-[#B06A00]"
              )}>{i + 1}</span>
              <span className="text-sm text-slate-700 flex-1">{textOf(id)}</span>
              {!submitted && (
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => move(i, -1)} disabled={i === 0}
                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-slate-100 disabled:opacity-20">
                    <ChevronLeft className="h-3 w-3 rotate-90" />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === order.length - 1}
                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-slate-100 disabled:opacity-20">
                    <ChevronLeft className="h-3 w-3 -rotate-90" />
                  </button>
                </div>
              )}
              {submitted && isCorrect && <Check className="h-4 w-4 text-emerald-500 shrink-0" />}
              {submitted && isWrong   && (
                <span className="text-[10px] text-red-500 font-medium shrink-0">
                  #{correct.indexOf(id) + 1}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {!submitted && (
        <button onClick={submit}
          className="w-full py-2.5 rounded-xl bg-[#B06A00] text-white text-sm font-semibold hover:bg-[#905500] transition-colors">
          Check order
        </button>
      )}
    </div>
  )
}

// ─── 4. Error Spotter ──────────────────────────────────────────────
function ErrorSpotterPlayer({ content, onScore }: { content: any; onScore: (s: number, t: number) => void }) {
  const errors: { wrong: string; correct: string }[] = content.errors ?? []
  const text: string = content.text ?? ""
  const [selected, setSelected] = useState<Set<number>>(new Set()) // selected token indices
  const [submitted, setSubmitted]  = useState(false)

  // Tokenize entire text into word-level tokens so ALL words are equally clickable
  // Each token is either a word or whitespace/punctuation between words
  const tokens: { text: string; tokenIdx: number }[] = []
  let raw = text
  let ti = 0
  const rx = /([a-zA-Z0-9''-]+|[^a-zA-Z0-9''-]+)/g
  let m: RegExpExecArray | null
  while ((m = rx.exec(raw)) !== null) {
    tokens.push({ text: m[0], tokenIdx: ti++ })
  }

  // Map each word token index → error index (null if not an error)
  const tokenErrorMap: Record<number, number> = {}
  errors.forEach((e, ei) => {
    // Find which token indices cover the wrong phrase
    let charPos = 0
    tokens.forEach(tok => {
      const start = charPos
      const end = charPos + tok.text.length
      // Check if this token overlaps the wrong phrase
      const wrongStart = text.indexOf(e.wrong)
      if (wrongStart !== -1 && start >= wrongStart && end <= wrongStart + e.wrong.length) {
        tokenErrorMap[tok.tokenIdx] = ei
      }
      charPos += tok.text.length
    })
  })

  // Any word can be selected — clicking never reveals whether it's an error,
  // so the student can't brute-force by watching which words "stick".
  function clickToken(tok: { text: string; tokenIdx: number }) {
    if (submitted) return
    if (!/[a-zA-Z0-9]/.test(tok.text)) return
    setSelected(prev => {
      const n = new Set(prev)
      n.has(tok.tokenIdx) ? n.delete(tok.tokenIdx) : n.add(tok.tokenIdx)
      return n
    })
  }

  // Distinct errors the student caught (≥1 of the error's tokens selected)
  const foundErrorIndices = new Set(
    [...selected].map(ti => tokenErrorMap[ti]).filter(ei => ei !== undefined)
  )
  // Selected words that aren't part of any error (false positives)
  const wrongPicks = [...selected].filter(ti => tokenErrorMap[ti] === undefined).length

  function submit() {
    setSubmitted(true)
    // A malformed activity with no valid errors must not trap the student — pass it through.
    if (errors.length === 0) { onScore(1, 1); return }
    // Reward errors found, penalise wrong guesses so selecting everything ≠ full marks.
    const net = Math.max(0, foundErrorIndices.size - wrongPicks)
    onScore(net, errors.length)
  }

  const isWord = (t: string) => /[a-zA-Z0-9]/.test(t)

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-[#FCEBEB] rounded-xl border border-[#D63B3B]/20">
        <AlertTriangle className="h-4 w-4 text-[#D63B3B] shrink-0 mt-0.5" />
        <p className="text-xs text-[#791F1F] font-medium">
          Read carefully and click the {errors.length} factual error{errors.length !== 1 ? "s" : ""} in the paragraph
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-700 leading-relaxed select-none">
        {tokens.map(tok => {
          if (!isWord(tok.text)) return <span key={tok.tokenIdx}>{tok.text}</span>
          const isSelected  = selected.has(tok.tokenIdx)
          const isErrorTok  = tokenErrorMap[tok.tokenIdx] !== undefined
          const isRevealedOk  = submitted && isErrorTok                 // a real error — always revealed
          const isRevealedBad = submitted && isSelected && !isErrorTok  // wrong guess
          return (
            <span key={tok.tokenIdx}
              onClick={() => clickToken(tok)}
              className={cn(
                "cursor-pointer rounded px-0.5 transition-all",
                // Before submit: selected words look neutral — no hint of correctness
                !submitted && !isSelected && "hover:bg-slate-100",
                !submitted && isSelected  && "bg-amber-200 text-amber-900 underline",
                // After submit: every real error turns green; wrong guesses turn red
                isRevealedOk  && "bg-emerald-200 text-emerald-800 font-semibold",
                isRevealedBad && "bg-red-100 text-red-600 line-through",
              )}
            >{tok.text}</span>
          )
        })}
      </div>

      {submitted && (
        <div className="space-y-2">
          {errors.map((e, i) => (
            <div key={i} className="flex items-start gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-sm line-through text-red-500 mr-2">{e.wrong}</span>
                <span className="text-sm text-emerald-700 font-medium">→ {e.correct}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!submitted && (
        <button onClick={submit} disabled={errors.length > 0 && selected.size === 0}
          className="w-full py-2.5 rounded-xl bg-[#D63B3B] text-white text-sm font-semibold disabled:opacity-40 hover:bg-[#b52e2e] transition-colors">
          {errors.length === 0
            ? "Continue"
            : `Check ${selected.size} selected word${selected.size !== 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  )
}

// ─── 5. Gap Fill ───────────────────────────────────────────────────
function GapFillPlayer({ content, onScore }: { content: any; onScore: (s: number, t: number) => void }) {
  const blanks: { placeholder: string; answer: string }[] = content.blanks ?? []
  const paragraph: string = content.paragraph ?? ""
  const [values, setValues] = useState<string[]>(Array(blanks.length).fill(""))
  const [submitted, setSubmitted] = useState(false)

  // Replace [BLANK_n] tokens with input fields
  const parts = paragraph.split(/(\[BLANK_\d+\])/)

  function submit() {
    setSubmitted(true)
    const correct = values.filter((v, i) =>
      v.trim().toLowerCase() === (blanks[i]?.answer ?? "").trim().toLowerCase()
    ).length
    onScore(correct, blanks.length)
  }

  let blankCounter = 0
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-700 leading-loose">
        {parts.map((part, i) => {
          if (/^\[BLANK_\d+\]$/.test(part)) {
            const bi = blankCounter++
            const ans = blanks[bi]?.answer ?? ""
            const val = values[bi] ?? ""
            const correct = submitted && val.trim().toLowerCase() === ans.toLowerCase()
            const wrong   = submitted && val.trim().toLowerCase() !== ans.toLowerCase()
            return (
              <span key={i} className="inline-flex items-center mx-1">
                <input
                  value={val}
                  onChange={e => {
                    const n = [...values]; n[bi] = e.target.value; setValues(n)
                  }}
                  disabled={submitted}
                  placeholder={`${bi + 1}`}
                  className={cn(
                    "inline-block w-28 border-b-2 bg-transparent px-1 py-0.5 text-sm font-semibold text-center outline-none transition-all",
                    !submitted && "border-[#6E67D8] text-[#26215C] focus:border-[#26215C]",
                    correct && "border-emerald-500 text-emerald-700",
                    wrong   && "border-red-400 text-red-600",
                  )}
                />
                {wrong && <span className="text-[10px] text-emerald-600 font-medium ml-1">({ans})</span>}
              </span>
            )
          }
          return <span key={i}>{part}</span>
        })}
      </div>
      {submitted && blanks.some((b, i) => values[i]?.trim().toLowerCase() !== (b.answer ?? "").toLowerCase()) && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-1">
          <p className="text-xs font-bold text-emerald-700 mb-2">Correct answers:</p>
          {blanks.map((b: any, i: number) => {
            const ans = b.answer ?? b.placeholder ?? ""
            const correct = values[i]?.trim().toLowerCase() === ans.toLowerCase()
            if (correct) return null
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Blank {i + 1}:</span>
                <span className="font-bold text-emerald-700">{ans}</span>
              </div>
            )
          })}
        </div>
      )}
      {!submitted && (
        <button onClick={submit} disabled={values.some(v => !v.trim())}
          className="w-full py-2.5 rounded-xl bg-[#6E67D8] text-white text-sm font-semibold disabled:opacity-40 hover:bg-[#5850c5] transition-colors">
          Check answers
        </button>
      )}
    </div>
  )
}

// ─── 6. Word Scramble ──────────────────────────────────────────────
function WordScramblePlayer({ content, onScore }: { content: any; onScore: (s: number, t: number) => void }) {
  const word: string = (content.word ?? "").toUpperCase()
  const hint: string = content.hint ?? ""
  const [tiles] = useState<string[]>(() => word.split("").sort(() => Math.random() - 0.5))
  const [selected, setSelected]   = useState<number[]>([]) // indices into tiles
  const [submitted, setSubmitted] = useState(false)

  const answer = selected.map(i => tiles[i]).join("")
  const correct = answer === word

  function toggleTile(i: number) {
    if (submitted) return
    setSelected(prev =>
      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
    )
  }

  function submit() {
    setSubmitted(true)
    onScore(correct ? 1 : 0, 1)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 p-3 bg-[#FBEAF0] rounded-xl border border-[#C24472]/20">
        <Lightbulb className="h-4 w-4 text-[#C24472] shrink-0 mt-0.5" />
        <p className="text-sm text-[#4B1528]">{hint}</p>
      </div>

      {/* Answer slots */}
      <div className="flex items-center justify-center gap-1.5 flex-wrap">
        {word.split("").map((_, i) => (
          <div key={i} className={cn(
            "w-10 h-10 rounded-xl border-2 flex items-center justify-center text-lg font-bold transition-all",
            selected[i] !== undefined
              ? submitted
                ? correct
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-red-400 bg-red-400 text-white"
                : "border-[#C24472] bg-[#FBEAF0] text-[#C24472]"
              : "border-dashed border-slate-300 bg-slate-50"
          )}>
            {selected[i] !== undefined ? tiles[selected[i]] : ""}
          </div>
        ))}
      </div>

      {submitted && !correct && (
        <p className="text-center text-sm text-emerald-700 font-semibold">
          The word was: <span className="text-lg">{word}</span>
        </p>
      )}
      {submitted && correct && (
        <p className="text-center text-sm text-emerald-700 font-semibold">✓ Correct!</p>
      )}

      {/* Tile bank */}
      {!submitted && (
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {tiles.map((letter, i) => {
            const used = selected.includes(i)
            return (
              <button key={i} onClick={() => toggleTile(i)}
                className={cn(
                  "w-10 h-10 rounded-xl border-2 text-lg font-bold transition-all",
                  used
                    ? "border-slate-200 bg-slate-100 text-slate-300 scale-90"
                    : "border-[#C24472] bg-white text-[#C24472] hover:bg-[#FBEAF0] active:scale-95"
                )}>
                {letter}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex gap-2">
        {!submitted && (
          <button onClick={() => setSelected([])} className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-50 transition-colors">
            Reset
          </button>
        )}
        {!submitted && (
          <button onClick={submit} disabled={selected.length !== word.length}
            className="flex-1 py-2 rounded-xl bg-[#C24472] text-white text-sm font-semibold disabled:opacity-40 hover:bg-[#a3365e] transition-colors">
            Check
          </button>
        )}
      </div>
    </div>
  )
}

// ─── 7. Scenario ───────────────────────────────────────────────────
function ScenarioPlayer({ content, onScore }: { content: any; onScore: (s: number, t: number) => void }) {
  const choices: { text: string; is_correct: boolean; consequence: string }[] = content.choices ?? []
  const [chosen, setChosen] = useState<number | null>(null)

  function pick(i: number) {
    if (chosen !== null) return
    setChosen(i)
    onScore(choices[i]?.is_correct ? 1 : 0, 1)
  }

  const correctIdx = choices.findIndex(c => c.is_correct)

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-[#0D8C5C] to-[#0a6645] rounded-2xl p-5 text-white">
        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-2 block">Scenario</span>
        <p className="text-sm leading-relaxed">{content.situation}</p>
      </div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">What would you do?</p>
      <div className="space-y-2">
        {choices.map((c, i) => {
          const isChosen  = chosen === i
          const isCorrect = chosen !== null && i === correctIdx
          const isWrong   = isChosen && !c.is_correct
          return (
            <div key={i}>
              <button onClick={() => pick(i)}
                className={cn(
                  "w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-xl border-2 text-sm transition-all",
                  chosen === null && "border-slate-200 bg-white hover:border-[#0D8C5C] hover:bg-[#E1F5EE]",
                  isCorrect && "border-emerald-500 bg-emerald-50",
                  isWrong   && "border-red-400 bg-red-50",
                  chosen !== null && !isChosen && !isCorrect && "border-slate-200 bg-white opacity-60",
                )}>
                <span className={cn(
                  "w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5",
                  isCorrect ? "border-emerald-500 bg-emerald-500 text-white" :
                  isWrong   ? "border-red-400 bg-red-400 text-white" :
                  "border-slate-300 text-slate-400"
                )}>
                  {isCorrect ? <Check className="h-3 w-3" /> : isWrong ? <X className="h-3 w-3" /> : ["A","B","C","D"][i]}
                </span>
                <span className={cn("font-medium",
                  isCorrect ? "text-emerald-700" : isWrong ? "text-red-700" : "text-slate-700"
                )}>{c.text}</span>
              </button>
              {isChosen && c.consequence && (
                <div className={cn(
                  "mt-1.5 ml-2 px-4 py-2.5 rounded-xl text-sm",
                  c.is_correct ? "bg-emerald-50 border border-emerald-200 text-emerald-800" :
                                 "bg-red-50 border border-red-200 text-red-800"
                )}>
                  {c.is_correct ? "✓ " : "✗ "}{c.consequence}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 8. Concept Sorter ─────────────────────────────────────────────
function ConceptSorterPlayer({ content, onScore }: { content: any; onScore: (s: number, t: number) => void }) {
  // Extract a display string from any object — tries known fields, then finds any non-letter string value
  function extractText(obj: any): string {
    if (typeof obj === "string") return obj
    if (!obj || typeof obj !== "object") return String(obj)
    const known = obj.text ?? obj.item ?? obj.concept ?? obj.statement ?? obj.name ??
      obj.label ?? obj.description ?? obj.value ?? obj.content ?? obj.phrase
    if (typeof known === "string" && known) return known
    // Fallback: find first string property value longer than 1 char
    const found = Object.values(obj).find((v): v is string => typeof v === "string" && v.length > 1)
    return found ?? JSON.stringify(obj)
  }
  function extractCategory(obj: any): string {
    if (!obj || typeof obj !== "object") return ""
    return obj.category ?? obj.group ?? obj.correct_category ?? obj.belongs_to ?? obj.belongs ?? ""
  }
  function extractCatName(c: any): string {
    if (typeof c === "string") return c
    const known = c.name ?? c.label ?? c.title ?? c.category
    if (typeof known === "string" && known) return known
    const found = Object.values(c).find((v): v is string => typeof v === "string" && v.length > 1)
    return found ?? String(c)
  }

  const categories: { name: string }[] = (content.categories ?? []).map((c: any) => ({ name: extractCatName(c) }))
  const items: { text: string; category: string }[] = (content.items ?? []).map((it: any) => ({
    text: extractText(it),
    category: extractCategory(it),
  }))
  const [selected, setSelected] = useState<string | null>(null) // item text
  const [placements, setPlacements] = useState<Record<string, string>>({}) // item → category
  const [submitted, setSubmitted] = useState(false)

  const unplaced = items.filter(it => !placements[it.text])

  function clickItem(text: string) {
    if (submitted) return
    setSelected(s => s === text ? null : text)
  }
  function clickCat(name: string) {
    if (!selected || submitted) return
    setPlacements(p => ({ ...p, [selected]: name }))
    setSelected(null)
  }

  function submit() {
    setSubmitted(true)
    const correct = items.filter(it => placements[it.text] === it.category).length
    onScore(correct, items.length)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Click an item, then click a category to sort it.</p>

      {/* Unplaced pool */}
      {unplaced.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 min-h-12">
          {unplaced.map(it => (
            <button key={it.text} onClick={() => clickItem(it.text)}
              className={cn(
                "px-3 py-1.5 rounded-lg border-2 text-xs font-medium transition-all",
                selected === it.text
                  ? "border-[#8A8A00] bg-[#FFFFF0] text-[#3B3B00] scale-105"
                  : "border-slate-300 bg-white text-slate-700 hover:border-[#8A8A00]"
              )}>{it.text}</button>
          ))}
        </div>
      )}

      {/* Category columns */}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${categories.length}, 1fr)` }}>
        {categories.map(cat => {
          const here = items.filter(it => placements[it.text] === cat.name)
          return (
            <div key={cat.name}
              onClick={() => clickCat(cat.name)}
              className={cn(
                "rounded-xl border-2 p-2 min-h-24 transition-all cursor-pointer",
                selected ? "border-[#8A8A00] bg-[#FFFFF0]" : "border-slate-200 bg-slate-50 hover:border-slate-300"
              )}>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center">
                {cat.name}
              </p>
              <div className="flex flex-col gap-1.5">
                {here.map(it => {
                  const correct = submitted && it.category === cat.name
                  const wrong   = submitted && it.category !== cat.name
                  return (
                    <div key={it.text} className={cn(
                      "px-2 py-1 rounded-lg text-xs font-medium border",
                      submitted
                        ? correct
                          ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                          : "border-red-300 bg-red-50 text-red-700"
                        : "border-[#8A8A00]/40 bg-white text-[#3B3B00]"
                    )}>{it.text}</div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {!submitted && unplaced.length === 0 && (
        <button onClick={submit}
          className="w-full py-2.5 rounded-xl bg-[#8A8A00] text-white text-sm font-semibold hover:bg-[#6e6e00] transition-colors">
          Check sorting
        </button>
      )}
    </div>
  )
}

// ─── 9. Acronym Explainer ──────────────────────────────────────────
function AcronymPlayer({ content, onScore }: { content: any; onScore: (s: number, t: number) => void }) {
  const acronym: string = content.acronym ?? ""
  const letters: any[] = content.letters ?? []
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [done, setDone] = useState(false)

  function reveal(i: number) {
    const next = new Set(revealed); next.add(i); setRevealed(next)
    if (next.size === letters.length) { setDone(true); onScore(1, 1) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="bg-gradient-to-br from-[#E65100] to-[#bf360c] rounded-2xl px-8 py-5">
          <p className="text-4xl font-black text-white tracking-widest text-center">{acronym}</p>
        </div>
      </div>
      <p className="text-xs text-slate-500 text-center">Tap each letter to reveal what it stands for</p>
      <div className="space-y-2">
        {letters.map((item, i) => {
          const isRevealed = revealed.has(i)
          // AI may generate {letter:"I", word:"International"} or even {"I":"International"}
          const expansion: string = (() => {
            const direct = item.expansion ?? item.word ?? item.meaning ?? item.stands_for ?? item.full ?? item.phrase
            if (typeof direct === "string" && direct) return direct
            // Fallback: find first string value longer than 1 char (i.e. not the letter itself)
            const found = Object.values(item).find((v): v is string => typeof v === "string" && v.length > 1)
            return found ?? ""
          })()
          return (
            <button key={i} onClick={() => reveal(i)} disabled={isRevealed}
              className={cn(
                "w-full flex items-center gap-4 px-4 py-3 rounded-xl border-2 text-left transition-all",
                isRevealed
                  ? "border-[#E65100]/30 bg-[#FFF3E0]"
                  : "border-slate-200 bg-white hover:border-[#E65100] hover:bg-[#FFF3E0]"
              )}>
              <span className={cn(
                "w-10 h-10 rounded-xl text-xl font-black flex items-center justify-center shrink-0 transition-all",
                isRevealed ? "bg-[#E65100] text-white" : "bg-slate-100 text-slate-400"
              )}>{item.letter ?? acronym[i] ?? ""}</span>
              <span className={cn(
                "text-sm font-medium transition-all",
                isRevealed ? "text-[#2C1A00]" : "text-slate-300"
              )}>
                {isRevealed ? (expansion || "—") : "Tap to reveal…"}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── 10. Drag & Drop Matching (click-based) ─────────────────────────
function DragMatchPlayer({ content, onScore }: { content: any; onScore: (s: number, t: number) => void }) {
  const pairs: { left: string; right: string }[] = content.pairs ?? []
  const [rightShuffled] = useState(() => [...pairs.map(p => p.right)].sort(() => Math.random() - 0.5))
  const [selectedLeft, setSelectedLeft]   = useState<number | null>(null)
  const [matches, setMatches]             = useState<Record<number, string>>({}) // leftIdx → rightText
  const [submitted, setSubmitted]         = useState(false)

  function clickLeft(i: number) {
    if (submitted) return
    setSelectedLeft(s => s === i ? null : i)
  }
  function clickRight(text: string) {
    if (selectedLeft === null || submitted) return
    setMatches(prev => ({ ...prev, [selectedLeft]: text }))
    setSelectedLeft(null)
  }
  function unmatch(leftIdx: number) {
    if (submitted) return
    setMatches(prev => { const n = { ...prev }; delete n[leftIdx]; return n })
  }

  const usedRight = Object.values(matches)

  function submit() {
    setSubmitted(true)
    const correct = pairs.filter((p, i) => matches[i] === p.right).length
    onScore(correct, pairs.length)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Click a left item, then click its match on the right.</p>
      <div className="grid grid-cols-2 gap-3">
        {/* Left column */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Terms</p>
          {pairs.map((p, i) => {
            const matched  = matches[i] !== undefined
            const isCorrect = submitted && matches[i] === p.right
            const isWrong   = submitted && matches[i] !== p.right
            return (
              <button key={i} onClick={() => matched ? unmatch(i) : clickLeft(i)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-xl border-2 text-xs font-medium transition-all",
                  !submitted && selectedLeft === i  && "border-[#9C27B0] bg-[#F3E5F5] scale-[1.02]",
                  !submitted && matched             && "border-slate-400 bg-slate-100 text-slate-500",
                  !submitted && !matched && selectedLeft !== i && "border-slate-200 bg-white hover:border-[#9C27B0] text-slate-700",
                  isCorrect && "border-emerald-500 bg-emerald-50 text-emerald-800",
                  isWrong   && "border-red-400 bg-red-50 text-red-800",
                )}>{p.left}</button>
            )
          })}
        </div>
        {/* Right column */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Definitions</p>
          {rightShuffled.map(text => {
            const used = usedRight.includes(text)
            const leftIdx = pairs.findIndex(p => p.right === text)
            const isCorrect = submitted && matches[leftIdx] === text
            const isWrong   = submitted && used && matches[leftIdx] !== text
            return (
              <button key={text} onClick={() => clickRight(text)}
                disabled={used && !submitted}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-xl border-2 text-xs font-medium transition-all",
                  !submitted && !used && selectedLeft !== null && "border-[#9C27B0] bg-white hover:bg-[#F3E5F5] text-slate-700",
                  !submitted && !used && selectedLeft === null && "border-slate-200 bg-white text-slate-700 opacity-60",
                  !submitted && used  && "border-slate-300 bg-slate-100 text-slate-400",
                  isCorrect && "border-emerald-500 bg-emerald-50 text-emerald-800",
                  isWrong   && "border-red-400 bg-red-50 text-red-800",
                )}>{text}</button>
            )
          })}
        </div>
      </div>
      {!submitted && Object.keys(matches).length === pairs.length && (
        <button onClick={submit}
          className="w-full py-2.5 rounded-xl bg-[#9C27B0] text-white text-sm font-semibold hover:bg-[#7b1fa2] transition-colors">
          Check matches
        </button>
      )}
    </div>
  )
}

// ─── 11. Fill in the Blank ─────────────────────────────────────────
function FillBlankPlayer({ content, onScore }: { content: any; onScore: (s: number, t: number) => void }) {
  // Normalize sentence: [BLANK_1] style (gap_fill format) → ___ so the same splitter works
  const sentence: string = (content.sentence ?? "").replace(/\[BLANK_\d+\]/g, "___")
  const blanks: { answer: string }[] = content.blanks ?? []
  const parts = sentence.split("___")
  const [values, setValues] = useState<string[]>(Array(blanks.length).fill(""))
  const [submitted, setSubmitted] = useState(false)

  function submit() {
    setSubmitted(true)
    const correct = values.filter((v, i) =>
      v.trim().toLowerCase() === (blanks[i]?.answer ?? "").trim().toLowerCase()
    ).length
    onScore(correct, blanks.length)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5 text-base text-slate-700 leading-loose">
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < blanks.length && (() => {
              const ans = blanks[i]?.answer ?? ""
              const val = values[i] ?? ""
              const correct = submitted && val.trim().toLowerCase() === ans.toLowerCase()
              const wrong   = submitted && val.trim().toLowerCase() !== ans.toLowerCase()
              return (
                <span className="inline-flex items-center gap-1">
                  <input
                    value={val}
                    onChange={e => {
                      const n = [...values]; n[i] = e.target.value; setValues(n)
                    }}
                    disabled={submitted}
                    className={cn(
                      "inline-block border-b-2 bg-transparent px-1 text-sm font-bold text-center outline-none w-24 transition-all",
                      !submitted && "border-[#1565C0] text-[#002244] focus:border-[#1B4F8A]",
                      correct && "border-emerald-500 text-emerald-700",
                      wrong   && "border-red-400 text-red-600",
                    )}
                  />
                  {wrong && <span className="text-[10px] text-emerald-600 font-semibold">({ans})</span>}
                </span>
              )
            })()}
          </span>
        ))}
      </div>
      {submitted && blanks.some((b, i) => values[i]?.trim().toLowerCase() !== (b.answer ?? "").toLowerCase()) && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-1">
          <p className="text-xs font-bold text-emerald-700 mb-2">Correct answers:</p>
          {blanks.map((b, i) => {
            const ans = b.answer ?? ""
            const correct = values[i]?.trim().toLowerCase() === ans.toLowerCase()
            if (correct) return null
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Blank {i + 1}:</span>
                <span className="font-bold text-emerald-700">{ans}</span>
              </div>
            )
          })}
        </div>
      )}
      {!submitted && (
        <button onClick={submit} disabled={values.some(v => !v.trim())}
          className="w-full py-2.5 rounded-xl bg-[#1565C0] text-white text-sm font-semibold disabled:opacity-40 hover:bg-[#0d47a1] transition-colors">
          Check answers
        </button>
      )}
    </div>
  )
}

// ─── 12. Rapid Fire ────────────────────────────────────────────────
function RapidFirePlayer({ content, onScore }: { content: any; onScore: (s: number, t: number) => void }) {
  const questions: any[] = content.questions ?? []
  const timePerQ: number = content.time_per_question_s ?? 10
  const [qIdx, setQIdx]       = useState(0)
  const [scores, setScores]   = useState(0)
  const [answered, setAnswered] = useState<boolean | null>(null) // null=pending, true=correct, false=wrong
  const [timeLeft, setTimeLeft] = useState(timePerQ)
  const [done, setDone]       = useState(false)
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const idxRef      = useRef(0)   // mirrors qIdx so the timer callback never reads a stale index
  const scoreRef    = useRef(0)   // authoritative running score
  const finishedRef = useRef(false)

  // Advance to the next question, or finish. Uses idxRef (not qIdx) so a timer
  // that fires from a memoized closure still sees the current question.
  const goNext = useCallback(() => {
    setAnswered(null)
    if (idxRef.current < questions.length - 1) {
      idxRef.current += 1
      setQIdx(idxRef.current)
    } else {
      setDone(true)
    }
  }, [questions.length])

  // Report the final score exactly once when the round ends.
  useEffect(() => {
    if (done && !finishedRef.current) {
      finishedRef.current = true
      onScore(scoreRef.current, questions.length || 1)
    }
  }, [done, onScore, questions.length])

  // Per-question countdown — re-created each question so its closure is fresh.
  useEffect(() => {
    if (done || !questions.length) return
    setTimeLeft(timePerQ)
    const id = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(id); goNext(); return 0 }
        return t - 1
      })
    }, 1000)
    timerRef.current = id
    return () => clearInterval(id)
  }, [qIdx, done, timePerQ, goNext, questions.length])

  function answer(isCorrect: boolean) {
    if (answered !== null) return
    if (timerRef.current) clearInterval(timerRef.current)
    setAnswered(isCorrect)
    if (isCorrect) { scoreRef.current += 1; setScores(scoreRef.current) }
    setTimeout(goNext, 800)
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
        <div className="w-12 h-12 rounded-full bg-[#FFEBEE] flex items-center justify-center">
          <Zap className="h-6 w-6 text-[#C62828]" />
        </div>
        <p className="text-sm font-semibold text-slate-700">Quiz complete</p>
        <p className="text-xs text-slate-400">{scores} of {questions.length} correct</p>
      </div>
    )
  }
  if (!questions.length) {
    return (
      <div className="text-center py-8 space-y-3">
        <p className="text-sm text-slate-400">No questions in this activity.</p>
        <button onClick={() => onScore(1, 1)}
          className="px-4 py-2 rounded-xl bg-[#C62828] text-white text-sm font-semibold hover:bg-[#b71c1c] transition-colors">
          Continue
        </button>
      </div>
    )
  }

  const q = questions[qIdx]
  // AI may use "q", "question", or "text" as the question field
  const questionText: string = q?.q ?? q?.question ?? q?.text ?? ""
  const pct = (timeLeft / timePerQ) * 100

  return (
    <div className="space-y-4">
      {/* Timer bar */}
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold text-slate-500">{qIdx + 1} / {questions.length}</span>
          <span className={cn("text-sm font-bold flex items-center gap-1",
            timeLeft <= 3 ? "text-red-600" : "text-[#C62828]"
          )}>
            <Clock className="h-3.5 w-3.5" /> {timeLeft}s
          </span>
        </div>
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", timeLeft <= 3 ? "bg-red-500" : "bg-[#C62828]")}
            style={{ width: `${pct}%`, transition: "width 1s linear" }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="bg-gradient-to-br from-[#C62828] to-[#b71c1c] rounded-2xl p-5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-red-300 block mb-2">Quick!</span>
        <p className="text-white font-semibold leading-snug">{questionText}</p>
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-2">
        {(q?.options ?? []).map((opt: any, i: number) => {
          const isCorrect = answered !== null && opt.is_correct
          const isWrong   = answered === false && !opt.is_correct
          return (
            <button key={i} onClick={() => answered === null && answer(opt.is_correct)}
              className={cn(
                "px-3 py-3 rounded-xl border-2 text-xs font-semibold text-center transition-all",
                answered === null && "border-slate-200 bg-white text-slate-700 hover:border-[#C62828] hover:bg-[#FFEBEE] active:scale-95",
                isCorrect && "border-emerald-500 bg-emerald-500 text-white",
                isWrong   && "border-slate-200 bg-slate-100 text-slate-400",
              )}>
              {opt.text}
            </button>
          )
        })}
      </div>

      {/* Score running total */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-slate-400">Score</span>
        <div className="flex gap-1">
          {questions.map((_, i) => (
            <div key={i} className={cn("w-2 h-2 rounded-full",
              i < qIdx ? "bg-emerald-400" : i === qIdx ? "bg-[#C62828]" : "bg-slate-200"
            )} />
          ))}
        </div>
        <span className="text-xs font-bold text-slate-700">{scores} pts</span>
      </div>
    </div>
  )
}

// ─── 13. True / False ──────────────────────────────────────────────
function TrueFalsePlayer({ content, onScore }: { content: any; onScore: (s: number, t: number) => void }) {
  const statement: string = content.statement ?? content.question ?? ""
  const answer: boolean   = content.answer ?? content.correct ?? true
  const explanation: string = content.explanation ?? ""
  const [chosen, setChosen] = useState<boolean | null>(null)

  function pick(val: boolean) {
    if (chosen !== null) return
    setChosen(val)
    onScore(val === answer ? 1 : 0, 1)
  }

  const submitted = chosen !== null

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-[#00838F] to-[#006064] rounded-2xl p-5 text-white">
        <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-300 block mb-2">True or False?</span>
        <p className="text-base font-semibold leading-snug">{statement}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {([true, false] as const).map(val => {
          const label    = val ? "True" : "False"
          const isChosen = chosen === val
          const correct  = submitted && val === answer
          const wrong    = submitted && isChosen && val !== answer
          return (
            <button key={String(val)} onClick={() => pick(val)}
              className={cn(
                "py-5 rounded-2xl border-2 text-lg font-bold transition-all",
                !submitted && "border-slate-200 bg-white text-slate-600 hover:border-[#00838F] hover:bg-[#E0F7FA]",
                correct && "border-emerald-500 bg-emerald-50 text-emerald-700",
                wrong   && "border-red-400 bg-red-50 text-red-600",
                submitted && !isChosen && !correct && "border-slate-200 bg-white opacity-40",
              )}>
              {submitted && correct ? <Check className="inline h-5 w-5 mr-1" /> :
               submitted && wrong   ? <X     className="inline h-5 w-5 mr-1" /> : null}
              {label}
            </button>
          )
        })}
      </div>

      {submitted && explanation && (
        <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
          <Lightbulb className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">{explanation}</p>
        </div>
      )}
    </div>
  )
}

// ─── 14. Short Answer (AI-scored) ──────────────────────────────────
function ShortAnswerPlayer({ content, onScore }: { content: any; onScore: (s: number, t: number) => void }) {
  const question: string    = content.question ?? ""
  const rubric: string      = content.rubric ?? content.model_answer ?? content.expected_answer ?? ""
  const [answer, setAnswer] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [scoring, setScoring]     = useState(false)
  const [feedback, setFeedback]   = useState<{ score: number; comment: string } | null>(null)

  async function submit() {
    if (!answer.trim()) return
    setSubmitted(true)
    setScoring(true)
    try {
      const res = await fetch("/api/lms/activities/score-short-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, rubric, answer: answer.trim() }),
      })
      const data = await res.json()
      setFeedback({ score: data.score ?? 0, comment: data.comment ?? "" })
      onScore(data.score ?? 0, 10)
    } catch {
      setFeedback({ score: 0, comment: "Could not score your answer at this time." })
      onScore(0, 10)
    }
    setScoring(false)
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-[#6A1B9A] to-[#4A148C] rounded-2xl p-5 text-white">
        <span className="text-[10px] font-bold uppercase tracking-widest text-purple-300 block mb-2">Short Answer</span>
        <p className="text-base font-semibold leading-snug">{question}</p>
      </div>

      <textarea
        value={answer}
        onChange={e => setAnswer(e.target.value)}
        disabled={submitted}
        placeholder="Type your answer here…"
        rows={4}
        className={cn(
          "w-full rounded-xl border-2 p-3 text-sm text-slate-700 outline-none resize-none transition-all",
          submitted ? "border-slate-200 bg-slate-50 text-slate-500" : "border-[#6A1B9A]/40 focus:border-[#6A1B9A] bg-white"
        )}
      />

      {!submitted && (
        <button onClick={submit} disabled={!answer.trim()}
          className="w-full py-2.5 rounded-xl bg-[#6A1B9A] text-white text-sm font-semibold disabled:opacity-40 hover:bg-[#560d84] transition-colors">
          Submit answer
        </button>
      )}

      {submitted && (
        <div className={cn(
          "rounded-2xl border-2 p-4 space-y-2",
          scoring ? "border-slate-200 bg-slate-50" :
          feedback && feedback.score >= 7 ? "border-emerald-300 bg-emerald-50" :
          feedback && feedback.score >= 4 ? "border-amber-300 bg-amber-50" :
          "border-red-300 bg-red-50"
        )}>
          {scoring ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              AI is reviewing your answer…
            </div>
          ) : feedback && (
            <>
              <div className="flex items-center justify-between">
                <p className={cn("text-sm font-bold",
                  feedback.score >= 7 ? "text-emerald-800" :
                  feedback.score >= 4 ? "text-amber-800" : "text-red-800"
                )}>
                  {feedback.score >= 7 ? "Good answer!" : feedback.score >= 4 ? "Partially correct" : "Needs improvement"}
                </p>
                <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full",
                  feedback.score >= 7 ? "bg-emerald-200 text-emerald-900" :
                  feedback.score >= 4 ? "bg-amber-200 text-amber-900" : "bg-red-200 text-red-900"
                )}>{feedback.score}/10</span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{feedback.comment}</p>
              {rubric && (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <p className="text-xs font-semibold text-slate-400 mb-1">Model answer</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{rubric}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Activity Player Wrapper ───────────────────────────────────────
type Phase = "intro" | "play" | "result"

interface PlayerProps {
  activity: Activity
  onComplete?: (score: number) => void
  onNext?: () => void
  className?: string
}

export default function ActivityPlayer({ activity, onComplete, onNext, className }: PlayerProps) {
  const [phase, setPhase]       = useState<Phase>("intro")
  const [score, setScore]       = useState(0)
  const [total, setTotal]       = useState(1)
  const [key, setKey]           = useState(0)
  const [answered, setAnswered] = useState(false) // waiting for student to Continue or Retry

  const t = THEME[activity.type] ?? THEME.mcq
  const Icon = t.icon

  // Called by each player when the student finishes answering.
  // We stay in "play" phase so feedback remains visible; show action bar instead.
  function handleScore(s: number, tot: number) {
    setScore(s); setTotal(tot)
    setAnswered(true)
  }

  function handleContinue() {
    setAnswered(false)
    setPhase("result")
    // total can be 0 for degenerate/empty content — don't emit NaN; treat as complete.
    const pct = total > 0 ? Math.round((score / total) * 100) : 100
    onComplete?.(pct)
  }

  function handleRetry() {
    setScore(0); setTotal(1); setKey(k => k + 1)
    setAnswered(false)
    setPhase("play")
  }

  const isPerfect = total > 0 && score === total

  const TYPE_LABEL: Record<ActivityType, string> = {
    mcq: "Multiple Choice", flashcard: "Flashcard", ordering: "Ordering",
    error_spotter: "Error Spotter", gap_fill: "Gap Fill", word_scramble: "Word Scramble",
    scenario: "Scenario", concept_sorter: "Concept Sorter", acronym: "Acronym",
    drag_match: "Drag & Match", fill_blank: "Fill in Blank", rapid_fire: "Rapid Fire",
    true_false: "True / False", short_answer: "Short Answer",
  }

  return (
    <div className={cn("rounded-2xl border-2 overflow-hidden bg-white", className)}
      style={{ borderColor: t.primary + "33" }}>

      {/* Header bar */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b"
        style={{ background: t.light, borderColor: t.primary + "22" }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: t.primary }}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold" style={{ color: t.text }}>{TYPE_LABEL[activity.type]}</p>
          <p className="text-[11px] truncate" style={{ color: t.text + "99" }}>{activity.title}</p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: t.primary + "22", color: t.text }}>
          {activity.difficulty}
        </span>
      </div>

      {/* Body */}
      <div className="p-4">
        {phase === "intro" && (
          <div className="flex flex-col items-center text-center py-6 gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: t.light }}>
              <Icon className="h-8 w-8" style={{ color: t.primary }} />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-lg mb-1">{activity.title}</p>
              <p className="text-sm text-slate-500">{TYPE_LABEL[activity.type]} activity</p>
            </div>
            <button
              onClick={() => setPhase("play")}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors"
              style={{ background: t.primary }}>
              Start activity <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {phase === "play" && (
          <div className="space-y-4">
            <div key={key}>
              {activity.type === "mcq"           && <McqPlayer           content={activity.content} onScore={handleScore} />}
              {activity.type === "flashcard"     && <FlashcardPlayer     content={activity.content} onScore={handleScore} />}
              {activity.type === "ordering"      && <OrderingPlayer      content={activity.content} onScore={handleScore} />}
              {activity.type === "error_spotter" && <ErrorSpotterPlayer  content={activity.content} onScore={handleScore} />}
              {activity.type === "gap_fill"      && <GapFillPlayer       content={activity.content} onScore={handleScore} />}
              {activity.type === "word_scramble" && <WordScramblePlayer  content={activity.content} onScore={handleScore} />}
              {activity.type === "scenario"      && <ScenarioPlayer      content={activity.content} onScore={handleScore} />}
              {activity.type === "concept_sorter"&& <ConceptSorterPlayer content={activity.content} onScore={handleScore} />}
              {activity.type === "acronym"       && <AcronymPlayer       content={activity.content} onScore={handleScore} />}
              {activity.type === "drag_match"    && <DragMatchPlayer     content={activity.content} onScore={handleScore} />}
              {activity.type === "fill_blank"    && <FillBlankPlayer     content={activity.content} onScore={handleScore} />}
              {activity.type === "rapid_fire"    && <RapidFirePlayer     content={activity.content} onScore={handleScore} />}
              {activity.type === "true_false"    && <TrueFalsePlayer     content={activity.content} onScore={handleScore} />}
              {activity.type === "short_answer"  && <ShortAnswerPlayer   content={activity.content} onScore={handleScore} />}
            </div>

            {/* Action bar — appears after answering, stays until student decides */}
            {answered && (
              <div className={cn(
                "rounded-2xl border-2 p-4 space-y-3",
                isPerfect
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-amber-300 bg-amber-50"
              )}>
                <div className="flex items-center gap-2">
                  {isPerfect
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    : <XCircle      className="h-5 w-5 text-amber-600 shrink-0" />
                  }
                  <div>
                    <p className={cn("text-sm font-bold",
                      isPerfect ? "text-emerald-800" : "text-amber-800"
                    )}>
                      {isPerfect ? "Well done!" : `${score} / ${total} correct`}
                    </p>
                    <p className="text-xs text-slate-500">
                      {isPerfect
                        ? "You got everything right."
                        : "Review the feedback above, then retry or continue."}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleRetry}
                    className="flex-1 py-2.5 rounded-xl border-2 border-slate-300 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-1.5 transition-colors">
                    <RotateCcw className="h-3.5 w-3.5" /> Try Again
                  </button>
                  <button onClick={handleContinue}
                    className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    style={{ background: isPerfect ? "#16a34a" : t.primary }}>
                    Continue <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {phase === "result" && (
          <ResultScreen
            score={score} total={total} type={activity.type}
            onRetry={handleRetry}
            onNext={onNext}
          />
        )}
      </div>
    </div>
  )
}
