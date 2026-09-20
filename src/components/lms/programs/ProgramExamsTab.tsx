"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronUp, FileSearch, GraduationCap } from "lucide-react"
import type { ProgramDetail } from "./shared"

// One tab that answers "how did they do in the exams?", course by course.
// Everything here is already in the program payload, so opening a course costs
// nothing — no fetch, no spinner.

type Row = {
  studentId: string; enrollmentId: string; name: string; jobTitle: string | null; track: string | null
  attempts: number; best: number | null; sat: boolean; passed: boolean
}

export default function ProgramExamsTab({ detail }: { detail: ProgramDetail }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const tracks = new Map(detail.tracks.map(t => [t.id, t.name]))
  const members = detail.members.filter(m => m.status !== "withdrawn")

  // Courses the program actually delivers, in structure order, plus anything a
  // rule mentions (a course can carry a pass mark without sitting in a track).
  const courseIds: string[] = []
  const titles = new Map<string, string>()
  for (const i of detail.items) {
    if (i.lms_courses && !titles.has(i.lms_courses.id)) { titles.set(i.lms_courses.id, i.lms_courses.title); courseIds.push(i.lms_courses.id) }
  }
  for (const pc of detail.path_courses) {
    if (pc.lms_courses && !titles.has(pc.lms_courses.id)) { titles.set(pc.lms_courses.id, pc.lms_courses.title); courseIds.push(pc.lms_courses.id) }
  }
  for (const r of detail.rules) {
    if (r.lms_courses && !titles.has(r.lms_courses.id)) { titles.set(r.lms_courses.id, r.lms_courses.title); courseIds.push(r.lms_courses.id) }
  }

  const courses = courseIds.map(courseId => {
    const rows: Row[] = []
    for (const m of members) {
      const e = m.enrollments.find(x => x.course_id === courseId && x.status !== "dropped")
      if (!e) continue
      rows.push({
        studentId: m.student_id, enrollmentId: e.id,
        name: m.lms_students?.name ?? "Unknown", jobTitle: m.lms_students?.job_title ?? null,
        track: m.track_id ? tracks.get(m.track_id) ?? null : null,
        attempts: e.exam?.attempts ?? 0, best: e.exam?.pct ?? null,
        sat: !!e.exam, passed: !!e.exam?.passed,
      })
    }
    // Weakest at the bottom, where you look for them; not-sat last of all.
    rows.sort((a, b) => (b.best ?? -1) - (a.best ?? -1) || a.name.localeCompare(b.name))
    const sat = rows.filter(r => r.sat)
    return {
      courseId, title: titles.get(courseId) ?? "Untitled course", rows,
      sat: sat.length, passed: sat.filter(r => r.passed).length,
      avg: sat.length ? Math.round(sat.reduce((t, r) => t + (r.best ?? 0), 0) / sat.length) : null,
      retakes: rows.filter(r => r.attempts > 1).length,
      passMark: detail.rules.find(r => r.course_id === courseId)?.pass_mark ?? null,
    }
  }).filter(c => c.rows.length > 0)

  if (courses.length === 0)
    return <p className="text-sm text-slate-400 py-12 text-center">No one is enrolled in this program&apos;s courses yet.</p>

  return (
    <div className="space-y-2.5">
      {courses.map(c => {
        const isOpen = !!open[c.courseId]
        const summary = [
          `${c.sat}/${c.rows.length} sat`,
          c.sat ? `${c.passed} passed` : null,
          c.avg !== null ? `avg ${c.avg}%` : null,
          c.passMark !== null ? `pass mark ${c.passMark}%` : null,
          c.retakes ? `${c.retakes} retake${c.retakes === 1 ? "" : "s"}` : null,
        ].filter(Boolean).join(" · ")

        return (
          <div key={c.courseId} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button onClick={() => setOpen(o => ({ ...o, [c.courseId]: !isOpen }))}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left">
              <GraduationCap className="h-4 w-4 text-slate-300 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-800 truncate">{c.title}</span>
                <span className="block text-xs text-slate-400">{summary}</span>
              </span>
              {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
            </button>

            {isOpen && (
              <table className="w-full text-sm border-t border-slate-100">
                <thead>
                  <tr className="bg-slate-50/60 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-2">Participant</th>
                    <th className="text-left px-3 py-2">Track</th>
                    <th className="text-center px-3 py-2">Attempts</th>
                    <th className="text-center px-3 py-2">Best</th>
                    <th className="text-center px-3 py-2">Result</th>
                    <th className="text-right px-4 py-2">Answers</th>
                  </tr>
                </thead>
                <tbody>
                  {c.rows.map(r => (
                    <tr key={r.enrollmentId} className="border-t border-slate-50">
                      <td className="px-4 py-2">
                        <p className="text-slate-800">{r.name}</p>
                        {r.jobTitle && <p className="text-xs text-slate-400">{r.jobTitle}</p>}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{r.track ?? "—"}</td>
                      <td className={`px-3 py-2 text-center text-xs ${r.attempts > 1 ? "text-amber-600 font-medium" : "text-slate-500"}`}>
                        {r.attempts || "—"}
                      </td>
                      <td className="px-3 py-2 text-center font-semibold text-slate-800">{r.best === null ? "—" : `${r.best}%`}</td>
                      <td className="px-3 py-2 text-center">
                        {!r.sat ? <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Not sat</span>
                          : r.passed ? <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">Passed</span>
                          : <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">Not passed</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {r.sat ? (
                          <Link href={`/lms-admin/reports/${c.courseId}/${r.studentId}/exam?enrollment=${r.enrollmentId}`}
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
        )
      })}
    </div>
  )
}
