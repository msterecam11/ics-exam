"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, AlertCircle, Route, BookOpen, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface PathCourse {
  id: string; title: string; status: string
  order_index: number; path_course_id: string
}

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export default function PathProgressPage({
  params,
}: {
  params: Promise<{ studentId: string; pathId: string }>
}) {
  const { studentId, pathId } = use(params)
  const [path,    setPath]    = useState<{ id: string; title: string; description: string | null; courses: PathCourse[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/lms/learning-paths/${pathId}`)
      .then(r => r.json())
      .then(d => { setPath(d); setLoading(false) })
      .catch(() => { setError("Failed to load"); setLoading(false) })
  }, [pathId])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
  if (error || !path) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <AlertCircle className="h-8 w-8 text-red-400" />
      <p className="text-slate-500">{error ?? "Not found"}</p>
      <Link href={`/lms-admin/progress/${studentId}`}><Badge variant="outline" className="gap-1 cursor-pointer"><ArrowLeft className="h-3 w-3" />Back</Badge></Link>
    </div>
  )

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href={`/lms-admin/progress/${studentId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#1B4F8A] transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Student Overview
      </Link>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
            <Route className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{path.title}</h1>
            {path.description && <p className="text-sm text-slate-400 mt-0.5">{path.description}</p>}
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">{path.courses?.length ?? 0} course{path.courses?.length !== 1 ? "s" : ""} in this path</p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Courses — click to view student results</h2>
        {!path.courses?.length ? (
          <div className="text-center py-12 text-slate-400">
            <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No courses in this path</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {path.courses.map((c, idx) => (
              <Link
                key={c.id}
                href={`/lms-admin/progress/${studentId}/course/${c.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors group"
              >
                <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 text-sm">{c.title}</p>
                  <Badge variant="outline" className={cn("text-xs mt-1 capitalize",
                    c.status === "published" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-500"
                  )}>{c.status}</Badge>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#1B4F8A] shrink-0 transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
