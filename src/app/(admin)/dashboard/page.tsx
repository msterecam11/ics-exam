import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Users, BookOpen, FileText, CheckCircle, Clock } from "lucide-react"
import Link from "next/link"
import { formatScore, cn } from "@/lib/utils"

async function getStats() {
  const [
    { count: groupCount },
    { count: courseCount },
    { count: examCount },
    { count: candidateCount },
    { data: recentExams },
    { data: recentCandidates },
  ] = await Promise.all([
    db.from("groups").select("*", { count: "exact", head: true }),
    db.from("courses").select("*", { count: "exact", head: true }),
    db.from("exams").select("*", { count: "exact", head: true }),
    db.from("candidates").select("*", { count: "exact", head: true }),
    db
      .from("exams")
      .select("id, title, status, created_at, courses(name, groups(name))")
      .order("created_at", { ascending: false })
      .limit(5),
    db
      .from("candidates")
      .select("id, full_name, total_score, passed, submitted_at, exams(title)")
      .order("submitted_at", { ascending: false })
      .limit(5),
  ])

  return { groupCount, courseCount, examCount, candidateCount, recentExams, recentCandidates }
}

export default async function DashboardPage() {
  const session = await auth()
  const stats = await getStats()

  const statCards = [
    { label: "Groups", value: stats.groupCount ?? 0, icon: Users, href: "/groups", color: "text-[#1B4F8A]", bg: "bg-blue-50" },
    { label: "Courses", value: stats.courseCount ?? 0, icon: BookOpen, href: "/courses", color: "text-[#4B7EC8]", bg: "bg-sky-50" },
    { label: "Exams", value: stats.examCount ?? 0, icon: FileText, href: "/exams", color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Candidates", value: stats.candidateCount ?? 0, icon: CheckCircle, href: "/candidates", color: "text-emerald-600", bg: "bg-emerald-50" },
  ]

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-foreground">
          Welcome back, {session?.user?.name?.split(" ")[0]}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">Here&apos;s an overview of your exam platform.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, href, color, bg }) => (
          <Link key={label} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-6 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
                  </div>
                  <div className={`${bg} p-3 rounded-xl`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Exams */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">Recent Exams</CardTitle>
            <Link href="/exams" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.recentExams?.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-4">No exams yet.</p>
            )}
            {stats.recentExams?.map((exam: any) => (
              <Link
                key={exam.id}
                href={`/exams/${exam.id}`}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">{exam.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {exam.courses?.groups?.name} → {exam.courses?.name}
                  </p>
                </div>
                <Badge
                  variant={exam.status === "active" ? "default" : "secondary"}
                  className={
                    exam.status === "active"
                      ? "bg-emerald-100 text-emerald-700 border-0"
                      : exam.status === "closed"
                      ? "bg-slate-100 text-slate-600 border-0"
                      : "bg-amber-100 text-amber-700 border-0"
                  }
                >
                  {exam.status}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Recent Submissions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">Recent Submissions</CardTitle>
            <Link href="/candidates" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.recentCandidates?.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-4">No submissions yet.</p>
            )}
            {stats.recentCandidates?.map((c: any) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50"
              >
                <div>
                  <p className="text-sm font-medium">{c.full_name}</p>
                  <p className="text-xs text-muted-foreground">{c.exams?.title}</p>
                </div>
                <div className="text-right">
                  {c.submitted_at ? (
                    <>
                      <p className={`text-sm font-semibold ${c.passed ? "text-emerald-600" : "text-red-500"}`}>
                        {formatScore(c.total_score)}
                      </p>
                      <p className="text-xs text-muted-foreground">{c.passed ? "Passed" : "Failed"}</p>
                    </>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-amber-600">
                      <Clock className="h-3 w-3" /> In progress
                    </span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
