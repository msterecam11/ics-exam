import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import CourseReportButton from "@/components/reports/CourseReportButton"
import {
  ArrowLeft, BookOpen, CheckCircle2, ChevronRight, Clock,
  FileText, Users, XCircle, BarChart2
} from "lucide-react"

interface Props {
  params: Promise<{ groupId: string; courseId: string }>
}

function scoreColor(pct: number) {
  if (pct >= 80) return "text-emerald-600"
  if (pct >= 60) return "text-amber-600"
  return "text-red-500"
}

export default async function CourseReportsPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect("/auth/login")

  const { groupId, courseId } = await params

  const [groupRes, courseRes, examsRes] = await Promise.all([
    db.from("groups").select("id, name").eq("id", groupId).single(),
    db.from("courses").select("id, name").eq("id", courseId).single(),
    db.from("exams")
      .select("id, title, passing_score, created_at, candidates(id, full_name, email, company, total_score, passed, submitted_at, results_released)")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false }),
  ])

  if (!groupRes.data || !courseRes.data) notFound()
  const group = groupRes.data as any
  const course = courseRes.data as any
  const exams = (examsRes.data ?? []) as any[]

  const enrichedExams = exams.map((e: any) => {
    const candidates = e.candidates ?? []
    const submitted = candidates.filter((c: any) => c.submitted_at)
    const passed = submitted.filter((c: any) => c.passed)
    const passRate = submitted.length > 0 ? Math.round((passed.length / submitted.length) * 100) : null
    const avgScore = submitted.length > 0
      ? submitted.reduce((s: number, c: any) => s + (c.total_score ?? 0), 0) / submitted.length
      : null
    return { ...e, submitted, passRate, avgScore }
  })

  const allSubmitted = enrichedExams.flatMap((e: any) => e.submitted)
  const allPassed = allSubmitted.filter((c: any) => c.passed)
  const coursePassRate = allSubmitted.length > 0 ? Math.round((allPassed.length / allSubmitted.length) * 100) : null
  const courseAvg = allSubmitted.length > 0
    ? allSubmitted.reduce((s: number, c: any) => s + (c.total_score ?? 0), 0) / allSubmitted.length
    : null

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <Link href="/reports" className="hover:text-foreground transition-colors">Reports</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/reports/${groupId}`} className="hover:text-foreground transition-colors">{group.name}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{course.name}</span>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Link href={`/reports/${groupId}`} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h2 className="text-xl font-bold">{course.name}</h2>
            <p className="text-muted-foreground text-sm">{group.name}</p>
          </div>
        </div>
        <CourseReportButton courseId={courseId} />
      </div>

      {/* Course summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Exams", value: exams.length, icon: FileText, color: "text-[#1B4F8A]" },
          { label: "Total Submitted", value: allSubmitted.length, icon: Users, color: "text-slate-700" },
          { label: "Course Avg", value: courseAvg !== null ? `${courseAvg.toFixed(1)}%` : "—", icon: BarChart2, color: "text-purple-600" },
          { label: "Pass Rate", value: coursePassRate !== null ? `${coursePassRate}%` : "—", icon: CheckCircle2, color: coursePassRate !== null && coursePassRate >= 60 ? "text-emerald-600" : "text-red-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs">{label}</span>
              </div>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Exams */}
      {enrichedExams.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No exams in this course yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {enrichedExams.map((exam: any) => (
            <Card key={exam.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="text-base">{exam.title}</CardTitle>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">Pass: {exam.passing_score}%</span>
                      <span className="text-muted-foreground/40">·</span>
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Users className="h-3 w-3" /> {exam.submitted.length} submitted
                      </Badge>
                      {exam.passRate !== null && (
                        <Badge variant="secondary" className={`text-xs ${exam.passRate >= 60 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"} border-0`}>
                          {exam.passRate}% pass rate
                        </Badge>
                      )}
                      {exam.avgScore !== null && (
                        <Badge variant="secondary" className="text-xs border-0 bg-slate-100 text-slate-600">
                          avg {exam.avgScore.toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/exams/${exam.id}/results`}
                    className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1"
                  >
                    <BookOpen className="h-3.5 w-3.5" /> Manage exam
                  </Link>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {exam.submitted.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">No submissions yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-t border-border bg-muted/40">
                          <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Candidate</th>
                          <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2.5 hidden sm:table-cell">Company</th>
                          <th className="text-center text-xs font-semibold text-muted-foreground px-3 py-2.5">Score</th>
                          <th className="text-center text-xs font-semibold text-muted-foreground px-3 py-2.5">Result</th>
                          <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Report</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exam.submitted
                          .sort((a: any, b: any) => (b.total_score ?? 0) - (a.total_score ?? 0))
                          .map((c: any, idx: number) => (
                            <tr key={c.id} className={`border-t border-border ${idx % 2 === 0 ? "" : "bg-muted/20"}`}>
                              <td className="px-4 py-2.5">
                                <p className="font-medium text-sm leading-tight">{c.full_name}</p>
                                <p className="text-xs text-muted-foreground">{c.email}</p>
                              </td>
                              <td className="px-3 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">
                                {c.company ?? "—"}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={`text-sm font-bold ${scoreColor(c.total_score ?? 0)}`}>
                                  {c.total_score?.toFixed(1) ?? "—"}%
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {c.passed ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Pass
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium">
                                    <XCircle className="h-3.5 w-3.5" /> Fail
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <Link
                                  href={`/reports/candidate/${c.id}`}
                                  target="_blank"
                                  className="inline-flex items-center gap-1 h-7 px-2.5 text-xs border border-[#1B4F8A] text-[#1B4F8A] rounded-md hover:bg-blue-50 transition-colors font-medium"
                                >
                                  <FileText className="h-3 w-3" /> Report
                                </Link>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
