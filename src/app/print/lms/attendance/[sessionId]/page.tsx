import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Image from "next/image"
import { Users, Clock, MapPin, CalendarDays } from "lucide-react"

interface Props {
  params: Promise<{ sessionId: string }>
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

const STATUS_COLORS: Record<string, string> = {
  present: "bg-emerald-50 text-emerald-700",
  late:    "bg-amber-50 text-amber-700",
  absent:  "bg-red-50 text-red-600",
  excused: "bg-blue-50 text-blue-600",
}

const ROWS_PER_PAGE = 35

export default async function PrintAttendanceReport({ params, searchParams }: Props) {
  const { pdf_secret } = await searchParams
  const validSecret = process.env.PDF_INTERNAL_SECRET && pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
  }

  const { sessionId } = await params
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })

  const sessionRes = await db.from("lms_sessions")
    .select(`
      id, title, session_date, start_time, end_time, location, is_open,
      late_threshold_minutes, duration_minutes,
      lms_courses(title)
    `)
    .eq("id", sessionId)
    .single()

  if (!sessionRes.data) notFound()
  const sess = sessionRes.data as any

  const attendanceRes = await db.from("lms_attendance")
    .select("id, status, checked_in_at, scan_method, lms_students(name, email, company)")
    .eq("session_id", sessionId)
    .order("checked_in_at", { ascending: true })

  const attendance = (attendanceRes.data ?? []) as any[]

  // Count by status
  const counts = { present: 0, late: 0, absent: 0, excused: 0 }
  for (const a of attendance) {
    const s = a.status as keyof typeof counts
    if (s in counts) counts[s]++
  }
  const total    = attendance.length
  const attended = counts.present + counts.late
  const attRate  = total > 0 ? Math.round((attended / total) * 100) : 0

  const sessionDateFmt = new Date(sess.session_date).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })

  // Paginate rows
  const pages: (typeof attendance)[] = []
  for (let i = 0; i < attendance.length; i += ROWS_PER_PAGE) {
    pages.push(attendance.slice(i, i + ROWS_PER_PAGE))
  }
  if (pages.length === 0) pages.push([])

  const totalPages = 1 + pages.length

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
              <p className="text-white/50 text-[11px] uppercase tracking-[0.4em]">Attendance Sheet</p>
              <div className="flex items-center gap-3 justify-center">
                <div className="h-px w-14 bg-white/20" />
                <div className="w-1 h-1 rounded-full bg-white/30" />
                <div className="h-px w-14 bg-white/20" />
              </div>
            </div>

            <div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight leading-tight max-w-lg">{sess.title}</h1>
              {sess.lms_courses?.title && (
                <p className="text-white/50 text-sm mt-2">{sess.lms_courses.title}</p>
              )}
            </div>

            {/* Session info chips */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full">
                <CalendarDays className="h-3.5 w-3.5 text-emerald-300/70" />
                <span className="text-white/70 text-xs">{sessionDateFmt}</span>
              </div>
              {sess.start_time && (
                <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full">
                  <Clock className="h-3.5 w-3.5 text-emerald-300/70" />
                  <span className="text-white/70 text-xs">{sess.start_time}{sess.end_time ? ` – ${sess.end_time}` : ""}</span>
                </div>
              )}
              {sess.location && (
                <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full">
                  <MapPin className="h-3.5 w-3.5 text-emerald-300/70" />
                  <span className="text-white/70 text-xs">{sess.location}</span>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-10">
              <div className="text-center">
                <p className="text-3xl font-bold text-white">{total}</p>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Total</p>
              </div>
              <div className="h-10 w-px bg-white/15" />
              <div className="text-center">
                <p className="text-3xl font-bold text-emerald-300">{counts.present}</p>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Present</p>
              </div>
              <div className="h-10 w-px bg-white/15" />
              <div className="text-center">
                <p className="text-3xl font-bold text-amber-300">{counts.late}</p>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Late</p>
              </div>
              <div className="h-10 w-px bg-white/15" />
              <div className="text-center">
                <p className="text-3xl font-bold text-red-300">{counts.absent}</p>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Absent</p>
              </div>
              <div className="h-10 w-px bg-white/15" />
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-200">{attRate}%</p>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Rate</p>
              </div>
            </div>
          </div>

          <div className="px-12 py-6 border-t border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-emerald-300/60" />
              <p className="text-white/30 text-[10px]">ICS Learning Management System</p>
            </div>
            <p className="text-white/20 text-[9px]">Page 1 of {totalPages}</p>
          </div>
        </Page>

        {/* ══ ATTENDANCE TABLE PAGES ══ */}
        {pages.map((rows, pi) => (
          <Page key={pi}>
            <PageHeader
              title={pi === 0 ? "Attendance Register" : "Attendance Register (cont.)"}
              subtitle={`${sess.title} · ${sessionDateFmt}`}
              today={today}
            />
            <div className="px-12 py-7 space-y-5">

              {pi === 0 && (
                <div className="avoid-break grid grid-cols-5 gap-3 mb-6">
                  {[
                    { label: "Total",   value: total,          color: "text-slate-700" },
                    { label: "Present", value: counts.present, color: "text-emerald-600" },
                    { label: "Late",    value: counts.late,    color: "text-amber-600" },
                    { label: "Absent",  value: counts.absent,  color: "text-red-500" },
                    { label: "Att. Rate", value: `${attRate}%`, color: attRate >= 75 ? "text-emerald-600" : "text-amber-600" },
                  ].map(s => (
                    <div key={s.label} className="border border-slate-100 rounded-xl p-3 text-center">
                      <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="avoid-break">
                {pi === 0 && <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Student Attendance</p>}
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <span className="w-6 shrink-0">#</span>
                    <span className="flex-1">Student</span>
                    <span className="w-20 text-center">Status</span>
                    <span className="w-28 text-center">Check-in Time</span>
                    <span className="w-16 text-center">Method</span>
                  </div>

                  {rows.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-slate-400">No attendance records</div>
                  ) : rows.map((a, ri) => (
                    <div key={a.id}
                      className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-0 ${ri % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                      <span className="w-6 text-[10px] text-slate-300 shrink-0">{pi * ROWS_PER_PAGE + ri + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{a.lms_students?.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{a.lms_students?.email}</p>
                      </div>
                      <div className="w-20 text-center">
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${STATUS_COLORS[a.status] ?? "bg-slate-100 text-slate-400"}`}>
                          {a.status}
                        </span>
                      </div>
                      <div className="w-28 text-center">
                        {a.checked_in_at ? (
                          <span className="text-[10px] text-slate-600">
                            {new Date(a.checked_in_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-300">—</span>
                        )}
                      </div>
                      <div className="w-16 text-center">
                        <span className="text-[9px] text-slate-400 capitalize">{a.scan_method ?? "—"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {pi === pages.length - 1 && (
                <div className="avoid-break border-t border-slate-100 pt-5 flex flex-col items-center gap-2 text-center">
                  <Image src="/logo/logo-dark-blue.png" alt="ICS" width={80} height={22} className="object-contain opacity-20" />
                  <p className="text-[10px] text-slate-300 uppercase tracking-widest">ICS Aviation · Integrated Consulting Services</p>
                  <p className="text-[10px] text-slate-300 max-w-md">
                    This attendance sheet is generated from the ICS Learning Management System and is for internal use only.
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
