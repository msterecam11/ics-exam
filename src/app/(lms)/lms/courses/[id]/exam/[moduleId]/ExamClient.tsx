"use client"

import { toast } from "sonner"
import FinalExamPlayer, { type ExamQuestion, type ExamSettings } from "@/components/lms/FinalExamPlayer"

interface Props {
  moduleId:    string
  courseId:    string
  examTitle:   string
  questions:   ExamQuestion[]
  settings:    ExamSettings | null
  attemptNo:   number
}

export default function ExamClient({ moduleId, courseId, examTitle, questions, settings, attemptNo }: Props) {
  async function handleSubmit(result: {
    score: number; maxScore: number; pct: number; passed: boolean
    answers: Record<string, any>; timeSpentS: number
    securityEvents: { tabs: number; fs: number }
  }) {
    try {
      const res = await fetch("/api/lms/exam-attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module_id:       moduleId,
          course_id:       courseId,
          score:           result.score,
          max_score:       result.maxScore,
          pct:             result.pct,
          passed:          result.passed,
          answers:         result.answers,
          time_spent_s:    result.timeSpentS,
          security_events: result.securityEvents,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save attempt")
        return null
      }
      return data as { score: number; max_score: number; pct: number; passed: boolean; ai_scores?: Record<string, { score: number; justification: string }> }
    } catch {
      toast.error("Connection error — your result was not saved. Please contact support.")
      return null
    }
  }

  return (
    <FinalExamPlayer
      questions={questions}
      settings={settings}
      examTitle={examTitle}
      attemptNo={attemptNo}
      onSubmit={handleSubmit}
      courseUrl={`/lms/courses/${courseId}`}
    />
  )
}
