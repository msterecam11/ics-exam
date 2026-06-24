"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Loader2, User, Building2, Mail, Globe, Calendar, Clock,
  BookOpen, Route, GraduationCap, ChevronRight, AlertCircle, TrendingUp,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface Student {
  id: string; name: string; email: string; job_title: string | null
  company: string | null; department: string | null; language: string
  last_login: string | null; created_at: string
}
interface Enrollment {
  id: string; status: string; enrolled_at: string; completed_at: string | null
  progress_pct: number
  course: { id: string; title: string; status: string; thumbnail_url: string | null; delivery_mode: string | null } | null
}
interface LearningPath { id: string; title: string; description: string | null; added_at: string }
interface Cohort {
  id: string; name: string; description: string | null
  mode: string; start_date: string | null; end_date: string | null
  added_at: string; track_id: string | null
}

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-[#1B4F8A] rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs text-slate-500 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  )
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active:    "bg-blue-50 text-blue-700 border-blue-200",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dropped:   "bg-red-50 text-red-700 border-red-200",
  }
  return map[status] ?? "bg-slate-50 text-slate-500 border-slate-200"
}

export default function StudentProgressOverview({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = use(params)
  const [data,    setData]    = useState<{ student: Student; enrollments?: Enrollment[]; learning_paths?: LearningPath[]; cohorts?: Cohort[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [tab,     setTab]     = useState<"courses" | "paths" | "cohorts">("courses")

  useEffect(() => {
    fetch(`/api/lms/students/${studentId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setData({
          student:        d.student,
          enrollments:    d.enrollments    ?? [],
          learning_paths: d.learning_paths ?? [],
          cohorts:        d.cohorts        ?? [],
        })
        setLoading(false)
      })
      .catch(() => { setError("Failed to load"); setLoading(false) })
  }, [studentId])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
  if (error || !data || !data.student) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <AlertCircle className="h-8 w-8 text-red-400" />
      <p className="text-slate-500">{error ?? "Student not found"}</p>
      <Link href="/lms-admin/progress"><Badge variant="outline" className="gap-1 cursor-pointer"><ArrowLeft className="h-3 w-3" /> Back</Badge></Link>
    </div>
  )

  const student       = data.student
  const enrollments   = data.enrollments   ?? []
  const learning_paths = data.learning_paths ?? []
  const cohorts       = data.cohorts       ?? []
  const completed = enrollments.filter(e => e.status === "completed").length

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <Link href="/lms-admin/progress" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#1B4F8A] transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Student Progress
      </Link>

      {/* Student card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-[#1B4F8A]/10 flex items-center justify-center text-[#1B4F8A] font-bold text-xl shrink-0">
            {student.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-slate-900">{student.name}</h1>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
              <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{student.email}</span>
              {student.company   && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{student.company}</span>}
              {student.job_title && <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{student.job_title}</span>}
              {student.department && <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{student.department}</span>}
              <span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{student.language.toUpperCase()}</span>
              <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Joined {fmtDate(student.created_at)}</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Last login: {fmtDate(student.last_login)}</span>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-slate-100">
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900">{enrollments.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">Enrolled Courses</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600">{completed}</p>
            <p className="text-xs text-slate-400 mt-0.5">Completed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-[#1B4F8A]">{learning_paths.length + cohorts.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">Paths & Cohorts</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b border-slate-200 mb-4">
          {([
            { key: "courses", label: `Courses (${enrollments.length})`,       icon: BookOpen },
            { key: "paths",   label: `Learning Paths (${learning_paths.length})`, icon: Route },
            { key: "cohorts", label: `Cohorts (${cohorts.length})`,            icon: GraduationCap },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === key ? "border-[#1B4F8A] text-[#1B4F8A]" : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        {/* ── Courses tab ── */}
        {tab === "courses" && (
          <div className="space-y-2">
            {enrollments.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Not enrolled in any courses</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {enrollments.map(e => (
                  <Link
                    key={e.id}
                    href={`/lms-admin/progress/${studentId}/course/${e.course?.id}`}
                    className={cn("flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors group", !e.course && "pointer-events-none")}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-slate-900 text-sm truncate">{e.course?.title ?? "Unknown"}</p>
                        <Badge variant="outline" className={cn("text-xs shrink-0", statusBadge(e.status))}>{e.status}</Badge>
                      </div>
                      <ProgressBar pct={e.progress_pct} />
                      <p className="text-xs text-slate-400 mt-1">
                        Enrolled {fmtDate(e.enrolled_at)}
                        {e.completed_at ? ` · Completed ${fmtDate(e.completed_at)}` : ""}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#1B4F8A] shrink-0 transition-colors" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Learning Paths tab ── */}
        {tab === "paths" && (
          <div className="space-y-2">
            {learning_paths.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Route className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Not in any learning path</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {learning_paths.map(p => (
                  <Link
                    key={p.id}
                    href={`/lms-admin/progress/${studentId}/path/${p.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                      <Route className="h-4 w-4 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 text-sm">{p.title}</p>
                      {p.description && <p className="text-xs text-slate-400 truncate mt-0.5">{p.description}</p>}
                      <p className="text-xs text-slate-400 mt-0.5">Added {fmtDate(p.added_at)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#1B4F8A] shrink-0 transition-colors" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Cohorts tab ── */}
        {tab === "cohorts" && (
          <div className="space-y-2">
            {cohorts.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <GraduationCap className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Not in any cohort</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {cohorts.map(c => (
                  <Link
                    key={c.id}
                    href={`/lms-admin/progress/${studentId}/cohort/${c.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                      <GraduationCap className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900 text-sm">{c.name}</p>
                        <Badge variant="outline" className="text-xs capitalize">{c.mode}</Badge>
                      </div>
                      {c.description && <p className="text-xs text-slate-400 truncate mt-0.5">{c.description}</p>}
                      <div className="flex gap-3 text-xs text-slate-400 mt-0.5">
                        <span>Added {fmtDate(c.added_at)}</span>
                        {c.start_date && <span>Starts {fmtDate(c.start_date)}</span>}
                        {c.end_date   && <span>Ends {fmtDate(c.end_date)}</span>}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#1B4F8A] shrink-0 transition-colors" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
