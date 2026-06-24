"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Loader2, AlertCircle, BookOpen, FileText, GraduationCap,
  Package, Shield, ChevronDown, ChevronUp, CheckCircle2, XCircle,
  Calendar, AlertTriangle, Monitor, Download, MousePointer, Clipboard, Eye,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ── Types ────────────────────────────────────────────────────────────────────

interface CourseDetail {
  course:      { id: string; title: string; status: string; delivery_mode: string | null }
  enrollment:  { id: string; status: string; enrolled_at: string; completed_at: string | null }
  progress_pct: number
  quizzes:     any[]
  assignments: any[]
  exams:       any[]
  packages:    any[]
  security:    any[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function fmtDuration(seconds: number | null) {
  if (!seconds) return "—"
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-500" : "bg-[#1B4F8A]")} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-sm font-semibold tabular-nums w-10 text-right">{pct}%</span>
    </div>
  )
}

function PassBadge({ passed }: { passed: boolean | null }) {
  if (passed === true)  return <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">Passed</Badge>
  if (passed === false) return <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">Failed</Badge>
  return <span className="text-slate-300 text-xs">—</span>
}

function ViolationBadge({ count, label }: { count: number; label: string }) {
  if (count === 0) return <span className="text-xs text-slate-400">0 {label}</span>
  return <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 gap-1"><AlertTriangle className="h-3 w-3" />{count} {label}</Badge>
}

// Package quizzes use is_correct; exam questions use correct — handle both
const isOptCorrect = (o: any) => !!(o.correct || o.is_correct)

// ── Question review (single question with student answer) ────────────────────

function QuestionReview({
  num, q, answers, aiScores,
}: {
  num: number
  q: any
  answers: Record<string, any>
  aiScores?: Record<string, { score: number; justification: string }>
}) {
  const answer  = answers?.[q.id]
  const aiScore = aiScores?.[q.id]
  const max     = q.points ?? 1

  // Compute correctness + earned points
  let earned    = 0
  let graded    = false   // whether we can determine correctness
  if (q.type === "mcq_single" && q.options) {
    const correctId = q.options.find(isOptCorrect)?.id
    const given     = Array.isArray(answer) ? answer[0] : (answer as string)
    earned = correctId === given ? max : 0
    graded = answer !== undefined
  } else if (q.type === "mcq_multiple" && q.options) {
    const correctIds  = q.options.filter(isOptCorrect).map((o: any) => o.id) as string[]
    const givenIds: string[] = Array.isArray(answer) ? answer : answer ? [answer] : []
    const allCorrect  = correctIds.length === givenIds.length && correctIds.every(id => givenIds.includes(id))
    earned = allCorrect ? max : 0
    graded = answer !== undefined
  } else if (q.type === "open_ended") {
    earned = aiScore?.score ?? 0
    graded = true
  } else if (q.type === "ordering") {
    graded = Array.isArray(answer) && answer.length > 0
  } else if (q.type === "match_pair") {
    graded = answer != null && typeof answer === "object"
  }

  const isCorrect = graded && earned >= max && q.type !== "ordering" && q.type !== "match_pair"

  return (
    <div className={cn(
      "border rounded-lg p-3 bg-white text-xs",
      !graded                    ? "border-slate-200" :
      isCorrect                  ? "border-emerald-200" :
                                   "border-red-200"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-medium text-slate-700 leading-snug flex-1">
          <span className="text-slate-400 mr-1.5">Q{num}.</span>{q.text}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {graded && q.type !== "ordering" && q.type !== "match_pair" && (
            isCorrect
              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              : <XCircle className="h-3.5 w-3.5 text-red-500" />
          )}
          <span className={cn("font-bold tabular-nums", isCorrect ? "text-emerald-600" : "text-slate-500")}>
            {earned}/{max}
          </span>
        </div>
      </div>

      {/* MCQ options */}
      {(q.type === "mcq_single" || q.type === "mcq_multiple") && q.options && (
        <div className="space-y-0.5 mt-1">
          {q.options.map((opt: any) => {
            const givenIds: string[] = Array.isArray(answer) ? answer : answer ? [answer] : []
            const selected = givenIds.includes(opt.id)
            return (
              <div key={opt.id} className={cn(
                "flex items-center gap-2 px-2 py-1 rounded",
                selected && isOptCorrect(opt)  ? "bg-emerald-50 border border-emerald-200 text-emerald-800" :
                selected && !isOptCorrect(opt) ? "bg-red-50 border border-red-200 text-red-700" :
                !selected && isOptCorrect(opt) ? "bg-emerald-50/40 border border-dashed border-emerald-200 text-emerald-700" :
                "border border-transparent text-slate-500"
              )}>
                <span className="shrink-0 font-bold w-3">
                  {selected ? (isOptCorrect(opt) ? "✓" : "✗") : (isOptCorrect(opt) ? "·" : " ")}
                </span>
                <span className={cn("flex-1", isOptCorrect(opt) && "font-medium")}>{opt.text}</span>
                {isOptCorrect(opt) && !selected && <span className="text-emerald-600 shrink-0">Correct answer</span>}
                {isOptCorrect(opt) && selected  && <span className="text-emerald-600 shrink-0">Correct ✓</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Open-ended */}
      {q.type === "open_ended" && (
        <div className="space-y-1.5 mt-1">
          <div className="bg-slate-50 border border-slate-200 rounded p-2">
            <p className="text-slate-400 text-[10px] uppercase font-semibold mb-1">Student answer</p>
            {typeof answer === "string" && answer.trim()
              ? <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{answer}</p>
              : <p className="text-slate-400 italic">No answer provided</p>}
          </div>
          {aiScore && (
            <div className="bg-blue-50 border border-blue-100 rounded p-2">
              <p className="text-blue-500 text-[10px] uppercase font-semibold mb-1">
                AI Assessment · {earned}/{max} pts
              </p>
              <p className="text-slate-600 leading-relaxed">{aiScore.justification}</p>
            </div>
          )}
        </div>
      )}

      {/* Ordering */}
      {q.type === "ordering" && q.items && (
        <div className="space-y-0.5 mt-1">
          <p className="text-slate-400 text-[10px] uppercase font-semibold mb-1">Student order</p>
          {(Array.isArray(answer) ? (answer as string[]) : []).map((itemId: string, i: number) => {
            const item        = (q.items as any[]).find((it: any) => it.id === itemId)
            const correctIdx  = (q.items as any[]).findIndex((it: any) => it.id === itemId)
            const inPlace     = correctIdx === i
            return (
              <div key={itemId} className={cn(
                "flex items-center gap-2 px-2 py-1 rounded",
                inPlace ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"
              )}>
                <span className={cn("font-bold w-5 shrink-0", inPlace ? "text-emerald-600" : "text-red-500")}>{i + 1}.</span>
                <span className="flex-1">{item?.text ?? itemId}</span>
                {!inPlace && <span className="text-emerald-600 shrink-0">→ correct #{correctIdx + 1}</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Match pair */}
      {q.type === "match_pair" && q.pairs && (
        <div className="space-y-0.5 mt-1">
          {(q.pairs as any[]).map((pair: any) => {
            const studentMatch = (answer as Record<string, string>)?.[pair.id]
            const correct      = studentMatch === pair.right
            return (
              <div key={pair.id} className={cn(
                "flex items-center gap-2 px-2 py-1 rounded text-xs",
                correct ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"
              )}>
                <span className="font-medium text-slate-700 shrink-0 w-1/3">{pair.left}</span>
                <span className="text-slate-400 shrink-0">→</span>
                <span className={cn("flex-1", correct ? "text-emerald-700" : "text-red-600")}>
                  {studentMatch ?? <span className="italic text-slate-400">—</span>}
                </span>
                {!correct && (
                  <span className="text-emerald-600 shrink-0 text-[10px]">correct: {pair.right}</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Expandable exam attempt row ───────────────────────────────────────────────

function ExamAttemptRow({ attempt }: { attempt: any }) {
  const [open, setOpen] = useState(false)
  const pct      = attempt.max_score > 0 ? Math.round((attempt.score / attempt.max_score) * 100) : 0
  const questions = (attempt.questions ?? []) as any[]
  const answers   = (attempt.answers ?? {}) as Record<string, any>
  const aiScores  = (attempt.ai_feedback?.open_ended_scores ?? {}) as Record<string, { score: number; justification: string }>

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
          {attempt.attempt_no}
        </div>
        <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <div>
            <p className="text-xs text-slate-400">Score</p>
            <p className="font-semibold">{attempt.score}/{attempt.max_score} <span className="text-slate-400 font-normal">({pct}%)</span></p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Result</p>
            <PassBadge passed={attempt.passed} />
          </div>
          <div>
            <p className="text-xs text-slate-400">Duration</p>
            <p className="font-medium">{fmtDuration(attempt.time_spent_s)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Submitted</p>
            <p className="font-medium text-xs">{fmtDateTime(attempt.submitted_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {attempt.tab_switches > 0     && <ViolationBadge count={attempt.tab_switches}     label="tab" />}
          {attempt.fullscreen_exits > 0 && <ViolationBadge count={attempt.fullscreen_exits} label="fs" />}
          {attempt.right_clicks > 0     && <ViolationBadge count={attempt.right_clicks}     label="rc" />}
          {attempt.copy_attempts > 0    && <ViolationBadge count={attempt.copy_attempts}    label="cp" />}
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 space-y-4">
          {/* Security snapshot */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm pb-3 border-b border-slate-200">
            <div><p className="text-xs text-slate-400">Started</p><p className="text-xs font-medium">{fmtDateTime(attempt.started_at)}</p></div>
            <div><p className="text-xs text-slate-400">Tab switches</p><p className={cn("font-semibold text-sm", attempt.tab_switches > 0 ? "text-red-600" : "text-slate-500")}>{attempt.tab_switches}</p></div>
            <div><p className="text-xs text-slate-400">FS exits</p><p className={cn("font-semibold text-sm", attempt.fullscreen_exits > 0 ? "text-red-600" : "text-slate-500")}>{attempt.fullscreen_exits}</p></div>
            <div><p className="text-xs text-slate-400">Right clicks / Copy</p><p className={cn("font-semibold text-sm", (attempt.right_clicks + attempt.copy_attempts) > 0 ? "text-red-600" : "text-slate-500")}>{attempt.right_clicks} / {attempt.copy_attempts}</p></div>
          </div>

          {/* Q&A review */}
          {questions.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Answer Review · {questions.length} question{questions.length !== 1 ? "s" : ""}
              </p>
              <div className="space-y-2">
                {questions.map((q: any, i: number) => (
                  <QuestionReview key={q.id} num={i + 1} q={q} answers={answers} aiScores={aiScores} />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-center py-2 italic">No answer data available for this attempt</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Quiz detail panel (no student answers stored for package quizzes) ─────────

function QuizDetailRow({ quiz }: { quiz: any }) {
  const [open, setOpen] = useState(false)
  const questions = (quiz.questions ?? []) as any[]

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-4 py-3 font-medium text-slate-800">{quiz.title ?? "—"}</td>
        <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell">{quiz.module_title ?? "—"}</td>
        <td className="px-4 py-3 font-medium tabular-nums">
          {quiz.pct != null
            ? <span>{quiz.score}/{quiz.total_score} <span className="text-slate-400 text-xs">({quiz.pct}%)</span></span>
            : <span className="text-slate-300">Not attempted</span>}
        </td>
        <td className="px-4 py-3">
          {quiz.pct != null ? <PassBadge passed={quiz.passed} /> : <span className="text-slate-400 text-xs">—</span>}
        </td>
        <td className="px-4 py-3">
          {questions.length > 0 && (
            <button
              onClick={() => setOpen(o => !o)}
              className="flex items-center gap-1 text-xs text-[#1B4F8A] hover:text-[#153f6e] transition-colors"
              title="View questions"
            >
              <Eye className="h-3.5 w-3.5" />
              {open ? "Hide" : "View"}
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="px-4 pb-4 bg-slate-50 border-b border-slate-100">
            <div className="pt-3 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Quiz Questions · {questions.length} question{questions.length !== 1 ? "s" : ""}
                {quiz.pct != null && (
                  <span className="ml-2 normal-case font-normal text-slate-400">
                    Score: {quiz.score}/{quiz.total_score} ({quiz.pct}%) — {quiz.passed ? "Passed" : "Failed"}
                  </span>
                )}
              </p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 mb-2">
                Student's selected answers are not stored for package quizzes — correct answers are highlighted below.
              </div>
              {questions.map((q: any, i: number) => (
                <div key={q.id} className="border border-slate-200 rounded-lg p-3 bg-white text-xs">
                  <p className="font-medium text-slate-700 mb-1.5">
                    <span className="text-slate-400 mr-1.5">Q{i + 1}.</span>{q.text}
                    <span className="ml-2 text-slate-400 font-normal">({q.points ?? 1} pt{(q.points ?? 1) !== 1 ? "s" : ""})</span>
                  </p>
                  {(q.type === "mcq_single" || q.type === "mcq_multiple") && q.options && (
                    <div className="space-y-0.5 ml-4">
                      {(q.options as any[]).map((opt: any) => (
                        <div key={opt.id} className={cn(
                          "flex items-center gap-2 px-2 py-1 rounded",
                          (opt.is_correct || opt.correct)
                            ? "bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium"
                            : "text-slate-500"
                        )}>
                          <span className="w-3 shrink-0">{(opt.is_correct || opt.correct) ? "✓" : "○"}</span>
                          <span>{opt.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {q.type === "open_ended" && (
                    <p className="text-slate-400 italic ml-4">Open-ended — scored by AI</p>
                  )}
                  {q.type === "ordering" && q.items && (
                    <div className="ml-4 space-y-0.5">
                      {(q.items as any[]).map((item: any, idx: number) => (
                        <div key={item.id} className="flex items-center gap-2 text-emerald-700">
                          <span className="font-bold w-4 shrink-0">{idx + 1}.</span>
                          <span>{item.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {q.type === "match_pair" && q.pairs && (
                    <div className="ml-4 space-y-0.5">
                      {(q.pairs as any[]).map((pair: any) => (
                        <div key={pair.id} className="flex items-center gap-2 text-emerald-700">
                          <span className="font-medium">{pair.left}</span>
                          <span className="text-slate-400">→</span>
                          <span>{pair.right}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CourseProgressDetail({
  params,
}: {
  params: Promise<{ studentId: string; courseId: string }>
}) {
  const { studentId, courseId } = use(params)
  const [data,    setData]    = useState<CourseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [tab,     setTab]     = useState<"quizzes" | "assignments" | "exams" | "packages" | "security">("exams")

  useEffect(() => {
    fetch(`/api/lms/progress/${studentId}/course/${courseId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setData(d); setLoading(false)
      })
      .catch(() => { setError("Failed to load"); setLoading(false) })
  }, [studentId, courseId])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
  if (error || !data) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <AlertCircle className="h-8 w-8 text-red-400" />
      <p className="text-slate-500">{error ?? "Not found"}</p>
      <Link href={`/lms-admin/progress/${studentId}`}><Badge variant="outline" className="gap-1 cursor-pointer"><ArrowLeft className="h-3 w-3" />Back</Badge></Link>
    </div>
  )

  const { course, enrollment, progress_pct, quizzes, assignments, exams, packages, security } = data

  const totalViolations = security.reduce((s, ex) => s + ex.total_tab_switches + ex.total_fullscreen_exits + ex.total_right_clicks + ex.total_copy_attempts, 0)

  const tabs = [
    { key: "exams",       label: `Exams (${exams.length})`,             icon: GraduationCap },
    { key: "assignments", label: `Assignments (${assignments.length})`,  icon: FileText },
    { key: "quizzes",     label: `Quizzes (${quizzes.length})`,          icon: BookOpen },
    ...(packages.length > 0 ? [{ key: "packages", label: `Packages (${packages.length})`, icon: Package }] : []),
    { key: "security",    label: `Security${totalViolations > 0 ? ` ⚠ ${totalViolations}` : ""}`, icon: Shield },
  ] as const

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <Link href={`/lms-admin/progress/${studentId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#1B4F8A] transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Student Overview
      </Link>

      {/* Course header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-[#1B4F8A]/10 flex items-center justify-center shrink-0">
            <BookOpen className="h-5 w-5 text-[#1B4F8A]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{course.title}</h1>
              <Badge variant="outline" className={cn("text-xs capitalize",
                enrollment.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                enrollment.status === "dropped"   ? "bg-red-50 text-red-700 border-red-200" :
                "bg-blue-50 text-blue-700 border-blue-200"
              )}>{enrollment.status}</Badge>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 mt-1">
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Enrolled {fmtDate(enrollment.enrolled_at)}</span>
              {enrollment.completed_at && <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" />Completed {fmtDate(enrollment.completed_at)}</span>}
              {course.delivery_mode && <span className="capitalize">{course.delivery_mode}</span>}
            </div>
          </div>
          {totalViolations > 0 && (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1 shrink-0">
              <AlertTriangle className="h-3 w-3" />{totalViolations} violation{totalViolations !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* Overall progress */}
        <div className="mt-5 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">Overall Progress</span>
            {enrollment.status === "completed" && <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Complete</span>}
          </div>
          <ProgressBar pct={progress_pct} />
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100 text-center">
          <div>
            <p className="text-lg font-bold text-slate-900">{exams.filter(e => e.passed).length}/{exams.length}</p>
            <p className="text-xs text-slate-400">Exams Passed</p>
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">{assignments.filter((a: any) => a.status === "graded").length}/{assignments.length}</p>
            <p className="text-xs text-slate-400">Assignments</p>
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">{quizzes.filter((q: any) => q.passed).length}/{quizzes.length}</p>
            <p className="text-xs text-slate-400">Quizzes Passed</p>
          </div>
          <div>
            <p className={cn("text-lg font-bold", totalViolations > 0 ? "text-red-600" : "text-slate-900")}>{totalViolations}</p>
            <p className="text-xs text-slate-400">Violations</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                tab === key ? "border-[#1B4F8A] text-[#1B4F8A]" : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        {/* ── Exams ── */}
        {tab === "exams" && (
          <div className="space-y-4">
            {exams.length === 0 ? (
              <div className="text-center py-16 text-slate-400"><GraduationCap className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No exam attempts yet</p></div>
            ) : exams.map((ex: any) => (
              <div key={ex.module_id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{ex.module_title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {ex.total_attempts} / {ex.max_attempts === 99 ? "∞" : ex.max_attempts} attempts used · Pass mark: {ex.pass_mark}%
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {ex.passed  && <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">Passed</Badge>}
                    {ex.blocked && <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">Max attempts reached</Badge>}
                    {!ex.passed && !ex.blocked && <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">In progress</Badge>}
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  {ex.attempts.map((a: any) => <ExamAttemptRow key={a.id} attempt={a} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Assignments ── */}
        {tab === "assignments" && (
          <div>
            {assignments.length === 0 ? (
              <div className="text-center py-16 text-slate-400"><FileText className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No assignment submissions yet</p></div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Assignment</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Score</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Submitted</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Graded</th>
                      <th className="px-4 py-3 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assignments.map((a: any) => (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{a.lms_modules?.title ?? "—"}</p>
                          {a.instructor_note && <p className="text-xs text-slate-400 mt-0.5 italic">"{a.instructor_note}"</p>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn("text-xs", {
                            "bg-violet-50 text-violet-700 border-violet-200": a.status === "submitted",
                            "bg-teal-50 text-teal-700 border-teal-200":       a.status === "graded",
                            "bg-slate-50 text-slate-500 border-slate-200":    a.status === "pending",
                          })}>{a.status}</Badge>
                        </td>
                        <td className="px-4 py-3 font-medium tabular-nums">
                          {a.score != null && a.max_score
                            ? <span>{a.score}/{a.max_score} <span className="text-slate-400 text-xs">({Math.round((a.score/a.max_score)*100)}%)</span></span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell">{fmtDateTime(a.submitted_at)}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs hidden lg:table-cell">{fmtDateTime(a.graded_at)}</td>
                        <td className="px-4 py-3">
                          {a.file_url && (
                            <a href={a.file_url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-[#1B4F8A] hover:underline">
                              <Download className="h-3 w-3" />File
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Quizzes ── */}
        {tab === "quizzes" && (
          <div>
            {quizzes.length === 0 ? (
              <div className="text-center py-16 text-slate-400"><BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No quiz items in this course</p></div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Quiz</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Package Module</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Score</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Result</th>
                      <th className="px-4 py-3 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {quizzes.map((a: any) => (
                      <QuizDetailRow key={a.id} quiz={a} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Packages ── */}
        {tab === "packages" && (
          <div className="space-y-4">
            {packages.length === 0 ? (
              <div className="text-center py-16 text-slate-400"><Package className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No package modules in this course</p></div>
            ) : packages.map((pkg: any) => (
              <div key={pkg.package_id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Header */}
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{pkg.module_title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {pkg.completed_items} / {pkg.total_items} items completed
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn("text-sm font-bold",
                      pkg.status === "passed" ? "text-emerald-600" :
                      pkg.status === "failed"  ? "text-red-500" : "text-[#1B4F8A]"
                    )}>{pkg.content_pct}%</span>
                    <Badge variant="outline" className={cn("text-xs capitalize", {
                      "bg-emerald-50 text-emerald-700 border-emerald-200": pkg.status === "passed",
                      "bg-red-50 text-red-700 border-red-200":             pkg.status === "failed",
                      "bg-blue-50 text-blue-700 border-blue-200":          pkg.status === "in_progress",
                      "bg-slate-50 text-slate-500 border-slate-200":       pkg.status === "not_started",
                    })}>{pkg.status.replace(/_/g, " ")}</Badge>
                  </div>
                </div>
                {/* Progress bar = content coverage */}
                <div className="px-5 py-3">
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                    <div className={cn("h-full rounded-full transition-all",
                      pkg.status === "passed" ? "bg-emerald-500" :
                      pkg.status === "failed" ? "bg-red-400" : "bg-[#1B4F8A]"
                    )} style={{ width: `${pkg.content_pct}%` }} />
                  </div>
                  {pkg.last_activity_at && (
                    <p className="text-xs text-slate-400">Last activity: {fmtDateTime(pkg.last_activity_at)}</p>
                  )}
                  {pkg.items.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {(() => {
                        const doneIds = new Set<string>(pkg.completed_item_ids ?? [])
                        return pkg.items.map((item: any) => (
                        <div key={item.id} className="flex items-center gap-2 text-xs text-slate-600 py-1">
                          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                            doneIds.has(item.id) ? "bg-emerald-500" : "bg-slate-200"
                          )} />
                          <span className="capitalize text-slate-400 w-16 shrink-0">{item.type}</span>
                          <span>{item.title}</span>
                        </div>
                        ))
                      })()}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Security ── */}
        {tab === "security" && (
          <div className="space-y-4">
            {security.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No exams taken — no security data</p>
              </div>
            ) : security.map((ex: any) => (
              <div key={ex.module_id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className={cn("px-5 py-4 border-b border-slate-100 flex items-center justify-between",
                  ex.total_tab_switches + ex.total_fullscreen_exits + ex.total_right_clicks + ex.total_copy_attempts > 0 ? "bg-red-50" : "bg-slate-50"
                )}>
                  <div>
                    <p className="font-semibold text-slate-900">{ex.module_title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <ViolationBadge count={ex.total_tab_switches}     label="tab switches" />
                      <ViolationBadge count={ex.total_fullscreen_exits} label="fullscreen exits" />
                      <ViolationBadge count={ex.total_right_clicks}     label="right clicks" />
                      <ViolationBadge count={ex.total_copy_attempts}    label="copy attempts" />
                    </div>
                  </div>
                  {ex.total_tab_switches + ex.total_fullscreen_exits + ex.total_right_clicks + ex.total_copy_attempts > 0
                    ? <AlertTriangle className="h-5 w-5 text-red-500" />
                    : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                </div>
                <div className="divide-y divide-slate-100">
                  {ex.attempts.map((a: any) => {
                    const totalA = a.tab_switches + a.fullscreen_exits + a.right_clicks + a.copy_attempts
                    return (
                    <div key={a.attempt_no} className="px-5 py-3 flex items-center gap-4 text-sm">
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                        {a.attempt_no}
                      </div>
                      <div className="flex-1 text-xs text-slate-400">{fmtDateTime(a.submitted_at)}</div>
                      <div className="flex items-center gap-3">
                        <span className={cn("flex items-center gap-1 text-xs", a.tab_switches > 0 ? "text-red-600 font-medium" : "text-slate-400")}>
                          <Monitor className="h-3 w-3" />{a.tab_switches} tab{a.tab_switches !== 1 ? "s" : ""}
                        </span>
                        <span className={cn("flex items-center gap-1 text-xs", a.fullscreen_exits > 0 ? "text-red-600 font-medium" : "text-slate-400")}>
                          <Monitor className="h-3 w-3" />{a.fullscreen_exits} fullscreen
                        </span>
                        <span className={cn("flex items-center gap-1 text-xs", (a.right_clicks ?? 0) > 0 ? "text-red-600 font-medium" : "text-slate-400")}>
                          <MousePointer className="h-3 w-3" />{a.right_clicks ?? 0} right-click{(a.right_clicks ?? 0) !== 1 ? "s" : ""}
                        </span>
                        <span className={cn("flex items-center gap-1 text-xs", (a.copy_attempts ?? 0) > 0 ? "text-red-600 font-medium" : "text-slate-400")}>
                          <Clipboard className="h-3 w-3" />{a.copy_attempts ?? 0} copy
                        </span>
                        {totalA === 0 && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        {totalA > 0  && <XCircle className="h-4 w-4 text-red-500" />}
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {totalViolations === 0 && security.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <p className="text-sm text-emerald-700 font-medium">No security violations detected across all exam attempts.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
