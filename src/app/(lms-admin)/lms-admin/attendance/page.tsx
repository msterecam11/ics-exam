import Link from "next/link"
import { redirect } from "next/navigation"
import { CalendarDays, MapPin, Clock, ChevronRight, ClipboardCheck, Video, Users } from "lucide-react"
import { db } from "@/lib/db"
import { cn } from "@/lib/utils"
import { pageScope, canTakeAttendance } from "@/lib/staff-access"
import { sessionToday, sessionEndTime } from "@/lib/lms-sessions"
import { groupLabel, SEAT_STATUSES } from "@/lib/lms-groups"

export const dynamic = "force-dynamic"

// Attendance — the days someone takes attendance for: today first, then what's
// coming, then the last two weeks (anything not taken yet stands out).
// A facilitator sees their groups' days only; an instructor also their
// programs' sessions; an admin everything.

const DAY = 86_400_000
const shift = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10)
const fmtDay = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })

export default async function AttendancePage() {
  const scope = await pageScope()
  if (!scope) redirect("/auth/login")

  const today = sessionToday()
  const from = shift(today, -14), to = shift(today, 30)
  const cols = "id, title, session_date, start_time, duration_minutes, location, meeting_link, closed_at, course_id, program_id, track_id, group_id, lms_courses(title), lms_programs(name), session_group:lms_course_groups(id, name, start_date, end_date, city, status)"

  let rows: any[] = []
  if (scope.isAdmin) {
    const { data } = await db.from("lms_sessions").select(cols).gte("session_date", from).lte("session_date", to).order("session_date").order("start_time")
    rows = data ?? []
  } else {
    const parts = await Promise.all([
      scope.groupIds.length
        ? db.from("lms_sessions").select(cols).in("group_id", scope.groupIds).gte("session_date", from).lte("session_date", to)
        : Promise.resolve({ data: [] as any[] }),
      scope.role !== "facilitator" && scope.programIds.length
        ? db.from("lms_sessions").select(cols).in("program_id", scope.programIds).gte("session_date", from).lte("session_date", to)
        : Promise.resolve({ data: [] as any[] }),
    ])
    const seen = new Set<string>()
    rows = [...(parts[0].data ?? []), ...(parts[1].data ?? [])].filter((s: any) => !seen.has(s.id) && seen.add(s.id) && canTakeAttendance(scope, s))
      .sort((a: any, b: any) => (a.session_date + a.start_time).localeCompare(b.session_date + b.start_time))
  }
  // A cancelled group's days are gone from the calendar.
  rows = rows.filter(s => s.session_group?.status !== "cancelled")

  const ids = rows.map(s => s.id)
  const groupIds = [...new Set(rows.map(s => s.group_id).filter(Boolean))] as string[]
  const [{ data: att }, { data: seats }] = await Promise.all([
    ids.length ? db.from("lms_attendance").select("session_id").in("session_id", ids) : Promise.resolve({ data: [] as any[] }),
    groupIds.length ? db.from("lms_enrollments").select("group_id").in("group_id", groupIds).in("status", SEAT_STATUSES) : Promise.resolve({ data: [] as any[] }),
  ])
  const marked = new Map<string, number>()
  for (const a of (att ?? []) as any[]) marked.set(a.session_id, (marked.get(a.session_id) ?? 0) + 1)
  const people = new Map<string, number>()
  for (const e of (seats ?? []) as any[]) people.set(e.group_id, (people.get(e.group_id) ?? 0) + 1)

  const sections = [
    { key: "today", title: "Today", items: rows.filter(s => s.session_date === today) },
    { key: "next", title: "Coming up", items: rows.filter(s => s.session_date > today) },
    { key: "past", title: "Last two weeks", items: rows.filter(s => s.session_date < today).reverse() },
  ]

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-[#1B4F8A]" /> Attendance</h1>
        <p className="text-sm text-slate-500 mt-1">Open a day to check people in and out, and mark late, absent or excused.</p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl py-16 text-center">
          <CalendarDays className="h-9 w-9 text-slate-300 mx-auto" />
          <p className="font-semibold text-slate-600 mt-3">Nothing scheduled</p>
          <p className="text-sm text-slate-400 mt-1">Days of the groups you&apos;re assigned to appear here.</p>
        </div>
      ) : sections.filter(s => s.items.length).map(sec => (
        <section key={sec.key} className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{sec.title}</h2>
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {sec.items.map((s: any) => {
              const m = marked.get(s.id) ?? 0
              const expected = s.group_id ? people.get(s.group_id) ?? 0 : null
              const due = s.session_date <= today && m === 0
              return (
                <Link key={s.id} href={`/lms-admin/sessions/${s.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 group">
                  <div className="w-24 shrink-0">
                    <p className={cn("text-sm font-semibold", s.session_date === today ? "text-[#1B4F8A]" : "text-slate-800")}>{fmtDay(s.session_date)}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1"><Clock className="h-3 w-3" />{String(s.start_time).slice(0, 5)}–{sessionEndTime(s.start_time, s.duration_minutes)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{s.lms_courses?.title ?? s.title}</p>
                    <p className="text-xs text-slate-500 truncate flex items-center gap-1.5">
                      {s.session_group ? groupLabel(s.session_group) : s.lms_programs?.name ?? "Session"}
                      {s.meeting_link ? <><span>·</span><Video className="h-3 w-3" /> Online</> : s.location ? <><span>·</span><MapPin className="h-3 w-3" />{s.location}</> : null}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {due ? <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded-full">Not taken</span>
                      : <p className="text-xs text-slate-500 flex items-center gap-1 justify-end"><Users className="h-3 w-3" />{m}{expected !== null ? ` / ${expected}` : ""} marked</p>}
                    {s.closed_at && <p className="text-[10px] text-slate-400 mt-0.5">Closed</p>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#1B4F8A] shrink-0" />
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
