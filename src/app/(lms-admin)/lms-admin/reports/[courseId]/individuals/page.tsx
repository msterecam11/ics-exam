import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowLeft, User, FileText } from "lucide-react"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

function fmtTime(s: number) {
  if (!s || s < 60) return s >= 1 ? `${s}s` : "—"
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

interface Props { params: Promise<{ courseId: string }> }

// Individual reports — a roster table; each row opens that student's report.
export default async function LmsIndividualReportsPage({ params }: Props) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) redirect("/auth/login")

  const { courseId } = await params

  const [courseRes, enrollRes, examModRes] = await Promise.all([
    db.from("lms_courses").select("id, title").eq("id", courseId).single(),
    db.from("lms_enrollments")
      .select("id, status, time_spent_s, lms_students(id, name, email, company, job_title)")
      .eq("course_id", courseId)
      .order("enrolled_at", { ascending: false }),
    db.from("lms_modules").select("id").eq("course_id", courseId).eq("module_type", "final_exam").order("order_index", { ascending: true }).limit(1),
  ])

  if (!courseRes.data) notFound()
  const course      = courseRes.data as any
  const enrollments = (enrollRes.data ?? []) as any[]
  const examModuleId = ((examModRes.data ?? []) as any[])[0]?.id ?? null

  // Final-exam attempts for all students in this course
  let attempts: any[] = []
  if (examModuleId) {
    const { data } = await db
      .from("lms_module_attempts")
      .select("student_id, passed, score, max_score, attempt_no")
      .eq("module_id", examModuleId)
      .order("attempt_no", { ascending: false })
    attempts = data ?? []
  }

  const rows = enrollments.map((e: any) => {
    const s = e.lms_students
    const mine = attempts.filter(a => a.student_id === s?.id)
    const attemptCount = mine.length
    // best attempt = highest pct
    const best = mine
      .map(a => ({ passed: a.passed, pct: a.max_score > 0 ? Math.round((a.score / a.max_score) * 100) : null }))
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))[0] ?? null
    return {
      id:         s?.id,
      name:       s?.name ?? "—",
      email:      s?.email ?? "",
      company:    s?.company || "—",
      jobTitle:   s?.job_title || "—",
      timeS:      e.time_spent_s ?? 0,
      attemptCount,
      best,
    }
  }).filter(r => r.id)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/lms-admin/reports/${courseId}`}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-muted-foreground hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <User className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold leading-tight">Individual Reports</h2>
            <p className="text-muted-foreground text-sm">{course.title} · {rows.length} students</p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground text-xs uppercase tracking-wider">
                <th className="py-3 px-4 font-semibold w-10">#</th>
                <th className="py-3 px-4 font-semibold">Name</th>
                <th className="py-3 px-4 font-semibold">Company</th>
                <th className="py-3 px-4 font-semibold">Job Title</th>
                <th className="py-3 px-4 font-semibold">Time Spent</th>
                <th className="py-3 px-4 font-semibold text-center">Exam Attempts</th>
                <th className="py-3 px-4 font-semibold">Exam Result</th>
                <th className="py-3 px-4 font-semibold text-right">Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-muted-foreground">No students enrolled yet.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 text-muted-foreground">{i + 1}</td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-slate-800">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.email}</p>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{r.company}</td>
                  <td className="py-3 px-4 text-slate-600">{r.jobTitle}</td>
                  <td className="py-3 px-4 text-slate-600">{fmtTime(r.timeS)}</td>
                  <td className="py-3 px-4 text-center text-slate-600">
                    {r.attemptCount > 0 ? r.attemptCount : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-3 px-4">
                    {!r.best ? (
                      <span className="text-muted-foreground">Not attempted</span>
                    ) : (
                      <Link href={`/lms-admin/reports/${courseId}/${r.id}/exam`}
                        title="View exam answers & attempts"
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                          r.best.passed
                            ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            : "border-red-200 text-red-600 hover:bg-red-50"}`}>
                        {r.best.passed ? "Passed" : "Failed"}{r.best.pct != null ? ` · ${r.best.pct}%` : ""}
                      </Link>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link href={`/lms-admin/reports/${courseId}/${r.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#1B4F8A]/30 text-[#1B4F8A] px-3 py-1.5 text-xs font-medium hover:bg-[#1B4F8A] hover:text-white transition-colors">
                      <FileText className="h-3.5 w-3.5" /> Report
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
