"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Star, Eye, X, MessageSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface FeedbackRow {
  id: string
  rating_overall: number | null
  rating_content: number | null
  rating_platform: number | null
  rating_pace: number | null
  rating_materials: number | null
  comments: string | null
  is_anonymous: boolean
  submitted_at: string
  student: { id: string; name: string; email: string } | null
}

interface CourseData {
  id: string
  title: string
  feedback_anonymous: boolean
}

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <span className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(n => (
        <Star key={n} className={cn("h-3.5 w-3.5", n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-200 fill-slate-100")} />
      ))}
    </span>
  )
}

function avg(rows: FeedbackRow[], field: keyof FeedbackRow) {
  const vals = rows.map(r => r[field] as number | null).filter(v => v !== null) as number[]
  if (!vals.length) return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

export default function FeedbackDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params)
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [course, setCourse] = useState<CourseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<FeedbackRow | null>(null)

  useEffect(() => {
    fetch(`/api/lms/feedback?course_id=${courseId}`)
      .then(r => r.json())
      .then(d => { setCourse(d.course); setRows(d.rows ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [courseId])

  const dimensions = [
    { key: "rating_overall",   label: "Overall"   },
    { key: "rating_content",   label: "Content"   },
    { key: "rating_platform",  label: "Platform"  },
    { key: "rating_pace",      label: "Pace"      },
    { key: "rating_materials", label: "Materials" },
  ] as const

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-20 text-center text-muted-foreground text-sm">
        Loading...
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/lms-admin/reports/feedback"
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-muted-foreground hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h2 className="text-xl font-bold">{course?.title ?? "Feedback"}</h2>
          <p className="text-muted-foreground text-sm">
            {rows.length} response{rows.length !== 1 ? "s" : ""}
            {rows.length > 0 && (
              <> · Last submitted {new Date(rows[0].submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>
            )}
          </p>
        </div>
      </div>

      {/* Aggregate cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {dimensions.map(d => {
          const val = avg(rows, d.key as keyof FeedbackRow)
          return (
            <div key={d.key} className="bg-white border border-border rounded-xl p-4 flex flex-col gap-2">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{d.label}</p>
              <p className="text-2xl font-bold text-slate-800">{val !== null ? val.toFixed(1) : "—"}</p>
              <Stars rating={val !== null ? Math.round(val) : null} />
            </div>
          )
        })}
      </div>

      {/* Submissions table */}
      {rows.length === 0 ? (
        <div className="bg-white border border-border rounded-xl py-20 text-center text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No feedback submitted yet.
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-border">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-8">#</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Student</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Overall</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Submitted</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Comment</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-5 py-3.5">
                    {r.is_anonymous || !r.student
                      ? <span className="italic text-muted-foreground">Anonymous</span>
                      : <div>
                          <p className="font-medium text-slate-800">{r.student.name}</p>
                          <p className="text-xs text-muted-foreground">{r.student.email}</p>
                        </div>
                    }
                  </td>
                  <td className="px-4 py-3.5">
                    <Stars rating={r.rating_overall} />
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground text-xs">
                    {new Date(r.submitted_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3.5">
                    {r.comments
                      ? <MessageSquare className="h-4 w-4 text-slate-400" />
                      : <span className="text-muted-foreground">—</span>
                    }
                  </td>
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => setModal(r)}
                      className="inline-flex items-center gap-1 text-xs font-medium border border-border rounded-lg px-2.5 py-1 hover:bg-slate-100 transition-colors text-muted-foreground hover:text-slate-800"
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setModal(null)}
        >
          <div className="bg-white rounded-2xl border border-border w-full max-w-md shadow-xl">
            <div className="px-6 pt-6 pb-4 border-b border-border flex items-start justify-between">
              <div>
                <p className="font-semibold text-slate-800">
                  {modal.is_anonymous || !modal.student ? "Anonymous" : modal.student.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Submitted {new Date(modal.submitted_at).toLocaleDateString("en-GB", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </p>
              </div>
              <button
                onClick={() => setModal(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-muted-foreground hover:text-slate-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-1">
              {dimensions.map(d => {
                const val = modal[d.key as keyof FeedbackRow] as number | null
                const pct = val !== null ? (val / 5) * 100 : 0
                return (
                  <div key={d.key} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                    <span className="text-sm text-muted-foreground">{d.label}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-slate-700 w-8 text-right">
                        {val !== null ? `${val}/5` : "—"}
                      </span>
                      <Stars rating={val} />
                    </div>
                  </div>
                )
              })}
            </div>

            {modal.comments && (
              <div className="px-6 pb-6">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Comment</p>
                <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-700 leading-relaxed">
                  {modal.comments}
                </div>
              </div>
            )}
            {!modal.comments && (
              <div className="px-6 pb-6">
                <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm italic text-muted-foreground">
                  No comment left.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
