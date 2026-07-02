import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft, ChevronRight, Users, CheckCircle2,
  Clock, BarChart3, Download, Eye, GraduationCap, ClipboardList,
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
        id, status, enrolled_at, completed_at, progress_pct,
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
