"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ChevronRight } from "lucide-react"
import FeedbackResponses, { type ResponseRow } from "@/components/lms/FeedbackResponses"

const DIMENSIONS = [
  { key: "overall",      label: "Overall satisfaction" },
  { key: "organisation", label: "Organisation" },
  { key: "instructor",   label: "Instructor(s)" },
]

type Course = { course_id: string; lms_courses: { title: string } | null }

export default function ProgramSurveyPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = use(params)
  const [data, setData] = useState<{ program: { name: string; feedback_enabled: boolean; feedback_anonymous: boolean }; rows: ResponseRow[]; members: number } | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/lms/feedback/program?program_id=${programId}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Could not load the survey"); return d })
      .then(setData).catch(e => setError(e.message))
    fetch(`/api/lms/programs/${programId}`).then(r => r.ok ? r.json() : null).then(d => setCourses(d?.rules ?? []))
  }, [programId])

  const rows = data?.rows ?? []

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/lms-admin/reports/feedback" aria-label="Back to feedback"
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-muted-foreground hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h2 className="text-xl font-bold truncate">{data?.program.name ?? "Program feedback"}</h2>
          <p className="text-muted-foreground text-sm">
            {data
              ? <>Program survey: {rows.length} of {data.members} student{data.members !== 1 ? "s" : ""} answered · {data.program.feedback_anonymous ? "anonymous" : "named"}{!data.program.feedback_enabled && " · feedback is off"}</>
              : "Loading…"}
          </p>
        </div>
      </div>

      {courses.length > 0 && (
        <div className="bg-white border border-border rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Course feedback in this program</p>
          <div className="flex flex-wrap gap-2">
            {courses.map(c => (
              <Link key={c.course_id} href={`/lms-admin/reports/feedback/${c.course_id}?program=${programId}`}
                className="inline-flex items-center gap-1 text-xs font-medium border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 text-slate-700">
                {c.lms_courses?.title ?? "Course"} <ChevronRight className="h-3 w-3" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {error ? <p className="text-sm text-red-500">{error}</p>
        : !data ? <div className="py-20 text-center text-muted-foreground text-sm">Loading…</div>
        : <FeedbackResponses rows={rows} dimensions={DIMENSIONS} />}
    </div>
  )
}
