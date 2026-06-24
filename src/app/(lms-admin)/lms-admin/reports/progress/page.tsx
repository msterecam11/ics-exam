import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, BookOpen, BarChart3, ChevronRight, Users, CheckCircle2, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

export default async function LmsProgressReportsPage() {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) redirect("/auth/login")

  const { data: courses } = await db
    .from("lms_courses")
    .select(`
      id, title, delivery_mode, status, created_at,
      lms_enrollments(id, status),
      lms_sessions(id, closed_at)
    `)
    .neq("status", "archived")
    .order("created_at", { ascending: false })

  const enriched = (courses ?? []).map((c: any) => {
    const enrollments = c.lms_enrollments ?? []
    const active    = enrollments.filter((e: any) => e.status === "active").length
    const completed = enrollments.filter((e: any) => e.status === "completed").length
    const total     = enrollments.length
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : null
    const sessions  = c.lms_sessions ?? []
    return { ...c, total, active, completed, completionRate, sessionCount: sessions.length }
  })

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/lms-admin/reports"
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-muted-foreground hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h2 className="text-xl font-bold">Progress Reports</h2>
          <p className="text-muted-foreground text-sm">
            Browse by course → student to view and download progress reports
          </p>
        </div>
      </div>

      {enriched.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No courses yet.</p>
            <p className="text-muted-foreground text-sm mt-1">
              Create courses and enroll students first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {enriched.map((c: any) => (
            <Link key={c.id} href={`/lms-admin/reports/${c.id}`} className="group block">
              <Card className="h-full hover:shadow-md transition-shadow border-border group-hover:border-[#1B4F8A]/30">
                <CardContent className="p-5 flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                        <BookOpen className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 leading-tight">{c.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                          {c.delivery_mode} · {c.sessionCount} session{c.sessionCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-[#1B4F8A] transition-colors mt-1 shrink-0" />
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="secondary" className="gap-1 text-xs font-normal">
                      <Users className="h-3 w-3" /> {c.total} enrolled
                    </Badge>
                    <Badge variant="secondary" className="gap-1 text-xs font-normal">
                      <CheckCircle2 className="h-3 w-3" /> {c.completed} completed
                    </Badge>
                    <Badge className={cn("text-xs border-0", {
                      "bg-emerald-100 text-emerald-700": c.status === "published",
                      "bg-slate-100 text-slate-500":    c.status === "draft",
                    })}>
                      {c.status}
                    </Badge>
                  </div>

                  {c.completionRate !== null ? (
                    <div className="flex items-center gap-4 pt-1 border-t border-border">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Completion Rate</p>
                        <p className={cn("text-lg font-bold", c.completionRate >= 60 ? "text-emerald-600" : "text-amber-600")}>
                          {c.completionRate}%
                        </p>
                      </div>
                      <div className="h-8 w-px bg-border" />
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active</p>
                        <p className="text-lg font-bold text-slate-700">{c.active}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground pt-1 border-t border-border">No enrollments yet</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
