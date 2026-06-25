"use client"

import Link from "next/link"
import Image from "next/image"
import { useState, useMemo } from "react"
import {
  BookOpen, CheckCircle2, Lock, ArrowRight, Search,
  Users, GitBranch, Route, Clock, Plane, Trophy,
  Layers, Timer, CalendarClock, ArrowUpDown, SortAsc,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ──────────────────────────────────────────────────────
interface EnrollmentRow {
  id: string
  status: "active" | "completed"
  enrolled_at: string
  completed_at: string | null
  course: {
    id: string; title: string; delivery_mode: string
    thumbnail_url: string | null; start_date: string | null; end_date: string | null
  }
  progress:      number
  lastAccessed:  string | null
  nextContentId: string | null
  moduleCount:   number
  totalMinutes:  number
  remainMinutes: number
}

interface LPCourse {
  id: string; title: string; delivery_mode: string
  start_date: string | null; end_date: string | null
  progress: number; order_index: number
}

interface LearningPath {
  id: string; title: string; description: string | null
  start_date: string | null; end_date: string | null
  courses: LPCourse[]
}

interface CohortCourse {
  id: string; title: string; delivery_mode: string
  start_date: string | null; end_date: string | null
  progress: number; order_index: number
}

interface Track {
  id: string; name: string; courses: CohortCourse[]
}

interface CohortRow {
  memberId: string
  cohort: {
    id: string; name: string; mode: "unified" | "specialization"
    start_date: string | null; end_date: string | null
    courses: CohortCourse[]
  }
  trackId: string | null
  track: Track | null
  allTracks: { id: string; name: string }[]
}

interface Props {
  enrollments:   EnrollmentRow[]
  learningPaths: LearningPath[]
  cohorts:       CohortRow[]
  defaultTab?:   "courses" | "paths" | "cohorts"
}

// ── Helpers ────────────────────────────────────────────────────
function fmtDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function relativeAccessed(iso: string | null): string | null {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return "Studied today"
  if (days === 1) return "Studied yesterday"
  if (days < 7)  return `Studied ${days} days ago`
  if (days < 30) return `Studied ${Math.floor(days / 7)}w ago`
  return `Studied ${Math.floor(days / 30)}mo ago`
}

function fmtMins(mins: number) {
  if (!mins) return null
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

// ── Aviation thumbnail placeholder ────────────────────────────
const GRADIENTS = [
  "from-[#1B4F8A] to-[#2563EB]",
  "from-slate-700 to-slate-500",
  "from-sky-700 to-sky-500",
  "from-indigo-700 to-indigo-500",
  "from-[#1B4F8A] to-slate-600",
]

function CourseThumbnail({
  url, title, size = "md", showRibbon = false,
}: {
  url: string | null; title: string; size?: "sm" | "md"; showRibbon?: boolean
}) {
  const idx = title.charCodeAt(0) % GRADIENTS.length
  const h   = size === "sm" ? "h-24" : "h-36"

  return (
    <div className={cn("w-full overflow-hidden flex-shrink-0 relative", h)}>
      {url ? (
        <Image src={url} alt={title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
      ) : (
        <div className={cn("w-full h-full flex items-center justify-center bg-gradient-to-br", GRADIENTS[idx])}>
          <Plane className="h-10 w-10 text-white/30 -rotate-45" />
        </div>
      )}
      {/* Certificate ribbon */}
      {showRibbon && (
        <div className="absolute inset-0 flex items-end justify-end p-2 bg-gradient-to-t from-black/40 to-transparent">
          <div className="flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm">
            <Trophy className="h-3 w-3" />
            Completed
          </div>
        </div>
      )}
    </div>
  )
}

// ── Course card ────────────────────────────────────────────────
function CourseCard({ enrollment }: { enrollment: EnrollmentRow }) {
  const { course, progress, status, lastAccessed, nextContentId, moduleCount, totalMinutes, remainMinutes } = enrollment
  const done       = status === "completed"
  const now        = Date.now()
  const notStarted = course.start_date ? new Date(course.start_date).getTime() > now : false
  const ended      = !done && course.end_date ? new Date(course.end_date).getTime() < now : false
  const daysLeft   = !done && !notStarted && course.end_date
    ? Math.ceil((new Date(course.end_date).getTime() - now) / 86_400_000)
    : null
  const urgent     = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7

  const ctaHref  = nextContentId
    ? `/lms/content/${nextContentId}`
    : `/lms/courses/${course.id}`
  const ctaLabel = done ? "Review" : progress > 0 ? "Continue" : "Start"

  const startLabel = course.start_date
    ? new Date(course.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : ""

  const accessedLabel = relativeAccessed(lastAccessed)
  const totalLabel    = fmtMins(totalMinutes)
  const remainLabel   = !done && remainMinutes > 0 ? fmtMins(remainMinutes) : null

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col group">
      <Link href={`/lms/courses/${course.id}`}>
        <CourseThumbnail url={course.thumbnail_url} title={course.title} showRibbon={done} />
      </Link>

      <div className="p-4 flex flex-col flex-1">
        {/* Badges row */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
            {course.delivery_mode}
          </span>
          {notStarted && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              Starts {startLabel}
            </span>
          )}
          {urgent && !notStarted && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              {daysLeft === 0 ? "Due today" : `${daysLeft}d left`}
            </span>
          )}
        </div>

        {/* Title */}
        <Link href={`/lms/courses/${course.id}`}>
          <p className="text-sm font-semibold text-slate-900 line-clamp-2 group-hover:text-[#1B4F8A] transition-colors">
            {course.title}
          </p>
        </Link>

        {/* Module count + time chips */}
        {(moduleCount > 0 || totalLabel) && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {moduleCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                <Layers className="h-3 w-3 text-slate-400" />
                {moduleCount} module{moduleCount !== 1 ? "s" : ""}
              </span>
            )}
            {totalLabel && (
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                <Clock className="h-3 w-3 text-slate-400" />
                {totalLabel} total
              </span>
            )}
            {remainLabel && (
              <span className="flex items-center gap-1 text-[11px] text-blue-600 font-medium">
                <Timer className="h-3 w-3" />
                ~{remainLabel} left
              </span>
            )}
          </div>
        )}

        {/* Last accessed */}
        {accessedLabel && (
          <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
            <CalendarClock className="h-3 w-3 flex-shrink-0" />
            {accessedLabel}
          </p>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Progress */}
        <div className="mt-3">
          {done ? (
            <div className="h-1.5 bg-emerald-100 rounded-full">
              <div className="h-full bg-emerald-500 rounded-full w-full" />
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Progress</span>
                <span className="font-semibold text-[#1B4F8A]">{progress}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#1B4F8A] rounded-full" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Continue / Start / Review / Locked button */}
        {notStarted ? (
          <div className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 cursor-not-allowed select-none">
            🔒 Opens {startLabel}
          </div>
        ) : ended ? (
          <div className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-400 cursor-not-allowed select-none">
            Course ended
          </div>
        ) : (
          <Link
            href={ctaHref}
            className={cn(
              "mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors",
              done
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : progress > 0
                  ? "bg-[#1B4F8A] text-white hover:bg-[#163f6d]"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
          >
            {ctaLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Sort key type ──────────────────────────────────────────────
type SortKey = "deadline" | "progress" | "az"

// ── Courses Tab ────────────────────────────────────────────────
function CoursesTab({ enrollments }: { enrollments: EnrollmentRow[] }) {
  const [query,  setQuery]  = useState("")
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all")
  const [sort,   setSort]   = useState<SortKey>("deadline")

  const filtered = useMemo(() => {
    let list = enrollments.filter(e => {
      const matchQ = !query || e.course.title.toLowerCase().includes(query.toLowerCase())
      const matchF = filter === "all" || e.status === filter
      return matchQ && matchF
    })

    if (sort === "az") {
      list = [...list].sort((a, b) => a.course.title.localeCompare(b.course.title))
    } else if (sort === "progress") {
      list = [...list].sort((a, b) => b.progress - a.progress)
    } else {
      // deadline: null end_dates pushed to bottom
      list = [...list].sort((a, b) => {
        const da = a.course.end_date ? new Date(a.course.end_date).getTime() : Infinity
        const db = b.course.end_date ? new Date(b.course.end_date).getTime() : Infinity
        return da - db
      })
    }
    return list
  }, [enrollments, query, filter, sort])

  const active    = enrollments.filter(e => e.status === "active").length
  const completed = enrollments.filter(e => e.status === "completed").length

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "deadline", label: "Deadline" },
    { key: "progress", label: "Progress" },
    { key: "az",       label: "A → Z"   },
  ]

  return (
    <div className="space-y-4">
      {/* Search + filter + sort bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search courses…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 focus:border-[#1B4F8A] transition-all"
          />
        </div>

        {/* Filter */}
        <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden text-xs font-medium">
          {[
            { key: "all",       label: `All (${enrollments.length})`  },
            { key: "active",    label: `Active (${active})`           },
            { key: "completed", label: `Done (${completed})`          },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key as any)}
              className={cn(
                "px-3 py-2 transition-colors",
                filter === f.key
                  ? "bg-[#1B4F8A] text-white"
                  : "text-slate-500 hover:bg-slate-50"
              )}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white overflow-hidden text-xs font-medium px-1">
          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 ml-1.5" />
          {sortOptions.map(s => (
            <button key={s.key} onClick={() => setSort(s.key)}
              className={cn(
                "px-2.5 py-2 transition-colors rounded-md",
                sort === s.key
                  ? "text-[#1B4F8A] font-semibold"
                  : "text-slate-500 hover:bg-slate-50"
              )}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 flex flex-col items-center text-slate-400 gap-2">
          <BookOpen className="h-8 w-8 opacity-20" />
          <p className="text-sm">{query ? "No courses match your search" : "No courses yet"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(e => <CourseCard key={e.id} enrollment={e} />)}
        </div>
      )}
    </div>
  )
}

// ── Learning Paths Tab ─────────────────────────────────────────
function PathsTab({ paths }: { paths: LearningPath[] }) {
  if (paths.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 py-16 flex flex-col items-center text-slate-400 gap-2">
        <Route className="h-8 w-8 opacity-20" />
        <p className="text-sm">No learning paths assigned</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {paths.map(lp => {
        const done        = lp.courses.filter(c => c.progress === 100).length
        const overallPct  = lp.courses.length
          ? Math.round(lp.courses.reduce((a, c) => a + c.progress, 0) / lp.courses.length)
          : 0
        const now         = Date.now()
        const pathLocked  = !!lp.start_date && new Date(lp.start_date).getTime() > now
        const pathStartLbl = lp.start_date
          ? new Date(lp.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
          : ""

        return (
          <div key={lp.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Path header */}
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Route className="h-4 w-4 text-[#1B4F8A]" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{lp.title}</p>
                    {lp.description && <p className="text-xs text-slate-500 mt-0.5">{lp.description}</p>}
                    {pathLocked && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1 font-medium">
                        🔒 Opens {pathStartLbl}
                      </p>
                    )}
                    {!pathLocked && (lp.start_date || lp.end_date) && (
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {fmtDate(lp.start_date) ?? "—"} → {fmtDate(lp.end_date) ?? "—"}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-xl font-bold text-[#1B4F8A]">{overallPct}%</span>
                  <p className="text-[10px] text-slate-400">{done}/{lp.courses.length} done</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#1B4F8A] rounded-full" style={{ width: `${overallPct}%` }} />
              </div>
            </div>

            {/* Step list */}
            <div className="divide-y divide-slate-50">
              {lp.courses.map((c, idx) => {
                const prevDone    = idx === 0 || lp.courses[idx - 1].progress === 100
                const courseNotStarted = !!c.start_date && new Date(c.start_date).getTime() > Date.now()
                const locked      = pathLocked || courseNotStarted || (!prevDone && c.progress === 0)
                return (
                  <div key={c.id}
                    className={cn("flex items-center gap-3 px-5 py-3", locked && "opacity-40")}>
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 border-2",
                      c.progress === 100
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : c.progress > 0
                          ? "bg-[#1B4F8A] border-[#1B4F8A] text-white"
                          : locked
                            ? "border-slate-200 text-slate-300"
                            : "border-[#1B4F8A] text-[#1B4F8A]"
                    )}>
                      {c.progress === 100
                        ? <CheckCircle2 className="h-3.5 w-3.5" />
                        : locked ? <Lock className="h-3 w-3" /> : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{c.title}</p>
                      {c.progress > 0 && c.progress < 100 && (
                        <div className="mt-1 max-w-[140px] h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#1B4F8A] rounded-full" style={{ width: `${c.progress}%` }} />
                        </div>
                      )}
                    </div>
                    {!locked && (
                      <Link href={`/lms/courses/${c.id}`}
                        className="flex-shrink-0 text-xs font-medium text-[#1B4F8A] hover:underline flex items-center gap-1">
                        {c.progress === 100 ? "Review" : c.progress > 0 ? "Continue" : "Start"}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Cohorts Tab ────────────────────────────────────────────────
function CohortsTab({ cohorts }: { cohorts: CohortRow[] }) {
  if (cohorts.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 py-16 flex flex-col items-center text-slate-400 gap-2">
        <Users className="h-8 w-8 opacity-20" />
        <p className="text-sm">No cohorts assigned</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {cohorts.map(row => {
        const { cohort } = row
        const now            = Date.now()
        const cohortLocked   = !!cohort.start_date && new Date(cohort.start_date).getTime() > now
        const cohortStartLbl = cohort.start_date
          ? new Date(cohort.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
          : ""
        return (
          <div key={row.memberId} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Cohort header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3">
              <div className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                cohort.mode === "unified" ? "bg-blue-50" : "bg-purple-50"
              )}>
                {cohort.mode === "unified"
                  ? <Users className="h-4 w-4 text-[#1B4F8A]" />
                  : <GitBranch className="h-4 w-4 text-purple-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-slate-900 text-sm">{cohort.name}</p>
                  <span className={cn(
                    "text-[10px] font-medium px-2 py-0.5 rounded-full",
                    cohort.mode === "unified" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                  )}>
                    {cohort.mode === "unified" ? "Unified" : "Specialization"}
                  </span>
                </div>
                {cohortLocked && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1 font-medium">
                    🔒 Opens {cohortStartLbl}
                  </p>
                )}
                {!cohortLocked && (cohort.start_date || cohort.end_date) && (
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {fmtDate(cohort.start_date) ?? "—"} → {fmtDate(cohort.end_date) ?? "—"}
                  </p>
                )}
              </div>
            </div>

            {/* Unified courses */}
            {cohort.mode === "unified" && (
              <div className="divide-y divide-slate-50">
                {cohort.courses.length === 0
                  ? <p className="text-sm text-slate-400 text-center py-6">No courses assigned yet</p>
                  : cohort.courses.map((c, idx) => {
                    const courseLocked = cohortLocked || (!!c.start_date && new Date(c.start_date).getTime() > Date.now())
                    return (
                      <div key={c.id} className={cn("flex items-center gap-3 px-5 py-3", courseLocked && "opacity-40")}>
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 border-2",
                          c.progress === 100
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : c.progress > 0
                              ? "bg-[#1B4F8A] border-[#1B4F8A] text-white"
                              : courseLocked
                                ? "border-slate-200 text-slate-300"
                                : "border-slate-200 text-slate-400"
                        )}>
                          {c.progress === 100 ? <CheckCircle2 className="h-3.5 w-3.5" /> : courseLocked ? <Lock className="h-3 w-3" /> : idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{c.title}</p>
                          {c.progress > 0 && c.progress < 100 && (
                            <div className="mt-1 max-w-[120px] h-1 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-[#1B4F8A] rounded-full" style={{ width: `${c.progress}%` }} />
                            </div>
                          )}
                        </div>
                        {!courseLocked && (
                          <Link href={`/lms/courses/${c.id}`}
                            className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1 flex-shrink-0">
                            {c.progress === 100 ? "Review" : c.progress > 0 ? "Continue" : "Start"}
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    )
                  })}
              </div>
            )}

            {/* Specialization: student's track */}
            {cohort.mode === "specialization" && (
              <div className="p-4 space-y-3">
                {row.track ? (
                  <>
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your track</span>
                        <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">{row.track.name}</span>
                      </div>
                      <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                        {row.track.courses.map((c, idx) => {
                          const tCourseLocked = cohortLocked || (!!c.start_date && new Date(c.start_date).getTime() > Date.now())
                          return (
                            <div key={c.id} className={cn("flex items-center gap-3 px-4 py-2.5", tCourseLocked && "opacity-40")}>
                              <div className={cn(
                                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 border-2",
                                c.progress === 100
                                  ? "bg-emerald-500 border-emerald-500 text-white"
                                  : c.progress > 0
                                    ? "bg-[#1B4F8A] border-[#1B4F8A] text-white"
                                    : tCourseLocked
                                      ? "border-slate-200 text-slate-300"
                                      : "border-slate-200 text-slate-400"
                              )}>
                                {c.progress === 100 ? <CheckCircle2 className="h-3 w-3" /> : tCourseLocked ? <Lock className="h-3 w-3" /> : idx + 1}
                              </div>
                              <p className="text-sm font-medium text-slate-800 truncate flex-1">{c.title}</p>
                              {!tCourseLocked && (
                                <Link href={`/lms/courses/${c.id}`}
                                  className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1 flex-shrink-0">
                                  {c.progress === 100 ? "Review" : c.progress > 0 ? "Continue" : "Start"}
                                  <ArrowRight className="h-3 w-3" />
                                </Link>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    {row.allTracks.filter(t => t.id !== row.trackId).length > 0 && (
                      <div className="opacity-40">
                        <p className="text-xs font-medium text-slate-500 mb-2">Other tracks</p>
                        <div className="space-y-1.5">
                          {row.allTracks.filter(t => t.id !== row.trackId).map(t => (
                            <div key={t.id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-4 py-2.5">
                              <GitBranch className="h-4 w-4 text-slate-400 flex-shrink-0" />
                              <span className="text-sm text-slate-600">{t.name}</span>
                              <span className="ml-auto text-xs text-slate-400">Not enrolled</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-4">No track assigned yet</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────
export default function CoursesTabs({ enrollments, learningPaths, cohorts, defaultTab }: Props) {
  const [tab, setTab] = useState<"courses" | "paths" | "cohorts">(defaultTab ?? "courses")

  const tabs = [
    { key: "courses" as const, label: "My Courses",     count: enrollments.length   },
    { key: "paths"   as const, label: "Learning Paths", count: learningPaths.length },
    { key: "cohorts" as const, label: "Cohorts",        count: cohorts.length       },
  ]

  return (
    <div className="p-6 space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto scrollbar-none">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 px-2.5 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all whitespace-nowrap shrink-0",
              tab === t.key
                ? "border-[#1B4F8A] text-[#1B4F8A]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}>
            {t.label}
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
              tab === t.key ? "bg-[#1B4F8A]/10 text-[#1B4F8A]" : "bg-slate-100 text-slate-500"
            )}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {tab === "courses" && <CoursesTab enrollments={enrollments} />}
      {tab === "paths"   && <PathsTab paths={learningPaths} />}
      {tab === "cohorts" && <CohortsTab cohorts={cohorts} />}
    </div>
  )
}
