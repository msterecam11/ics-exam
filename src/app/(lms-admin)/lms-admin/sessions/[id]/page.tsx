"use client"

import { use, useEffect, useRef, useState, useCallback } from "react"
import Link from "next/link"
import {
  ArrowLeft, Radio, Users, CheckCircle2, Clock, AlertTriangle,
  RefreshCw, Loader2, Search, Download, UserCheck, Eye,
} from "lucide-react"
import { Button }  from "@/components/ui/button"
import { Badge }   from "@/components/ui/badge"
import { Input }   from "@/components/ui/input"
import { toast }   from "sonner"
import { cn }      from "@/lib/utils"

type AttendStatus = "present" | "late" | "absent" | "excused"

interface Student {
  id:              string
  name:            string
  email:           string
  company:         string | null
  qr_code:         string
  status:          AttendStatus
  scanned_at:      string | null
  manual_override: boolean
}

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
}

const STATUS_CONFIG: Record<AttendStatus, { label: string; bg: string; text: string }> = {
  present: { label: "Present",  bg: "bg-emerald-100", text: "text-emerald-700" },
  late:    { label: "Late",     bg: "bg-amber-100",   text: "text-amber-700"   },
  absent:  { label: "Absent",   bg: "bg-slate-100",   text: "text-slate-500"   },
  excused: { label: "Excused",  bg: "bg-blue-100",    text: "text-blue-700"    },
}

export default function SessionAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params)
  const [session,   setSession]   = useState<Session | null>(null)
  const [students,  setStudents]  = useState<Student[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState("")
  const [filter,    setFilter]    = useState<AttendStatus | "all">("all")
  const [updating,  setUpdating]  = useState<string | null>(null)
  const [toggling,    setToggling]    = useState(false)
  const [downloading, setDownloading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadAttendance = useCallback(async () => {
    const res = await fetch(`/api/lms/attendance?session_id=${sessionId}`)
    if (res.ok) {
      const data = await res.json()
      setStudents(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }, [sessionId])

  async function loadSession() {
    // We'll derive session info from the first students call by also calling sessions API
    const res = await fetch(`/api/lms/sessions?course_id=placeholder`)
    // Alternatively, we get it from attendance response — just derive manually
  }

  // Poll every 5 seconds while session is open
  useEffect(() => {
    loadAttendance()
    intervalRef.current = setInterval(loadAttendance, 5000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [loadAttendance])

  async function markStatus(student: Student, status: AttendStatus) {
    setUpdating(student.id)
    const res = await fetch("/api/lms/attendance", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        session_id:      sessionId,
        student_id:      student.id,
        status,
        manual_override: true,
      }),
    })
    const data = await res.json()
    setUpdating(null)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success(`${student.name} marked ${status}`)
    loadAttendance()
  }

  // Derive session-level data from URL by fetching sessions for the course
  const presentCount = students.filter(s => s.status === "present").length
  const lateCount    = students.filter(s => s.status === "late").length
  const absentCount  = students.filter(s => s.status === "absent").length
  const total        = students.length
  const attendedPct  = total ? Math.round(((presentCount + lateCount) / total) * 100) : 0

  const filtered = students.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === "all" || s.status === filter
    return matchSearch && matchFilter
  })

  async function downloadPDF() {
    setDownloading(true)
    toast.info("Generating attendance PDF…")
    try {
      const res = await fetch(`/api/lms/reports/attendance/${sessionId}/pdf`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? "PDF generation failed")
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      const cd   = res.headers.get("Content-Disposition") ?? ""
      const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i)
      a.download  = match ? decodeURIComponent(match[1]) : `attendance-${sessionId}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("PDF downloaded")
    } catch {
      toast.error("Failed to download PDF")
    } finally {
      setDownloading(false)
    }
  }

  function exportCSV() {
    const header  = "Name,Email,Company,Status,Checked In At,Manual Override"
    const rows    = students.map(s =>
      `"${s.name}","${s.email}","${s.company ?? ""}","${s.status}","${s.scanned_at ?? ""}","${s.manual_override}"`
    )
    const csv     = [header, ...rows].join("\n")
    const blob    = new Blob([csv], { type: "text/csv" })
    const url     = URL.createObjectURL(blob)
    const a       = document.createElement("a")
    a.href        = url
    a.download    = `attendance-${sessionId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/lms-admin/sessions">
          <Button variant="ghost" size="icon" className="rounded-full shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900">Attendance Board</h1>
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              <Radio className="h-3 w-3 animate-pulse" /> Live
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">Auto-refreshes every 5 seconds</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setLoading(true); loadAttendance() }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Link href={`/print/lms/attendance/${sessionId}`} target="_blank">
            <Button variant="outline" size="sm" className="gap-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50">
              <Eye className="h-4 w-4" /> View Report
            </Button>
          </Link>
          <Button
            size="sm"
            onClick={downloadPDF}
            disabled={downloading}
            className="gap-2 bg-[#1B4F8A] hover:bg-[#163f6f] text-white"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? "Generating…" : "PDF Report"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total",    value: total,        color: "text-slate-700", icon: Users },
          { label: "Present",  value: presentCount, color: "text-emerald-600", icon: CheckCircle2 },
          { label: "Late",     value: lateCount,    color: "text-amber-600",   icon: Clock },
          { label: "Absent",   value: absentCount,  color: "text-slate-400",   icon: AlertTriangle },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-500">{s.label}</p>
              <s.icon className={cn("h-4 w-4", s.color)} />
            </div>
            <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
            {s.label === "Present" && (
              <p className="text-xs text-slate-400 mt-0.5">{attendedPct}% attendance</p>
            )}
          </div>
        ))}
      </div>

      {/* Attendance bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-slate-700">Attendance Rate</p>
          <p className="text-sm font-bold text-slate-900">{attendedPct}%</p>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#1B4F8A] rounded-full transition-all duration-500"
            style={{ width: `${attendedPct}%` }}
          />
        </div>
        <div className="flex gap-4 mt-3">
          {[
            { color: "bg-emerald-500", label: `${presentCount} Present` },
            { color: "bg-amber-400",   label: `${lateCount} Late` },
            { color: "bg-slate-200",   label: `${absentCount} Absent` },
          ].map(x => (
            <div key={x.label} className="flex items-center gap-1.5">
              <div className={cn("w-2.5 h-2.5 rounded-full", x.color)} />
              <span className="text-xs text-slate-500">{x.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search students…"
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {(["all", "present", "late", "absent", "excused"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors",
                filter === f
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {f === "all" ? "All" : STATUS_CONFIG[f].label}
            </button>
          ))}
        </div>
      </div>

      {/* Students list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <UserCheck className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500">
            {search ? "No students match your search." : "No students enrolled."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Student</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Checked In</th>
                <th className="px-4 py-3 font-medium text-slate-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(s => {
                const cfg = STATUS_CONFIG[s.status]
                return (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0",
                          s.status === "present" ? "bg-emerald-100 text-emerald-700" :
                          s.status === "late"    ? "bg-amber-100 text-amber-700" :
                          "bg-slate-100 text-slate-500"
                        )}>
                          {s.name[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{s.name}</p>
                          <p className="text-xs text-slate-500">{s.email}</p>
                        </div>
                        {s.manual_override && (
                          <Badge className="text-xs bg-slate-100 text-slate-500 border-0 hidden xl:flex">
                            Manual
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Badge className={cn("text-xs border-0", cfg.bg, cfg.text)}>
                        {cfg.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-slate-500">
                      {s.scanned_at
                        ? new Date(s.scanned_at).toLocaleTimeString("en-GB", {
                            hour: "2-digit", minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {updating === s.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        ) : (
                          (["present", "late", "excused", "absent"] as AttendStatus[]).map(st => (
                            <button
                              key={st}
                              title={STATUS_CONFIG[st].label}
                              onClick={() => markStatus(s, st)}
                              disabled={s.status === st}
                              className={cn(
                                "px-2 py-1 rounded text-xs font-medium transition-colors border",
                                s.status === st
                                  ? cn(STATUS_CONFIG[st].bg, STATUS_CONFIG[st].text, "border-transparent cursor-default")
                                  : "border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700"
                              )}
                            >
                              {STATUS_CONFIG[st].label.slice(0, 1)}
                            </button>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
