import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Image from "next/image"
import { CheckCircle2, XCircle, Clock, BookOpen, Calendar, Users } from "lucide-react"
import ScoreBar from "@/components/reports/ScoreBar"

interface Props {
  params: Promise<{ studentId: string; courseId: string }>
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

function progressColor(pct: number) {
  if (pct >= 80) return { text: "#10b981", bg: "#d1fae5", border: "#a7f3d0" }
  if (pct >= 50) return { text: "#f59e0b", bg: "#fef3c7", border: "#fde68a" }
  return { text: "#6b7280", bg: "#f3f4f6", border: "#e5e7eb" }
}

export default async function PrintStudentLmsReport({ params, searchParams }: Props) {
  const { pdf_secret }          = await searchParams
  const validSecret = process.env.PDF_INTERNAL_SECRET && pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
  }

  const { studentId, courseId } = await params
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })

  // Fetch student + enrollment
  const [studentRes, courseRes, enrollRes] = await Promise.all([
    db.from("lms_students").select("name, email, job_title, company").eq("id", studentId).single(),
    db.from("lms_courses").select("title, delivery_mode").eq("id", courseId).single(),
    db.from("lms_enrollments")
      .select("status, enrolled_at, completed_at")
      .eq("student_id", studentId)
      .eq("course_id", courseId)
      .single(),
  ])

  if (!studentRes.data || !courseRes.data || !enrollRes.data) notFound()

  const student    = studentRes.data as any
  const course     = courseRes.data as any
  const enrollment = enrollRes.data as any

  // Fetch modules with content and progress
  const { data: modules } = await db
    .from("lms_modules")
    .select(`
      id, title, order_index,
      lms_content_items(
        id, title, type, is_mandatory, order_index
      )
    `)
    .eq("course_id", courseId)
    .order("order_index")

  const { data: progressRows } = await db
    .from("lms_progress")
    .select("content_item_id, status, time_spent, completed_at")
    .eq("student_id", studentId)
    .eq("course_id", courseId)

  const progressMap = new Map(
    (progressRows ?? []).map((p: any) => [p.content_item_id, p])
  )

  // Fetch attendance
  const { data: sessions } = await db
    .from("lms_sessions")
    .select(`id, title, session_date, start_time`)
    .eq("course_id", courseId)
    .order("session_date")

  const { data: attendanceRows } = await db
    .from("lms_attendance")
    .select("session_id, status, scanned_at")
    .eq("student_id", studentId)

  const attendMap = new Map(
    (attendanceRows ?? []).map((a: any) => [a.session_id, a])
  )

  // Compute per-module stats
  const moduleStats = (modules ?? []).map((m: any) => {
    const items     = (m.lms_content_items ?? []).sort((a: any, b: any) => a.order_index - b.order_index)
    const mandatory = items.filter((i: any) => i.is_mandatory)
    const completedCount = mandatory.filter((i: any) => progressMap.get(i.id)?.status === "completed").length
    const pct        = mandatory.length > 0 ? Math.round((completedCount / mandatory.length) * 100) : 0
    const timeSpent  = items.reduce((s: number, i: any) => s + (progressMap.get(i.id)?.time_spent ?? 0), 0)
    return { ...m, items, mandatory, completedCount, pct, timeSpent }
  })

  const totalMandatory  = moduleStats.reduce((s, m) => s + m.mandatory.length, 0)
  const totalCompleted  = moduleStats.reduce((s, m) => s + m.completedCount, 0)
  const overallPct      = totalMandatory > 0 ? Math.round((totalCompleted / totalMandatory) * 100) : 0
  const totalTime       = moduleStats.reduce((s, m) => s + m.timeSpent, 0)

  const presentCount = (sessions ?? []).filter(s => ["present","late"].includes(attendMap.get(s.id)?.status ?? "")).length
  const attendPct    = (sessions ?? []).length > 0 ? Math.round((presentCount / (sessions ?? []).length) * 100) : null

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  const totalPages = 2 + ((sessions ?? []).length > 0 ? 1 : 0)
  const col = progressColor(overallPct)

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
            style={{ background: "radial-gradient(circle, #60a5fa, transparent)", transform: "translate(35%,-35%)" }} />
          <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full pointer-events-none opacity-10"
            style={{ background: "radial-gradient(circle, #93c5fd, transparent)", transform: "translate(-35%,35%)" }} />

          <div className="flex items-center justify-between px-12 pt-10 shrink-0">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36} className="object-contain" />
            <p className="text-white/40 text-xs">{today}</p>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-12 text-center gap-7">
            <div className="space-y-3">
              <p className="text-white/50 text-[11px] uppercase tracking-[0.4em]">LMS Progress Report</p>
              <div className="flex items-center gap-3 justify-center">
                <div className="h-px w-14 bg-white/20" />
                <div className="w-1 h-1 rounded-full bg-white/30" />
                <div className="h-px w-14 bg-white/20" />
              </div>
            </div>

            <div>
              <h1 className="text-4xl font-extrabold text-white tracking-tight">{student.name}</h1>
              {(student.job_title || student.company) && (
                <p className="text-white/50 text-sm mt-2">
                  {[student.job_title, student.company].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            {/* Progress ring */}
            <div className="relative" style={{ width: 164, height: 164 }}>
              {(() => {
                const size = 164, sw = 12, r = (size - sw) / 2
                const circ = 2 * Math.PI * r
                const offset = circ * (1 - Math.min(overallPct, 100) / 100)
                const ringCol = enrollment.status === "completed" ? "#34d399" : "#60a5fa"
                return (
                  <>
                    <svg width={size} height={size} className="-rotate-90">
                      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={sw} />
                      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={ringCol}
                        strokeWidth={sw} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-extrabold text-white leading-none">{overallPct}%</span>
                      <span className="text-xs font-bold tracking-widest uppercase mt-1" style={{ color: ringCol }}>
                        {enrollment.status === "completed" ? "● Completed" : "● In Progress"}
                      </span>
                    </div>
                  </>
                )
              })()}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-10">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{totalCompleted}<span className="text-white/40 text-sm font-normal">/{totalMandatory}</span></p>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Items Done</p>
              </div>
              {totalTime > 0 && (
                <>
                  <div className="h-10 w-px bg-white/15" />
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white">{fmtTime(totalTime)}</p>
                    <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Time Spent</p>
                  </div>
                </>
              )}
              {attendPct !== null && (
                <>
                  <div className="h-10 w-px bg-white/15" />
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white">{attendPct}%</p>
                    <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Attendance</p>
                  </div>
                </>
              )}
            </div>

            {/* Course info */}
            <div className="px-8 py-4 rounded-2xl border border-white/10 bg-white/5 space-y-1 text-center">
              <p className="text-white/80 text-sm font-semibold">{course.title}</p>
              <p className="text-white/40 text-xs capitalize">{course.delivery_mode}</p>
              <p className="text-white/30 text-[10px]">
                Enrolled {new Date(enrollment.enrolled_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                {enrollment.completed_at && ` · Completed ${new Date(enrollment.completed_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
              </p>
            </div>
          </div>

          <div className="px-12 py-6 border-t border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5 text-blue-300/60" />
              <p className="text-white/30 text-[10px]">ICS Learning Management System</p>
            </div>
            <p className="text-white/20 text-[9px]">Page 1 of {totalPages}</p>
          </div>
        </Page>

        {/* ══ PAGE 2 — PROGRESS DETAIL ══ */}
        <Page>
          <PageHeader title="Learning Progress" subtitle={course.title} today={today} />
          <div className="px-12 py-7 space-y-6">

            {/* Summary */}
            <div className="avoid-break">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Student Summary</p>
              <div className="grid grid-cols-2 gap-x-8">
                {[
                  ["Student Name",   student.name],
                  ["Email",         student.email],
                  ...(student.job_title ? [["Job Title", student.job_title]] : []),
                  ...(student.company   ? [["Company",   student.company]]   : []),
                  ["Course",        course.title],
                  ["Delivery",      course.delivery_mode],
                  ["Enrollment Status", enrollment.status],
                  ["Overall Progress", `${overallPct}%`],
                  ...(totalTime > 0 ? [["Total Time Spent", fmtTime(totalTime)]] : []),
                  ...(attendPct !== null ? [["Attendance Rate", `${attendPct}% (${presentCount}/${(sessions ?? []).length})`]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center gap-3 py-2 border-b border-slate-50">
                    <p className="text-[10px] text-slate-400 w-32 shrink-0">{label}</p>
                    <p className="text-xs font-semibold text-slate-700 capitalize">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Module progress bars */}
            <div className="avoid-break space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Progress by Module</p>
              {moduleStats.map(m => (
                <ScoreBar
                  key={m.id}
                  label={m.title}
                  score={m.pct}
                  detail={`${m.completedCount}/${m.mandatory.length} mandatory items · ${fmtTime(m.timeSpent)}`}
                />
              ))}
            </div>

            {/* Per-module content breakdown */}
            {moduleStats.map(m => (
              <div key={m.id} className="avoid-break space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-700">{m.title}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                    style={{ background: progressColor(m.pct).bg, color: progressColor(m.pct).text }}>
                    {m.pct}%
                  </span>
                </div>
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  {m.items.map((item: any, ii: number) => {
                    const prog = progressMap.get(item.id)
                    const done = prog?.status === "completed"
                    const inProg = prog?.status === "in_progress"
                    return (
                      <div key={item.id}
                        className={`flex items-center gap-3 px-4 py-2 border-b border-slate-50 last:border-0 ${ii % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                        <div className="shrink-0">
                          {done
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            : inProg
                              ? <Clock className="h-3.5 w-3.5 text-amber-400" />
                              : <XCircle  className="h-3.5 w-3.5 text-slate-300" />}
                        </div>
                        <p className="flex-1 text-xs text-slate-600">{item.title}</p>
                        <span className="text-[10px] text-slate-400 capitalize shrink-0">{item.type}</span>
                        {!item.is_mandatory && (
                          <span className="text-[9px] text-slate-300 shrink-0">optional</span>
                        )}
                        {prog?.time_spent > 0 && (
                          <span className="text-[10px] text-slate-400 shrink-0">{fmtTime(prog.time_spent)}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <PageFooter page={2} total={totalPages} />
        </Page>

        {/* ══ PAGE 3 — ATTENDANCE (if sessions exist) ══ */}
        {(sessions ?? []).length > 0 && (
          <Page>
            <PageHeader title="Session Attendance" subtitle={course.title} today={today} />
            <div className="px-12 py-7 space-y-5">

              {/* Summary chips */}
              <div className="flex gap-3 flex-wrap avoid-break">
                {[
                  { label: "Total Sessions",  val: (sessions ?? []).length,          color: "bg-slate-100 text-slate-700" },
                  { label: "Present/Late",    val: presentCount,                      color: "bg-emerald-50 text-emerald-700" },
                  { label: "Absent",          val: (sessions ?? []).length - presentCount, color: "bg-red-50 text-red-600" },
                  ...(attendPct !== null ? [{ label: "Attendance Rate", val: `${attendPct}%`,
                    color: attendPct >= 80 ? "bg-emerald-50 text-emerald-700" : attendPct >= 50 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600" }] : []),
                ].map(({ label, val, color }) => (
                  <div key={label} className={`px-3 py-1.5 rounded-lg text-center ${color}`}>
                    <p className="text-xs font-bold">{val}</p>
                    <p className="text-[9px] uppercase tracking-wide opacity-70">{label}</p>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              {attendPct !== null && (
                <ScoreBar label="Attendance Rate" score={attendPct} detail={`${presentCount} of ${(sessions ?? []).length} sessions`} />
              )}

              {/* Sessions table */}
              <div className="avoid-break">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Session Breakdown</p>
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  {(sessions ?? []).map((s: any, si: number) => {
                    const att    = attendMap.get(s.id)
                    const status = att?.status ?? "absent"
                    const present = ["present","late"].includes(status)
                    return (
                      <div key={s.id}
                        className={`flex items-center gap-4 px-4 py-2.5 border-b border-slate-50 last:border-0 ${si % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                        <div className="shrink-0">
                          {present
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            : <XCircle      className="h-3.5 w-3.5 text-slate-300" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-medium text-slate-700">{s.title}</p>
                          <p className="text-[10px] text-slate-400">
                            {new Date(s.session_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                            {s.start_time && ` · ${s.start_time.slice(0, 5)}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            status === "present" ? "bg-emerald-50 text-emerald-700" :
                            status === "late"    ? "bg-amber-50 text-amber-700" :
                            status === "excused" ? "bg-blue-50 text-blue-700" :
                            "bg-slate-100 text-slate-400"
                          }`}>
                            {status}
                          </span>
                          {att?.scanned_at && (
                            <p className="text-[9px] text-slate-300 mt-0.5">
                              {new Date(att.scanned_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Footer note */}
              <div className="avoid-break border-t border-slate-100 pt-5 flex flex-col items-center gap-2 text-center">
                <Image src="/logo/logo-dark-blue.png" alt="ICS" width={80} height={22} className="object-contain opacity-20" />
                <p className="text-[10px] text-slate-300 uppercase tracking-widest">ICS Aviation · Integrated Consulting Services</p>
                <p className="text-[10px] text-slate-300 max-w-md">
                  This report is generated from the ICS Learning Management System and is for internal use only.
                </p>
              </div>
            </div>
            <PageFooter page={totalPages} total={totalPages} />
          </Page>
        )}

      </div>
    </>
  )
}
