import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Clock, MapPin, Video, CheckCircle2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export default async function SchedulePage() {
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  const { data: enrollments } = await db
    .from("lms_enrollments")
    .select("course_id")
    .eq("student_id", student.id)
    .in("status", ["active", "completed"])

  const courseIds = (enrollments ?? []).map((e: any) => e.course_id).filter(Boolean)

  const today = new Date().toISOString().slice(0, 10)

  // Upcoming sessions
  const { data: upcoming } = courseIds.length
    ? await db
        .from("lms_sessions")
        .select("id, title, session_date, start_time, duration_minutes, location, meeting_link, course_id, lms_courses(title)")
        .in("course_id", courseIds)
        .gte("session_date", today)
        .is("closed_at", null)
        .order("session_date", { ascending: true })
        .order("start_time", { ascending: true })
    : { data: [] }

  // Past sessions
  const { data: past } = courseIds.length
    ? await db
        .from("lms_sessions")
        .select("id, title, session_date, start_time, duration_minutes, location, course_id, lms_courses(title), closed_at")
        .in("course_id", courseIds)
        .lt("session_date", today)
        .not("closed_at", "is", null)
        .order("session_date", { ascending: false })
        .limit(20)
    : { data: [] }

  function fmtDate(d: string) {
    const dt = new Date(d)
    return {
      day:     dt.toLocaleString("en", { weekday: "short" }),
      date:    dt.getDate(),
      month:   dt.toLocaleString("en", { month: "short" }),
      full:    dt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    }
  }

  // Group upcoming by date
  const byDate = new Map<string, any[]>()
  for (const s of (upcoming ?? []) as any[]) {
    const key = s.session_date
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(s)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">

      {/* Upcoming */}
      <div>
        <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide mb-4">Upcoming Sessions</h2>

        {byDate.size === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center py-16 text-slate-400">
            <Clock className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">No upcoming sessions</p>
          </div>
        ) : (
          <div className="space-y-4">
            {[...byDate.entries()].map(([dateStr, sessions]) => {
              const f = fmtDate(dateStr)
              return (
                <div key={dateStr} className="flex gap-4">
                  {/* Date label */}
                  <div className="flex-shrink-0 w-16 text-center">
                    <p className="text-[10px] text-slate-400 uppercase">{f.day}</p>
                    <div className="bg-[#1B4F8A] text-white rounded-xl w-12 mx-auto mt-1 py-1.5">
                      <p className="text-xl font-bold leading-none">{f.date}</p>
                      <p className="text-[10px] opacity-70 mt-0.5">{f.month}</p>
                    </div>
                  </div>

                  {/* Session cards */}
                  <div className="flex-1 space-y-2">
                    {(sessions ?? []).map((s: any) => (
                      <div
                        key={s.id}
                        className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-start gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-900">{s.title}</p>
                          <p className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {s.start_time?.slice(0, 5)}
                              {s.duration_minutes ? ` · ${s.duration_minutes} min` : ""}
                            </span>
                            {s.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {s.location}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {(s.lms_courses as any)?.title}
                          </p>
                        </div>
                        {s.meeting_link && (
                          <a
                            href={s.meeting_link}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1B4F8A] hover:bg-[#163f6e] px-3 py-2 rounded-lg transition-colors"
                          >
                            <Video className="h-3.5 w-3.5" /> Join
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Past sessions */}
      {(past ?? []).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide mb-4">Past Sessions</h2>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {(past ?? []).map((s: any) => {
              const f = fmtDate(s.session_date)
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex flex-col items-center justify-center flex-shrink-0">
                    <p className="text-sm font-bold text-slate-700 leading-none">{f.date}</p>
                    <p className="text-[9px] text-slate-400 uppercase mt-0.5">{f.month}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{s.title}</p>
                    <p className="text-xs text-slate-400">
                      {(s.lms_courses as any)?.title}
                      {s.start_time ? ` · ${s.start_time.slice(0, 5)}` : ""}
                    </p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
