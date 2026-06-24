import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Image from "next/image"
import { CheckCircle2, Users, BookOpen, TrendingUp } from "lucide-react"
import ScoreBar from "@/components/reports/ScoreBar"

interface Props {
  params: Promise<{ courseId: string }>
  searchParams: Promise<{ pdf_secret?: string }>
}

function Page({ children, dark = false, first = false }: {
  children: React.ReactNode; dark?: boolean; first?: boolean
}) {
  return (
    <div
      data-report-page=""
      className={`relative w-full flex flex-col ${dark ? "bg-[#1B4F8A]" : "bg-white"} ${first ? "overflow-hidden" : "page-break"}`}
      style={first ? { minHeight: "100vh" } : undefined}
    >
      {children}
    </div>
  )
}

function PageHeader({ light = false, title, subtitle, today }: {
  light?: boolean; title: string; subtitle?: string; today: string
}) {
  return (
    <div className={`flex items-center justify-between px-12 pt-8 pb-5 border-b shrink-0
      ${light ? "border-white/15" : "border-[#1B4F8A] border-b-2"}`}>
      <Image
        src={light ? "/logo/logo-white.png" : "/logo/logo-dark-blue.png"}
        alt="ICS Aviation" width={110} height={30} className="object-contain"
      />
      <div className="text-right">
        <p className={`text-[10px] font-bold uppercase tracking-widest ${light ? "text-white/70" : "text-[#1B4F8A]"}`}>{title}</p>
        {subtitle && <p className={`text-[10px] mt-0.5 ${light ? "text-white/40" : "text-slate-400"}`}>{subtitle}</p>}
        <p className={`text-[10px] mt-0.5 ${light ? "text-white/40" : "text-slate-400"}`}>{today}</p>
      </div>
    </div>
  )
}

function PageFooter({ page, total, light = false }: { page: number; total: number; light?: boolean }) {
  return (
    <div className={`px-12 py-4 border-t shrink-0 flex items-center justify-between mt-auto
      ${light ? "border-white/10" : "border-slate-100"}`}>
      <p className={`text-[9px] uppercase tracking-widest ${light ? "text-white/30" : "text-slate-300"}`}>
        ICS Aviation · Integrated Consulting Services · Confidential
      </p>
      <p className={`text-[9px] ${light ? "text-white/30" : "text-slate-300"}`}>Page {page} of {total}</p>
    </div>
  )
}

export default async function PrintCourseLmsReport({ params, searchParams }: Props) {
  const { pdf_secret } = await searchParams
  const validSecret = process.env.PDF_INTERNAL_SECRET && pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
  }

  const { courseId } = await params
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })

  const courseRes = await db.from("lms_courses")
    .select("id, title, delivery_mode, description, created_at")
    .eq("id", courseId).single()

  if (!courseRes.data) notFound()
  const course = courseRes.data as any

  const [enrollRes, modulesRes, sessionsRes] = await Promise.all([
    db.from("lms_enrollments")
      .select("id, status, enrolled_at, completed_at, student_id, lms_students(name, email, company, job_title)")
      .eq("course_id", courseId)
      .order("enrolled_at", { ascending: false }),
    db.from("lms_modules")
      .select("id, title, order_index, lms_content_items(id, is_mandatory)")
      .eq("course_id", courseId).order("order_index"),
    db.from("lms_sessions")
      .select("id, title, session_date, lms_attendance(student_id, status)")
      .eq("course_id", courseId).order("session_date"),
  ])

  const enrollments = (enrollRes.data ?? []) as any[]
  const modules     = (modulesRes.data ?? []) as any[]
  const sessions    = (sessionsRes.data ?? []) as any[]

  const studentIds = enrollments.map((e: any) => e.student_id)

  // Fetch all progress
  const { data: allProgress } = studentIds.length
    ? await db.from("lms_progress")
        .select("student_id, content_item_id, status, time_spent")
        .eq("course_id", courseId)
        .in("student_id", studentIds)
    : { data: [] }

  const totalMandatory = modules.reduce((s: number, m: any) =>
    s + (m.lms_content_items ?? []).filter((i: any) => i.is_mandatory).length, 0)

  const mandatoryIds = modules.flatMap((m: any) =>
    (m.lms_content_items ?? []).filter((i: any) => i.is_mandatory).map((i: any) => i.id))

  // Build per-student summary
  const studentRows = enrollments.map((e: any) => {
    const prog = (allProgress ?? []).filter((p: any) => p.student_id === e.student_id)
    const completed = prog.filter((p: any) => mandatoryIds.includes(p.content_item_id) && p.status === "completed").length
    const pct       = totalMandatory > 0 ? Math.round((completed / totalMandatory) * 100) : 0
    const attended  = sessions.filter((s: any) =>
      (s.lms_attendance ?? []).some((a: any) => a.student_id === e.student_id && ["present","late"].includes(a.status))
    ).length
    const attPct = sessions.length > 0 ? Math.round((attended / sessions.length) * 100) : null
    return { ...e, student: e.lms_students, pct, completed, attended, attPct }
  })

  const totalEnrolled  = enrollments.length
  const totalCompleted = enrollments.filter((e: any) => e.status === "completed").length
  const avgProgress    = totalEnrolled > 0
    ? Math.round(studentRows.reduce((s, r) => s + r.pct, 0) / totalEnrolled) : 0
  const completionRate = totalEnrolled > 0 ? Math.round((totalCompleted / totalEnrolled) * 100) : 0

  // Students per page (30 rows max)
  const ROWS_PER_PAGE = 30
  const studentPages: (typeof studentRows)[] = []
  for (let i = 0; i < studentRows.length; i += ROWS_PER_PAGE) {
    studentPages.push(studentRows.slice(i, i + ROWS_PER_PAGE))
  }

  const totalPages = 1 + (studentPages.length || 1)

  return (
    <>
      <style>{`
        html, body { margin: 0 !important; padding: 0 !important; }
        .page-break { break-before: page; }
        .avoid-break { break-inside: avoid; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      `}</style>

      <div id="report-root" style={{ width: 794, margin: "0 auto", display: "flex", flexDirection: "column", background: "white" }}>

        {/* ══ PAGE 1 — COVER ══ */}
        <Page dark first>
          <div className="absolute top-0 right-0 w-80 h-80 rounded-full pointer-events-none opacity-10"
            style={{ background: "radial-gradient(circle, #34d399, transparent)", transform: "translate(35%,-35%)" }} />
          <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full pointer-events-none opacity-10"
            style={{ background: "radial-gradient(circle, #6ee7b7, transparent)", transform: "translate(-35%,35%)" }} />

          <div className="flex items-center justify-between px-12 pt-10 shrink-0">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36} className="object-contain" />
            <p className="text-white/40 text-xs">{today}</p>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-12 text-center gap-7">
            <div className="space-y-3">
              <p className="text-white/50 text-[11px] uppercase tracking-[0.4em]">Course Completion Report</p>
              <div className="flex items-center gap-3 justify-center">
                <div className="h-px w-14 bg-white/20" />
                <div className="w-1 h-1 rounded-full bg-white/30" />
                <div className="h-px w-14 bg-white/20" />
              </div>
            </div>

            <div>
              <h1 className="text-4xl font-extrabold text-white tracking-tight leading-tight max-w-lg">{course.title}</h1>
              <p className="text-white/50 text-sm mt-2 capitalize">{course.delivery_mode}</p>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-10">
              <div className="text-center">
                <p className="text-3xl font-bold text-white">{totalEnrolled}</p>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Enrolled</p>
              </div>
              <div className="h-10 w-px bg-white/15" />
              <div className="text-center">
                <p className="text-3xl font-bold text-emerald-300">{completionRate}%</p>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Completion Rate</p>
              </div>
              <div className="h-10 w-px bg-white/15" />
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-200">{avgProgress}%</p>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Avg Progress</p>
              </div>
            </div>

            {/* Module list */}
            <div className="w-full max-w-md space-y-2">
              {modules.map((m: any, i: number) => {
                const mandatory = (m.lms_content_items ?? []).filter((c: any) => c.is_mandatory).length
                return (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-xl text-left">
                    <span className="text-white/30 text-xs w-5 shrink-0">{i + 1}</span>
                    <span className="text-white/80 text-sm flex-1">{m.title}</span>
                    <span className="text-white/30 text-xs shrink-0">{mandatory} items</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="px-12 py-6 border-t border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5 text-emerald-300/60" />
              <p className="text-white/30 text-[10px]">ICS Learning Management System</p>
            </div>
            <p className="text-white/20 text-[9px]">Page 1 of {totalPages}</p>
          </div>
        </Page>

        {/* ══ PAGES 2+ — STUDENT TABLE ══ */}
        {(studentPages.length === 0 ? [[]] : studentPages).map((rows, pi) => (
          <Page key={pi}>
            <PageHeader
              title={pi === 0 ? "Student Progress Summary" : `Student Progress (cont.)`}
              subtitle={course.title}
              today={today}
            />
            <div className="px-12 py-7 space-y-5">

              {pi === 0 && (
                <div className="avoid-break grid grid-cols-4 gap-4 mb-6">
                  {[
                    { label: "Total Enrolled",   value: totalEnrolled,    color: "text-slate-700" },
                    { label: "Completed",         value: totalCompleted,   color: "text-emerald-600" },
                    { label: "Completion Rate",   value: `${completionRate}%`, color: completionRate >= 60 ? "text-emerald-600" : "text-amber-600" },
                    { label: "Average Progress",  value: `${avgProgress}%`, color: "text-[#1B4F8A]" },
                  ].map(s => (
                    <div key={s.label} className="border border-slate-100 rounded-xl p-4 text-center">
                      <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Table */}
              <div className="avoid-break">
                {pi === 0 && <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">All Students</p>}
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <span className="flex-1">Student</span>
                    <span className="w-16 text-center">Status</span>
                    <span className="w-20 text-center">Progress</span>
                    <span className="w-20 text-center">Attendance</span>
                  </div>

                  {rows.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-slate-400">No students enrolled</div>
                  ) : rows.map((r, ri) => (
                    <div key={r.enrollmentId}
                      className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-0 ${ri % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{r.student?.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{r.student?.email}</p>
                      </div>
                      <div className="w-16 text-center">
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                          r.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                          r.status === "active"    ? "bg-blue-50 text-blue-700" :
                          "bg-slate-100 text-slate-400"
                        }`}>
                          {r.status}
                        </span>
                      </div>
                      <div className="w-20 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`text-xs font-bold ${r.pct >= 80 ? "text-emerald-600" : r.pct >= 40 ? "text-amber-600" : "text-slate-400"}`}>
                            {r.pct}%
                          </span>
                          <div className="w-14 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${r.pct >= 80 ? "bg-emerald-500" : r.pct >= 40 ? "bg-amber-400" : "bg-slate-300"}`}
                              style={{ width: `${r.pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="w-20 text-center">
                        {r.attPct !== null ? (
                          <span className={`text-xs font-bold ${r.attPct >= 80 ? "text-emerald-600" : r.attPct >= 50 ? "text-amber-600" : "text-red-500"}`}>
                            {r.attPct}%
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {pi === studentPages.length - 1 && (
                <div className="avoid-break border-t border-slate-100 pt-5 flex flex-col items-center gap-2 text-center">
                  <Image src="/logo/logo-dark-blue.png" alt="ICS" width={80} height={22} className="object-contain opacity-20" />
                  <p className="text-[10px] text-slate-300 uppercase tracking-widest">ICS Aviation · Integrated Consulting Services</p>
                  <p className="text-[10px] text-slate-300 max-w-md">
                    This report is generated from the ICS Learning Management System and is for internal use only.
                  </p>
                </div>
              )}
            </div>
            <PageFooter page={2 + pi} total={totalPages} />
          </Page>
        ))}

      </div>
    </>
  )
}
