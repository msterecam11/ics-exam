"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CheckCircle2, XCircle, Bot, Pencil, Check, X } from "lucide-react"
import { toast } from "sonner"

// Show the minimum decimal places needed — avoids 1.46 rounding to 1.5
function fmtPts(n: number): string {
  if (Number.isInteger(n)) return String(n)
  const s2 = parseFloat(n.toFixed(2))
  return s2 === Math.round(s2 * 10) / 10 ? s2.toFixed(1) : s2.toFixed(2)
}

function renderAnswer(answer: any) {
  const q = answer.questions
  if (!q) return null

  if (q.type === "open_ended") {
    return <p className="text-sm whitespace-pre-wrap">{answer.answer_text || <em className="text-muted-foreground">No answer</em>}</p>
  }

  if (q.type === "mcq_single") {
    const choice = q.choices?.find((c: any) => c.id === answer.answer_json?.choice_id)
    return choice ? (
      <div className="flex items-center gap-2">
        {choice.is_correct ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
        <span className="text-sm">{choice.text}</span>
      </div>
    ) : <em className="text-sm text-muted-foreground">No answer</em>
  }

  if (q.type === "mcq_multi") {
    const ids: string[] = answer.answer_json?.choice_ids ?? []
    const selected = q.choices?.filter((c: any) => ids.includes(c.id))
    return selected?.length ? (
      <div className="space-y-1">
        {selected.map((c: any) => (
          <div key={c.id} className="flex items-center gap-2">
            {c.is_correct ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
            <span className="text-sm">{c.text}</span>
          </div>
        ))}
      </div>
    ) : <em className="text-sm text-muted-foreground">No answer</em>
  }

  if (q.type === "ordering") {
    const order: string[] = answer.answer_json?.order ?? []
    return order.length ? (
      <div className="space-y-1">
        {order.map((id, idx) => {
          const item = q.ordering_items?.find((i: any) => i.id === id)
          const correct = item?.correct_position === idx
          return item ? (
            <div key={id} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-4">{idx + 1}.</span>
              {correct ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
              <span className="text-sm">{item.text}</span>
            </div>
          ) : null
        })}
      </div>
    ) : <em className="text-sm text-muted-foreground">No answer</em>
  }

  if (q.type === "matching") {
    const pairs: { left_id: string; right_id: string }[] = answer.answer_json?.pairs ?? []
    const cp = q.matching_pairs ?? []
    return pairs.length ? (
      <div className="space-y-1">
        {pairs.map((p, idx) => {
          const left = cp.find((x: any) => x.id === p.left_id)
          const right = cp.find((x: any) => x.id === p.right_id)
          const correct = left && right && left.right_item === right.right_item
          return (
            <div key={idx} className="flex items-center gap-2 text-sm">
              {correct ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
              <span className="font-medium">{left?.left_item}</span>
              <span className="text-muted-foreground">→</span>
              <span>{right?.right_item}</span>
            </div>
          )
        })}
      </div>
    ) : <em className="text-sm text-muted-foreground">No answer</em>
  }

  return null
}

interface Props {
  answer: any
  index: number
  onScoreUpdate?: (answerId: string, newScore: number, newTotal: number, passed: boolean) => void
  readOnly?: boolean
}

export default function AnswerCard({ answer, index, onScoreUpdate, readOnly = false }: Props) {
  const q = answer.questions
  const maxScore = q?.score ?? 0

  const [score, setScore] = useState<number>(answer.score_achieved ?? 0)
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState("")
  const [saving, setSaving] = useState(false)

  // Question Bank exams draw a random subset per candidate, so raw question
  // weights don't sum to 100 for any given draw — display_possible/
  // display_achieved (computed server-side, same scaleToTarget used
  // everywhere else) show scaled points instead. Deriving the displayed
  // achieved value from the live `score` state (not the server's static
  // display_achieved) keeps it in sync immediately after an edit, rather
  // than only after the next full reload. Editing itself always operates
  // on the real maxScore/score_achieved — never the scaled display values.
  const displayMax = answer.display_possible ?? maxScore
  const displayRatio = maxScore > 0 ? displayMax / maxScore : 0
  const displayScore = Math.round(score * displayRatio * 100) / 100

  const scoreColor = score >= maxScore ? "text-emerald-600" : score > 0 ? "text-amber-500" : "text-red-500"

  function startEdit() {
    setEditVal(score.toString())
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
  }

  async function saveEdit() {
    const newScore = parseFloat(editVal)
    if (isNaN(newScore) || newScore < 0 || newScore > maxScore) {
      toast.error(`Score must be between 0 and ${maxScore}`)
      return
    }
    setSaving(true)
    const res = await fetch(`/api/admin/answers/${answer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score_achieved: newScore }),
    })
    setSaving(false)
    if (!res.ok) { toast.error("Failed to update score"); return }
    const data = await res.json()
    setScore(data.score_achieved)
    setEditing(false)
    onScoreUpdate?.(answer.id, data.score_achieved, data.new_total, data.passed)
    toast.success("Score updated")
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs capitalize">{q?.type?.replace(/_/g, " ")}</Badge>
              <span className="text-xs text-muted-foreground">Q{index + 1}</span>
            </div>
            <CardTitle className="text-sm font-medium leading-snug">{q?.text}</CardTitle>
          </div>

          {/* Score display / edit */}
          <div className="shrink-0 text-right">
            {editing ? (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={maxScore}
                  step={0.5}
                  value={editVal}
                  onChange={(e) => setEditVal(e.target.value)}
                  className="w-20 h-7 text-sm text-right"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit() }}
                />
                <span className="text-xs text-muted-foreground">/ {maxScore}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={saveEdit} disabled={saving}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={cancelEdit}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <p className={`text-base font-bold ${scoreColor}`}>
                  {fmtPts(displayScore)} <span className="text-xs font-normal text-muted-foreground">/ {fmtPts(displayMax)}</span>
                </p>
                {!readOnly && (
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={startEdit} title="Override score">
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Candidate&apos;s Answer</p>
          {renderAnswer(answer)}
        </div>

        {answer.ai_justification && (
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Bot className="h-3.5 w-3.5 text-blue-600" />
              <p className="text-xs font-medium text-blue-700">Expert Evaluation</p>
            </div>
            <p className="text-xs text-blue-800 leading-relaxed">{answer.ai_justification}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
