import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BarChart3, BookOpen, ChevronRight, FileText, Users } from "lucide-react"

export default async function ReportsPage() {
  const session = await auth()
  if (!session) redirect("/auth/login")

  // Fetch groups with nested courses → exams → candidates
  const { data: groups } = await db
    .from("groups")
    .select("id, name, description, courses(id, name, exams(id, candidates(id, total_score, passed, submitted_at)))")
    .order("name")

  const enriched = (groups ?? []).map((g: any) => {
    const courses = g.courses ?? []
    const exams = courses.flatMap((c: any) => c.exams ?? [])
    const allCandidates = exams.flatMap((e: any) => e.candidates ?? [])
    const submitted = allCandidates.filter((c: any) => c.submitted_at)
    const passed = submitted.filter((c: any) => c.passed)
    const passRate = submitted.length > 0 ? Math.round((passed.length / submitted.length) * 100) : null
    const avgScore = submitted.length > 0
      ? submitted.reduce((s: number, c: any) => s + (c.total_score ?? 0), 0) / submitted.length
      : null
    return { ...g, courses, courseCount: courses.length, examCount: exams.length, candidateCount: submitted.length, passRate, avgScore }
  })

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold">Reports</h2>
        <p className="text-muted-foreground text-sm">Browse by group → course → candidate to download performance reports</p>
      </div>

      {enriched.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No groups found.</p>
            <p className="text-muted-foreground text-sm mt-1">Create groups and courses first, then run exams to generate reports.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {enriched.map((g: any) => (
            <Link key={g.id} href={`/reports/${g.id}`} className="group block">
              <Card className="h-full hover:shadow-md transition-shadow border-border group-hover:border-[#1B4F8A]/30">
                <CardContent className="p-5 flex flex-col gap-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#1B4F8A]/10 flex items-center justify-center shrink-0">
                        <Users className="h-5 w-5 text-[#1B4F8A]" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 leading-tight">{g.name}</p>
                        {g.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{g.description}</p>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-[#1B4F8A] transition-colors mt-1 shrink-0" />
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="secondary" className="gap-1 text-xs font-normal">
                      <BookOpen className="h-3 w-3" /> {g.courseCount} course{g.courseCount !== 1 ? "s" : ""}
                    </Badge>
                    <Badge variant="secondary" className="gap-1 text-xs font-normal">
                      <FileText className="h-3 w-3" /> {g.examCount} exam{g.examCount !== 1 ? "s" : ""}
                    </Badge>
                    <Badge variant="secondary" className="gap-1 text-xs font-normal">
                      <Users className="h-3 w-3" /> {g.candidateCount} submitted
                    </Badge>
                  </div>

                  {/* Pass rate + avg */}
                  {g.passRate !== null && (
                    <div className="flex items-center gap-4 pt-1 border-t border-border">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pass Rate</p>
                        <p className={`text-lg font-bold ${g.passRate >= 60 ? "text-emerald-600" : "text-red-500"}`}>
                          {g.passRate}%
                        </p>
                      </div>
                      <div className="h-8 w-px bg-border" />
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Score</p>
                        <p className="text-lg font-bold text-slate-700">{g.avgScore!.toFixed(1)}%</p>
                      </div>
                    </div>
                  )}
                  {g.passRate === null && g.examCount > 0 && (
                    <p className="text-xs text-muted-foreground pt-1 border-t border-border">No submissions yet</p>
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
