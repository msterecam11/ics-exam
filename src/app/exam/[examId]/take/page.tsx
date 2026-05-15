"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Loader2, Clock, ChevronLeft, ChevronRight, Send, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import MCQSingleQuestion from "@/components/exam/questions/MCQSingleQuestion"
import MCQMultiQuestion from "@/components/exam/questions/MCQMultiQuestion"
import OrderingQuestion from "@/components/exam/questions/OrderingQuestion"
import MatchingQuestion from "@/components/exam/questions/MatchingQuestion"
import OpenEndedQuestion from "@/components/exam/questions/OpenEndedQuestion"

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function TakePage({ params }: { params: Promise<{ examId: string }> }) {
  const router = useRouter()
  const [examId, setExamId] = useState("")
  const [exam, setExam] = useState<any>(null)
  const [candidate, setCandidate] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showUnansweredModal, setShowUnansweredModal] = useState(false)
  const [unansweredList, setUnansweredList] = useState<number[]>([])
  const [fullscreenWarning, setFullscreenWarning] = useState(false)
  const [tabWarning, setTabWarning] = useState(false)
  const submitted = useRef(false)
  const tabLeftAt = useRef<number | null>(null)
  const candidateIdRef = useRef<string>("")
  const examIdRef = useRef<string>("")

  // Log security event silently
  const logSecurity = useCallback(async (event: string, extra?: object) => {
    const cid = candidateIdRef.current
    if (!cid) return
    try {
      await fetch(`/api/candidates/${cid}/security`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, timestamp: new Date().toISOString(), ...extra }),
      })
    } catch { /* silent */ }
  }, [])

  const handleSubmit = useCallback(async (auto = false) => {
    if (submitted.current) return
    submitted.current = true
    setSubmitting(true)

    if (auto) toast.info("Time's up! Submitting your exam...")

    const id = examIdRef.current
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000) // 30 s timeout

    try {
      const res = await fetch(`/api/exams/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candidateIdRef.current, answers }),
        signal: controller.signal,
      })

      clearTimeout(timeout)
      setSubmitting(false)

      if (res.ok) {
        const result = await res.json()
        sessionStorage.setItem(`result_${id}`, JSON.stringify(result))
        router.push(`/exam/${id}/results?candidate=${candidateIdRef.current}`)
      } else {
        submitted.current = false
        toast.error("Submission failed. Please try again.")
      }
    } catch (err: any) {
      clearTimeout(timeout)
      setSubmitting(false)
      submitted.current = false
      if (err?.name === "AbortError") {
        toast.error("Submission timed out. Please check your connection and try again.")
      } else {
        toast.error("Submission failed. Please try again.")
      }
    }
  }, [answers, router])

  // Load exam + questions
  useEffect(() => {
    params.then(async ({ examId: id }) => {
      setExamId(id)
      examIdRef.current = id

      const storedExam = sessionStorage.getItem(`exam_${id}`)
      const storedCandidate = sessionStorage.getItem(`candidate_${id}`)

      if (!storedExam || !storedCandidate) {
        router.replace(`/exam/${id}`)
        return
      }

      const examData = JSON.parse(storedExam)
      const candidateData = JSON.parse(storedCandidate)
      setExam(examData)
      setCandidate(candidateData)
      candidateIdRef.current = candidateData.id

      // Fetch questions
      const res = await fetch(`/api/exam/${id}/questions`)
      if (res.ok) {
        const qs = await res.json()

        // Question randomization — check if we already have an order stored
        const storedOrder = sessionStorage.getItem(`q_order_${id}`)
        let orderedQs: any[]
        if (storedOrder) {
          const order: string[] = JSON.parse(storedOrder)
          orderedQs = order.map((qid) => qs.find((q: any) => q.id === qid)).filter(Boolean)
          // Add any new questions not in stored order
          const missing = qs.filter((q: any) => !order.includes(q.id))
          orderedQs = [...orderedQs, ...missing]
        } else {
          orderedQs = shuffleArray(qs)
          sessionStorage.setItem(`q_order_${id}`, JSON.stringify(orderedQs.map((q: any) => q.id)))
        }

        // Answer randomization — shuffle choices for MCQ questions
        orderedQs = orderedQs.map((q: any) => {
          if ((q.type === "mcq_single" || q.type === "mcq_multi") && q.choices?.length) {
            const storedChoiceOrder = sessionStorage.getItem(`c_order_${q.id}`)
            let shuffledChoices: any[]
            if (storedChoiceOrder) {
              const order: string[] = JSON.parse(storedChoiceOrder)
              shuffledChoices = order.map((cid) => q.choices.find((c: any) => c.id === cid)).filter(Boolean)
            } else {
              shuffledChoices = shuffleArray(q.choices)
              sessionStorage.setItem(`c_order_${q.id}`, JSON.stringify(shuffledChoices.map((c: any) => c.id)))
            }
            return { ...q, choices: shuffledChoices }
          }
          return q
        })

        setQuestions(orderedQs)
      }

      // Timer
      const startedAt = new Date(candidateData.started_at).getTime()
      const durationMs = examData.duration_minutes * 60 * 1000
      const elapsed = Date.now() - startedAt
      const remaining = Math.max(0, Math.floor((durationMs - elapsed) / 1000))
      setTimeLeft(remaining)
      setLoading(false)
    })
  }, [params, router])

  // Countdown timer
  useEffect(() => {
    if (loading || timeLeft <= 0) return
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval)
          handleSubmit(true)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [loading, timeLeft, handleSubmit])

  // Fullscreen enforcement
  useEffect(() => {
    if (loading) return

    function requestFs() {
      document.documentElement.requestFullscreen?.().catch(() => {})
    }
    requestFs()

    function onFsChange() {
      if (!document.fullscreenElement) {
        setFullscreenWarning(true)
        logSecurity("fullscreen_exit")
      } else {
        setFullscreenWarning(false)
      }
    }
    document.addEventListener("fullscreenchange", onFsChange)
    return () => document.removeEventListener("fullscreenchange", onFsChange)
  }, [loading, logSecurity])

  // Tab / window visibility detection
  useEffect(() => {
    if (loading) return

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        tabLeftAt.current = Date.now()
      } else if (document.visibilityState === "visible" && tabLeftAt.current) {
        const duration = Math.round((Date.now() - tabLeftAt.current) / 1000)
        tabLeftAt.current = null
        setTabWarning(true)
        setTimeout(() => setTabWarning(false), 4000)
        logSecurity("tab_switch", { duration })
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [loading, logSecurity])

  // Disable right-click
  useEffect(() => {
    if (loading) return
    function onContextMenu(e: MouseEvent) {
      e.preventDefault()
      logSecurity("right_click")
    }
    document.addEventListener("contextmenu", onContextMenu)
    return () => document.removeEventListener("contextmenu", onContextMenu)
  }, [loading, logSecurity])

  // Disable copy / cut / paste (desktop + mobile keyboard shortcuts)
  useEffect(() => {
    if (loading) return
    function onCopy(e: ClipboardEvent) {
      e.preventDefault()
      logSecurity("copy_paste")
    }
    function onPaste(e: ClipboardEvent) {
      e.preventDefault()
    }
    function onKeyDown(e: KeyboardEvent) {
      const blocked = (e.ctrlKey || e.metaKey) && ["c", "v", "x", "a"].includes(e.key.toLowerCase())
      if (blocked) {
        e.preventDefault()
        if (e.key.toLowerCase() !== "v") logSecurity("copy_paste")
      }
    }
    document.addEventListener("copy", onCopy)
    document.addEventListener("cut", onCopy)
    document.addEventListener("paste", onPaste)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("copy", onCopy)
      document.removeEventListener("cut", onCopy)
      document.removeEventListener("paste", onPaste)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [loading, logSecurity])

  function setAnswer(questionId: string, value: any) {
    setAnswers((a) => ({ ...a, [questionId]: value }))
  }

  function trySubmit() {
    const unanswered = questions
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => answers[q.id] === undefined)
      .map(({ i }) => i + 1)

    if (unanswered.length > 0) {
      setUnansweredList(unanswered)
      setShowUnansweredModal(true)
    } else {
      handleSubmit(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1B4F8A]" />
      </div>
    )
  }

  const question = questions[currentIdx]
  const isLast = currentIdx === questions.length - 1
  const answeredCount = Object.keys(answers).length
  const timerWarning = timeLeft < 300

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      {/* Tab switch warning banner */}
      {tabWarning && (
        <div className="bg-amber-500 text-white text-sm font-medium text-center py-2 px-4 flex items-center justify-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Warning: Leaving the exam tab has been recorded.
        </div>
      )}

      {/* Fullscreen warning banner */}
      {fullscreenWarning && (
        <div className="bg-red-600 text-white text-sm font-medium text-center py-2 px-4 flex items-center justify-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          You exited fullscreen — this has been recorded.
          <button
            onClick={() => document.documentElement.requestFullscreen?.()}
            className="underline ml-2 font-bold"
          >
            Return to fullscreen
          </button>
        </div>
      )}

      {/* Header */}
      <header className="bg-[#1B4F8A] text-white sticky top-0 z-10 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={110} height={30} className="object-contain" />
            <div className="hidden sm:block border-l border-white/20 pl-3">
              <p className="text-xs opacity-70 truncate max-w-[200px]">{exam?.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 font-mono font-bold text-lg ${timerWarning ? "text-red-300 timer-warning" : "text-white"}`}>
              <Clock className="h-4 w-4" />
              {formatTime(timeLeft)}
            </div>
          </div>
        </div>
        <div className="h-1 bg-white/20">
          <div
            className="h-1 bg-white transition-all"
            style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
          />
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 select-none" style={{ WebkitUserSelect: "none", userSelect: "none" }}>
        {question && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground font-medium">
                Question {currentIdx + 1} of {questions.length}
              </span>
              <Badge variant="outline" className="text-xs">{question.score} pts</Badge>
            </div>

            <Card className="shadow-sm">
              <CardContent className="pt-6 pb-6">
                <p className="font-semibold text-base mb-5 leading-relaxed">{question.text}</p>

                {question.type === "mcq_single" && (
                  <MCQSingleQuestion question={question} value={answers[question.id]} onChange={(v) => setAnswer(question.id, v)} />
                )}
                {question.type === "mcq_multi" && (
                  <MCQMultiQuestion question={question} value={answers[question.id]} onChange={(v) => setAnswer(question.id, v)} />
                )}
                {question.type === "ordering" && (
                  <OrderingQuestion question={question} value={answers[question.id]} onChange={(v) => setAnswer(question.id, v)} />
                )}
                {question.type === "matching" && (
                  <MatchingQuestion question={question} value={answers[question.id]} onChange={(v) => setAnswer(question.id, v)} />
                )}
                {question.type === "open_ended" && (
                  <div style={{ userSelect: "text", WebkitUserSelect: "text" }}>
                    <OpenEndedQuestion question={question} value={answers[question.id]} onChange={(v) => setAnswer(question.id, v)} />
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                disabled={currentIdx === 0}
                className="gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>

              <span className="text-xs text-muted-foreground">
                {answeredCount}/{questions.length} answered
              </span>

              {isLast ? (
                <Button
                  onClick={trySubmit}
                  disabled={submitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit Exam
                </Button>
              ) : (
                <Button
                  onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                  className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-1.5"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Question dot navigator */}
            <div className="flex flex-wrap gap-1.5 justify-center pt-2">
              {questions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIdx(i)}
                  className={`w-7 h-7 rounded-full text-xs font-medium transition-colors ${
                    i === currentIdx
                      ? "bg-[#1B4F8A] text-white"
                      : answers[q.id] !== undefined
                      ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                      : "bg-white text-muted-foreground border"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Unanswered questions modal */}
      {showUnansweredModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 rounded-full p-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="font-bold text-lg">Unanswered Questions</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              You have <span className="font-semibold text-foreground">{unansweredList.length} unanswered</span> question{unansweredList.length > 1 ? "s" : ""}:
            </p>
            <div className="flex flex-wrap gap-2">
              {unansweredList.map((n) => (
                <button
                  key={n}
                  onClick={() => { setCurrentIdx(n - 1); setShowUnansweredModal(false) }}
                  className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 text-sm font-medium hover:bg-amber-200 transition-colors"
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Click a number to go to that question, or submit anyway.</p>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowUnansweredModal(false)}>
                Go Back
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => { setShowUnansweredModal(false); handleSubmit(false) }}
              >
                Submit Anyway
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
