"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Loader2, User, Building2, Mail,
  BookOpen, CheckCircle2, Clock, BarChart2,
  GraduationCap, Award, FileText, AlertCircle,
  Calendar, Globe, Layers,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ── Types ────────────────────────────────────────────────────────

interface Student {
  id: string; name: string; email: string
  job_title: string | null; company: string | null
  department: string | null; language: string
  last_login: string | null; created_at: string
}

interface Enrollment {
  id: string; status: string; enrolled_at: string
  completed_at: string | null; progress_pct: number
  course: { id: string; title: string; status: string } | null
}

interface LearningPath { id: string; title: string; added_at: string }

interface QuizAttempt {
  id: string; score: number | null; total_score: number | null
  passed: boolean | null; submitted_at: string
  lms_quizzes: {
    id: string; title: string
    lms_content_items: {
      id: string; title: string; module_id: string
      lms_modules: { id: string; title: string; course_id: string } | null
    } | null
  } | null
}

interface AssignmentSub {
  id: string; status: string
  score: number | null; max_score: number | null
  instructor_note: string | null; submitted_at: string; graded_at: string | null
  file_url: string | null
  lms_modules: { id: string; title: string; course_id: string } | null
}

interface ExamSummary {
  module_id: string; module_title: string; course_id: string
  total_attempts: number; max_attempts: number
  passed: boolean; blocked: boolean
}

interface Progress {
  student: Student
  enrollments: Enrollment[]
  learning_paths: LearningPath[]
  quiz_attempts: QuizAttempt[]
  assignment_submissions: AssignmentSub[]
  exam_summaries: ExamSummary[]
}

// ── Helpers ──────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active:    "bg-blue-50 text-blue-700 border-blue-200",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    suspended: "bg-amber-50 text-amber-700 border-amber-200",
    passed:    "bg-emerald-50 text-emerald-700 border-emerald-200",
    failed:    "bg-red-50 text-red-700 border-red-200",
    submitted: "bg-violet-50 text-violet-700 border-violet-200",
    graded:    "bg-teal-50 text-teal-700 border-teal-200",
    pending:   "bg-slate-50 text-slate-600 border-slate-200",
  }
  return map[status] ?? "bg-slate-50 text-slate-600 border-slate-200"
}

// ── Stat card ────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = "text-[#1B4F8A]" }: {
  icon: React.ElementType; label: string; value: string | number
  sub?: string; color?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", color === "text-[#1B4F8A]" ? "bg-[#1B4F8A]/10" : "bg-emerald-50")}>
        <Icon className={cn("h-4 w-4", color)} />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

// ── Progress bar ─────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#1B4F8A] rounded-full transition-all"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────

export default function StudentProgressPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [data,    setData]    = useState<Progress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [tab,     setTab]     = useState<"enrollments" | "activities" | "assignments" | "exams">("enrollments")
  const [resetting, setResetting] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/lms/students/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError("Failed to load student data"); setLoading(false) })
  }, [id])

  if (loading) return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  )

  if (error || !data) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <AlertCircle className="h-8 w-8 text-red-400" />
      <p className="text-slate-600">{error ?? "Student not found"}</p>
      <Link href="/lms-admin/students">
        <Button variant="outline" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Students
        </Button>
      </Link>
    </div>
  )

  const { student, enrollments, learning_paths, quiz_attempts, assignment_submissions, exam_summaries = [] } = data

  const completedCourses = enrollments.filter(e => e.status === "completed").length
  const passedQuizzes    = quiz_attempts.filter(a => a.passed === true).length
  const avgScore = quiz_attempts.filter(a => a.score != null && a.total_score).length
    ? Math.round(
        quiz_attempts
          .filter(a => a.score != null && a.total_score)
          .reduce((acc, a) => acc + ((a.score! / a.total_score!) * 100), 0) /
        quiz_attempts.filter(a => a.score != null && a.total_score).length
      )
    : null

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back link */}
      <Link href="/lms-admin/students" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#1B4F8A] transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to Students
      </Link>

      {/* Student header card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-[#1B4F8A]/10 flex items-center justify-center text-[#1B4F8A] font-bold text-xl shrink-0">
            {student.name[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900">{student.name}</h1>
            <div className="flex flex-wrap gap-3 mt-1.5 text-sm text-slate-500">
              <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{student.email}</span>
              {student.company && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{student.company}</span>}
              {student.job_title && <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{student.job_title}</span>}
              <span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{student.language.toUpperCase()}</span>
              <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Joined {fmtDate(student.created_at)}</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />
                Last login: {student.last_login ? fmtDate(student.last_login) : <span className="text-slate-300">Never</span>}
              </span>
            </div>
            {learning_paths.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {learning_paths.map(p => (
                  <Badge key={p.id} variant="outline" className="text-xs gap-1">
                    <Layers className="h-3 w-3" />{p.title}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={BookOpen}      label="Enrolled Courses"   value={enrollments.length} />
        <StatCard icon={GraduationCap} label="Completed Courses"  value={completedCourses}
          color={completedCourses > 0 ? "text-emerald-600" : "text-[#1B4F8A]"} />
        <StatCard icon={Award}         label="Passed Quizzes"  value={passedQuizzes}
          sub={`of ${quiz_attempts.length} attempts`} />
        <StatCard icon={BarChart2}     label="Avg Score"
          value={avgScore != null ? `${avgScore}%` : "—"}
          sub="across all quizzes" />
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b border-slate-200 mb-4">
          {(["enrollments", "activities", "assignments", "exams"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition-colors",
                tab === t
                  ? "border-[#1B4F8A] text-[#1B4F8A]"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              {t === "enrollments"  ? `Courses (${enrollments.length})`
               : t === "activities" ? `Quizzes (${quiz_attempts.length})`
               : t === "assignments"? `Assignments (${assignment_submissions.length})`
               : `Exams (${exam_summaries.length})`}
            </button>
          ))}
        </div>

        {/* Enrollments tab */}
        {tab === "enrollments" && (
          <div className="space-y-2">
            {enrollments.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Not enrolled in any courses</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {enrollments.map(e => (
                  <div key={e.id} className="px-4 py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-slate-900 text-sm truncate">
                          {e.course?.title ?? "Unknown course"}
                        </p>
                        <Badge variant="outline" className={cn("text-xs shrink-0", statusBadge(e.status))}>
                          {e.status}
                        </Badge>
                      </div>
                      <ProgressBar pct={e.progress_pct} />
                      <p className="text-xs text-slate-400 mt-1">
                        Enrolled {fmtDate(e.enrolled_at)}
                        {e.completed_at ? ` · Completed ${fmtDate(e.completed_at)}` : ""}
                      </p>
                    </div>
                    {e.course && (
                      <Link href={`/lms-admin/courses/${e.course.id}`}>
                        <Button variant="ghost" size="sm" className="text-xs text-slate-500 hover:text-[#1B4F8A] shrink-0">
                          View Course
                        </Button>
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quizzes tab */}
        {tab === "activities" && (
          <div>
            {quiz_attempts.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No quiz attempts yet</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Quiz</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Module</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Score</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Result</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {quiz_attempts.map(a => {
                      const pct = a.score != null && a.total_score
                        ? Math.round((a.score / a.total_score) * 100) : null
                      return (
                        <tr key={a.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800">{a.lms_quizzes?.title ?? "—"}</p>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-slate-500 text-xs">
                            {a.lms_quizzes?.lms_content_items?.lms_modules?.title ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            {pct != null
                              ? <span className="font-medium tabular-nums">{pct}%</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {a.passed === true && (
                              <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">Passed</Badge>
                            )}
                            {a.passed === false && (
                              <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">Failed</Badge>
                            )}
                            {a.passed == null && <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell text-slate-400 text-xs">
                            {fmtDate(a.submitted_at)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Assignments tab */}
        {tab === "assignments" && (
          <div>
            {assignment_submissions.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No assignment submissions yet</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Assignment</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Score</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Submitted</th>
                      <th className="px-4 py-3 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assignment_submissions.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{s.lms_modules?.title ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn("text-xs", statusBadge(s.status))}>
                            {s.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 tabular-nums font-medium">
                          {s.score != null && s.max_score
                            ? `${Math.round((s.score / s.max_score) * 100)}%`
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-slate-400 text-xs">
                          {fmtDate(s.submitted_at)}
                        </td>
                        <td className="px-4 py-3">
                          {s.file_url && (
                            <a
                              href={s.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-[#1B4F8A] hover:underline"
                            >
                              File
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

        {/* Exams tab */}
        {tab === "exams" && (
          <div>
            {exam_summaries.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <GraduationCap className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No exam attempts yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {exam_summaries.map((ex: any) => (
                  <div key={ex.module_id} className={cn(
                    "bg-white rounded-xl border px-5 py-4 flex items-center gap-4",
                    ex.blocked ? "border-red-200 bg-red-50/30" : "border-slate-200"
                  )}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 text-sm">{ex.module_title}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-slate-400">
                          {ex.total_attempts} / {ex.max_attempts === 99 ? "∞" : ex.max_attempts} attempts used
                        </span>
                        {ex.passed && (
                          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">Passed</Badge>
                        )}
                        {ex.blocked && (
                          <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">Max attempts reached</Badge>
                        )}
                        {!ex.passed && !ex.blocked && (
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">In progress</Badge>
                        )}
                      </div>
                    </div>
                    {!ex.passed && (
                      <button
                        disabled={resetting === ex.module_id}
                        onClick={async () => {
                          if (!confirm(`Reset all exam attempts for "${ex.module_title}"? This cannot be undone.`)) return
                          setResetting(ex.module_id)
                          await fetch(`/api/lms/exam-attempt?module_id=${ex.module_id}&student_id=${student.id}`, { method: "DELETE" })
                          setResetting(null)
                          fetch(`/api/lms/students/${student.id}`)
                            .then(r => r.json())
                            .then(d => setData(d))
                        }}
                        className={cn(
                          "shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                          ex.blocked
                            ? "border-red-300 text-red-600 hover:bg-red-50"
                            : "border-slate-200 text-slate-500 hover:bg-slate-50",
                          resetting === ex.module_id && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {resetting === ex.module_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Reset attempts
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
