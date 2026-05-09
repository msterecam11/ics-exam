"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Loader2, Clock, ChevronLeft, ChevronRight, Send } from "lucide-react"
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
  const submitted = useRef(false)

  const handleSubmit = useCallback(async (auto = false) => {
    if (submitted.current) return
    submitted.current = true
    setSubmitting(true)

    if (auto) toast.info("Time's up! Submitting your exam...")

    const res = await fetch(`/api/exams/${examId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate_id: candidate.id, answers }),
    })

    setSubmitting(false)

    if (res.ok) {
      const result = await res.json()
      sessionStorage.setItem(`result_${examId}`, JSON.stringify(result))
      router.push(`/exam/${examId}/results?candidate=${candidate.id}`)
    } else {
      submitted.current = false
      toast.error("Submission failed. Please try again.")
    }
  }, [examId, candidate, answers, router])

  // Load exam + questions from API
  useEffect(() => {
    params.then(async ({ examId: id }) => {
      setExamId(id)

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

      // Fetch questions (public endpoint without choices is_correct hidden)
      const res = await fetch(`/api/exam/${id}/questions`)
      if (res.ok) {
        const qs = await res.json()
        setQuestions(qs)
      }

      // Set timer
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

  function setAnswer(questionId: string, value: any) {
    setAnswers((a) => ({ ...a, [questionId]: value }))
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
  const timerWarning = timeLeft < 300 // < 5 minutes

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
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

        {/* Progress bar */}
        <div className="h-1 bg-white/20">
          <div
            className="h-1 bg-white transition-all"
            style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
          />
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        {question && (
          <div className="space-y-4">
            {/* Question header */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground font-medium">
                Question {currentIdx + 1} of {questions.length}
              </span>
              <Badge variant="outline" className="text-xs">{question.score} pts</Badge>
            </div>

            {/* Question card */}
            <Card className="shadow-sm">
              <CardContent className="pt-6 pb-6">
                <p className="font-semibold text-base mb-5 leading-relaxed">{question.text}</p>

                {question.type === "mcq_single" && (
                  <MCQSingleQuestion
                    question={question}
                    value={answers[question.id]}
                    onChange={(v) => setAnswer(question.id, v)}
                  />
                )}
                {question.type === "mcq_multi" && (
                  <MCQMultiQuestion
                    question={question}
                    value={answers[question.id]}
                    onChange={(v) => setAnswer(question.id, v)}
                  />
                )}
                {question.type === "ordering" && (
                  <OrderingQuestion
                    question={question}
                    value={answers[question.id]}
                    onChange={(v) => setAnswer(question.id, v)}
                  />
                )}
                {question.type === "matching" && (
                  <MatchingQuestion
                    question={question}
                    value={answers[question.id]}
                    onChange={(v) => setAnswer(question.id, v)}
                  />
                )}
                {question.type === "open_ended" && (
                  <OpenEndedQuestion
                    question={question}
                    value={answers[question.id]}
                    onChange={(v) => setAnswer(question.id, v)}
                  />
                )}
              </CardContent>
            </Card>

            {/* Navigation */}
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
                  onClick={() => handleSubmit(false)}
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
              {questions.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIdx(i)}
                  className={`w-7 h-7 rounded-full text-xs font-medium transition-colors ${
                    i === currentIdx
                      ? "bg-[#1B4F8A] text-white"
                      : answers[questions[i].id] !== undefined
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
    </div>
  )
}
