"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Plus, Search, BookOpen, Users, MoreHorizontal,
  Edit, Trash2, Eye, Globe, Monitor, Layers,
  CheckCircle2, FileText, Archive, Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type DeliveryMode = "online" | "onsite" | "hybrid"
type CourseStatus  = "draft" | "published" | "archived"

interface Course {
  id:                string
  title:             string
  description:       string | null
  language:          string
  delivery_mode:     DeliveryMode
  status:            CourseStatus
  start_date:        string | null
  end_date:          string | null
  capacity:          number | null
  enrollment_count:  number
  created_at:        string
}

const STATUS_STYLES: Record<CourseStatus, string> = {
  draft:     "bg-amber-100 text-amber-700",
  published: "bg-emerald-100 text-emerald-700",
  archived:  "bg-slate-100 text-slate-500",
}

const DELIVERY_ICONS: Record<DeliveryMode, React.ElementType> = {
  online:  Globe,
  onsite:  Monitor,
  hybrid:  Layers,
}

const STATUS_TABS = [
  { key: "all",       label: "All" },
  { key: "published", label: "Published" },
  { key: "draft",     label: "Drafts" },
  { key: "archived",  label: "Archived" },
]

export default function CoursesPage() {
  const router = useRouter()
  const [courses,    setCourses]    = useState<Course[]>([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState("")
  const [statusTab,  setStatusTab]  = useState("all")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res  = await fetch(`/api/lms/courses?status=${statusTab}`)
    const data = await res.json()
    setCourses(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [statusTab])

  const filtered = courses.filter(c =>
    !search || c.title.toLowerCase().includes(search.toLowerCase())
  )

  async function deleteCourse(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    setDeletingId(id)
    const res  = await fetch(`/api/lms/courses?id=${id}`, { method: "DELETE" })
    const data = await res.json()
    setDeletingId(null)
    if (!res.ok) { toast.error(data.error ?? "Failed to delete"); return }
    if (data.archived) toast.info(`"${title}" archived (students enrolled)`)
    else               toast.success(`"${title}" deleted`)
    load()
  }

  async function updateStatus(id: string, status: CourseStatus) {
    const res  = await fetch("/api/lms/courses", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id, status }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Failed to update"); return }
    toast.success(`Course ${status === "published" ? "published" : status}`)
    load()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Courses</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your LMS course catalogue</p>
        </div>
        <Link href="/lms-admin/courses/new">
          <Button className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
            <Plus className="h-4 w-4" /> New Course
          </Button>
        </Link>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusTab(tab.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              statusTab === tab.key
                ? "border-[#1B4F8A] text-[#1B4F8A]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search courses…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Course list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="h-12 w-12 text-slate-200 mb-3" />
          <p className="text-slate-500 font-medium">No courses found</p>
          <p className="text-sm text-slate-400 mt-1">
            {search ? "Try a different search term" : "Create your first course to get started"}
          </p>
          {!search && (
            <Link href="/lms-admin/courses/new" className="mt-4">
              <Button size="sm" className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
                <Plus className="h-4 w-4" /> New Course
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(course => {
            const DeliveryIcon = DELIVERY_ICONS[course.delivery_mode]
            return (
              <div key={course.id}
                className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{course.title}</h3>
                    {course.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{course.description}</p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" />}
                    >
                      {deletingId === course.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <MoreHorizontal className="h-4 w-4" />}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => router.push(`/lms-admin/courses/${course.id}`)} className="flex items-center gap-2">
                        <Eye className="h-4 w-4" /> View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push(`/lms-admin/courses/${course.id}/edit`)} className="flex items-center gap-2">
                        <Edit className="h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      {course.status === "draft" && (
                        <DropdownMenuItem onClick={() => updateStatus(course.id, "published")}
                          className="flex items-center gap-2 text-emerald-600">
                          <CheckCircle2 className="h-4 w-4" /> Publish
                        </DropdownMenuItem>
                      )}
                      {course.status === "published" && (
                        <DropdownMenuItem onClick={() => updateStatus(course.id, "draft")}
                          className="flex items-center gap-2">
                          <FileText className="h-4 w-4" /> Revert to Draft
                        </DropdownMenuItem>
                      )}
                      {course.status !== "archived" && (
                        <DropdownMenuItem onClick={() => updateStatus(course.id, "archived")}
                          className="flex items-center gap-2 text-slate-500">
                          <Archive className="h-4 w-4" /> Archive
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => deleteCourse(course.id, course.title)}
                        className="flex items-center gap-2 text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  <Badge className={cn("text-xs border-0", STATUS_STYLES[course.status])}>
                    {course.status.charAt(0).toUpperCase() + course.status.slice(1)}
                  </Badge>
                  <Badge variant="outline" className="text-xs gap-1">
                    <DeliveryIcon className="h-3 w-3" />
                    {course.delivery_mode.charAt(0).toUpperCase() + course.delivery_mode.slice(1)}
                  </Badge>
                  <Badge variant="outline" className="text-xs uppercase">
                    {course.language}
                  </Badge>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-slate-500 mt-auto pt-2 border-t border-slate-100">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {course.enrollment_count} enrolled
                    {course.capacity ? ` / ${course.capacity}` : ""}
                  </span>
                  {course.start_date && (
                    <span>
                      {new Date(course.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
