"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, ShieldAlert, ShieldCheck, Monitor, MousePointerClick, Copy, Clock } from "lucide-react"
import LmsAnswerCard from "@/components/lms/LmsAnswerCard"

interface Attempt {
  id: string
  attemptNo: number
  pct: number | null
  passed: boolean
  submittedAt: string | null
  timeS: number
  answers: any[]
  security: { tabs: number; fs: number; rightClicks: number; copyAttempts: number } | null
}
interface Props {
  courseId: string
  student: { id: string; name: string; email: string; company: string | null; job_title: string | null }
  courseTitle: string
  examTitle: string
  passMark: number
  hasExam: boolean
  attempts: Attempt[]
}

function fmtTime(s: number) {
  if (!s || s < 60) return s >= 1 ? `${s}s` : "—"
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function ExamAttemptsView({ courseId, student, courseTitle, examTitle, passMark, hasExam, attempts }: Props) {
  // Default to the best attempt (highest pct)
  const bestIdx = attempts.length
    ? attempts.reduce((best, a, i, arr) => ((a.pct ?? -1) > (arr[best].pct ?? -1) ? i : best), 0)
    : 0
  const [sel, setSel] = useState(bestIdx)
  const [tab, setTab] = useState<"answers" | "security">("answers")

  const back = (
    <Link href={`/lms-admin/reports/${courseId}/individuals`}
      className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-muted-foreground hover:text-slate-800">
      <ArrowLeft className="h-4 w-4" />
    </Link>
  )

  if (!hasExam || attempts.length === 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          {back}
          <div>
            <h2 className="text-xl font-bold leading-tight">{student.name}</h2>
            <p className="text-muted-foreground text-sm">{courseTitle} · {examTitle}</p>
          </div>
        </div>
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          {hasExam ? "This student hasn't attempted the final exam yet." : "This course has no final exam."}
        </CardContent></Card>
      </div>
    )
  }

  const a = attempts[sel]
  const total = (a.security?.tabs ?? 0) + (a.security?.fs ?? 0)
  const risk = total === 0 ? "clean" : total <= 2 ? "medium" : "high"
  const riskBadge = {
    clean:  <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Clean</Badge>,
    medium: <Badge className="bg-amber-100 text-amber-700 border-0 gap-1"><ShieldAlert className="h-3.5 w-3.5" /> Medium Risk</Badge>,
    high:   <Badge className="bg-red-100 text-red-700 border-0 gap-1"><ShieldAlert className="h-3.5 w-3.5" /> High Risk</Badge>,
  }[risk]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {back}
        <div>
          <h2 className="text-xl font-bold leading-tight">{student.name}</h2>
          <p className="text-muted-foreground text-sm">{courseTitle} · {examTitle}</p>
        </div>
      </div>

      {/* Summary */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">{student.name}</h2>
              <p className="text-sm text-muted-foreground">{student.email}{student.company ? ` · ${student.company}` : ""}</p>
              {student.job_title && <p className="text-sm text-muted-foreground">{student.job_title}</p>}
            </div>
            <div className="text-right space-y-2">
              <p className={`text-3xl font-bold ${a.passed ? "text-emerald-600" : "text-red-500"}`}>{a.pct ?? 0}%</p>
              <Badge className={a.passed ? "bg-emerald-100 text-emerald-700 border-0" : "bg-red-100 text-red-700 border-0"}>
                {a.passed ? "Passed" : "Failed"} · Passing: {passMark}%
              </Badge>
              <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                <Clock className="h-3 w-3" /> {fmtTime(a.timeS)}
                {a.submittedAt ? ` · ${new Date(a.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
              </p>
            </div>
          </div>

          {/* Attempt selector */}
          {attempts.length > 1 && (
            <div className="flex items-center gap-2 mt-4 pt-4 border-t flex-wrap">
              <span className="text-xs text-muted-foreground mr-1">Attempts:</span>
              {attempts.map((at, i) => (
                <button key={at.id} onClick={() => setSel(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    i === sel ? "border-[#1B4F8A] bg-[#1B4F8A] text-white"
                              : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  #{at.attemptNo} · {at.pct ?? 0}% · {at.passed ? "Pass" : "Fail"}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex border-b">
        <button onClick={() => setTab("answers")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "answers" ? "border-[#1B4F8A] text-[#1B4F8A]" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          Answers ({a.answers.length})
        </button>
        <button onClick={() => setTab("security")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${tab === "security" ? "border-[#1B4F8A] text-[#1B4F8A]" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <ShieldAlert className="h-3.5 w-3.5" /> Security
        </button>
      </div>

      {/* Answers */}
      {tab === "answers" && (
        <div className="space-y-4">
          {a.answers.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No answers recorded.</CardContent></Card>
          ) : (
            a.answers.map((it, idx) => (
              <LmsAnswerCard key={it.id} index={idx} question={it.question} answer={it.answer} earned={it.earned} aiJustification={it.aiJustification} />
            ))
          )}
        </div>
      )}

      {/* Security */}
      {tab === "security" && (
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Security Report — Attempt #{a.attemptNo}</h3>
              {riskBadge}
            </div>
            {a.security ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Tab Switches", value: a.security.tabs, icon: Monitor },
                  { label: "Fullscreen Exits", value: a.security.fs, icon: Monitor },
                  { label: "Right-click Attempts", value: a.security.rightClicks, icon: MousePointerClick },
                  { label: "Copy/Cut Attempts", value: a.security.copyAttempts, icon: Copy },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                      <Icon className="h-3.5 w-3.5" /><span className="text-xs">{label}</span>
                    </div>
                    <p className={`text-2xl font-bold ${value > 2 ? "text-red-500" : value > 0 ? "text-amber-600" : "text-emerald-600"}`}>{value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground text-sm">
                <ShieldCheck className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                No security events captured for this attempt.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
