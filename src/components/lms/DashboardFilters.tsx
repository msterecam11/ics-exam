"use client"

import { useRouter } from "next/navigation"
import { X } from "lucide-react"

type Opt = { id: string; name: string }
export type DashboardFilterValue = { company: string; program: string; course: string; period: string }

// Company → Program → Course (each narrows the next) and the period. The
// selection lives in the URL, so the page reloads its numbers server-side.
export default function DashboardFilters({ value, companies, programs, courses, programCourses }: {
  value: DashboardFilterValue
  companies: Opt[]
  programs: (Opt & { company_id: string | null })[]
  courses: Opt[]
  /** course ids per program id */
  programCourses: Record<string, string[]>
}) {
  const router = useRouter()
  const go = (next: Partial<DashboardFilterValue>) => {
    const v = { ...value, ...next }
    const q = new URLSearchParams(Object.entries(v).filter(([k, x]) => x && !(k === "period" && x === "30d")) as [string, string][])
    router.push(`/lms-admin${q.toString() ? `?${q}` : ""}`)
  }
  const progOpts = value.company ? programs.filter(p => p.company_id === value.company) : programs
  const allowed = value.program ? new Set(programCourses[value.program] ?? [])
    : value.company ? new Set(progOpts.flatMap(p => programCourses[p.id] ?? [])) : null
  const courseOpts = allowed ? courses.filter(c => allowed.has(c.id)) : courses
  const any = value.company || value.program || value.course
  const sel = "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 max-w-[240px]"

  return (
    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">Filter</span>
      <select aria-label="Company" className={sel} value={value.company}
        onChange={e => go({ company: e.target.value, program: "", course: "" })}>
        <option value="">All companies</option>
        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select aria-label="Program" className={sel} value={value.program}
        onChange={e => go({ program: e.target.value, course: "", company: e.target.value ? (programs.find(p => p.id === e.target.value)?.company_id ?? value.company) : value.company })}>
        <option value="">{value.company ? "All its programs" : "All programs"}</option>
        {progOpts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select aria-label="Course" className={sel} value={value.course} onChange={e => go({ course: e.target.value })}>
        <option value="">All courses</option>
        {courseOpts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 ml-auto">
        {[["30d", "30 days"], ["90d", "90 days"], ["year", "12 months"]].map(([k, l]) => (
          <button key={k} onClick={() => go({ period: k })}
            className={`px-2.5 py-1 rounded-md text-xs font-medium ${(value.period || "30d") === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{l}</button>
        ))}
      </div>
      {any && (
        <button onClick={() => router.push(value.period && value.period !== "30d" ? `/lms-admin?period=${value.period}` : "/lms-admin")}
          className="h-8 px-2.5 rounded-lg text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-50 flex items-center gap-1">
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      )}
    </div>
  )
}
