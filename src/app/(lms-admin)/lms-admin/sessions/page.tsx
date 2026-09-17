"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Calendar, Clock, MapPin, Users, Radio,
  ChevronRight, Loader2, MoreHorizontal, Search, X,
  BookOpen, Info,
} from "lucide-react"
import { Button }  from "@/components/ui/button"
import { Badge }   from "@/components/ui/badge"
import { Input }   from "@/components/ui/input"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface Session {
  id:               string
  title:            string
  session_date:     string
  start_time:       string
  duration_minutes: number
  location:         string | null
  closed_at:        string | null
  is_open:          boolean
  attendance_count: number
  course_id:        string
  course_title:     string | null
  program_id:       string | null
  program_name:     string | null
  track_name:       string | null
}

interface Course  { id: string; title: string }
interface Program { id: string; name: string; status: string }

export default function SessionsPage() {
  const [sessions,     setSessions]     = useState<Session[]>([])
  const [courses,      setCourses]      = useState<Course[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState("")
  const [courseFilter, setCourseFilter] = useState("")
  const [programs,      setPrograms]      = useState<Program[]>([])
  const [programFilter, setProgramFilter] = useState("")
  const [toggling,     setToggling]     = useState<string | null>(null)

  async function loadSessions() {
    setLoading(true)
    const qs = new URLSearchParams()
    if (courseFilter)  qs.set("course_id", courseFilter)
    if (programFilter) qs.set("program_id", programFilter)
    const res = await fetch(`/api/lms/sessions${qs.toString() ? `?${qs}` : ""}`)
    if (res.ok) {
      const data = await res.json()
      setSessions(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }

  async function loadCourses() {
    const res = await fetch("/api/lms/courses")
    if (res.ok) {
      const d = await res.json()
      // /api/lms/courses returns an array (this read d.courses, so the filter was always empty)
      setCourses(Array.isArray(d) ? d : [])
    }
    const pr = await fetch("/api/lms/programs")
    if (pr.ok) { const d = await pr.json(); setPrograms(Array.isArray(d) ? d : []) }
  }

  useEffect(() => {
    loadCourses()
  }, [])

  useEffect(() => {
    loadSessions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseFilter, programFilter])

  async function toggleSession(id: string, isOpen: boolean) {
    setToggling(id)
    const res = await fetch("/api/lms/sessions", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id, action: isOpen ? "close" : "open" }),
    })
    const data = await res.json()
    setToggling(null)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success(isOpen ? "Session closed" : "Session reopened")
    loadSessions()
  }

  async function deleteSession(id: string, title: string) {
    if (!confirm(`Delete "${title}"?`)) return
    const res  = await fetch(`/api/lms/sessions?id=${id}`, { method: "DELETE" })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success("Session deleted")
    loadSessions()
  }

  const filtered = sessions.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    (s.location ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (s.course_title ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (s.program_name ?? "").toLowerCase().includes(search.toLowerCase())
  )

  const openCount   = sessions.filter(s => s.is_open).length
  const closedCount = sessions.length - openCount

  // Group by date for schedule view
  const grouped: Record<string, Session[]> = {}
  for (const s of filtered) {
    const key = s.session_date
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(s)
  }
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Live Sessions</h1>
          <p className="text-sm text-slate-500 mt-1">
            {sessions.length} sessions · {openCount} open · {closedCount} closed
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
        <span>
          Sessions are scheduled per program: open <Link href="/lms-admin/programs" className="font-semibold underline">Program Manager</Link> → a program → <strong>Sessions</strong>. Each program&apos;s students only see (and are marked for) their own sessions.
        </span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search sessions…"
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 bg-white min-w-44"
          value={courseFilter}
          onChange={e => setCourseFilter(e.target.value)}
        >
          <option value="">All courses</option>
          {courses.map(c => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        <select
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 bg-white min-w-44"
          value={programFilter}
          onChange={e => setProgramFilter(e.target.value)}
        >
          <option value="">All programs</option>
          {programs.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Sessions */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <Calendar className="h-12 w-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">No sessions found</p>
          <p className="text-sm text-slate-400 mt-1">
            Schedule sessions from a program in Program Manager
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedDates.map(date => (
            <div key={date}>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                {new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric",
                })}
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {grouped[date].map(s => (
                  <div
                    key={s.id}
                    className="bg-white rounded-xl border border-slate-200 hover:border-[#1B4F8A]/30 hover:shadow-sm transition-all"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={cn("text-xs border-0", s.is_open
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                            )}>
                              {s.is_open ? "Open" : "Closed"}
                            </Badge>
                          </div>
                          <h3 className="font-semibold text-slate-900 truncate">{s.title}</h3>
                          <div className="mt-2 space-y-1">
                            {s.program_name && (
                              <p className="text-xs text-slate-600 flex items-center gap-1.5 font-medium">
                                <Users className="h-3.5 w-3.5" /> {s.program_name}{s.track_name ? ` · ${s.track_name}` : ""}
                              </p>
                            )}
                            {s.course_title && (
                              <p className="text-xs text-[#1B4F8A] flex items-center gap-1.5 font-medium">
                                <BookOpen className="h-3.5 w-3.5" /> {s.course_title}
                              </p>
                            )}
                            <p className="text-xs text-slate-500 flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5" />
                              {s.start_time?.slice(0, 5)} · {s.duration_minutes} min
                            </p>
                            {s.location && (
                              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5" /> {s.location}
                              </p>
                            )}
                            <p className="text-xs text-slate-500 flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5" /> {s.attendance_count} attended
                            </p>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" />}>
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => toggleSession(s.id, s.is_open)} className="gap-2">
                              {toggling === s.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Radio className="h-4 w-4" />}
                              {s.is_open ? "Close session" : "Reopen session"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => deleteSession(s.id, s.title)}
                              className="gap-2 text-red-600 focus:text-red-600"
                            >
                              <X className="h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-slate-400">Attendance board</span>
                      <Link href={`/lms-admin/sessions/${s.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-[#1B4F8A]">
                          View <ChevronRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
