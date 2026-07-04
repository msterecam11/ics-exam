import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft, ChevronRight, Users, CheckCircle2,
  Clock, BarChart3, Download, Eye, GraduationCap, ClipboardList, AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import LmsCourseReportButton from "@/components/lms/LmsCourseReportButton"
import LmsStudentReportButton from "@/components/lms/LmsStudentReportButton"
import LmsReleaseCertsButton from "@/components/lms/LmsReleaseCertsButton"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

interface Props { params: Promise<{ courseId: string }> }

export default async function LmsCourseReportPage({ params }: Props) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) redirect("/auth/login")

  const { courseId } = await params

  const [courseRes, enrollmentsRes, sessionsRes, modulesRes] = await Promise.all([
    db.from("lms_courses")
      .select("id, title, delivery_mode, status, description")
      .eq("id", courseId)
      .single(),
    db.from("lms_enrollments")
      .select(`
        id, status, enrolled_at, completed_at, progress_pct, time_spent_s,
        lms_students(id, name, email, company, job_title)
      `)
      .eq("course_id", courseId)
      .order("enrolled_at", { ascending: false }),
    db.from("lms_sessions")
      .select("id, title, session_date, start_time, closed_at, lms_attendance(student_id, status)")
      .eq("course_id", courseId)
      .order("session_date", { ascending: false }),
    // Fetch assessment modules (exam + assignment) for this course
    db.from("lms_modules")
      .select("id, module_type, title")
      .eq("course_id", courseId)
      .in("module_type", ["final_exam", "assignment"]),
  ])

  if (!courseRes.data) notFound()
  const course      = courseRes.data as any
  const enrollments = (enrollmentsRes.data ?? []) as any[]
  const sessions    = (sessionsRes.data ?? []) as any[]
  const assessmentModules = (modulesRes.data ?? []) as any[]

  // Fetch all module attempts for the assessment modules in this course
  const assessmentModuleIds = assessmentModules.map(m => m.id)
  const { data: attemptsRaw } = assessmentModuleIds.length > 0
    ? await db.from("lms_module_attempts")
        .select("student_id, module_id, status, score, max_score, passed, submitted_at")
        .in("module_id", assessmentModuleIds)
        .order("submitted_at", { ascending: false })
    : { data: [] }
  const attempts = (attemptsRaw ?? []) as any[]

  const examModule       = assessmentModules.find(m => m.module_type === "final_exam")
  const assignmentModules = assessmentModules.filter(m => m.module_type === "assignment")

  const enriched = enrollments.map((e: any) => {
    // progress_pct is maintained by syncEnrollmentProgress — use it directly (package model)
    const progressPct = Math.round(e.progress_pct ?? 0)

    // Attendance: count sessions attended
    const attended  = sessions.filter((s: any) =>
      (s.lms_attendance ?? []).some(
        (a: any) => a.student_id === e.lms_students?.id && ["present","late"].includes(a.status)
      )
    ).length
    const attendPct = sessions.length > 0 ? Math.round((attended / sessions.length) * 100) : null

    const studentId = e.lms_students?.id

    // Best exam attempt (highest score, or latest)
    const examAttempts = examModule
      ? attempts.filter(a => a.module_id === examModule.id && a.student_id === studentId)
      : []
    const bestExam = examAttempts.sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null

    // Assignment attempts for this student
    const assignAttempts = assignmentModules.map(mod => ({
      moduleId:  mod.id,
      title:     mod.title,
      attempt:   attempts.find(a => a.module_id === mod.id && a.student_id === studentId) ?? null,
    }))
    const pendingAssign  = assignAttempts.filter(a => a.attempt?.status === "submitted").length
    const gradedAssign   = assignAttempts.filter(a => a.attempt?.status === "graded").length

    return {
      enrollmentId:   e.id,
      student:        e.lms_students,
      status:         e.status,
      enrolledAt:     e.enrolled_at,
      completedAt:    e.completed_at,
      progressPct,
      attendPct,
      attended,
      sessionTotal:   sessions.length,
      bestExam,
      assignAttempts,
      pendingAssign,
      gradedAssign,
      totalAssign:    assignmentModules.length,
    }
  })

  const totalEnrolled   = enriched.length
  const totalCompleted  = enriched.filter(e => e.status === "completed").length
  const avgProgress     = totalEnrolled > 0
    ? Math.round(enriched.reduce((s, e) => s + e.progressPct, 0) / totalEnrolled)
    : 0
  const completionRate  = totalEnrolled > 0 ? Math.round((totalCompleted / totalEnrolled) * 100) : 0
  const examPassCount   = enriched.filter(e => e.bestExam?.passed).length
  const pendingGrades   = enriched.reduce((s, e) => s + e.pendingAssign, 0)

  // ── Time-on-task aggregate ──────────────────────────────────────
  const totalTimeS = enrollments.reduce((s, e) => s + (e.time_spent_s ?? 0), 0)
  const avgTimeS   = totalEnrolled > 0 ? Math.round(totalTimeS / totalEnrolled) : 0
  const fmtDur = (s: number) => { if (!s || s < 60) return s >= 1 ? `${s}s` : "—"; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m` }

  // ── Progress distribution (buckets) ─────────────────────────────
  const buckets = [
    { label: "0–25%",  count: enriched.filter(e => e.progressPct < 25).length },
    { label: "25–50%", count: enriched.filter(e => e.progressPct >= 25 && e.progressPct < 50).length },
    { label: "50–75%", count: enriched.filter(e => e.progressPct >= 50 && e.progressPct < 75).length },
    { label: "75–99%", count: enriched.filter(e => e.progressPct >= 75 && e.progressPct < 100).length },
    { label: "100%",   count: enriched.filter(e => e.progressPct >= 100).length },
  ]
  const bucketMax = Math.max(1, ...buckets.map(b => b.count))

  // ── At-risk students ────────────────────────────────────────────
  const atRisk = enriched
    .filter(e => e.status !== "dropped")
    .map(e => {
      const reasons: string[] = []
      if (e.progressPct < 40) reasons.push("Low progress")
      if (e.bestExam && !e.bestExam.passed) reasons.push("Failed exam")
      if (e.attendPct !== null && e.attendPct < 50) reasons.push("Low attendance")
      if (e.pendingAssign > 0) reasons.push(`${e.pendingAssign} ungraded`)
      return { name: e.student?.name, email: e.student?.email, id: e.student?.id, progressPct: e.progressPct, reasons }
    })
    .filter(e => e.reasons.length > 0)

  // ── Per-module cohort performance ───────────────────────────────
  const { data: allModules } = await db.from("lms_modules")
    .select("id, title, module_type, order_index").eq("course_id", courseId).order("order_index")
  const studentIds = enriched.map(e => e.student?.id).filter(Boolean) as string[]
  const pkgModIds  = (allModules ?? []).filter((m: any) => m.module_type === "package").map((m: any) => m.id)
  const { data: pkgRows } = pkgModIds.length
    ? await db.from("lms_packages").select("id, module_id").in("module_id", pkgModIds)
    : { data: [] }
  const pkgIds = (pkgRows ?? []).map((p: any) => p.id)
  const [pkgItemsRes, pkgProgRes] = await Promise.all([
    pkgIds.length ? db.from("lms_package_items").select("package_id").in("package_id", pkgIds) : Promise.resolve({ data: [] }),
    pkgIds.length && studentIds.length
      ? db.from("lms_package_progress").select("package_id, student_id, completed_items, status").in("package_id", pkgIds).in("student_id", studentIds)
      : Promise.resolve({ data: [] }),
  ])
  const totalByPkg: Record<string, number> = {}
  for (const it of (pkgItemsRes.data ?? []) as any[]) totalByPkg[it.package_id] = (totalByPkg[it.package_id] ?? 0) + 1
  const pkgIdByMod = new Map((pkgRows ?? []).map((p: any) => [p.module_id, p.id]))
  const progByKey: Record<string, any> = {}
  for (const pp of (pkgProgRes.data ?? []) as any[]) progByKey[`${pp.package_id}:${pp.student_id}`] = pp

  const moduleStats = (allModules ?? []).map((m: any) => {
    if (m.module_type === "package") {
      const pkgId = pkgIdByMod.get(m.id)
      const total = pkgId ? (totalByPkg[pkgId] ?? 0) : 0
      let sum = 0, done = 0
      for (const sid of studentIds) {
        const pp = pkgId ? progByKey[`${pkgId}:${sid}`] : null
        const isDone = pp?.status === "passed" || pp?.status === "completed"
        const comp = Array.isArray(pp?.completed_items) ? pp.completed_items.length : 0
        const pct = isDone ? 100 : total > 0 ? Math.min(100, Math.round((comp / total) * 100)) : 0
        sum += pct; if (pct >= 100) done++
      }
      return { title: m.title, type: "package", avg: studentIds.length ? Math.round(sum / studentIds.length) : 0, done, total: studentIds.length }
    }
    if (m.module_type === "final_exam") {
      const avg = totalEnrolled
        ? Math.round(enriched.reduce((s, e) => s + (e.bestExam?.score != null && e.bestExam?.max_score ? (e.bestExam.score / e.bestExam.max_score) * 100 : 0), 0) / totalEnrolled)
        : 0
      return { title: m.title, type: "final_exam", avg, done: examPassCount, total: totalEnrolled }
    }
    return { title: m.title, type: m.module_type, avg: null as number | null, done: null as number | null, total: totalEnrolled }
  })

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/lms-admin/reports" className="hover:text-foreground transition-colors">Reports</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{course.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/lms-admin/reports"
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h2 className="text-xl font-bold">{course.title}</h2>
            <p className="text-muted-foreground text-sm capitalize">{course.delivery_mode}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LmsReleaseCertsButton courseId={courseId} />
          <LmsCourseReportButton courseId={courseId} courseTitle={course.title} />
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Enrolled",       value: totalEnrolled,         color: "text-slate-700"   },
          { label: "Completed",      value: totalCompleted,        color: "text-emerald-600" },
          { label: "Avg Progress",   value: `${avgProgress}%`,     color: "text-[#1B4F8A]"  },
          { label: "Completion",     value: `${completionRate}%`,  color: completionRate >= 60 ? "text-emerald-600" : "text-amber-600" },
          { label: "Exam Passes",    value: examModule ? `${examPassCount}/${totalEnrolled}` : "—", color: "text-indigo-600" },
          { label: "Pending Grades", value: pendingGrades,         color: pendingGrades > 0 ? "text-rose-600" : "text-slate-400" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Module performance + distribution + time ──────────────── */}
      {enriched.length > 0 && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-4 w-4 text-[#1B4F8A]" />
                <h3 className="font-semibold text-sm">Module Performance <span className="text-muted-foreground font-normal">— cohort average</span></h3>
              </div>
              {moduleStats.length === 0 ? (
                <p className="text-xs text-muted-foreground">No modules in this course.</p>
              ) : (
                <div className="space-y-3">
                  {moduleStats.map((m, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between text-xs mb-1 gap-2">
                        <span className="font-medium text-slate-700 truncate">{m.title}</span>
                        <span className="text-muted-foreground shrink-0">
                          {m.avg !== null ? `${m.avg}%` : "—"}
                          {m.type === "final_exam" && m.done !== null ? ` · ${m.done}/${m.total} passed` : ""}
                          {m.type === "package"    && m.done !== null ? ` · ${m.done}/${m.total} done` : ""}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", (m.avg ?? 0) >= 70 ? "bg-emerald-500" : (m.avg ?? 0) >= 40 ? "bg-amber-400" : "bg-red-400")}
                          style={{ width: `${m.avg ?? 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-3">Low bars flag modules the whole cohort struggled with — worth reviewing that content.</p>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-sm mb-3">Progress Distribution</h3>
                <div className="space-y-2">
                  {buckets.map(b => (
                    <div key={b.label} className="flex items-center gap-2 text-xs">
                      <span className="w-14 text-muted-foreground shrink-0">{b.label}</span>
                      <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
                        <div className="h-full bg-[#1B4F8A]/70 rounded" style={{ width: `${(b.count / bucketMax) * 100}%` }} />
                      </div>
                      <span className="w-5 text-right font-medium text-slate-700">{b.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center shrink-0"><Clock className="h-5 w-5 text-sky-600" /></div>
                <div>
                  <p className="text-lg font-bold text-slate-800">{fmtDur(avgTimeS)} <span className="text-xs font-normal text-muted-foreground">avg</span></p>
                  <p className="text-xs text-muted-foreground">{fmtDur(totalTimeS)} total learning time</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── At-risk students ───────────────────────────────────────── */}
      {atRisk.length > 0 && (
        <Card className="border-amber-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h3 className="font-semibold text-sm">At-Risk Students <span className="text-muted-foreground font-normal">({atRisk.length})</span></h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {atRisk.map(s => (
                <Link key={s.id} href={`/lms-admin/students/${s.id}`}
                  className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 hover:bg-amber-50 transition-colors">
                  <span className="text-sm font-medium text-slate-700">{s.name}</span>
                  <span className="text-[11px] text-amber-700">{s.reasons.join(" · ")}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Students table */}
      {enriched.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No students enrolled in this course yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Student</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground hidden sm:table-cell">Status</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground hidden md:table-cell">Progress</th>
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground hidden lg:table-cell">Attendance</th>
                    {examModule && <th className="text-left px-5 py-3 font-medium text-muted-foreground hidden lg:table-cell">Final Exam</th>}
                    {assignmentModules.length > 0 && <th className="text-left px-5 py-3 font-medium text-muted-foreground hidden xl:table-cell">Assignments</th>}
                    <th className="px-5 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {enriched.map(e => (
                    <tr key={e.enrollmentId} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] font-bold text-xs flex items-center justify-center shrink-0">
                            {e.student?.name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{e.student?.name}</p>
                            <p className="text-xs text-muted-foreground">{e.student?.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell">
                        <Badge className={cn("text-xs border-0 capitalize", {
                          "bg-blue-100 text-blue-700":      e.status === "active",
                          "bg-emerald-100 text-emerald-700": e.status === "completed",
                          "bg-slate-100 text-slate-500":    e.status === "dropped",
                        })}>
                          {e.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", e.progressPct >= 80 ? "bg-emerald-500" : e.progressPct >= 40 ? "bg-amber-400" : "bg-slate-300")}
                              style={{ width: `${e.progressPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">{e.progressPct}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 hidden lg:table-cell">
                        {e.attendPct !== null ? (
                          <span className={cn("text-xs font-medium", e.attendPct >= 80 ? "text-emerald-600" : e.attendPct >= 50 ? "text-amber-600" : "text-red-500")}>
                            {e.attended}/{e.sessionTotal} ({e.attendPct}%)
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      {examModule && (
                        <td className="px-5 py-3 hidden lg:table-cell">
                          {e.bestExam ? (
                            <div className="flex items-center gap-1.5">
                              <GraduationCap className={cn("h-3.5 w-3.5 shrink-0", e.bestExam.passed ? "text-emerald-500" : "text-red-400")} />
                              <span className={cn("text-xs font-medium", e.bestExam.passed ? "text-emerald-600" : "text-red-500")}>
                                {e.bestExam.passed ? "Passed" : "Failed"}
                                {e.bestExam.score != null && e.bestExam.max_score
                                  ? ` · ${Math.round((e.bestExam.score / e.bestExam.max_score) * 100)}%`
                                  : ""}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not attempted</span>
                          )}
                        </td>
                      )}
                      {assignmentModules.length > 0 && (
                        <td className="px-5 py-3 hidden xl:table-cell">
                          {e.totalAssign === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : e.pendingAssign > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <ClipboardList className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              <span className="text-xs text-amber-600 font-medium">{e.pendingAssign} pending</span>
                            </div>
                          ) : e.gradedAssign > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              <span className="text-xs text-emerald-600 font-medium">{e.gradedAssign}/{e.totalAssign} graded</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not submitted</span>
                          )}
                        </td>
                      )}
                      <td className="px-5 py-3">
                        <LmsStudentReportButton
                          studentId={e.student?.id}
                          courseId={courseId}
                          studentName={e.student?.name ?? "Student"}
                          courseTitle={course.title}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
