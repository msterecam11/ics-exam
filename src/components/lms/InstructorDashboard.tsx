import Link from "next/link"
import { db } from "@/lib/db"
import { Briefcase, CalendarDays, ClipboardList, ChevronRight, Users } from "lucide-react"
import type { StaffScope } from "@/lib/staff-access"
import { canSeeTrack } from "@/lib/staff-access"

// IR-3 — the instructor's Dashboard: their own programs, nothing else.
// The admin dashboard counts every student, course and enrollment in the LMS,
// which is exactly what an instructor must not see, so they get this instead.

const fmt = (d: string | null) =>
  d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—"

export default async function InstructorDashboard({ scope, name }: { scope: StaffScope; name?: string | null }) {
  const ids = scope.programIds

  if (!ids.length) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold text-slate-900">Welcome{name ? `, ${name}` : ""}</h1>
        <p className="text-slate-500 text-sm mt-1">You aren&apos;t assigned to any program yet.</p>
        <p className="text-sm text-slate-600 mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
          An administrator adds you to a program under <strong>Program Manager → Settings → Instructors</strong>.
          Once they do, its students, classes and reports appear here.
        </p>
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const [{ data: programs }, { data: members }, { data: sessions }, { data: toGrade }] = await Promise.all([
    db.from("lms_programs")
      .select("id, name, status, start_date, end_date, lms_companies(name)")
      .in("id", ids).order("start_date", { ascending: false, nullsFirst: false }),
    db.from("lms_program_members").select("program_id, student_id, status, track_id").in("program_id", ids),
    db.from("lms_sessions")
      .select("id, title, session_date, start_time, location, program_id, track_id, lms_courses(title)")
      .in("program_id", ids).gte("session_date", today).is("closed_at", null)
      .order("session_date").limit(8),
    db.from("lms_assignment_submissions")
      .select("id, student_id, submitted_at, lms_modules(title), lms_students(name)")
      .eq("status", "submitted").order("submitted_at", { ascending: false }).limit(50),
  ])

  const mine = (members ?? []).filter((m: any) => canSeeTrack(scope, m.program_id, m.track_id))
  const countFor = (pid: string) => mine.filter((m: any) => m.program_id === pid && m.status !== "withdrawn").length
  // Withdrawn members are excluded here as well as in the per-program count,
  // so the two numbers can't disagree.
  const myStudents = new Set(mine.filter((m: any) => m.status !== "withdrawn").map((m: any) => m.student_id))
  const grading = (toGrade ?? []).filter((a: any) => myStudents.has(a.student_id))
  const upcoming = (sessions ?? []).filter((s: any) => canSeeTrack(scope, s.program_id, s.track_id))

  const Stat = ({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-[#1B4F8A]/5 text-[#1B4F8A] flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-slate-900 leading-none">{value}</p>
        <p className="text-xs text-slate-500 mt-1">{label}</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome{name ? `, ${name}` : ""}</h1>
        <p className="text-slate-500 text-sm mt-1">Your programs, classes and marking.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat icon={Briefcase} label={`Program${ids.length === 1 ? "" : "s"}`} value={programs?.length ?? 0} />
        <Stat icon={Users} label="Students" value={myStudents.size} />
        <Stat icon={ClipboardList} label="Waiting to be graded" value={grading.length} />
      </div>

      <section className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">My programs</h2>
          <Link href="/lms-admin/programs" className="text-xs text-[#1B4F8A] hover:underline">Open Program Manager</Link>
        </div>
        <div className="divide-y divide-slate-100">
          {(programs ?? []).map((p: any) => (
            <Link key={p.id} href={`/lms-admin/programs/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {[p.lms_companies?.name, `${countFor(p.id)} students`, `${fmt(p.start_date)} → ${fmt(p.end_date)}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-amber-500" /> Coming up
          </h2>
          <Link href="/lms-admin/sessions" className="text-xs text-[#1B4F8A] hover:underline">All classes</Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">No classes scheduled.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {upcoming.map((s: any) => (
              <div key={s.id} className="px-5 py-3">
                <p className="text-sm font-medium text-slate-800">{s.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {[fmt(s.session_date), s.start_time?.slice(0, 5), s.lms_courses?.title, s.location].filter(Boolean).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {grading.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900 text-sm">Waiting to be graded</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {grading.slice(0, 8).map((a: any) => (
              <div key={a.id} className="px-5 py-3">
                <p className="text-sm text-slate-800">
                  <span className="font-medium">{a.lms_students?.name ?? "A student"}</span> — {a.lms_modules?.title ?? "an assignment"}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Submitted {fmt(String(a.submitted_at).slice(0, 10))}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
