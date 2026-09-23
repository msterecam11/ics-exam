export const dynamic = "force-dynamic"

import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, ArrowRight, Building2, GitBranch, CalendarDays, CheckCircle2, Lock,
  Award, Clock, MapPin, Video, BookOpen, UserCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getStudentPrograms, nextCourse } from "@/lib/lms-student-portal"
import { sessionsForViewers, sessionToday, enrollmentAttendance } from "@/lib/lms-sessions"
import { DeadlineBadge, fmtDay, ProgressBar } from "@/components/lms/portal/PortalBits"
import CourseFeedbackForm from "@/components/lms/CourseFeedbackForm"
import { getProgramSurveyState } from "@/lib/lms-feedback"

export default async function StudentProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  const [p] = await getStudentPrograms(student.id, { programId: id })
  if (!p) {
    // An individual enrollment is shown as a course, not a program.
    const { data: individual } = await db
      .from("lms_program_members")
      .select("id, lms_programs!inner(is_individual)")
      .eq("student_id", student.id)
      .eq("program_id", id)
      .eq("lms_programs.is_individual", true)
      .neq("status", "withdrawn")
      .maybeSingle()
    if (individual) redirect("/lms/courses")
    notFound()
  }

  const closed = p.access === "none"
  const next = nextCourse(p)
  const finished = p.totalCount > 0 && p.completedCount === p.totalCount

  // Sessions and attendance of this program only (and the student's track).
  const viewers = closed ? [] : p.courses.map(c => ({ course_id: c.course_id, program_id: p.program.id, track_id: p.track?.id ?? null, group_id: c.group_id }))
  const today = sessionToday()
  const [upcoming, attendance] = await Promise.all([
    sessionsForViewers<any>(viewers,
      "id, title, session_date, start_time, duration_minutes, location, meeting_link",
      q => q.gte("session_date", today).is("closed_at", null).order("session_date", { ascending: true }).order("start_time", { ascending: true }),
    ).catch(() => [] as any[]),
    Promise.all(viewers.map(v => enrollmentAttendance({ ...v, student_id: student.id }).catch(() => null))),
  ])
  const att = attendance.reduce((s, a) => a ? { total: s.total + a.sessionTotal - a.excusedCount, present: s.present + a.presentCount } : s, { total: 0, present: 0 })
  const attendancePct = att.total > 0 ? Math.round((att.present / att.total) * 100) : null
  const titleByCourse = new Map(p.courses.map(c => [c.course_id, c.title]))
  // End-of-program survey (FB-5) — once every course is completed.
  const survey = await getProgramSurveyState(p.member_id)

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <Link href="/lms/programs" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#1B4F8A]">
        <ArrowLeft className="h-3.5 w-3.5" /> My Programs
      </Link>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900">{p.program.name}</h1>
            {p.program.description && <p className="text-sm text-slate-500 mt-1">{p.program.description}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-slate-500">
              {p.program.company && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{p.program.company}</span>}
              {p.track && <span className="flex items-center gap-1"><GitBranch className="h-3.5 w-3.5" />Track: {p.track.name}</span>}
              {(p.program.start_date || p.endDate) && (
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {fmtDay(p.program.start_date) ?? "—"} → {fmtDay(p.endDate) ?? "—"}
                  {p.extended && <span className="text-[#1B4F8A] font-medium"> (extended for you)</span>}
                </span>
              )}
            </div>
            <DeadlineBadge daysLeft={p.daysLeft} level={p.deadline} extended={p.extended} className="mt-3" />
          </div>

          {/* Summary numbers */}
          <div className="grid grid-cols-3 gap-2 sm:w-[300px] shrink-0">
            <div className="bg-slate-50 rounded-xl px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-[#1B4F8A]">{p.progressPct}%</p>
              <p className="text-[10px] text-slate-500">Progress</p>
            </div>
            <div className="bg-slate-50 rounded-xl px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-slate-800">{p.completedCount}/{p.totalCount}</p>
              <p className="text-[10px] text-slate-500">Courses</p>
            </div>
            <div className="bg-slate-50 rounded-xl px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-slate-800">{attendancePct === null ? "—" : `${attendancePct}%`}</p>
              <p className="text-[10px] text-slate-500">Attendance</p>
            </div>
          </div>
        </div>
        <ProgressBar pct={p.progressPct} className="mt-4" />
      </div>

      {/* Status banners */}
      {closed ? (
        <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm text-slate-700">
          <Lock className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">{p.accessNote}</p>
            <p className="text-xs text-slate-500 mt-0.5">Course material is no longer available. Your results and certificates are kept.</p>
          </div>
        </div>
      ) : p.accessNote ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700">{p.accessNote}</div>
      ) : p.notStarted ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm text-amber-800">
          <Lock className="h-4 w-4 mt-0.5 shrink-0" />
          <p><span className="font-semibold">This program opens on {fmtDay(p.program.start_date)}.</span> You can see your courses now; they unlock on that day.</p>
        </div>
      ) : next ? (
        <Link href={`/lms/courses/${next.course_id}`}
          className="flex items-center gap-4 bg-[#1B4F8A] rounded-xl px-5 py-4 group hover:bg-[#163f6e] transition-colors">
          <div className="flex-1 min-w-0">
            <p className="text-white/60 text-xs font-medium uppercase tracking-wide">{next.progress_pct > 0 ? "Continue with" : "Up next"}</p>
            <p className="text-white font-semibold text-sm mt-0.5 truncate">{next.title}</p>
          </div>
          <span className="shrink-0 bg-white/15 group-hover:bg-white/25 rounded-lg px-3 py-1.5 text-white text-xs font-semibold flex items-center gap-1">
            {next.progress_pct > 0 ? "Continue" : "Start"} <ArrowRight className="h-3 w-3" />
          </span>
        </Link>
      ) : finished ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <p className="font-semibold">You&apos;ve completed every course in this program.</p>
        </div>
      ) : null}

      {survey?.due && (
        <CourseFeedbackForm kind="program" programId={p.program.id} isAnonymous={survey.anonymous} askInstructor={survey.askInstructor} />
      )}
      {survey?.enabled && survey.submitted && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 flex items-center gap-3 text-sm text-slate-700">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> Thank you, your program survey has been submitted.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Courses in order */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><BookOpen className="h-4 w-4 text-[#1B4F8A]" /> Courses</h2>
            {p.program.progress_enforcement && <span className="text-[11px] text-slate-400">Complete them in order</span>}
          </div>
          {p.courses.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No courses assigned yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {p.courses.map((c, i) => {
                const done = c.status === "completed"
                const locked = closed || c.lock.locked
                const row = (
                  <>
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                      done ? "bg-emerald-100 text-emerald-600" : locked ? "bg-slate-100 text-slate-400" : "bg-[#1B4F8A]/10 text-[#1B4F8A]",
                    )}>
                      {done ? <CheckCircle2 className="h-4 w-4" /> : locked ? <Lock className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-medium truncate", locked && !done ? "text-slate-500" : "text-slate-900")}>{c.title}</p>
                      {done ? (
                        <p className="text-xs text-emerald-600 mt-0.5 flex items-center gap-2 flex-wrap">
                          Completed{c.completed_at ? ` ${fmtDay(c.completed_at)}` : ""}
                          {c.certificate === "released" && <span className="inline-flex items-center gap-0.5 text-emerald-700"><Award className="h-3 w-3" /> Certificate</span>}
                          {c.certificate === "held" && <span className="text-slate-400">Certificate being prepared</span>}
                        </p>
                      ) : c.lock.locked && !closed ? (
                        <p className="text-xs text-slate-400 mt-0.5">{c.lock.reason}</p>
                      ) : !closed ? (
                        <div className="flex items-center gap-2 mt-1.5">
                          <ProgressBar pct={c.progress_pct} className="flex-1 max-w-[180px]" />
                          <span className="text-[11px] font-semibold text-[#1B4F8A]">{c.progress_pct}%</span>
                        </div>
                      ) : null}
                    </div>
                    {!locked && <ArrowRight className="h-4 w-4 text-slate-300 shrink-0" />}
                  </>
                )
                return locked ? (
                  <div key={c.enrollment_id} className="flex items-center gap-3 px-5 py-3.5">{row}</div>
                ) : (
                  <Link key={c.enrollment_id} href={`/lms/courses/${c.course_id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">{row}</Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Upcoming sessions */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Clock className="h-4 w-4 text-[#1B4F8A]" /> Upcoming sessions</h2>
              <Link href="/lms/schedule" className="text-xs text-[#1B4F8A] hover:underline">Schedule</Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No sessions scheduled</p>
            ) : upcoming.slice(0, 5).map((s: any) => (
              <div key={s.id} className="flex items-start gap-3 px-4 py-3 border-b border-slate-50 last:border-0">
                <div className="bg-[#1B4F8A] text-white rounded-lg px-2 py-1.5 text-center shrink-0 min-w-[40px]">
                  <div className="text-sm font-bold leading-none">{Number(s.session_date.slice(8, 10))}</div>
                  <div className="text-[9px] opacity-70 uppercase mt-0.5">{new Date(s.session_date + "T00:00:00Z").toLocaleString("en", { month: "short", timeZone: "UTC" })}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{s.title}</p>
                  <p className="text-[11px] text-slate-400 truncate">{titleByCourse.get(s.course_id)}</p>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
                    <Clock className="h-3 w-3" /> {s.start_time?.slice(0, 5)}
                    {s.location && <><MapPin className="h-3 w-3 ml-1" />{s.location}</>}
                  </p>
                </div>
                {s.meeting_link && (
                  <a href={s.meeting_link} target="_blank" rel="noreferrer"
                    className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-white bg-[#1B4F8A] hover:bg-[#163f6e] px-2 py-1 rounded-lg">
                    <Video className="h-3 w-3" /> Join
                  </a>
                )}
              </div>
            ))}
          </div>

          {attendancePct !== null && (
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5 flex items-center gap-3">
              <UserCheck className="h-5 w-5 text-[#1B4F8A] shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">Attendance {attendancePct}%</p>
                <p className="text-xs text-slate-500">{att.present} of {att.total} past sessions attended (excused sessions not counted)</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
