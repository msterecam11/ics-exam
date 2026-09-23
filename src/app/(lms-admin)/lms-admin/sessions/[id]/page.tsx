"use client"

import { use, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Users, CheckCircle2, Clock, AlertTriangle, RefreshCw, Loader2, Search, Download,
  UserCheck, Eye, CalendarDays, MapPin, Video, BookOpen, Layers, Lock, Unlock, X, Briefcase, LogIn, LogOut, Upload, Users2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type AttendStatus = "present" | "late" | "absent" | "excused"

interface Student {
  id: string; name: string; email: string; company: string | null
  on_roster: boolean
  status: AttendStatus
  marked: boolean
  marked_at: string | null
  marked_by: string | null
  excuse_note: string | null
  /** Arrived / left ("HH:MM", institute time), minutes from a meeting report. */
  check_in: string | null
  check_out: string | null
  minutes: number | null
  source: "manual" | "import" | null
  joined_at: string | null
  /** Share of the session that counts as attended (null = excused). */
  credit: number | null
}

interface SessionInfo {
  id: string; title: string; session_date: string; start_time: string; duration_minutes: number
  location: string | null; meeting_link: string | null; closed_at: string | null; is_open: boolean
  topics_covered: string | null; instructor_notes: string | null; agenda: string | null
  program_id: string | null; program_name: string | null; track_name: string | null
  group_id?: string | null; group_label?: string | null
  course_title: string | null; module_title: string | null
  online?: boolean; late_threshold?: number | null
}

const STATUS_CONFIG: Record<AttendStatus, { label: string; bg: string; text: string }> = {
  present: { label: "Present", bg: "bg-emerald-100", text: "text-emerald-700" },
  late:    { label: "Late",    bg: "bg-amber-100",   text: "text-amber-700"   },
  excused: { label: "Excused", bg: "bg-blue-100",    text: "text-blue-700"    },
  absent:  { label: "Absent",  bg: "bg-red-50",      text: "text-red-600"     },
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}

export default function SessionAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params)
  const [session,  setSession]  = useState<SessionInfo | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading,  setLoading]  = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [search,   setSearch]   = useState("")
  const [filter,   setFilter]   = useState<AttendStatus | "unmarked" | "all">("all")
  const [busy,     setBusy]     = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [wrapUp, setWrapUp] = useState({ topics_covered: "", instructor_notes: "" })
  const [importOpen, setImportOpen] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/lms/attendance?session_id=${sessionId}`)
    if (res.status === 404) { setNotFound(true); setLoading(false); return }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? "Could not load attendance"); setLoading(false); return }
    setSession(data.session); setStudents(data.students ?? []); setLoading(false)
  }, [sessionId])

  useEffect(() => { load() }, [load])

  async function mark(ids: string[], status: AttendStatus, excuse_note?: string) {
    if (!ids.length) return
    setBusy(ids.length === 1 ? ids[0] : "bulk")
    const { ok, data } = await send("/api/lms/attendance", "POST", { session_id: sessionId, student_ids: ids, status, excuse_note })
    setBusy(null)
    if (!ok) { toast.error(data.error ?? "Could not save"); return }
    load()
  }

  // Arrived / left: now, for these people.
  async function stamp(ids: string[], action: "check_in" | "check_out") {
    if (!ids.length) return
    setBusy(ids.length === 1 ? ids[0] : "bulk")
    const { ok, data } = await send("/api/lms/attendance", "POST", { session_id: sessionId, student_ids: ids, action })
    setBusy(null)
    if (!ok) { toast.error(data.error ?? "Could not save"); return }
    load()
  }

  // Correct the times by hand ("HH:MM"; empty clears it).
  async function editTimes(s: Student) {
    const cin = prompt(`${s.name} — arrived at (HH:MM, empty = not recorded)`, s.check_in ?? "")
    if (cin === null) return
    const cout = prompt(`${s.name} — left at (HH:MM, empty = not recorded)`, s.check_out ?? "")
    if (cout === null) return
    setBusy(s.id)
    const { ok, data } = await send("/api/lms/attendance", "POST", { session_id: sessionId, student_id: s.id, action: "times", check_in: cin.trim() || null, check_out: cout.trim() || null })
    setBusy(null)
    if (!ok) { toast.error(data.error ?? "Could not save"); return }
    load()
  }

  function markOne(s: Student, status: AttendStatus) {
    if (status === "excused") {
      const note = prompt(`Reason ${s.name} is excused (optional):`, s.excuse_note ?? "")
      if (note === null) return
      mark([s.id], status, note)
    } else mark([s.id], status)
  }

  async function clearMark(s: Student) {
    setBusy(s.id)
    const res = await fetch(`/api/lms/attendance?session_id=${sessionId}&student_id=${s.id}`, { method: "DELETE" })
    setBusy(null)
    if (!res.ok) { toast.error("Could not clear the mark"); return }
    load()
  }

  async function setOpen(open: boolean) {
    const { ok, data } = await send("/api/lms/sessions", "PATCH", open
      ? { id: sessionId, action: "open" }
      : { id: sessionId, action: "close", topics_covered: wrapUp.topics_covered, instructor_notes: wrapUp.instructor_notes })
    if (!ok) { toast.error(data.error ?? "Could not update the session"); return }
    toast.success(open ? "Session reopened" : "Session closed")
    setCloseOpen(false); load()
  }

  const onRoster  = students.filter(s => s.on_roster)
  const counts = {
    present:  students.filter(s => s.marked && s.status === "present").length,
    late:     students.filter(s => s.marked && s.status === "late").length,
    excused:  students.filter(s => s.marked && s.status === "excused").length,
    absent:   students.filter(s => s.marked && s.status === "absent").length,
    unmarked: students.filter(s => !s.marked).length,
  }
  // Partial days count partly (check-in/out, or minutes from a meeting report).
  const creditRows = students.filter(s => s.credit !== null)
  const attendedPct = creditRows.length ? Math.round((creditRows.reduce((t, s) => t + (s.credit ?? 0), 0) / creditRows.length) * 100) : 0
  const notIn  = students.filter(s => s.on_roster && !s.check_in && !(s.marked && (s.status === "excused" || s.status === "absent")))
  const notOut = students.filter(s => s.on_roster && s.check_in && !s.check_out)

  const q = search.trim().toLowerCase()
  const filtered = students.filter(s =>
    (!q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)) &&
    (filter === "all" || (filter === "unmarked" ? !s.marked : s.marked && s.status === filter)))

  async function downloadPDF() {
    setDownloading(true)
    try {
      const res = await fetch(`/api/lms/reports/attendance/${sessionId}/pdf`)
      if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.error ?? "PDF generation failed"); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const cd = res.headers.get("Content-Disposition") ?? ""
      const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i)
      a.download = match ? decodeURIComponent(match[1]) : `attendance-${sessionId}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch { toast.error("Failed to download PDF") } finally { setDownloading(false) }
  }

  function exportCSV() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const header = "Name,Email,Company,Status,Check-in,Check-out,Minutes,Attended %,Marked At,Marked By,Excuse Note"
    const rows = students.map(s => [s.name, s.email, s.company, s.marked ? s.status : "not marked", s.check_in, s.check_out, s.minutes,
      s.credit === null ? "" : Math.round(s.credit * 100), s.marked_at, s.marked_by, s.excuse_note].map(esc).join(","))
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `attendance-${sessionId}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
  if (notFound || !session) return (
    <div className="py-20 text-center">
      <p className="text-slate-600 font-medium">Session not found</p>
      <Link href="/lms-admin/sessions" className="text-sm text-[#1B4F8A] hover:underline">Back to sessions</Link>
    </div>
  )

  const backHref = session.group_id ? `/lms-admin/groups/${session.group_id}`
    : session.program_id ? `/lms-admin/programs/${session.program_id}?tab=sessions` : "/lms-admin/sessions"

  return (
    <div className="space-y-6">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> {session.group_label ?? session.program_name ?? "Sessions"}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900">{session.title}</h1>
            <Badge className={cn("text-xs border-0", session.is_open ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
              {session.is_open ? "Open" : "Closed"}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-slate-500">
            <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />
              {new Date(session.session_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {session.start_time?.slice(0, 5)} · {session.duration_minutes} min</span>
            {session.group_label && <span className="flex items-center gap-1"><Users2 className="h-3.5 w-3.5" /> {session.group_label}</span>}
            {session.program_name && <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" /> {session.program_name}</span>}
            {session.program_name && <span className="flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> {session.track_name ?? "All tracks"}</span>}
            {session.course_title && <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" /> {session.course_title}{session.module_title ? ` · ${session.module_title}` : ""}</span>}
            {session.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {session.location}</span>}
            {session.meeting_link && <a href={session.meeting_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#1B4F8A] hover:underline"><Video className="h-3.5 w-3.5" /> Meeting link</a>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); load() }} className="gap-2"><RefreshCw className="h-4 w-4" /> Refresh</Button>
          {session.online && (
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="h-4 w-4" /> Import meeting report</Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2"><Download className="h-4 w-4" /> CSV</Button>
          <Link href={`/print/lms/attendance/${sessionId}`} target="_blank">
            <Button variant="outline" size="sm" className="gap-2"><Eye className="h-4 w-4" /> View report</Button>
          </Link>
          <Button size="sm" onClick={downloadPDF} disabled={downloading} className="gap-2 bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PDF
          </Button>
          {session.is_open ? (
            <Button variant="outline" size="sm" className="gap-2"
              onClick={() => { setWrapUp({ topics_covered: session.topics_covered ?? "", instructor_notes: session.instructor_notes ?? "" }); setCloseOpen(true) }}>
              <Lock className="h-4 w-4" /> Close session
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}><Unlock className="h-4 w-4" /> Reopen</Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "On roster",  value: onRoster.length, color: "text-slate-700",   icon: Users },
          { label: "Present",    value: counts.present,  color: "text-emerald-600", icon: CheckCircle2 },
          { label: "Late",       value: counts.late,     color: "text-amber-600",   icon: Clock },
          { label: "Excused",    value: counts.excused,  color: "text-blue-600",    icon: UserCheck },
          { label: "Absent / not marked", value: counts.absent + counts.unmarked, color: "text-red-500", icon: AlertTriangle },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-500">{s.label}</p>
              <s.icon className={cn("h-4 w-4", s.color)} />
            </div>
            <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-slate-700">Attendance rate <span className="text-xs text-slate-400 font-normal">(excused not counted)</span></p>
          <p className="text-sm font-bold text-slate-900">{attendedPct}%</p>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-[#1B4F8A] rounded-full transition-all duration-500" style={{ width: `${attendedPct}%` }} />
        </div>
        {!session.online && (notIn.length > 0 || notOut.length > 0) && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {notIn.length > 0 && (
              <Button size="sm" disabled={busy === "bulk"} className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => { if (confirm(`Check in ${notIn.length} ${notIn.length === 1 ? "person" : "people"} now?`)) stamp(notIn.map(s => s.id), "check_in") }}>
                <LogIn className="h-3.5 w-3.5" /> Check in all ({notIn.length})
              </Button>
            )}
            {notOut.length > 0 && (
              <Button size="sm" variant="outline" disabled={busy === "bulk"} className="h-8 text-xs gap-1.5"
                onClick={() => { if (confirm(`Check out ${notOut.length} ${notOut.length === 1 ? "person" : "people"} now?`)) stamp(notOut.map(s => s.id), "check_out") }}>
                <LogOut className="h-3.5 w-3.5" /> Check out all ({notOut.length})
              </Button>
            )}
            <p className="text-xs text-slate-400">Late is set automatically after {session.late_threshold ?? 15} min. Leaving early counts only the hours they were in.</p>
          </div>
        )}
        {counts.unmarked > 0 && (
          <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
            <p className="text-xs text-slate-500">{counts.unmarked} student{counts.unmarked !== 1 ? "s" : ""} not marked yet (counted as absent)</p>
            <Button size="sm" variant="outline" disabled={busy === "bulk"} className="h-8 text-xs gap-1.5"
              onClick={() => { if (confirm(`Mark all ${counts.unmarked} unmarked students as present?`)) mark(students.filter(s => !s.marked && s.on_roster).map(s => s.id), "present") }}>
              {busy === "bulk" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Mark unmarked as present
            </Button>
          </div>
        )}
      </div>

      {(session.topics_covered || session.instructor_notes) && !session.is_open && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 text-sm">
          {session.topics_covered && <p><span className="text-xs font-semibold text-slate-500 uppercase">Topics covered</span><br />{session.topics_covered}</p>}
          {session.instructor_notes && <p><span className="text-xs font-semibold text-slate-500 uppercase">Instructor notes</span><br />{session.instructor_notes}</p>}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search students…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto">
          {(["all", "unmarked", "present", "late", "excused", "absent"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
              {f === "all" ? "All" : f === "unmarked" ? "Not marked" : STATUS_CONFIG[f].label}
            </button>
          ))}
        </div>
      </div>

      {/* Roster */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <UserCheck className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500">{students.length ? "No students match." : "No students on this session's roster yet."}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Student</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">{session.online ? "In meeting" : "In / Out"}</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Marked</th>
                <th className="px-4 py-3 font-medium text-slate-600 text-right">Mark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(s => {
                const cfg = STATUS_CONFIG[s.status]
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.email}</p>
                      {!s.on_roster && <p className="text-[10px] text-amber-600">No longer on this roster (record kept)</p>}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {s.marked
                        ? <Badge className={cn("text-xs border-0", cfg.bg, cfg.text)}>{cfg.label}</Badge>
                        : <span className="text-xs text-slate-400">Not marked</span>}
                      {s.excuse_note && <p className="text-[10px] text-slate-400 mt-0.5 max-w-[14rem] truncate" title={s.excuse_note}>{s.excuse_note}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {session.online ? (
                        <div className="space-y-0.5">
                          {s.minutes !== null ? <p className="text-slate-700 font-medium">{s.minutes} min{s.credit !== null && s.credit < 1 ? ` · ${Math.round(s.credit * 100)}%` : ""}</p> : <p className="text-slate-300">—</p>}
                          {s.check_in && <p className="text-slate-400">{s.check_in}–{s.check_out ?? "?"}</p>}
                          {s.joined_at && <p className="text-[10px] text-emerald-600">Joined via LMS {new Date(s.joined_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {s.check_in ? <button onClick={() => editTimes(s)} className="font-medium text-slate-700 hover:underline" title="Correct the times">{s.check_in}</button>
                            : busy === s.id ? null : <button onClick={() => stamp([s.id], "check_in")} className="px-2 py-0.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1"><LogIn className="h-3 w-3" /> In</button>}
                          <span className="text-slate-300">–</span>
                          {s.check_out ? <button onClick={() => editTimes(s)} className="font-medium text-slate-700 hover:underline" title="Correct the times">{s.check_out}</button>
                            : s.check_in && busy !== s.id ? <button onClick={() => stamp([s.id], "check_out")} className="px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1"><LogOut className="h-3 w-3" /> Out</button>
                            : <span className="text-slate-300">—</span>}
                          {s.credit !== null && s.credit < 1 && s.credit > 0 && <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">{Math.round(s.credit * 100)}%</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-500">
                      {s.marked_at ? new Date(s.marked_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                      {s.marked_by && <p className="text-[10px] text-slate-400">by {s.marked_by}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {busy === s.id ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : (
                          <>
                            {(["present", "late", "excused", "absent"] as AttendStatus[]).map(st => (
                              <button key={st} title={STATUS_CONFIG[st].label}
                                onClick={() => markOne(s, st)}
                                disabled={s.marked && s.status === st && st !== "excused"}
                                className={cn("px-2 py-1 rounded text-xs font-medium transition-colors border",
                                  s.marked && s.status === st
                                    ? cn(STATUS_CONFIG[st].bg, STATUS_CONFIG[st].text, "border-transparent")
                                    : "border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700")}>
                                {STATUS_CONFIG[st].label}
                              </button>
                            ))}
                            {s.marked && (
                              <button onClick={() => clearMark(s)} title="Clear mark" className="p-1 text-slate-300 hover:text-slate-600">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </>
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

      <ImportReportDialog open={importOpen} onClose={() => setImportOpen(false)} sessionId={sessionId} onDone={() => { setImportOpen(false); load() }} />

      {/* Close with wrap-up */}
      <Dialog open={closeOpen} onOpenChange={v => { if (!v) setCloseOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Close session</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">Optionally record what was covered — it feeds the course analysis and reports. Attendance can still be corrected after closing.</p>
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <Label>Topics covered</Label>
              <textarea value={wrapUp.topics_covered} onChange={e => setWrapUp(w => ({ ...w, topics_covered: e.target.value }))} rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none" />
            </div>
            <div className="space-y-1">
              <Label>Instructor notes</Label>
              <textarea value={wrapUp.instructor_notes} onChange={e => setWrapUp(w => ({ ...w, instructor_notes: e.target.value }))} rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)}>Cancel</Button>
            <Button onClick={() => setOpen(false)} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2"><Lock className="h-4 w-4" /> Close session</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


// ── Importing a Teams / Zoom attendance report (online sessions) ──────────────
type ImportPreview = {
  duration_minutes: number
  matched: { student_id: string; name: string; email: string; minutes: number; first_join: string | null; status: string; credit_pct: number }[]
  unmatched: { email: string; name: string | null; minutes: number }[]
  missing: { student_id: string; name: string; email: string }[]
}

function ImportReportDialog({ open, onClose, sessionId, onDone }: { open: boolean; onClose: () => void; sessionId: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(apply: boolean) {
    if (!file) return
    setBusy(true)
    const fd = new FormData()
    fd.append("session_id", sessionId); fd.append("file", file)
    if (apply) fd.append("apply", "1")
    const res = await fetch("/api/lms/attendance/import", { method: "POST", body: fd })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast.error(data.error ?? "Could not read the report"); return }
    if (apply) { toast.success(`Attendance saved for ${data.matched} ${data.matched === 1 ? "person" : "people"}`); setFile(null); setPreview(null); onDone() }
    else setPreview(data)
  }
  const close = () => { if (!busy) { setFile(null); setPreview(null); onClose() } }
  const time = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) close() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Import the meeting's attendance report</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500 -mt-1">Download the attendance report from Teams or Zoom after the session and upload it here. People are matched by email; their time in the meeting counts toward their attendance.</p>
        <input type="file" accept=".csv,.tsv,.txt" onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null) }} className="text-sm" />
        {preview && (
          <div className="space-y-3">
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <p className="px-3 py-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b border-slate-100">Matched ({preview.matched.length}) — session is {preview.duration_minutes} min</p>
              <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {preview.matched.map(m => (
                  <div key={m.student_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <p className="flex-1 min-w-0 truncate">{m.name}</p>
                    <p className="text-xs text-slate-500">joined {time(m.first_join)} · {m.minutes} min · {m.credit_pct}%</p>
                    <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", m.status === "late" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>{m.status === "late" ? "Late" : "Present"}</span>
                  </div>
                ))}
              </div>
            </div>
            {preview.missing.length > 0 && <p className="text-xs text-slate-600"><b>Not in the report ({preview.missing.length}):</b> {preview.missing.map(m => m.name).join(", ")} — left as they are (not marked counts as absent).</p>}
            {preview.unmatched.length > 0 && <p className="text-xs text-amber-700"><b>In the report but not on this session ({preview.unmatched.length}):</b> {preview.unmatched.map(u => u.email).join(", ")} — ignored.</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
          {!preview
            ? <Button onClick={() => run(false)} disabled={!file || busy} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Check the file</Button>
            : <Button onClick={() => run(true)} disabled={busy || !preview.matched.length} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save attendance</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
