"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, Circle, Bot } from "lucide-react"

// Show the minimum decimal places needed (mirrors the exam-system AnswerCard).
function fmtPts(n: number): string {
  if (Number.isInteger(n)) return String(n)
  const s2 = parseFloat(n.toFixed(2))
  return s2 === Math.round(s2 * 10) / 10 ? s2.toFixed(1) : s2.toFixed(2)
}

interface Question {
  id: string
  type: string
  text: string
  points?: number
  options?: { id: string; text: string; correct?: boolean }[]
  items?:   { id: string; text: string }[]
  pairs?:   { id: string; left?: string; right?: string }[]
}
interface Props {
  index: number
  question: Question
  answer: any
  earned: number
  aiJustification?: string | null
}

// Renders the student's answer for every LMS exam question type, marking
// correct / incorrect the same way the exam player's review does.
function AnswerBody({ q, answer }: { q: Question; answer: any }) {
  const t = q.type

  if (t === "open_ended") {
    const has = typeof answer === "string" && answer.trim().length > 0
    return <p className="text-sm whitespace-pre-wrap">{has ? answer : <em className="text-muted-foreground">No answer</em>}</p>
  }

  if (t === "mcq_single" || t === "mcq_multiple") {
    const sel: string[] = t === "mcq_multiple"
      ? (Array.isArray(answer) ? answer : [])
      : (answer != null ? [Array.isArray(answer) ? answer[0] : answer] : [])
    if (!(q.options ?? []).length) return <em className="text-sm text-muted-foreground">No options</em>
    return (
      <div className="space-y-1">
        {(q.options ?? []).map(o => {
          const chosen = sel.includes(o.id)
          return (
            <div key={o.id} className={`flex items-center gap-2 text-sm ${o.correct ? "text-emerald-700 font-medium" : chosen ? "text-red-600" : "text-muted-foreground"}`}>
              {o.correct
                ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                : chosen ? <XCircle className="h-4 w-4 text-red-500 shrink-0" /> : <Circle className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
              <span>{o.text}</span>
              {chosen && !o.correct && <span className="text-[10px] text-red-400">(chosen)</span>}
            </div>
          )
        })}
      </div>
    )
  }

  if (t === "ordering") {
    const given: string[] = Array.isArray(answer) ? answer : []
    if (!(q.items ?? []).length) return <em className="text-sm text-muted-foreground">No answer</em>
    return (
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground mb-1">Correct order:</p>
        {(q.items ?? []).map((item, idx) => {
          const givenId = given[idx]
          const correct = givenId === item.id
          return (
            <div key={item.id} className={`flex items-center gap-2 text-sm ${correct ? "text-emerald-700" : "text-red-600"}`}>
              <span className="text-xs text-muted-foreground w-4">{idx + 1}.</span>
              {correct ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
              <span>{item.text}</span>
              {!correct && givenId && (
                <span className="ml-auto text-xs text-slate-400 line-through">
                  {(q.items ?? []).find(i => i.id === givenId)?.text ?? "?"}
                </span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  if (t === "match_pair") {
    const given: Record<string, string> = (answer && typeof answer === "object" && !Array.isArray(answer)) ? answer : {}
    if (!(q.pairs ?? []).length) return <em className="text-sm text-muted-foreground">No answer</em>
    return (
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground mb-1">Correct matches:</p>
        {(q.pairs ?? []).map(p => {
          const g = given[p.id]
          const correct = g === p.right
          return (
            <div key={p.id} className={`flex items-center gap-2 text-sm ${correct ? "text-emerald-700" : "text-red-600"}`}>
              {correct ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
              <span className="font-medium">{p.left}</span>
              <span className="text-muted-foreground">→</span>
              <span>{p.right}</span>
              {!correct && <span className="ml-auto text-xs text-slate-400">chose: <span className="line-through">{g ?? "—"}</span></span>}
            </div>
          )
        })}
      </div>
    )
  }

  // Unknown / future type — render raw so nothing is silently dropped.
  return (
    <p className="text-sm text-muted-foreground">
      {answer == null ? <em>No answer</em> : <span className="whitespace-pre-wrap">{typeof answer === "string" ? answer : JSON.stringify(answer)}</span>}
    </p>
  )
}

export default function LmsAnswerCard({ index, question, answer, earned, aiJustification }: Props) {
  const max = Number(question.points ?? 1)
  const color = earned >= max ? "text-emerald-600" : earned > 0 ? "text-amber-500" : "text-red-500"

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs capitalize">{question.type.replace(/_/g, " ")}</Badge>
              <span className="text-xs text-muted-foreground">Q{index + 1}</span>
            </div>
            <CardTitle className="text-sm font-medium leading-snug">{question.text}</CardTitle>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-base font-bold ${color}`}>
              {fmtPts(earned)} <span className="text-xs font-normal text-muted-foreground">/ {fmtPts(max)}</span>
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Student&apos;s Answer</p>
          <AnswerBody q={question} answer={answer} />
        </div>

        {aiJustification && (
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Bot className="h-3.5 w-3.5 text-blue-600" />
              <p className="text-xs font-medium text-blue-700">Expert Evaluation</p>
            </div>
            <p className="text-xs text-blue-800 leading-relaxed">{aiJustification}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
