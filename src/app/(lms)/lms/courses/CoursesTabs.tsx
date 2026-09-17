"use client"

import Link from "next/link"
import Image from "next/image"
import { useState, useMemo } from "react"
import {
  BookOpen, ArrowRight, Search, Clock, Plane, Trophy, Lock,
  Layers, Timer, CalendarClock, ArrowUpDown, FolderKanban, AlertTriangle, Eye,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ──────────────────────────────────────────────────────
export interface CourseRow {
  id: string
  status: "active" | "completed"
  course: { id: string; title: string; delivery_mode: string; thumbnail_url: string | null }
  /** The program this course is taken in (not shown for individual enrollments). */
  program: { id: string; name: string } | null
  startDate: string | null
  endDate: string | null
  daysLeft: number | null
  deadline: "red" | "amber" | null
  extended: boolean
  /** Program ended → review only. */
  readOnly: boolean
  accessNote: string | null
  /** Program not open yet / earlier course unfinished. */
  lockReason: string | null
  progress: number
  lastAccessed: string | null
  nextContentId: string | null
  moduleCount: number
  totalMinutes: number
  remainMinutes: number
}

// ── Helpers ────────────────────────────────────────────────────
function fmtDay(d: string | null) {
  if (!d) return null
  return new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
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

// ── Thumbnail placeholder ──────────────────────────────────────
const GRADIENTS = [
  "from-[#1B4F8A] to-[#2563EB]",
  "from-slate-700 to-slate-500",
  "from-sky-700 to-sky-500",
  "from-indigo-700 to-indigo-500",
  "from-[#1B4F8A] to-slate-600",
]

function CourseThumbnail({ url, title, showRibbon = false }: { url: string | null; title: string; showRibbon?: boolean }) {
  const idx = title.charCodeAt(0) % GRADIENTS.length
  return (
    <div className="w-full overflow-hidden flex-shrink-0 relative h-32">
      {url ? (
        <Image src={url} alt={title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
      ) : (
        <div className={cn("w-full h-full flex items-center justify-center bg-gradient-to-br", GRADIENTS[idx])}>
          <Plane className="h-10 w-10 text-white/30 -rotate-45" />
        </div>
      )}
      {showRibbon && (
        <div className="absolute inset-0 flex items-end justify-end p-2 bg-gradient-to-t from-black/40 to-transparent">
          <div className="flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm">
            <Trophy className="h-3 w-3" /> Completed
          </div>
        </div>
      )}
    </div>
  )
}

// ── Course card ────────────────────────────────────────────────
function CourseCard({ row }: { row: CourseRow }) {
  const { course, progress, status, lastAccessed, nextContentId, moduleCount, totalMinutes, remainMinutes } = row
  const done   = status === "completed"
  const locked = !done && !!row.lockReason

  // Resume the exact item when there is one; otherwise the course page.
  // (This linked to /lms/content/<id>, a page that doesn't exist.)
  const ctaHref  = !done && !row.readOnly && nextContentId
    ? `/lms/courses/${course.id}/content/${nextContentId}`
    : `/lms/courses/${course.id}`
  const ctaLabel = done || row.readOnly ? "Review" : progress > 0 ? "Continue" : "Start"

  const accessedLabel = relativeAccessed(lastAccessed)
  const totalLabel    = fmtMins(totalMinutes)
  const remainLabel   = !done && remainMinutes > 0 ? fmtMins(remainMinutes) : null

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col group">
      <Link href={`/lms/courses/${course.id}`}>
        <CourseThumbnail url={course.thumbnail_url} title={course.title} showRibbon={done} />
      </Link>

      <div className="p-4 flex flex-col flex-1">
        {/* Badges */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {row.program && (
            <Link href={`/lms/programs/${row.program.id}`}
              className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] hover:bg-[#1B4F8A]/15 flex items-center gap-1 max-w-full">
              <FolderKanban className="h-3 w-3 shrink-0" /><span className="truncate">{row.program.name}</span>
            </Link>
          )}
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
            {course.delivery_mode}
          </span>
          {row.deadline && row.daysLeft !== null && !done && (
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1",
              row.deadline === "red" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>
              <AlertTriangle className="h-3 w-3" />
              {row.daysLeft === 0 ? "Ends today" : `${row.daysLeft}d left`}{row.extended ? " · extended" : ""}
            </span>
          )}
          {row.readOnly && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 flex items-center gap-1">
              <Eye className="h-3 w-3" /> Review only
            </span>
          )}
        </div>

        <Link href={`/lms/courses/${course.id}`}>
          <p className="text-sm font-semibold text-slate-900 line-clamp-2 group-hover:text-[#1B4F8A] transition-colors">
            {course.title}
          </p>
        </Link>

        {(row.startDate || row.endDate) && (
          <p className="text-[11px] text-slate-400 mt-1">
            {fmtDay(row.startDate) ?? "—"} → {fmtDay(row.endDate) ?? "—"}
          </p>
        )}

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
                <Clock className="h-3 w-3 text-slate-400" /> {totalLabel} total
              </span>
            )}
            {remainLabel && !locked && (
              <span className="flex items-center gap-1 text-[11px] text-blue-600 font-medium">
                <Timer className="h-3 w-3" /> ~{remainLabel} left
              </span>
            )}
          </div>
        )}

        {accessedLabel && (
          <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
            <CalendarClock className="h-3 w-3 flex-shrink-0" /> {accessedLabel}
          </p>
        )}

        <div className="flex-1" />

        <div className="mt-3">
          {done ? (
            <div className="h-1.5 bg-emerald-100 rounded-full"><div className="h-full bg-emerald-500 rounded-full w-full" /></div>
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

        {locked ? (
          <div className="mt-3 w-full flex items-start justify-center gap-1.5 py-2 px-2 rounded-lg text-[11px] font-medium bg-amber-50 text-amber-700 text-center">
            <Lock className="h-3.5 w-3.5 shrink-0 mt-px" /> <span>{row.lockReason}</span>
          </div>
        ) : (
          <Link
            href={ctaHref}
            className={cn(
              "mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors",
              done || row.readOnly
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : progress > 0
                  ? "bg-[#1B4F8A] text-white hover:bg-[#163f6d]"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
          >
            {ctaLabel} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  )
}

type TabKey  = "in_progress" | "completed" | "all"
type SortKey = "deadline" | "progress" | "az"

// ── Main ───────────────────────────────────────────────────────
export default function CoursesTabs({ courses }: { courses: CourseRow[] }) {
  const inProgressCount = courses.filter(c => c.status === "active").length
  const completedCount  = courses.filter(c => c.status === "completed").length

  const [tab,   setTab]   = useState<TabKey>(inProgressCount === 0 && completedCount > 0 ? "completed" : "in_progress")
  const [query, setQuery] = useState("")
  const [sort,  setSort]  = useState<SortKey>("deadline")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = courses.filter(c =>
      (tab === "all" || (tab === "in_progress" ? c.status === "active" : c.status === "completed"))
      && (!q || c.course.title.toLowerCase().includes(q) || (c.program?.name ?? "").toLowerCase().includes(q)))

    if (sort === "az") list = [...list].sort((a, b) => a.course.title.localeCompare(b.course.title))
    else if (sort === "progress") list = [...list].sort((a, b) => b.progress - a.progress)
    else list = [...list].sort((a, b) => {
      // Soonest end first; open courses before locked ones; no date last.
      const la = a.lockReason ? 1 : 0, lb = b.lockReason ? 1 : 0
      return la - lb || (a.endDate ?? "9999").localeCompare(b.endDate ?? "9999") || a.course.title.localeCompare(b.course.title)
    })
    return list
  }, [courses, tab, query, sort])

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "in_progress", label: "In progress", count: inProgressCount },
    { key: "completed",   label: "Completed",   count: completedCount },
    { key: "all",         label: "All",         count: courses.length },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto scrollbar-none">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all whitespace-nowrap shrink-0",
              tab === t.key ? "border-[#1B4F8A] text-[#1B4F8A]" : "border-transparent text-slate-500 hover:text-slate-700"
            )}>
            {t.label}
            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
              tab === t.key ? "bg-[#1B4F8A]/10 text-[#1B4F8A]" : "bg-slate-100 text-slate-500")}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative w-full sm:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search courses or programs…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 focus:border-[#1B4F8A] transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white overflow-x-auto text-xs font-medium px-1 shrink-0 self-start sm:self-auto">
          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 ml-1.5 shrink-0" />
          {([["deadline", "Deadline"], ["progress", "Progress"], ["az", "A → Z"]] as [SortKey, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setSort(k)}
              className={cn("px-2.5 py-2 transition-colors rounded-md whitespace-nowrap",
                sort === k ? "text-[#1B4F8A] font-semibold" : "text-slate-500 hover:bg-slate-50")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 flex flex-col items-center text-slate-400 gap-2 text-center px-4">
          <BookOpen className="h-8 w-8 opacity-20" />
          <p className="text-sm">
            {query ? "No courses match your search"
              : tab === "completed" ? "No completed courses yet"
              : tab === "in_progress" ? "No courses in progress"
              : "No courses yet"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(c => <CourseCard key={c.id} row={c} />)}
        </div>
      )}
    </div>
  )
}
