"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { BookOpen, Plus, Loader2, ArrowRight } from "lucide-react"

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:              { label: "Draft",              cls: "bg-slate-100 text-slate-600" },
  generating_outline: { label: "Generating outline", cls: "bg-blue-50 text-blue-700" },
  outline_review:     { label: "Outline review",     cls: "bg-amber-50 text-amber-700" },
  generating_slides:  { label: "Generating slides",  cls: "bg-blue-50 text-blue-700" },
  ready:              { label: "Ready",              cls: "bg-emerald-50 text-emerald-700" },
  failed:             { label: "Failed",             cls: "bg-red-50 text-red-700" },
  published:          { label: "Published",          cls: "bg-emerald-100 text-emerald-800" },
}

export default function StudioCoursesPage() {
  const [courses, setCourses] = useState<any[] | null>(null)

  useEffect(() => {
    fetch("/api/course-gen/courses")
      .then(r => r.json())
      .then(d => setCourses(d.courses ?? []))
      .catch(() => setCourses([]))
  }, [])

  if (courses === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-[#0C72C6]" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Courses</h1>
          <p className="text-sm text-slate-500 mt-1">All generated and in-progress courses.</p>
        </div>
        <Link
          href="/studio/create"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#0C72C6] hover:bg-[#0a63ab] transition-colors"
        >
          <Plus className="h-4 w-4" /> New Course
        </Link>
      </div>

      {courses.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
          No courses yet — create one from the button above.
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map(c => {
            const meta = STATUS_META[c.status] ?? STATUS_META.draft
            return (
              <Link
                key={c.id}
                href={`/studio/courses/${c.id}`}
                className="flex items-center gap-4 bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-slate-300 transition-all group"
              >
                <div className="w-10 h-10 rounded-lg bg-[#0C72C6]/10 flex items-center justify-center shrink-0">
                  <BookOpen className="h-5 w-5 text-[#0C72C6]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{c.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {[c.regulatory_framework, c.day_count ? `${c.day_count} days` : null, c.module_count ? `${c.module_count} modules` : null, c.partner_name]
                      .filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${meta.cls}`}>
                  {meta.label}
                </span>
                <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
