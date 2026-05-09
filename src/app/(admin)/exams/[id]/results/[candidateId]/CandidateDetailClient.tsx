"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatScore } from "@/lib/utils"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { FileText } from "lucide-react"
import AnswerCard from "@/components/admin/AnswerCard"

interface Props {
  candidate: any
  answers: any[]
  examId: string
  candidateId: string
}

export default function CandidateDetailClient({ candidate, answers, examId, candidateId }: Props) {
  const exam = candidate.exams as any

  const [totalScore, setTotalScore] = useState<number>(candidate.total_score ?? 0)
  const [passed, setPassed] = useState<boolean>(candidate.passed ?? false)

  function handleScoreUpdate(_answerId: string, _newScore: number, newTotal: number, newPassed: boolean) {
    setTotalScore(newTotal)
    setPassed(newPassed)
  }

  return (
    <div className="space-y-6">
      {/* Candidate summary */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">{candidate.full_name}</h2>
              <p className="text-sm text-muted-foreground">{candidate.email} · {candidate.company}</p>
              <p className="text-sm text-muted-foreground">{candidate.job_title} · {candidate.years_of_experience}yr exp</p>
            </div>
            <div className="text-right space-y-2">
              <p className={`text-3xl font-bold ${passed ? "text-emerald-600" : "text-red-500"}`}>
                {formatScore(totalScore)}
              </p>
              <Badge className={passed ? "bg-emerald-100 text-emerald-700 border-0" : "bg-red-100 text-red-700 border-0"}>
                {passed ? "Passed" : "Failed"} · Passing: {exam?.passing_score}%
              </Badge>
              <div>
                <Link href={`/reports/candidate/${candidateId}`} target="_blank">
                  <Button size="sm" className="gap-2 bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
                    <FileText className="h-4 w-4" /> View Report
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Answers */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Answers ({answers.length} questions)
          </h3>
          <p className="text-xs text-muted-foreground">Click the pencil icon to override any score</p>
        </div>

        {answers.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No answers recorded.
            </CardContent>
          </Card>
        ) : (
          answers.map((answer, idx) => (
            <AnswerCard
              key={answer.id}
              answer={answer}
              index={idx}
              onScoreUpdate={handleScoreUpdate}
            />
          ))
        )}
      </div>
    </div>
  )
}
