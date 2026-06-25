"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Plus, Search, BookOpen, Users, Globe, Monitor, Layers,
  Loader2, Eye, Edit, Trash2, Copy, BarChart2,
  Smartphone, ChevronDown, X, Filter, ArrowUpDown,
  CheckCircle2, Archive, FileText, Send,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type DeliveryMode = "online" | "onsite" | "hybrid"
type CourseStatus  = "draft" | "published" | "archived"

interface Course {
  id:               string
  title:            string
  description:      string | null
  course_code:      string | null
  category:         string | null
  thumbnail_url:    string | null
  language:         string
  delivery_mode:    DeliveryMode
  status:           CourseStatus
  start_date:       string | null
  end_date:         string | null
  capacity:         number | null
  enrollment_count: number
  created_at:       string
  updated_at:       string | null
}

const STATUS_STYLES: Record<CourseStatus, string> = {
  draft:     "bg-amber-100 text-amber-700 border-amber-200",
  published: "bg-emerald-100 text-emerald-700 border-emerald-200",
  archived:  "bg-slate-100 text-slate-500 border-slate-200",
}
const DELIVERY_ICONS: Record<DeliveryMode, React.ElementType> = {
  online: Globe, onsite: Monitor, hybrid: Layers,
}
const STATUS_TABS = [
  { key: "all",       label: "All Courses" },
  { key: "published", label: "Published" },
  { key: "draft",     label: "Drafts" },
  { key: "archived",  label: "Archived" },
]
const DELIVERY_FILTERS = [
  { key: "",        label: "All Modes" },
  { key: "online",  label: "Online" },
  { key: "onsite",  label: "On-site" },
  { key: "hybrid",  label: "Hybrid" },
]

function fmt(dateStr: string | null) {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

// ── Confirm delete dialog ─────────────────────────────────────
function ConfirmDeleteModal({ course, onConfirm, onClose }: {
  course: Course; onConfirm: () => void; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <Trash2 className="h-5 w-5 text-red-600" />
        </div>
        <h3 className="text-center font-bold text-slate-900 text-lg">Delete Course?</h3>
        <p className="text-center text-sm text-slate-500 mt-1 mb-5">
          <span className="font-medium text-slate-700">"{course.title}"</span> will be permanently removed.
          {(course.enrollment_count ?? 0) > 0 && <span className="block mt-1 text-amber-600">This course has {course.enrollment_count} enrolled students — it will be archived instead.</span>}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={onConfirm}>
            {(course.enrollment_count ?? 0) > 0 ? "Archive" : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function CoursesPage() {
  const router = useRouter()
  const [courses,       setCourses]       = useState<Course[]>([])
  const [loading,       setLoading]       = useState(true)
  const [search,        setSearch]        = useState("")
  const [statusTab,     setStatusTab]     = useState("all")
  const [deliveryFilter,setDeliveryFilter]= useState("")
  const [deletingId,    setDeletingId]    = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Course | null>(null)
  const [duplicating,   setDuplicating]   = useState<string | null>(null)
  const [sortBy,        setSortBy]        = useState<"title" | "updated_at" | "enrollment_count">("updated_at")
  const [sortDir,       setSortDir]       = useState<"asc" | "desc">("desc")

  async function load() {
    setLoading(true)
    const res  = await fetch(`/api/lms/courses?status=${statusTab}`)
    const data = await res.json()
    setCourses(Array.isArray(data) ? data : [])
    setLoading(false)
  }
  useEffect(() => { load() }, [statusTab])

  // Filter + sort
  const filtered = courses
    .filter(c => {
      if (search && !c.title.toLowerCase().includes(search.toLowerCase()) &&
          !(c.course_code?.toLowerCase().includes(search.toLowerCase())) &&
          !(c.category?.toLowerCase().includes(search.toLowerCase()))) return false
      if (deliveryFilter && c.delivery_mode !== deliveryFilter) return false
      return true
    })
    .sort((a, b) => {
      let av: any = a[sortBy] ?? ""; let bv: any = b[sortBy] ?? ""
      if (typeof av === "string") av = av.toLowerCase()
      if (typeof bv === "string") bv = bv.toLowerCase()
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
    })

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortBy(col); setSortDir("asc") }
  }

  // Actions
  async function doDelete(course: Course) {
    setDeletingId(course.id); setConfirmDelete(null)
    const res  = await fetch(`/api/lms/courses?id=${course.id}`, { method: "DELETE" })
    const data = await res.json(); setDeletingId(null)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    if (data.archived) toast.info(`"${course.title}" archived (students enrolled)`)
    else               toast.success(`"${course.title}" deleted`)
    load()
  }

  async function duplicate(course: Course) {
    setDuplicating(course.id)
    const res = await fetch("/api/lms/courses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:                `Copy of ${course.title}`,
        description:          course.description,
        course_code:          course.course_code ? `${course.course_code}-COPY` : null,
        category:             course.category,
        thumbnail_url:        course.thumbnail_url,
        language:             course.language,
        delivery_mode:        course.delivery_mode,
        progress_enforcement: false,
        certificate_enabled:  false,
      }),
    })
    const data = await res.json(); setDuplicating(null)
    if (!res.ok) { toast.error(data.error ?? "Failed to duplicate"); return }
    toast.success(`"${course.title}" duplicated`)
    load()
  }

  async function toggleStatus(course: Course) {
    const newStatus = course.status === "published" ? "draft" : "published"
    const res = await fetch("/api/lms/courses", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: course.id, status: newStatus }),
    })
    if (!res.ok) { toast.error("Failed"); return }
    toast.success(newStatus === "published" ? "Course published" : "Reverted to draft")
    load()
  }

  // Counts for tab badges
  const counts = {
    all:       courses.length,
    published: courses.filter(c => c.status === "published").length,
    draft:     courses.filter(c => c.status === "draft").length,
    archived:  courses.filter(c => c.status === "archived").length,
  }

  return (
    <div className="space-y-5">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Courses</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your LMS course catalogue</p>
        </div>
        <Link href="/lms-admin/courses/new" className="shrink-0">
          <Button className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
            <Plus className="h-4 w-4" /> New Course
          </Button>
        </Link>
      </div>

      {/* ── Status tabs ──────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-slate-200 overflow-x-auto scrollbar-none">
        {STATUS_TABS.map(tab => (
          <button key={tab.key} onClick={() => setStatusTab(tab.key)}
            className={cn("px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0",
              statusTab === tab.key
                ? "border-[#1B4F8A] text-[#1B4F8A]"
                : "border-transparent text-slate-500 hover:text-slate-700")}>
            {tab.label}
            <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-semibold",
              statusTab === tab.key ? "bg-[#1B4F8A]/10 text-[#1B4F8A]" : "bg-slate-100 text-slate-500")}>
              {counts[tab.key as keyof typeof counts] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input placeholder="Search by title, code, or path…" value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9 h-9 w-full" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
        </div>
        {/* Delivery filter + count */}
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {DELIVERY_FILTERS.map(f => (
              <button key={f.key} onClick={() => setDeliveryFilter(f.key)}
                className={cn("px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0",
                  deliveryFilter === f.key
                    ? "bg-[#1B4F8A] text-white border-[#1B4F8A]"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300")}>
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 ml-auto shrink-0">{filtered.length} course{filtered.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 py-20 text-center">
          <BookOpen className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="font-medium text-slate-500">
            {search || deliveryFilter ? "No courses match your filters" : "No courses yet"}
          </p>
          {!search && !deliveryFilter && (
            <Link href="/lms-admin/courses/new" className="mt-4 inline-block">
              <Button size="sm" className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
                <Plus className="h-4 w-4" /> Create First Course
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Scrollable table area — scrolls horizontally on mobile */}
          <div className="overflow-x-auto">
          {/* Table header */}
          <div className="grid grid-cols-[36px_1fr_110px_140px_85px_75px_100px_210px] min-w-[820px] border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider gap-x-2">
            <span className="text-center">#</span>
            <button className="flex items-center gap-1 text-left hover:text-slate-800 transition-colors" onClick={() => toggleSort("title")}>
              Course <ArrowUpDown className="h-3 w-3 opacity-50" />
            </button>
            <span>Code</span>
            <span>Path</span>
            <span>Mode</span>
            <button className="flex items-center gap-1 text-left hover:text-slate-800 transition-colors" onClick={() => toggleSort("enrollment_count")}>
              <Users className="h-3 w-3" /> <ArrowUpDown className="h-3 w-3 opacity-50" />
            </button>
            <button className="flex items-center gap-1 text-left hover:text-slate-800 transition-colors" onClick={() => toggleSort("updated_at")}>
              Updated <ArrowUpDown className="h-3 w-3 opacity-50" />
            </button>
            <span>Actions</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-slate-50">
            {filtered.map((course, idx) => {
              const DeliveryIcon = DELIVERY_ICONS[course.delivery_mode] ?? Globe
              const isDeleting   = deletingId  === course.id
              const isDuplicating = duplicating === course.id

              return (
                <div key={course.id}
                  className="grid grid-cols-[36px_1fr_110px_140px_85px_75px_100px_210px] min-w-[820px] items-center px-4 py-3 hover:bg-slate-50/60 transition-colors gap-x-2">

                  {/* # */}
                  <span className="text-xs text-slate-400 font-medium text-center">{idx + 1}</span>

                  {/* Course */}
                  <div className="flex items-center gap-3 min-w-0">
                    {course.thumbnail_url ? (
                      <img src={course.thumbnail_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 border border-slate-200" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#1B4F8A]/20 to-[#1B4F8A]/5 flex items-center justify-center shrink-0">
                        <BookOpen className="h-4 w-4 text-[#1B4F8A]/60" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/lms-admin/courses/${course.id}`}
                          className="font-semibold text-slate-900 text-sm hover:text-[#1B4F8A] transition-colors truncate block max-w-[220px]">
                          {course.title}
                        </Link>
                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0", STATUS_STYLES[course.status])}>
                          {course.status}
                        </span>
                      </div>
                      {course.description && (
                        <p className="text-xs text-slate-400 truncate max-w-[220px] mt-0.5">{course.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Code */}
                  <div>
                    {course.course_code
                      ? <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 truncate block max-w-full">{course.course_code}</span>
                      : <span className="text-slate-300 text-xs">—</span>}
                  </div>

                  {/* Path / Category */}
                  <div>
                    {course.category
                      ? <span className="text-xs text-slate-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full truncate block max-w-full">{course.category}</span>
                      : <span className="text-slate-300 text-xs">—</span>}
                  </div>

                  {/* Delivery Mode */}
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <DeliveryIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="capitalize truncate">{course.delivery_mode}</span>
                  </div>

                  {/* Students */}
                  <div className="flex items-center gap-1 text-xs text-slate-600">
                    <span className="font-medium">{course.enrollment_count}</span>
                    {course.capacity && <span className="text-slate-400">/{course.capacity}</span>}
                  </div>

                  {/* Last Update */}
                  <div className="text-xs text-slate-400">
                    {fmt(course.updated_at ?? course.created_at)}
                  </div>

                  {/* Actions — always visible, 6 icons × 34px = 204px fits in 210px */}
                  <div className="flex items-center gap-0.5">
                    {/* Edit / Open builder */}
                    <Link href={`/lms-admin/courses/${course.id}`} title="Edit course">
                      <span className="flex p-1.5 rounded-lg text-slate-400 hover:text-[#1B4F8A] hover:bg-[#1B4F8A]/8 transition-colors">
                        <Edit className="h-4 w-4" />
                      </span>
                    </Link>

                    {/* Preview — student portal in new tab */}
                    <a href={`/lms/courses/${course.id}`} target="_blank" rel="noreferrer" title="Preview as student">
                      <span className="flex p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors">
                        <Smartphone className="h-4 w-4" />
                      </span>
                    </a>

                    {/* Report */}
                    <Link href={`/lms-admin/reports?course_id=${course.id}`} title="Course report">
                      <span className="flex p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                        <BarChart2 className="h-4 w-4" />
                      </span>
                    </Link>

                    {/* Publish / Unpublish */}
                    {course.status !== "archived" && (
                      <button
                        title={course.status === "published" ? "Unpublish" : "Publish"}
                        onClick={() => toggleStatus(course)}
                        className={cn("p-1.5 rounded-lg transition-colors",
                          course.status === "published"
                            ? "text-emerald-500 hover:text-amber-600 hover:bg-amber-50"
                            : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50")}>
                        {course.status === "published"
                          ? <CheckCircle2 className="h-4 w-4" />
                          : <Send className="h-4 w-4" />}
                      </button>
                    )}

                    {/* Duplicate */}
                    <button title="Duplicate" onClick={() => duplicate(course)} disabled={!!isDuplicating}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-40">
                      {isDuplicating
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Copy className="h-4 w-4" />}
                    </button>

                    {/* Delete */}
                    <button title="Delete" onClick={() => setConfirmDelete(course)} disabled={isDeleting}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                      {isDeleting
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          </div>{/* end overflow-x-auto */}
          {/* Footer */}
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Showing <span className="font-medium text-slate-600">{filtered.length}</span> of{" "}
              <span className="font-medium text-slate-600">{courses.length}</span> courses
            </p>
            <Link href="/lms-admin/courses/new">
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Course
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Modal ──────────────────────────────── */}
      {confirmDelete && (
        <ConfirmDeleteModal
          course={confirmDelete}
          onConfirm={() => doDelete(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
