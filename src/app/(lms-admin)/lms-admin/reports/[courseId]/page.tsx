import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowLeft, Users, User, ChevronRight, BookOpen } from "lucide-react"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

interface Props { params: Promise<{ courseId: string }> }

// Course report hub — pick Group report or the Individual reports list.
export default async function LmsCourseReportHubPage({ params }: Props) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) redirect("/auth/login")

  const { courseId } = await params

  const { data: course } = await db
    .from("lms_courses")
    .select("id, title, delivery_mode, status, lms_enrollments(id, status)")
    .eq("id", courseId)
    .single()

  if (!course) notFound()

  const enrollments = (course as any).lms_enrollments ?? []
  const total     = enrollments.length
  const completed = enrollments.filter((e: any) => e.status === "completed").length

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/lms-admin/reports/progress"
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-muted-foreground hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <BookOpen className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold leading-tight">{(course as any).title}</h2>
            <p className="text-muted-foreground text-sm capitalize">
              {(course as any).delivery_mode} · {total} enrolled · {completed} completed
            </p>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">Choose a report to view.</p>

      {/* Two choices */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Group report */}
        <Link href={`/lms-admin/reports/${courseId}/group`} className="group block">
          <Card className="h-full hover:shadow-md transition-shadow group-hover:border-[#1B4F8A]/30">
            <CardContent className="p-6 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="w-11 h-11 rounded-xl bg-[#1B4F8A]/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-[#1B4F8A]" />
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-[#1B4F8A] transition-colors mt-1" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">Group Report</p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Cohort overview — completion, module performance, class ranking, exam analysis,
                  and the AI expert report. Print &amp; PDF.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Individual reports */}
        <Link href={`/lms-admin/reports/${courseId}/individuals`} className="group block">
          <Card className="h-full hover:shadow-md transition-shadow group-hover:border-[#1B4F8A]/30">
            <CardContent className="p-6 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center">
                  <User className="h-5 w-5 text-amber-600" />
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-[#1B4F8A] transition-colors mt-1" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">Individual Reports</p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  A roster of every student — time spent, exam attempts &amp; results — with a
                  per-student report you can open, print &amp; download.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
