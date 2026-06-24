import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import Link from "next/link"
import { ArrowLeft, MessageSquare, Star, ChevronRight, BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

function ratingColor(avg: number | null) {
  if (avg === null) return "text-muted-foreground"
  if (avg >= 4) return "text-emerald-600"
  if (avg >= 3) return "text-amber-500"
  return "text-red-500"
}

export default async function FeedbackCoursesPage() {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) redirect("/auth/login")

  const { data: courses } = await db
    .from("lms_courses")
    .select("id, title, feedback_enabled, feedback_anonymous")
    .neq("status", "archived")
    .order("title")

  const { data: stats } = await db
    .from("lms_feedback")
    .select("course_id, rating_overall, submitted_at")

  const statsByCourse = new Map<string, {
    count: number; sumOverall: number; lastSubmitted: string | null
  }>()
  for (const row of stats ?? []) {
    const s = statsByCourse.get(row.course_id) ?? { count: 0, sumOverall: 0, lastSubmitted: null }
    s.count++
    s.sumOverall += row.rating_overall ?? 0
    if (!s.lastSubmitted || row.submitted_at > s.lastSubmitted) s.lastSubmitted = row.submitted_at
    statsByCourse.set(row.course_id, s)
  }

  const enriched = (courses ?? []).map((c: any) => {
    const s = statsByCourse.get(c.id)
    return {
      ...c,
      response_count: s?.count ?? 0,
      avg_overall:    s ? Math.round((s.sumOverall / s.count) * 10) / 10 : null,
      last_submitted: s?.lastSubmitted ?? null,
    }
  })

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/lms-admin/reports"
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-muted-foreground hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h2 className="text-xl font-bold">Course Feedback</h2>
          <p className="text-muted-foreground text-sm">Student ratings and comments per course</p>
        </div>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-border">
            <tr>
              <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-8">#</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Course</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Responses</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Avg Rating</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Response</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Feedback</th>
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {enriched.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-16 text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No courses found.
                </td>
              </tr>
            )}
            {enriched.map((c: any, i: number) => (
              <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3.5 text-muted-foreground">{i + 1}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#1B4F8A]/10 flex items-center justify-center shrink-0">
                      <BookOpen className="h-4 w-4 text-[#1B4F8A]" />
                    </div>
                    <span className="font-medium text-slate-800">{c.title}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  {c.response_count > 0
                    ? <span className="font-medium text-slate-700">{c.response_count}</span>
                    : <span className="text-muted-foreground">0</span>
                  }
                </td>
                <td className="px-4 py-3.5">
                  {c.avg_overall !== null ? (
                    <div className="flex items-center gap-1.5">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span className={cn("font-semibold", ratingColor(c.avg_overall))}>
                        {c.avg_overall.toFixed(1)}
                      </span>
                      <span className="text-muted-foreground text-xs">/ 5</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">No data</span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-muted-foreground text-xs">
                  {c.last_submitted
                    ? new Date(c.last_submitted).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", year: "numeric",
                      })
                    : "—"
                  }
                </td>
                <td className="px-4 py-3.5">
                  {c.feedback_enabled ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                      Enabled · {c.feedback_anonymous ? "Anonymous" : "Named"}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground bg-slate-100 px-2 py-0.5 rounded-full">
                      Disabled
                    </span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  {c.response_count > 0 ? (
                    <Link
                      href={`/lms-admin/reports/feedback/${c.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4F8A] hover:underline"
                    >
                      View <ChevronRight className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
