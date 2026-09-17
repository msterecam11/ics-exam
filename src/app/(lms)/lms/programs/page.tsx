export const dynamic = "force-dynamic"

import { getStudentSession } from "@/lib/lms-auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { FolderKanban, ArrowRight, CalendarDays, Building2, GitBranch, Award, Lock, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { getStudentPrograms, nextCourse, type PortalProgram } from "@/lib/lms-student-portal"
import { DeadlineBadge, fmtDay, ProgressBar } from "@/components/lms/portal/PortalBits"

function statusChip(p: PortalProgram) {
  if (p.member_status === "completed" || (p.totalCount > 0 && p.completedCount === p.totalCount))
    return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Completed</span>
  if (p.ended)      return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Ended</span>
  if (p.notStarted) return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Starts {fmtDay(p.program.start_date)}</span>
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">In progress</span>
}

export default async function MyProgramsPage() {
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  const programs = await getStudentPrograms(student.id)

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Programs</h1>
        <p className="text-sm text-slate-500 mt-0.5">The training programs you&apos;re enrolled in, with your courses in order.</p>
      </div>

      {programs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 flex flex-col items-center text-slate-400 gap-2 text-center px-4">
          <FolderKanban className="h-8 w-8 opacity-20" />
          <p className="text-sm">You&apos;re not enrolled in a program yet.</p>
          <Link href="/lms/courses" className="text-xs text-[#1B4F8A] font-medium hover:underline">Go to My Courses</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {programs.map(p => {
            const next = nextCourse(p)
            const closed = p.access === "none"
            return (
              <div key={p.member_id} className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
                <div className="px-5 pt-4 pb-3 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/lms/programs/${p.program.id}`} className="min-w-0">
                      <p className="font-semibold text-slate-900 hover:text-[#1B4F8A] transition-colors">{p.program.name}</p>
                    </Link>
                    <div className="shrink-0">{statusChip(p)}</div>
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-500">
                    {p.program.company && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{p.program.company}</span>}
                    {p.track && <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" />{p.track.name}</span>}
                    {(p.program.start_date || p.endDate) && (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {fmtDay(p.program.start_date) ?? "—"} → {fmtDay(p.endDate) ?? "—"}
                      </span>
                    )}
                  </div>

                  <DeadlineBadge daysLeft={p.daysLeft} level={p.deadline} extended={p.extended} className="mt-2" />

                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">{p.completedCount}/{p.totalCount} course{p.totalCount === 1 ? "" : "s"} completed</span>
                      <span className="font-semibold text-[#1B4F8A]">{p.progressPct}%</span>
                    </div>
                    <ProgressBar pct={p.progressPct} />
                  </div>

                  {p.certificatesReleased > 0 && (
                    <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1">
                      <Award className="h-3.5 w-3.5" /> {p.certificatesReleased} certificate{p.certificatesReleased === 1 ? "" : "s"}
                    </p>
                  )}
                </div>

                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center gap-3">
                  {closed ? (
                    <p className="text-xs text-slate-500 flex items-center gap-1.5 flex-1"><Lock className="h-3.5 w-3.5" /> {p.accessNote}</p>
                  ) : next ? (
                    <p className="text-xs text-slate-600 flex-1 min-w-0 truncate">
                      Next: <span className="font-medium text-slate-800">{next.title}</span>
                    </p>
                  ) : p.notStarted ? (
                    <p className="text-xs text-amber-700 flex items-center gap-1.5 flex-1"><Lock className="h-3.5 w-3.5" /> Opens {fmtDay(p.program.start_date)}</p>
                  ) : p.totalCount > 0 && p.completedCount === p.totalCount ? (
                    <p className="text-xs text-emerald-700 flex items-center gap-1.5 flex-1"><CheckCircle2 className="h-3.5 w-3.5" /> All courses completed</p>
                  ) : (
                    <p className="text-xs text-slate-500 flex-1">{p.accessNote ?? ""}</p>
                  )}
                  <Link href={next ? `/lms/courses/${next.course_id}` : `/lms/programs/${p.program.id}`}
                    className={cn("shrink-0 flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                      next ? "bg-[#1B4F8A] text-white hover:bg-[#163f6e]" : "border border-slate-200 text-slate-600 hover:bg-white")}>
                    {next ? (next.progress_pct > 0 ? "Continue" : "Start") : "View"} <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
