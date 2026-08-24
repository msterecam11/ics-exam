"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Loader2, Clock, ChevronLeft, ChevronRight, Send, AlertTriangle, ArrowRight, Flag } from "lucide-react"
import { toast } from "sonner"
import MCQSingleQuestion from "@/components/exam/questions/MCQSingleQuestion"
import MCQMultiQuestion from "@/components/exam/questions/MCQMultiQuestion"
import OrderingQuestion from "@/components/exam/questions/OrderingQuestion"
import MatchingQuestion from "@/components/exam/questions/MatchingQuestion"
import OpenEndedQuestion from "@/components/exam/questions/OpenEndedQuestion"
import { formatScore } from "@/lib/scoreDisplay"

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

// Shuffles question ORDER within each section but never across sections —
// otherwise "Section 1 before Section 2" would stop meaning anything the
// moment shuffle is on. Questions with no section_id form their own group
// in the order they first appear, same as before sections existed.
function shuffleWithinSections<T extends { section_id?: string | null }>(arr: T[]): T[] {
  const groupOrder: (string | null)[] = []
  const groups = new Map<string | null, T[]>()
  for (const q of arr) {
    const key = q.section_id ?? null
    if (!groups.has(key)) { groups.set(key, []); groupOrder.push(key) }
    groups.get(key)!.push(q)
  }
  return groupOrder.flatMap((key) => shuffleArray(groups.get(key)!))
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
  // One combined pre-submit review modal — shows both groups together
  // (whichever apply) so a candidate never has one warning hidden behind
  // the other.
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [unansweredList, setUnansweredList] = useState<number[]>([])
  const [fullscreenWarning, setFullscreenWarning] = useState(false)
  const [tabWarning, setTabWarning] = useState(false)
  // Sections whose intro screen has already been shown this sitting — a
  // section's intro appears once, the first time the candidate LANDS on one
  // of its questions, whether by clicking Next or jumping via the dot/section
  // navigator. Persisted so a reload doesn't re-show intros already seen.
  const [introSeenSections, setIntroSeenSections] = useState<Set<string>>(new Set())
  // Candidate's own "review this later" markers — purely personal, never
  // sent to the backend, doesn't affect scoring or submission. Persisted so
  // it survives a reload mid-sitting, same as the other progress state here.
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
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

      // Fetch questions — candidate_id lets a Question Bank exam return this
      // candidate's own frozen random draw; harmless/ignored for manual exams.
      const res = await fetch(`/api/exam/${id}/questions?candidate_id=${candidateData.id}`)
      if (res.ok) {
        const qs = await res.json()

        // Question randomization — gated per-exam (defaults to true, matching
        // prior behavior). Check if we already have an order stored.
        const shuffleQuestions = examData.shuffle_questions !== false
        const shuffleOptions = examData.shuffle_options !== false
        let orderedQs: any[]
        if (!shuffleQuestions) {
          orderedQs = qs
        } else {
          const storedOrder = sessionStorage.getItem(`q_order_${id}`)
          if (storedOrder) {
            const order: string[] = JSON.parse(storedOrder)
            orderedQs = order.map((qid) => qs.find((q: any) => q.id === qid)).filter(Boolean)
            // Add any new questions not in stored order
            const missing = qs.filter((q: any) => !order.includes(q.id))
            orderedQs = [...orderedQs, ...missing]
          } else {
            orderedQs = shuffleWithinSections(qs)
            sessionStorage.setItem(`q_order_${id}`, JSON.stringify(orderedQs.map((q: any) => q.id)))
          }
        }

        // Answer randomization — shuffle choices for MCQ questions
        if (shuffleOptions) {
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
        }

        setQuestions(orderedQs)
      }

      const storedIntroSeen = sessionStorage.getItem(`intro_seen_${id}`)
      if (storedIntroSeen) setIntroSeenSections(new Set(JSON.parse(storedIntroSeen)))

      const storedFlagged = sessionStorage.getItem(`flagged_${id}`)
      const localFlagged: string[] = storedFlagged ? JSON.parse(storedFlagged) : []
      if (localFlagged.length > 0) setFlagged(new Set(localFlagged))

      // Restore any autosaved in-progress answers/flags — covers a refresh
      // in this same tab AND a candidate resuming on a completely different
      // device, since this comes from the server, not sessionStorage. Flags
      // are merged (not replaced) with whatever this browser already had,
      // so neither source can lose the other's data.
      try {
        const draftRes = await fetch(`/api/candidates/${candidateData.id}/autosave`)
        if (draftRes.ok) {
          const { draft_answers, flagged_questions, submitted: alreadySubmitted } = await draftRes.json()

          // Already finalized — e.g. the admin's "Check for Overdue Exams"
          // caught this candidate while their tab was gone, and they're only
          // now reopening it. Send them straight to their results instead of
          // letting them start "answering" an exam that's already scored.
          if (alreadySubmitted) {
            submitted.current = true
            router.replace(`/exam/${id}/results?candidate=${candidateData.id}`)
            return
          }

          if (draft_answers && Object.keys(draft_answers).length > 0) {
            setAnswers(draft_answers)
          }
          if (Array.isArray(flagged_questions) && flagged_questions.length > 0) {
            setFlagged(new Set([...localFlagged, ...flagged_questions]))
          }
        }
      } catch { /* non-critical — worst case they just start with a blank form */ }

      // Timer
      const startedAt = new Date(candidateData.started_at).getTime()
      const durationMs = examData.duration_minutes * 60 * 1000
      const elapsed = Date.now() - startedAt
      const remaining = Math.max(0, Math.floor((durationMs - elapsed) / 1000))
      setTimeLeft(remaining)
      setLoading(false)
    })
  }, [params, router])

  // Autosave answers as they go — debounced so we're not firing a request on
  // every keystroke. This is the actual fix for "the tab froze/closed and
  // everything was lost": whatever's saved here survives a refresh, a
  // crashed tab, or resuming on a completely different device, since it
  // lives server-side, not in this browser's memory or sessionStorage.
  useEffect(() => {
    if (loading || submitted.current) return
    if (Object.keys(answers).length === 0 && flagged.size === 0) return // nothing to save yet
    const timer = setTimeout(() => {
      fetch(`/api/candidates/${candidateIdRef.current}/autosave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, flagged: [...flagged] }),
      })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          // Caught mid-sitting, not just on load — e.g. the candidate was
          // idle/frozen when the admin's sweep finalized them, and this is
          // the first interaction since they came back.
          if (data?.submitted && !submitted.current) {
            submitted.current = true
            router.replace(`/exam/${examIdRef.current}/results?candidate=${candidateIdRef.current}`)
          }
        })
        .catch(() => { /* best-effort — next change will retry */ })
    }, 2000)
    return () => clearTimeout(timer)
  }, [answers, flagged, loading])

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

    // The register page already requests fullscreen synchronously on the
    // "Start Exam" click (the only reliable place to do it — see that
    // page's handleSubmit), and it persists across this client-side
    // navigation. If we're already in fullscreen, there's nothing to do.
    // If not — the earlier request failed or this page was reached some
    // other way — try again here, but unlike before, a failure is no
    // longer silent: show the warning banner immediately and log it, so
    // there's never a gap where proctoring silently isn't active with no
    // record of it.
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.()
        .then(() => setFullscreenWarning(false))
        .catch(() => {
          setFullscreenWarning(true)
          logSecurity("fullscreen_exit")
        })
    }

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

  function markIntroSeen(sectionId: string) {
    setIntroSeenSections((prev) => {
      const next = new Set(prev)
      next.add(sectionId)
      sessionStorage.setItem(`intro_seen_${examIdRef.current}`, JSON.stringify([...next]))
      return next
    })
  }

  function toggleFlag(questionId: string) {
    setFlagged((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      sessionStorage.setItem(`flagged_${examIdRef.current}`, JSON.stringify([...next]))
      return next
    })
  }

  function trySubmit() {
    const unanswered = questions
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => answers[q.id] === undefined)
      .map(({ i }) => i + 1)

    // One combined review screen for whichever applies — an unanswered
    // question that's ALSO flagged shows up in both lists, since both facts
    // are true and worth seeing. Neither list blocks submission either way.
    if (unanswered.length > 0 || flagged.size > 0) {
      setUnansweredList(unanswered)
      setShowReviewModal(true)
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

  // Sections are purely additive/visual — no navigation restrictions, the
  // dot/section navigators can still jump anywhere at any time.
  const sectionOrder = Array.from(new Set(questions.map((q) => q.section_id).filter(Boolean))) as string[]
  const sectionNumber = question?.section_id ? sectionOrder.indexOf(question.section_id) + 1 : 0
  // An intro screen appears once per section, the first time the candidate
  // LANDS on one of its questions — whether via Next or a jump.
  const needsIntro = !!question?.section_id && !introSeenSections.has(question.section_id)

  function jumpToSection(sectionId: string) {
    const idx = questions.findIndex((q) => q.section_id === sectionId)
    if (idx !== -1) setCurrentIdx(idx)
  }

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
        {question && needsIntro && question.section ? (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border shadow-sm px-6 py-10 sm:py-14 text-center space-y-4">
              <p className="text-xs font-semibold text-[#1B4F8A] uppercase tracking-wide">
                Section {sectionNumber} of {sectionOrder.length}
              </p>
              <h2 className="text-2xl font-bold text-[#1B4F8A]">{question.section.title}</h2>
              {question.section.description && (
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  {question.section.description}
                </p>
              )}
              <div className="pt-2">
                <Button
                  onClick={() => markIntroSeen(question.section_id)}
                  className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-1.5"
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {sectionOrder.length > 1 && (
              <div className="flex flex-wrap gap-1.5 justify-center">
                {sectionOrder.map((sid, i) => (
                  <button
                    key={sid}
                    onClick={() => jumpToSection(sid)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      sid === question.section_id
                        ? "bg-[#1B4F8A] text-white border-[#1B4F8A]"
                        : "bg-white text-muted-foreground hover:border-[#1B4F8A]/40"
                    }`}
                  >
                    {i + 1}. {questions.find((q) => q.section_id === sid)?.section?.title ?? `Section ${i + 1}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : question && (
          <div className="space-y-4">
            {question.section_id && question.section && (
              <p className="text-xs font-semibold text-[#1B4F8A] uppercase tracking-wide">
                Section {sectionNumber} of {sectionOrder.length} — {question.section.title}
              </p>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground font-medium">
                Question {currentIdx + 1} of {questions.length}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{formatScore(question.display_score ?? question.score)} pts</Badge>
                <button
                  type="button"
                  onClick={() => toggleFlag(question.id)}
                  aria-pressed={flagged.has(question.id)}
                  title={flagged.has(question.id) ? "Unflag this question" : "Flag this question for review"}
                  className={`flex items-center gap-1 h-6 px-2 rounded-full text-xs font-medium border transition-colors ${
                    flagged.has(question.id)
                      ? "bg-amber-100 text-amber-700 border-amber-300"
                      : "bg-white text-muted-foreground border-border hover:border-amber-300 hover:text-amber-600"
                  }`}
                >
                  <Flag className={`h-3 w-3 ${flagged.has(question.id) ? "fill-amber-500" : ""}`} />
                  {flagged.has(question.id) ? "Flagged" : "Flag"}
                </button>
              </div>
            </div>

            <Card className="shadow-sm">
              <CardContent className="pt-6 pb-6">
                <p className="font-semibold text-base mb-5 leading-relaxed">{question.text}</p>

                {question.image_url && (
                  <img
                    src={question.image_url}
                    alt=""
                    className="max-h-80 w-auto rounded-lg border mb-5 select-none"
                    draggable={false}
                  />
                )}

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

            {/* Section navigator — only rendered when the exam actually has sections */}
            {sectionOrder.length > 1 && (
              <div className="flex flex-wrap gap-1.5 justify-center">
                {sectionOrder.map((sid, i) => (
                  <button
                    key={sid}
                    onClick={() => jumpToSection(sid)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      sid === question.section_id
                        ? "bg-[#1B4F8A] text-white border-[#1B4F8A]"
                        : "bg-white text-muted-foreground hover:border-[#1B4F8A]/40"
                    }`}
                  >
                    {i + 1}. {questions.find((q) => q.section_id === sid)?.section?.title ?? `Section ${i + 1}`}
                  </button>
                ))}
              </div>
            )}

            {/* Question dot navigator */}
            <div className="flex flex-wrap gap-1.5 justify-center pt-2">
              {questions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIdx(i)}
                  aria-label={`Question ${i + 1}${answers[q.id] !== undefined ? ", answered" : ", unanswered"}${flagged.has(q.id) ? ", flagged for review" : ""}`}
                  className={`relative w-7 h-7 rounded-full text-xs font-medium transition-colors ${
                    i === currentIdx
                      ? "bg-[#1B4F8A] text-white"
                      : answers[q.id] !== undefined
                      ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                      : "bg-white text-muted-foreground border"
                  }`}
                >
                  {i + 1}
                  {flagged.has(q.id) && (
                    <Flag className="absolute -top-1 -right-1 h-3 w-3 fill-amber-500 text-amber-500" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Combined pre-submit review — unanswered AND flagged shown together
          (whichever apply) so neither hides behind the other. A question
          that's both unanswered and flagged appears in both lists. */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 rounded-full p-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="font-bold text-lg">Before You Submit</h3>
            </div>

            {unansweredList.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{unansweredList.length} unanswered</span> question{unansweredList.length > 1 ? "s" : ""}:
                </p>
                <div className="flex flex-wrap gap-2">
                  {unansweredList.map((n) => (
                    <button
                      key={n}
                      onClick={() => { setCurrentIdx(n - 1); setShowReviewModal(false) }}
                      className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 text-sm font-medium hover:bg-amber-200 transition-colors"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {flagged.size > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Flag className="h-3.5 w-3.5 text-amber-600 fill-amber-500" />
                  <span className="font-semibold text-foreground">{flagged.size} flagged</span> for review:
                </p>
                <div className="flex flex-wrap gap-2">
                  {questions
                    .map((q, i) => ({ q, n: i + 1 }))
                    .filter(({ q }) => flagged.has(q.id))
                    .map(({ n }) => (
                      <button
                        key={n}
                        onClick={() => { setCurrentIdx(n - 1); setShowReviewModal(false) }}
                        className="w-8 h-8 rounded-full bg-amber-50 text-amber-700 border border-amber-300 text-sm font-medium hover:bg-amber-100 transition-colors"
                      >
                        {n}
                      </button>
                    ))}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">Click a number to go to that question, or submit anyway.</p>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowReviewModal(false)}>
                Go Back
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => { setShowReviewModal(false); handleSubmit(false) }}
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
