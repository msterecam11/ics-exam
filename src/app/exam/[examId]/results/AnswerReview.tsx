"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react"

function AnswerDetail({ answer }: { answer: any }) {
  const q = answer.questions
  const type = q?.type

  if (type === "mcq_single") {
    const selected = answer.answer_data?.choice_id
    return (
      <div className="space-y-2 mt-3">
        {q.choices?.map((choice: any) => {
          const isSelected = choice.id === selected
          const isCorrect = choice.is_correct
          let style = "border bg-white text-slate-600"
          if (isSelected && isCorrect) style = "border-2 border-emerald-400 bg-emerald-50 text-emerald-700"
          else if (isSelected && !isCorrect) style = "border-2 border-red-400 bg-red-50 text-red-700"
          else if (!isSelected && isCorrect) style = "border-2 border-emerald-300 bg-emerald-50/50 text-emerald-600"
          return (
            <div key={choice.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${style}`}>
              {isSelected && isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
              {isSelected && !isCorrect && <XCircle className="h-4 w-4 shrink-0 text-red-500" />}
              {!isSelected && isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
              {!isSelected && !isCorrect && <span className="h-4 w-4 shrink-0" />}
              <span>{choice.text}</span>
              {isSelected && <span className="ml-auto text-xs font-medium">{isCorrect ? "Your answer ✓" : "Your answer ✗"}</span>}
              {!isSelected && isCorrect && <span className="ml-auto text-xs font-medium">Correct answer</span>}
            </div>
          )
        })}
      </div>
    )
  }

  if (type === "mcq_multi") {
    const selected: string[] = answer.answer_data?.choice_ids ?? []
    return (
      <div className="space-y-2 mt-3">
        {q.choices?.map((choice: any) => {
          const isSelected = selected.includes(choice.id)
          const isCorrect = choice.is_correct
          let style = "border bg-white text-slate-600"
          if (isSelected && isCorrect) style = "border-2 border-emerald-400 bg-emerald-50 text-emerald-700"
          else if (isSelected && !isCorrect) style = "border-2 border-red-400 bg-red-50 text-red-700"
          else if (!isSelected && isCorrect) style = "border-2 border-emerald-300 bg-emerald-50/50 text-emerald-600"
          return (
            <div key={choice.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${style}`}>
              {isSelected && isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
              {isSelected && !isCorrect && <XCircle className="h-4 w-4 shrink-0 text-red-500" />}
              {!isSelected && isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
              {!isSelected && !isCorrect && <span className="h-4 w-4 shrink-0" />}
              <span>{choice.text}</span>
              {isSelected && <span className="ml-auto text-xs font-medium">{isCorrect ? "✓ Selected" : "✗ Selected"}</span>}
              {!isSelected && isCorrect && <span className="ml-auto text-xs font-medium">Correct</span>}
            </div>
          )
        })}
      </div>
    )
  }

  if (type === "open_ended") {
    return (
      <div className="mt-3 space-y-2">
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Your answer:</p>
          <p className="text-sm">{answer.answer_text || "(no answer provided)"}</p>
        </div>
        {answer.ai_justification && (
          <div className="bg-purple-50 rounded-lg p-3">
            <p className="text-xs text-purple-600 font-medium mb-1">Expert evaluation:</p>
            <p className="text-sm text-purple-700">{answer.ai_justification}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <p className="text-xs text-muted-foreground mt-2 italic">
      Detailed review not available for this question type.
    </p>
  )
}

export default function AnswerReview({ answers }: { answers: any[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div>
      <h3 className="font-semibold text-base mb-3">Answer Review</h3>
      <div className="space-y-3">
        {answers?.map((answer: any, i: number) => {
          const q = answer.questions
          const correct = (answer.score_achieved ?? 0) >= q.score
          const partial = (answer.score_achieved ?? 0) > 0 && !correct
          const isOpen = expanded === answer.id

          return (
            <Card
              key={answer.id}
              className={`border-l-4 ${correct ? "border-l-emerald-400" : partial ? "border-l-amber-400" : "border-l-red-400"}`}
            >
              <CardContent className="py-4">
                <button
                  className="w-full text-left"
                  onClick={() => setExpanded(isOpen ? null : answer.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground font-medium">Q{i + 1}</span>
                        <Badge variant="outline" className="text-xs">{q.type?.replace("_", " ")}</Badge>
                        {correct
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          : partial
                          ? <span className="text-xs text-amber-600 font-medium">Partial</span>
                          : <XCircle className="h-4 w-4 text-red-400" />
                        }
                      </div>
                      <p className="text-sm font-medium">{q.text}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className={`font-bold text-sm ${correct ? "text-emerald-600" : partial ? "text-amber-600" : "text-red-500"}`}>
                          {answer.score_achieved ?? 0}/{q.score}
                        </p>
                        <p className="text-xs text-muted-foreground">pts</p>
                      </div>
                      {isOpen
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                  </div>
                </button>

                {isOpen && <AnswerDetail answer={answer} />}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
