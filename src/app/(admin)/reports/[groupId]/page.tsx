import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BarChart3, BookOpen, ChevronRight, FileText, Users, ArrowLeft } from "lucide-react"
import GroupReportButton from "@/components/reports/GroupReportButton"

interface Props {
  params: Promise<{ groupId: string }>
}

export default async function GroupReportsPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect("/auth/login")

  const { groupId } = await params

  const [groupRes, coursesRes] = await Promise.all([
    db.from("groups").select("id, name, description").eq("id", groupId).single(),
    db.from("courses")
      .select("id, name, exams(id, title, passing_score, candidates(id, total_score, passed, submitted_at))")
      .eq("group_id", groupId)
      .order("name"),
  ])

  if (!groupRes.data) notFound()
  const group = groupRes.data as any
  const courses = (coursesRes.data ?? []) as any[]

  const enriched = courses.map((c: any) => {
    const exams = c.exams ?? []
    const allCandidates = exams.flatMap((e: any) => e.candidates ?? [])
    const submitted = allCandidates.filter((c: any) => c.submitted_at)
    const passed = submitted.filter((c: any) => c.passed)
    const passRate = submitted.length > 0 ? Math.round((passed.length / submitted.length) * 100) : null
    const avgScore = submitted.length > 0
      ? submitted.reduce((s: number, c: any) => s + (c.total_score ?? 0), 0) / submitted.length
      : null
    return { ...c, exams, examCount: exams.length, candidateCount: submitted.length, passRate, avgScore }
  })

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/reports" className="hover:text-foreground transition-colors">Reports</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{group.name}</span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/reports" className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h2 className="text-xl font-bold">{group.name}</h2>
            {group.description && (
              <p className="text-muted-foreground text-sm">{group.description}</p>
            )}
          </div>
        </div>
        <GroupReportButton groupId={groupId} />
      </div>

      {enriched.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No courses in this group yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {enriched.map((c: any) => (
            <Link key={c.id} href={`/reports/${groupId}/${c.id}`} className="group block">
              <Card className="h-full hover:shadow-md transition-shadow border-border group-hover:border-[#1B4F8A]/30">
                <CardContent className="p-5 flex flex-col gap-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                        <BookOpen className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 leading-tight">{c.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{group.name}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-[#1B4F8A] transition-colors mt-1 shrink-0" />
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="secondary" className="gap-1 text-xs font-normal">
                      <FileText className="h-3 w-3" /> {c.examCount} exam{c.examCount !== 1 ? "s" : ""}
                    </Badge>
                    <Badge variant="secondary" className="gap-1 text-xs font-normal">
                      <Users className="h-3 w-3" /> {c.candidateCount} submitted
                    </Badge>
                  </div>

                  {/* Pass rate + avg */}
                  {c.passRate !== null ? (
                    <div className="flex items-center gap-4 pt-1 border-t border-border">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pass Rate</p>
                        <p className={`text-lg font-bold ${c.passRate >= 60 ? "text-emerald-600" : "text-red-500"}`}>
                          {c.passRate}%
                        </p>
                      </div>
                      <div className="h-8 w-px bg-border" />
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Score</p>
                        <p className="text-lg font-bold text-slate-700">{c.avgScore!.toFixed(1)}%</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground pt-1 border-t border-border">
                      {c.examCount > 0 ? "No submissions yet" : "No exams yet"}
                    </p>
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
