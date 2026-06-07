import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import {
  BookOpen, CheckCircle2, ChevronRight,
  Calendar, GraduationCap, Bell,
  Globe, Monitor, Layers, PlayCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import LmsLogoutButton from "@/components/lms/LmsLogoutButton"

// ── Types ─────────────────────────────────────────────────────
interface Enrollment {
  id:        string
  status:    string
  progress:  number
  course: {
    id:            string
    title:         string
    description:   string | null
    delivery_mode: string
    thumbnail_url: string | null
    end_date:      string | null
  }
}

const DELIVERY_ICONS: Record<string, React.ElementType> = {
  online: Globe,
  onsite: Monitor,
  hybrid: Layers,
}

function ProgressRing({ pct }: { pct: number }) {
  const r  = 20
  const c  = 2 * Math.PI * r
  const dash = (pct / 100) * c
  return (
    <svg width="52" height="52" className="shrink-0 -rotate-90">
      <circle cx="26" cy="26" r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
      <circle
        cx="26" cy="26" r={r}
        fill="none"
        stroke={pct >= 100 ? "#22c55e" : "#1B4F8A"}
        strokeWidth="4"
        strokeDasharray={`${dash} ${c}`}
        strokeLinecap="round"
      />
      <text
        x="26" y="26"
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90"
        style={{ rotate: "90deg", transformOrigin: "26px 26px", fontSize: 11, fill: "#334155", fontWeight: 600 }}
      >
        {pct}%
      </text>
    </svg>
  )
}

// ── Page (Server Component) ──────────────────────────────────
export default async function StudentDashboard() {
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  // Fetch active enrollments
  const { data: enrollments } = await db
    .from("lms_enrollments")
    .select(`
      id, status,
      lms_courses(id, title, description, delivery_mode, thumbnail_url, end_date)
    `)
    .eq("student_id", student.id)
    .in("status", ["active", "completed"])
    .order("enrolled_at", { ascending: false })

  // Fetch per-course progress %
  const courseIds = (enrollments ?? []).map((e: any) => e.lms_courses?.id).filter(Boolean)
  let progressMap: Record<string, number> = {}
  if (courseIds.length) {
    const { data: progRows } = await db
      .from("lms_progress")
      .select("course_id, status")
      .eq("student_id", student.id)
      .in("course_id", courseIds)

    const totals:     Record<string, number> = {}
    const completed:  Record<string, number> = {}
    for (const row of progRows ?? []) {
      totals[row.course_id]    = (totals[row.course_id]    ?? 0) + 1
      if (row.status === "completed")
        completed[row.course_id] = (completed[row.course_id] ?? 0) + 1
    }
    for (const id of courseIds) {
      progressMap[id] = totals[id]
        ? Math.round((completed[id] ?? 0) / totals[id] * 100)
        : 0
    }
  }

  const enriched: Enrollment[] = (enrollments ?? []).map((e: any) => ({
    id:       e.id,
    status:   e.status,
    progress: progressMap[e.lms_courses?.id] ?? 0,
    course:   e.lms_courses ?? {},
  }))

  const active    = enriched.filter(e => e.status === "active")
  const completed = enriched.filter(e => e.status === "completed")

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Top Nav ─────────────────────────────────────────── */}
      <header className="bg-[#1B4F8A] text-white sticky top-0 z-30 shadow">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Image src="/logo/logo-white.png" alt="ICS Aviation" width={110} height={30} className="object-contain" />
          <div className="flex items-center gap-3">
            <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <Bell className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 border-l border-white/20 pl-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
                {student.name[0]?.toUpperCase()}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium leading-tight">{student.name}</p>
                <p className="text-xs text-white/60 leading-tight">{student.email}</p>
              </div>
            </div>
            <LmsLogoutButton />
          </div>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-10">

        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back, {student.name.split(" ")[0]} 👋
          </h1>
          <p className="text-slate-500 mt-1">
            {active.length > 0
              ? `You have ${active.length} active course${active.length !== 1 ? "s" : ""}.`
              : "You have no active courses at the moment."}
          </p>
        </div>

        {/* ── Active Courses ─────────────────────────────────── */}
        {active.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-[#1B4F8A]" /> My Courses
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {active.map(e => {
                const DeliveryIcon = DELIVERY_ICONS[e.course.delivery_mode] ?? Globe
                const isNearDeadline = e.course.end_date &&
                  new Date(e.course.end_date) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

                return (
                  <Link
                    key={e.id}
                    href={`/lms/courses/${e.course.id}`}
                    className="bg-white rounded-2xl border border-slate-200 p-5 flex gap-4 hover:shadow-md transition-shadow group"
                  >
                    {/* Thumbnail or placeholder */}
                    <div className="w-16 h-16 rounded-xl bg-[#1B4F8A]/10 flex items-center justify-center shrink-0 overflow-hidden">
                      {e.course.thumbnail_url
                        ? <Image src={e.course.thumbnail_url} alt="" width={64} height={64} className="object-cover w-full h-full" />
                        : <BookOpen className="h-7 w-7 text-[#1B4F8A]/60" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-slate-900 leading-snug line-clamp-2 group-hover:text-[#1B4F8A] transition-colors">
                          {e.course.title}
                        </h3>
                        <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                      </div>

                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="outline" className="text-xs gap-1 py-0">
                          <DeliveryIcon className="h-3 w-3" />
                          {e.course.delivery_mode}
                        </Badge>
                        {isNearDeadline && (
                          <Badge className="text-xs bg-amber-100 text-amber-700 border-0 gap-1 py-0">
                            <Calendar className="h-3 w-3" />
                            Due {new Date(e.course.end_date!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </Badge>
                        )}
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                          <span>Progress</span>
                          <span className="font-medium">{e.progress}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#1B4F8A] rounded-full transition-all"
                            style={{ width: `${e.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Completed Courses ──────────────────────────────── */}
        {completed.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" /> Completed
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {completed.map(e => (
                <Link
                  key={e.id}
                  href={`/lms/courses/${e.course.id}`}
                  className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-4 hover:shadow-sm transition-shadow"
                >
                  <CheckCircle2 className="h-8 w-8 text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{e.course.title}</p>
                    <p className="text-xs text-emerald-600">Completed</p>
                  </div>
                  <GraduationCap className="h-5 w-5 text-slate-300" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Empty state ────────────────────────────────────── */}
        {enrollments?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-2xl bg-[#1B4F8A]/10 flex items-center justify-center mb-4">
              <PlayCircle className="h-10 w-10 text-[#1B4F8A]/40" />
            </div>
            <h2 className="text-lg font-semibold text-slate-700">No courses yet</h2>
            <p className="text-slate-400 text-sm mt-1 max-w-xs">
              Your instructor will enroll you in a course. Check back soon!
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

