"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import FeedbackResponses, { type ResponseRow } from "@/components/lms/FeedbackResponses"

const DIMENSIONS = [
  { key: "overall",    label: "Overall" },
  { key: "content",    label: "Content" },
  { key: "platform",   label: "Platform" },
  { key: "pace",       label: "Pace" },
  { key: "materials",  label: "Materials" },
  { key: "instructor", label: "Instructor" },
]

export default function FeedbackDetailPage({ params, searchParams }: {
  params: Promise<{ courseId: string }>
  searchParams: Promise<{ program?: string }>
}) {
  const { courseId } = use(params)
  const { program: programParam } = use(searchParams)
  const router = useRouter()
  const [program, setProgram] = useState(programParam ?? "")
  const [data, setData] = useState<{ course: { title: string }; rows: ResponseRow[]; programs: { id: string; name: string }[]; outside_programs: number } | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    fetch(`/api/lms/feedback?course_id=${courseId}${program ? `&program_id=${program}` : ""}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Could not load feedback"); return d })
      .then(d => { if (!cancelled) { setData(d); setError("") } })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [courseId, program])

  function choose(v: string) {
    setProgram(v); setData(null)
    router.replace(`/lms-admin/reports/feedback/${courseId}${v ? `?program=${v}` : ""}`)
  }

  const rows = data?.rows ?? []

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Link href="/lms-admin/reports/feedback" aria-label="Back to feedback"
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-muted-foreground hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate">{data?.course.title ?? "Feedback"}</h2>
            <p className="text-muted-foreground text-sm">
              {data ? `${rows.length} response${rows.length !== 1 ? "s" : ""}` : "Loading…"}
              {rows.length > 0 && <> · Last submitted {new Date(rows[0].submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>}
            </p>
          </div>
        </div>
        {data && (data.programs.length > 0 || data.outside_programs > 0) && (
          <select value={program} onChange={e => choose(e.target.value)} aria-label="Filter by program"
            className="h-9 rounded-lg border border-slate-200 px-3 text-sm bg-white max-w-full">
            <option value="">All programs</option>
            {data.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            {data.outside_programs > 0 && <option value="none">Outside programs</option>}
          </select>
        )}
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p>
        : !data ? <div className="py-20 text-center text-muted-foreground text-sm">Loading…</div>
        : <FeedbackResponses rows={rows} dimensions={DIMENSIONS} />}
    </div>
  )
}
