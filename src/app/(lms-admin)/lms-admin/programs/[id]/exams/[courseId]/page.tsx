import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { ArrowLeft, FileSearch } from "lucide-react"
import { db } from "@/lib/db"
import { pageScope, canSeeProgram } from "@/lib/staff-access"
import { loadEnrollmentFacts } from "@/lib/lms-program-report"
import { isUuid } from "@/lib/lms-report-scope"

export const dynamic = "force-dynamic"

// Everyone who sat one exam, in one table (RP-19). The group report answers
// "how did the cohort do"; the individual report answers "how did one person
// do". This is the list in between — the one you read before a client call or
// when deciding who retakes.
export default async function ProgramExamResultsPage({ params, searchParams }: {
  params: Promise<{ id: string; courseId: string }>
  searchParams: Promise<{ track?: string }>
}) {
  const staff = await pageScope()
  if (!staff) redirect("/auth/login")

  const { id: programId, courseId } = await params
  const sp = await searchParams
  if (!isUuid(programId) || !isUuid(courseId)) notFound()
  if (!canSeeProgram(staff, programId)) notFound()
  const trackId = isUuid(sp.track) ? sp.track : null

  const [facts, { data: memberRows }, { data: trackRows }, { data: course }, { data: program }] = await Promise.all([
    loadEnrollmentFacts({ programId }),
    db.from("lms_program_members")
      .select("id, student_id, track_id, status, lms_students(id, name, job_title)")
      .eq("program_id", programId),
    db.from("lms_program_tracks").select("id, name").eq("program_id", programId),
    db.from("lms_courses").select("id, title, final_exam_pass_mark").eq("id", courseId).maybeSingle(),
    db.from("lms_programs").select("id, name").eq("id", programId).maybeSingle(),
  ])
  if (!course || !program) notFound()

  const tracks = (trackRows ?? []) as any[]
  const members = new Map(((memberRows ?? []) as any[])
    .filter(m => m.status !== "withdrawn" && (!trackId || m.track_id === trackId))
    .map(m => [m.id as string, m]))

  const rows = facts
    .filter(f => f.course_id === courseId && f.status !== "dropped" && f.member_id && members.has(f.member_id))
    .map(f => {
      const m = members.get(f.member_id!)
      return {
        studentId: f.student_id,
        enrollmentId: f.enrollment_id,
        name: m?.lms_students?.name ?? "Unknown",
        jobTitle: m?.lms_students?.job_title ?? null,
        track: m?.track_id ? tracks.find(t => t.id === m.track_id)?.name ?? null : null,
        attempts: f.exam.attempts,
        best: f.exam.bestPct,
        sat: f.exam.sat,
        passed: f.exam.passed,
      }
    })
    // Weakest at the bottom, where you look for them; not-sat last of all.
    .sort((a, b) => (b.best ?? -1) - (a.best ?? -1) || a.name.localeCompare(b.name))

  const sat = rows.filter(r => r.sat)
  const passed = sat.filter(r => r.passed).length
  const avg = sat.length ? Math.round(sat.reduce((t, r) => t + (r.best ?? 0), 0) / sat.length) : null
  const retakes = rows.filter(r => r.attempts > 1).length
  const passMark = (course as any).final_exam_pass_mark ?? null

  const stat = (label: string, value: string) => (
    <div key={label} className="bg-slate-50 rounded-xl px-4 py-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-bold text-slate-800 mt-0.5">{value}</p>
    </div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-2 text-sm">
        <Link href={`/lms-admin/programs/${programId}?tab=progress`} aria-label="Back to the program"
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
        <span className="text-slate-400">{(program as any).name}</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h1 className="text-lg font-bold text-slate-900">Final exam — {(course as any).title}</h1>
          {tracks.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <Link href={`/lms-admin/programs/${programId}/exams/${courseId}`}
                className={`px-2.5 py-1 rounded-lg text-xs border ${!trackId ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                Whole program
              </Link>
              {tracks.map(t => (
                <Link key={t.id} href={`/lms-admin/programs/${programId}/exams/${courseId}?track=${t.id}`}
                  className={`px-2.5 py-1 rounded-lg text-xs border ${trackId === t.id ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  {t.name}
                </Link>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mt-4">
            {stat("Sat", `${sat.length} / ${rows.length}`)}
            {stat("Passed", String(passed))}
            {stat("Average", avg === null ? "—" : `${avg}%`)}
            {stat("Pass mark", passMark === null ? "—" : `${passMark}%`)}
            {stat("Retakes", String(retakes))}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-sm text-slate-400 text-center">Nobody is enrolled in this course yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/60 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                <th className="text-left px-5 py-2.5">Participant</th>
                <th className="text-left px-3 py-2.5">Track</th>
                <th className="text-center px-3 py-2.5">Attempts</th>
                <th className="text-center px-3 py-2.5">Best</th>
                <th className="text-center px-3 py-2.5">Result</th>
                <th className="text-right px-5 py-2.5">Answers</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.enrollmentId} className="border-t border-slate-100">
                  <td className="px-5 py-2.5">
                    <p className="text-slate-800">{r.name}</p>
                    {r.jobTitle && <p className="text-xs text-slate-400">{r.jobTitle}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 text-xs">{r.track ?? "—"}</td>
                  <td className={`px-3 py-2.5 text-center text-xs ${r.attempts > 1 ? "text-amber-600 font-medium" : "text-slate-500"}`}>
                    {r.attempts || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center font-semibold text-slate-800">{r.best === null ? "—" : `${r.best}%`}</td>
                  <td className="px-3 py-2.5 text-center">
                    {!r.sat ? <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Not sat</span>
                      : r.passed ? <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">Passed</span>
                      : <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">Not passed</span>}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {r.sat ? (
                      <Link href={`/lms-admin/reports/${courseId}/${r.studentId}/exam?enrollment=${r.enrollmentId}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4F8A] hover:underline">
                        <FileSearch className="h-3.5 w-3.5" /> View
                      </Link>
                    ) : <span className="text-xs text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
