"use client"

import { useEffect, useState } from "react"
import { useSession, signOut } from "next-auth/react"
import Image from "next/image"
import {
  LogOut, Eye, Loader2, AlertCircle, GraduationCap,
  Users, BookOpen, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Award,
} from "lucide-react"
import { cn, formatScore } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

// ─── Types ────────────────────────────────────────────────────────────────────
interface ExamCandidate {
  id: string; full_name: string; email: string
  job_title: string; company: string
  total_score: number | null; passed: boolean | null
  submitted_at: string | null; exam_id: string; exam_title: string
}

interface ExamItem {
  access_id: string; resource_type: string; resource_id: string
  label: string; permissions: Record<string, boolean>
  candidates: ExamCandidate[]
}

interface InterviewCandidate {
  id: string; full_name: string; position: string | null
  track_name: string | null; group_id: string; group_name: string
  scoring_progress: { scored_by: number; total_assessors: number }
  avg_score: number | null
  recommendation: string | null; confirmed: boolean
}

interface InterviewGroup {
  id: string; name: string; status: string
  scheduled_date: string | null; candidates: InterviewCandidate[]
}

interface InterviewItem {
  access_id: string; resource_type: string; resource_id: string
  label: string; permissions: Record<string, boolean>
  groups: InterviewGroup[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
    </div>
  )
}

function fmt(date: string | null) {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}


// ─── Exam section ─────────────────────────────────────────────────────────────
function ExamSection({ items }: { items: ExamItem[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [detail, setDetail]     = useState<ExamCandidate | null>(null)
  const [perms, setPerms]       = useState<Record<string, boolean>>({})

  const openDetail = (c: ExamCandidate, p: Record<string, boolean>) => {
    setDetail(c); setPerms(p)
  }

  if (items.length === 0)
    return <EmptyAccess label="exam" />

  return (
    <>
      <div className="space-y-4">
        {items.map(item => {
          const isOpen = expanded[item.access_id] !== false // default open
          const p = item.permissions
          return (
            <div key={item.access_id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Item header */}
              <button
                onClick={() => setExpanded(e => ({ ...e, [item.access_id]: !isOpen }))}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#1B4F8A]/10 flex items-center justify-center">
                    <GraduationCap className="h-4 w-4 text-[#1B4F8A]" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-slate-800 text-sm">{item.label}</p>
                    <p className="text-xs text-slate-400 capitalize mt-0.5">
                      {item.resource_type} · {item.candidates.length} candidate{item.candidates.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Permission badges */}
                  <div className="hidden sm:flex gap-1">
                    {(["scores", "results", "reports"] as const).map(k => p[k] && (
                      <span key={k} className="text-[10px] font-semibold uppercase tracking-wide bg-[#1B4F8A]/10 text-[#1B4F8A] px-2 py-0.5 rounded-full">
                        {k === "reports" ? "Results" : k}
                      </span>
                    ))}
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </div>
              </button>

              {/* Candidate list */}
              {isOpen && (
                item.candidates.length === 0 ? (
                  <p className="px-5 pb-5 text-sm text-slate-400">No candidates yet.</p>
                ) : (
                  <div className="border-t border-slate-100">
                    {/* Table header */}
                    <div className={cn(
                      "grid px-5 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50/60 border-b border-slate-100",
                      p.scores
                        ? "grid-cols-[1fr_auto_auto_auto_auto_auto]"
                        : "grid-cols-[1fr_auto_auto_auto]"
                    )}>
                      <span>Candidate</span>
                      {p.scores && <><span className="px-4 text-center">Score</span><span className="px-3 text-center">Result</span></>}
                      <span className="px-4 text-center">Submitted</span>
                      <span className="px-3 text-center">Results</span>
                      <span className="px-3 text-center">Report</span>
                    </div>
                    {item.candidates.map(c => (
                      <div key={c.id} className={cn(
                        "grid items-center px-5 py-3 border-b last:border-0 border-slate-50",
                        p.scores
                          ? "grid-cols-[1fr_auto_auto_auto_auto_auto]"
                          : "grid-cols-[1fr_auto_auto_auto]"
                      )}>
                        {/* Name */}
                        <div>
                          <p className="text-sm font-medium text-slate-800">{c.full_name}</p>
                          <p className="text-xs text-slate-400">{c.exam_title}</p>
                        </div>
                        {/* Score */}
                        {p.scores && (
                          <>
                            <p className="text-sm font-semibold text-slate-700 text-center px-4">
                              {c.total_score != null ? formatScore(c.total_score) : "—"}
                            </p>
                            <div className="flex justify-center px-3">
                              {c.passed == null ? (
                                <span className="text-xs text-slate-400">Pending</span>
                              ) : c.passed ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                                  <CheckCircle2 className="h-3 w-3" />Pass
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                  <XCircle className="h-3 w-3" />Fail
                                </span>
                              )}
                            </div>
                          </>
                        )}
                        {/* Date */}
                        <p className="text-xs text-slate-400 text-center px-4">{fmt(c.submitted_at)}</p>
                        {/* Results — answer breakdown */}
                        <div className="flex items-center justify-center px-3">
                          {p.results && (
                            <a href={`/viewer/results/candidate/${c.id}`} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs font-medium text-[#1B4F8A] hover:bg-[#1B4F8A]/10 px-2 py-1 rounded-lg transition-colors">
                              <Eye className="h-3.5 w-3.5" />Results
                            </a>
                          )}
                        </div>
                        {/* Report — full formatted report */}
                        <div className="flex items-center justify-center px-3">
                          {p.reports && (
                            <a href={`/viewer/report/candidate/${c.id}`} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs font-medium text-[#1B4F8A] hover:bg-[#1B4F8A]/10 px-2 py-1 rounded-lg transition-colors">
                              <Eye className="h-3.5 w-3.5" />Report
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )
        })}
      </div>

      {/* Detail modal */}
      <Dialog open={!!detail} onOpenChange={v => { if (!v) setDetail(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{detail?.full_name}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 py-1">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-slate-400">Exam</p><p className="font-medium text-slate-700">{detail.exam_title}</p></div>
                <div><p className="text-xs text-slate-400">Submitted</p><p className="font-medium text-slate-700">{fmt(detail.submitted_at)}</p></div>
                <div><p className="text-xs text-slate-400">Job Title</p><p className="font-medium text-slate-700">{detail.job_title || "—"}</p></div>
                <div><p className="text-xs text-slate-400">Company</p><p className="font-medium text-slate-700">{detail.company || "—"}</p></div>
              </div>
              {perms.scores && (
                <div className="bg-slate-50 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">Total Score</p>
                    <p className="text-2xl font-bold text-slate-800">{detail.total_score != null ? formatScore(detail.total_score) : "—"}</p>
                  </div>
                  {detail.passed != null && (
                    detail.passed
                      ? <span className="inline-flex items-center gap-1.5 text-sm font-semibold bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full"><CheckCircle2 className="h-4 w-4" />Passed</span>
                      : <span className="inline-flex items-center gap-1.5 text-sm font-semibold bg-red-100 text-red-700 px-3 py-1.5 rounded-full"><XCircle className="h-4 w-4" />Failed</span>
                  )}
                </div>
              )}
              {perms.results && (
                <div className="bg-amber-50 rounded-xl p-4">
                  <p className="text-xs text-amber-700 font-medium">Detailed answers are available in the Exam System.</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Interview section ────────────────────────────────────────────────────────
function InterviewSection({ items }: { items: InterviewItem[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (items.length === 0) return <EmptyAccess label="interview" />

  return (
    <>
      <div className="space-y-4">
        {items.map(item => {
          const isOpen = expanded[item.access_id] !== false
          const p = item.permissions
          const allCandidates = item.groups.flatMap(g => g.candidates)

          return (
            <div key={item.access_id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setExpanded(e => ({ ...e, [item.access_id]: !isOpen }))}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
                    <Users className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-slate-800 text-sm">{item.label}</p>
                    <p className="text-xs text-slate-400 capitalize mt-0.5">
                      {item.resource_type} · {allCandidates.length} candidate{allCandidates.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex gap-1">
                    {["progress", "scores", "reports"].map(k => p[k] && (
                      <span key={k} className="text-[10px] font-semibold uppercase tracking-wide bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                        {k}
                      </span>
                    ))}
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100">
                  {item.groups.map(group => (
                    <div key={group.id}>
                      {/* Group sub-header (only shown for config scope with multiple groups) */}
                      {item.resource_type === "config" && (
                        <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                          <p className="text-xs font-semibold text-slate-500">{group.name}
                            <span className={cn("ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full",
                              group.status === "published" ? "bg-emerald-100 text-emerald-600" :
                              group.status === "complete"  ? "bg-sky-100 text-sky-600" :
                                                            "bg-slate-100 text-slate-400"
                            )}>{group.status}</span>
                          </p>
                        </div>
                      )}

                      {group.candidates.length === 0 ? (
                        <p className="px-5 py-4 text-sm text-slate-400">No candidates in this group.</p>
                      ) : (
                        <>
                          <div className="grid grid-cols-[1fr_auto_auto_auto] px-5 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50/60 border-b border-slate-100">
                            <span>Candidate</span>
                            {p.progress && <span className="text-center px-3">Progress</span>}
                            {p.scores   && <span className="text-center px-3">Score</span>}
                            {p.reports  && <span className="text-center px-3">Report</span>}
                          </div>
                          {group.candidates.map(c => (
                            <div key={c.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center px-5 py-3 border-b last:border-0 border-slate-50">
                              <div>
                                <p className="text-sm font-medium text-slate-800">{c.full_name}</p>
                                <p className="text-xs text-slate-400">{c.position ?? "—"}{c.track_name ? ` · ${c.track_name}` : ""}</p>
                              </div>

                              {/* Progress */}
                              {p.progress && (
                                <div className="flex flex-col items-center px-3">
                                  <p className="text-xs font-semibold text-slate-700">
                                    {c.scoring_progress.scored_by}/{c.scoring_progress.total_assessors}
                                  </p>
                                  <p className="text-[10px] text-slate-400">scored</p>
                                </div>
                              )}

                              {/* Score */}
                              {p.scores && (
                                <div className="px-3 text-center">
                                  {c.avg_score != null ? (
                                    <span className={cn(
                                      "text-sm font-bold",
                                      c.avg_score >= 4 ? "text-emerald-600" :
                                      c.avg_score >= 3 ? "text-amber-600" : "text-red-500"
                                    )}>{c.avg_score}<span className="text-xs font-normal text-slate-400">/5</span></span>
                                  ) : (
                                    <span className="text-xs text-slate-300">—</span>
                                  )}
                                </div>
                              )}

                              {/* Report */}
                              {p.reports && (
                                <div className="flex justify-center px-3">
                                  <a
                                    href={`/viewer/report/${c.group_id}/${c.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors">
                                    <Eye className="h-3.5 w-3.5" />Report
                                  </a>
                                </div>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

    </>
  )
}

// ─── LMS types ───────────────────────────────────────────────────────────────
interface LmsStudent {
  id: string; name: string; email: string
  company: string | null; job_title: string | null
  enrollment_status?: string; enrolled_at?: string; completed_at?: string | null
  progress_pct: number | null
  quiz_avg_score: number | null
  attendance_pct: number | null
  assignments: { submitted: number; graded: number } | null
  certificate: { issued: boolean; released: boolean } | null
  // cohort scope extras
  courses_enrolled?: number; courses_completed?: number
  certificates_earned?: number | null
}

interface LmsItem {
  access_id: string; resource_type: string; resource_id: string
  label: string; permissions: Record<string, boolean>
  students: LmsStudent[]
}

// ─── LMS section ─────────────────────────────────────────────────────────────
function LmsSection({ items }: { items: LmsItem[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [detail, setDetail]     = useState<{ s: LmsStudent; p: Record<string, boolean> } | null>(null)

  if (items.length === 0) return <EmptyAccess label="LMS" />

  return (
    <>
      <div className="space-y-4">
        {items.map(item => {
          const isOpen = expanded[item.access_id] !== false
          const p = item.permissions
          const isCohort = item.resource_type === "cohort"

          return (
            <div key={item.access_id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Header */}
              <button
                onClick={() => setExpanded(e => ({ ...e, [item.access_id]: !isOpen }))}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <BookOpen className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-slate-800 text-sm">{item.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5 capitalize">
                      {item.resource_type} · {item.students.length} student{item.students.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex gap-1">
                    {["progress","scores","attendance","assignments","certificates"].map(k => p[k] && (
                      <span key={k} className="text-[10px] font-semibold uppercase tracking-wide bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">
                        {k}
                      </span>
                    ))}
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </div>
              </button>

              {/* Student list */}
              {isOpen && (
                item.students.length === 0 ? (
                  <p className="px-5 pb-5 text-sm text-slate-400">No students enrolled yet.</p>
                ) : (
                  <div className="border-t border-slate-100">
                    {/* Column headers */}
                    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] px-5 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50/60 border-b border-slate-100">
                      <span>Student</span>
                      {p.progress     && <span className="text-center px-3">{isCohort ? "Courses" : "Progress"}</span>}
                      {p.scores       && <span className="text-center px-3">Score</span>}
                      {p.attendance   && <span className="text-center px-3">Attend.</span>}
                      {p.certificates && <span className="text-center px-3">Cert.</span>}
                      <span className="text-center">Actions</span>
                    </div>

                    {item.students.map(s => (
                      <div key={s.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center px-5 py-3 border-b last:border-0 border-slate-50">
                        {/* Name */}
                        <div>
                          <p className="text-sm font-medium text-slate-800">{s.name}</p>
                          <p className="text-xs text-slate-400">{s.company ?? s.email}</p>
                        </div>

                        {/* Progress */}
                        {p.progress && (
                          <div className="px-3 text-center">
                            {isCohort ? (
                              <div>
                                <p className="text-xs font-semibold text-slate-700">{s.courses_completed ?? 0}/{s.courses_enrolled ?? 0}</p>
                                <p className="text-[10px] text-slate-400">done</p>
                              </div>
                            ) : s.progress_pct != null ? (
                              <div className="flex flex-col items-center gap-1">
                                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${s.progress_pct}%` }} />
                                </div>
                                <p className="text-[10px] text-slate-500">{s.progress_pct}%</p>
                              </div>
                            ) : <span className="text-xs text-slate-300">—</span>}
                          </div>
                        )}

                        {/* Score */}
                        {p.scores && (
                          <div className="px-3 text-center">
                            {s.quiz_avg_score != null
                              ? <span className="text-sm font-semibold text-slate-700">{s.quiz_avg_score}%</span>
                              : <span className="text-xs text-slate-300">—</span>}
                          </div>
                        )}

                        {/* Attendance */}
                        {p.attendance && (
                          <div className="px-3 text-center">
                            {s.attendance_pct != null
                              ? <span className={cn(
                                  "text-xs font-semibold",
                                  s.attendance_pct >= 80 ? "text-emerald-600" :
                                  s.attendance_pct >= 60 ? "text-amber-600" : "text-red-600"
                                )}>{s.attendance_pct}%</span>
                              : <span className="text-xs text-slate-300">—</span>}
                          </div>
                        )}

                        {/* Certificate */}
                        {p.certificates && (
                          <div className="px-3 flex justify-center">
                            {isCohort ? (
                              s.certificates_earned
                                ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                    <Award className="h-3 w-3" />{s.certificates_earned}
                                  </span>
                                : <span className="text-xs text-slate-300">—</span>
                            ) : s.certificate?.released ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                <Award className="h-3 w-3" />Issued
                              </span>
                            ) : s.certificate?.issued ? (
                              <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pending</span>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex justify-center">
                          {(p.assignments || p.scores || p.attendance) && (
                            <button onClick={() => setDetail({ s, p })}
                              className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors">
                              <Eye className="h-3.5 w-3.5" />View
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )
        })}
      </div>

      {/* Detail modal */}
      <Dialog open={!!detail} onOpenChange={v => { if (!v) setDetail(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{detail?.s.name}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 py-1">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-slate-400">Email</p><p className="font-medium text-slate-700 truncate">{detail.s.email}</p></div>
                <div><p className="text-xs text-slate-400">Company</p><p className="font-medium text-slate-700">{detail.s.company || "—"}</p></div>
                <div><p className="text-xs text-slate-400">Job Title</p><p className="font-medium text-slate-700">{detail.s.job_title || "—"}</p></div>
                {detail.p.progress && detail.s.progress_pct != null && (
                  <div><p className="text-xs text-slate-400">Progress</p><p className="font-medium text-slate-700">{detail.s.progress_pct}%</p></div>
                )}
              </div>

              {detail.p.scores && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-400 mb-1">Average Score</p>
                  <p className="text-2xl font-bold text-slate-800">
                    {detail.s.quiz_avg_score != null ? `${detail.s.quiz_avg_score}%` : "No attempts yet"}
                  </p>
                </div>
              )}

              {detail.p.attendance && detail.s.attendance_pct != null && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-400 mb-1">Attendance</p>
                  <p className={cn("text-2xl font-bold",
                    detail.s.attendance_pct >= 80 ? "text-emerald-600" :
                    detail.s.attendance_pct >= 60 ? "text-amber-600" : "text-red-600"
                  )}>{detail.s.attendance_pct}%</p>
                </div>
              )}

              {detail.p.assignments && detail.s.assignments && (
                <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-xl font-bold text-slate-800">{detail.s.assignments.submitted}</p>
                    <p className="text-xs text-slate-400">Submitted</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-emerald-600">{detail.s.assignments.graded}</p>
                    <p className="text-xs text-slate-400">Graded</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyAccess({ label }: { label: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <AlertCircle className="h-8 w-8 text-slate-200 mx-auto mb-3" />
      <p className="text-slate-500 font-medium">No {label} access assigned</p>
      <p className="text-slate-400 text-sm mt-1">Contact your administrator to get access.</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ViewerDashboard() {
  const { data: session } = useSession()
  const [examItems,      setExamItems]      = useState<ExamItem[]>([])
  const [interviewItems, setInterviewItems] = useState<InterviewItem[]>([])
  const [lmsItems,       setLmsItems]       = useState<LmsItem[]>([])
  const [loadingExam,    setLoadingExam]    = useState(true)
  const [loadingInt,     setLoadingInt]     = useState(true)
  const [loadingLms,     setLoadingLms]     = useState(true)
  const [activeTab,      setActiveTab]      = useState<"exam" | "interview" | "lms">("exam")

  useEffect(() => {
    fetch("/api/viewer/exam")
      .then(r => r.json())
      .then((d: ExamItem[]) => { setExamItems(Array.isArray(d) ? d : []); setLoadingExam(false) })
      .catch(() => setLoadingExam(false))

    fetch("/api/viewer/interview")
      .then(r => r.json())
      .then((d: InterviewItem[]) => { setInterviewItems(Array.isArray(d) ? d : []); setLoadingInt(false) })
      .catch(() => setLoadingInt(false))

    fetch("/api/viewer/lms")
      .then(r => r.json())
      .then((d: LmsItem[]) => { setLmsItems(Array.isArray(d) ? d : []); setLoadingLms(false) })
      .catch(() => setLoadingLms(false))
  }, [])

  const name    = session?.user?.name ?? "Viewer"
  const email   = session?.user?.email ?? ""
  const initial = name[0]?.toUpperCase() ?? "V"

  const tabs = [
    { id: "exam"      as const, label: "Exam System",  icon: GraduationCap, count: examItems.length,      color: "text-[#1B4F8A]",  border: "border-[#1B4F8A]"  },
    { id: "interview" as const, label: "Interview",    icon: Users,         count: interviewItems.length, color: "text-indigo-600", border: "border-indigo-500" },
    { id: "lms"       as const, label: "LMS",          icon: BookOpen,      count: lmsItems.length,       color: "text-emerald-600",border: "border-emerald-500" },
  ]

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Image src="/logo/logo-dark-blue.png" alt="ICS Aviation" width={140} height={38} className="object-contain" priority />
          <div className="h-5 w-px bg-slate-200 mx-1" />
          <div className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-sm font-semibold text-slate-500 tracking-wide">Viewer</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {initial}
            </div>
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-slate-800 leading-tight">{name}</p>
              <p className="text-xs text-slate-400 leading-tight">{email}</p>
            </div>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/auth/login" })}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100">
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Your assigned resources across ICS systems.</p>
        </div>

        {/* System tabs */}
        <div className="flex gap-1 border-b border-slate-200 mb-8">
          {tabs.map(tab => {
            const Icon     = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                  isActive ? `${tab.color} ${tab.border}` : "text-slate-500 border-transparent hover:text-slate-700"
                )}>
                <Icon className="h-4 w-4" />
                {tab.label}
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full font-semibold",
                  isActive ? "bg-slate-100" : "bg-slate-100 text-slate-400"
                )}>
                  <span className={isActive ? tab.color : "text-slate-400"}>{tab.count}</span>
                </span>
              </button>
            )
          })}
        </div>

        {/* Content */}
        {activeTab === "exam"      && (loadingExam ? <Spinner /> : <ExamSection      items={examItems}      />)}
        {activeTab === "interview" && (loadingInt  ? <Spinner /> : <InterviewSection items={interviewItems} />)}
        {activeTab === "lms"       && (loadingLms  ? <Spinner /> : <LmsSection       items={lmsItems}       />)}
      </main>

      <footer className="text-center py-5 text-xs text-slate-400 shrink-0">
        ICS Aviation — Integrated Consulting Services &nbsp;·&nbsp; Viewer Portal
      </footer>
    </div>
  )
}
