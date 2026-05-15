"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react"

function AnswerDetail({ answer }: { answer: any }) {
  const q = answer.questions
  const type = q?.type

  if (type === "mcq_single") {
    const selected = (answer.answer_json ?? answer.answer_data)?.choice_id
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
    const selected: string[] = (answer.answer_json ?? answer.answer_data)?.choice_ids ?? []
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

  if (type === "ordering") {
    const submittedOrder: string[] = (answer.answer_json ?? answer.answer_data)?.order ?? []
    const items: any[] = q.ordering_items ?? []
    const itemMap = Object.fromEntries(items.map((it: any) => [it.id, it]))

    // Build correct order sorted by correct_position (0-based, matching submit route logic)
    const correctOrder = [...items].sort((a, b) => a.correct_position - b.correct_position)

    return (
      <div className="mt-3 space-y-3">
        {/* Candidate's submitted order */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Your order:</p>
          <div className="space-y-1.5">
            {submittedOrder.map((itemId, index) => {
              const item = itemMap[itemId]
              if (!item) return null
              // correct_position is 0-based (same as indexOf in submit route)
              const isCorrect = item.correct_position === index
              return (
                <div
                  key={itemId}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
                    isCorrect
                      ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                      : "border-red-300 bg-red-50 text-red-800"
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isCorrect ? "bg-emerald-200 text-emerald-800" : "bg-red-200 text-red-800"
                  }`}>
                    {index + 1}
                  </span>
                  <span className="flex-1">{item.text}</span>
                  {isCorrect
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    : <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                  }
                </div>
              )
            })}
          </div>
        </div>

        {/* Correct order */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Correct order:</p>
          <div className="space-y-1.5">
            {correctOrder.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-emerald-300 bg-emerald-50/60 text-emerald-800"
              >
                <span className="w-6 h-6 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center text-xs font-bold shrink-0">
                  {index + 1}
                </span>
                <span className="flex-1">{item.text}</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (type === "matching") {
    const submittedPairs: { left_id: string; right_id: string }[] = (answer.answer_json ?? answer.answer_data)?.pairs ?? []
    const allPairs: any[] = q.matching_pairs ?? []

    // Map pair id → { left_item, right_item }
    const pairMap = Object.fromEntries(allPairs.map((p: any) => [p.id, p]))

    return (
      <div className="mt-3 space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground mb-2">Your matches:</p>
        {submittedPairs.map(({ left_id, right_id }) => {
          const leftPair  = pairMap[left_id]   // the pair whose left side was shown
          const rightPair = pairMap[right_id]   // the pair whose right side was selected
          if (!leftPair) return null

          const isCorrect = left_id === right_id
          const correctRightItem = leftPair.right_item

          return (
            <div
              key={left_id}
              className={`rounded-lg border text-sm ${
                isCorrect ? "border-emerald-400 bg-emerald-50" : "border-red-300 bg-red-50"
              }`}
            >
              <div className="flex items-center gap-2 px-3 py-2">
                {/* Left side */}
                <span className="flex-1 font-medium text-slate-700">{leftPair.left_item}</span>
                <span className="text-muted-foreground text-xs shrink-0">→</span>
                {/* Right side (what candidate picked) */}
                <span className={`flex-1 text-right ${isCorrect ? "text-emerald-700" : "text-red-700 line-through"}`}>
                  {rightPair?.right_item ?? "(no answer)"}
                </span>
                {isCorrect
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  : <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                }
              </div>
              {/* Show correction if wrong */}
              {!isCorrect && (
                <div className="flex items-center gap-2 px-3 pb-2 pt-0">
                  <span className="flex-1" />
                  <span className="text-xs text-muted-foreground shrink-0">Correct:</span>
                  <span className="flex-1 text-right text-xs font-medium text-emerald-700">{correctRightItem}</span>
                  <span className="w-4 shrink-0" />
                </div>
              )}
            </div>
          )
        })}
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
