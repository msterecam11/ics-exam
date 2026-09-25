"use client"

import { Fragment, use, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, CalendarDays, MapPin, Clock, Users, Loader2, Pencil, Trash2, Plus, UserMinus, ExternalLink,
  CheckCircle2, XCircle, RotateCcw, Flag, Globe, UserCheck, ClipboardCheck, Search,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { GroupFormDialog, type GroupFormValue } from "@/components/lms/groups/GroupFormDialog"
import MaterialsManager from "@/components/lms/groups/MaterialsManager"
import { GroupExercises, GroupAssignments } from "@/components/lms/groups/GroupMarking"
import { GroupExam, AccessPanel } from "@/components/lms/groups/GroupExam"
import { GroupFeedback } from "@/components/lms/groups/GroupFeedback"
import GroupTeams from "@/components/lms/groups/GroupTeams"
import ReleasePanel from "@/components/lms/groups/ReleasePanel"
import ViewAsStudentButton from "@/components/lms/ViewAsStudentButton"
import { ComponentBadge, ResultPill } from "@/components/lms/course/PassResultView"

type Person = {
  enrollment_id: string; status: string
  student: { id: string; name: string; email: string; company: string | null } | null
  program: { id: string; name: string; client: string | null } | null
  track?: string | null
  current_group?: { id: string; label: string } | null
}
type Day = {
  id: string; title: string; session_date: string; start_time: string; duration_minutes: number
  location: string | null; closed_at: string | null
  attendance: { present?: number; late?: number; absent?: number; excused?: number } | null
}
type Detail = {
  group: any
  /** The client program this group belongs to; null = an open date (catalogue). */
  program: { id: string; name: string; client: string | null } | null
  course: { id: string; title: string; course_code: string | null; delivery_mode: string } | null
  provider: { id: string; name: string } | null
  staff: { user_id: string; name: string; email: string; role: "instructor" | "facilitator" }[]
  seats_taken: number
  participants: Person[]
  candidates: Person[]
  days: Day[]
  /** Admins; a group's instructors only view and mark. */
  can_manage: boolean
}

const STATUS_STYLE: Record<string, string> = {
  planned: "bg-slate-100 text-slate-600", confirmed: "bg-emerald-50 text-emerald-700",
  completed: "bg-blue-50 text-blue-700", cancelled: "bg-red-50 text-red-600",
}
const weekday = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
const endTime = (start: string, mins: number) => {
  const [h, m] = start.split(":").map(Number); const t = h * 60 + m + mins
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`
}

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<"participants" | "days" | "content" | "exercises" | "assignments" | "exam" | "feedback" | "results" | "materials">("participants")
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [modules, setModules] = useState<{ id: string; title: string }[]>([])

  const load = useCallback(async () => {
    const res = await fetch(`/api/lms/groups/${id}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error ?? "Could not load the group"); return }
    setD(data)
  }, [id])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!d?.course?.id) return
    fetch(`/api/lms/modules?course_id=${d.course.id}`).then(r => r.ok ? r.json() : []).then(ms => setModules((Array.isArray(ms) ? ms : []).map((m: any) => ({ id: m.id, title: m.title })))).catch(() => {})
  }, [d?.course?.id])

  const formValue = useMemo<GroupFormValue | null>(() => d && ({
    id: d.group.id, name: d.group.name ?? "", start_date: d.group.start_date, end_date: d.group.end_date,
    daily_start: d.group.daily_start?.slice(0, 5) ?? "", daily_end: d.group.daily_end?.slice(0, 5) ?? "",
    city: d.group.city ?? "", country: d.group.country ?? "", venue_name: d.group.venue_name ?? "",
    venue_address: d.group.venue_address ?? "", map_url: d.group.map_url ?? "",
    seats: d.group.seats ? String(d.group.seats) : "", language: d.group.language ?? "", provider_id: d.group.provider_id,
    notes: d.group.notes ?? "", joining_instructions: d.group.joining_instructions ?? "", staff: d.staff.map(s => ({ user_id: s.user_id, role: s.role })),
  }), [d])

  async function setStatus(status: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return
    const res = await fetch(`/api/lms/groups/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? "Could not change the status"); return }
    toast.success(status === "confirmed" ? "Confirmed — participants can now see it" : "Status updated")
    load()
  }

  async function remove() {
    if (!confirm("Delete this group? Its days and its own files go with it.")) return
    const res = await fetch(`/api/lms/groups/${id}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? "Could not delete"); return }
    toast.success("Group deleted")
    router.push(`/lms-admin/courses/${d?.course?.id}`)
  }

  async function takeOut(p: Person) {
    if (!confirm(`Take ${p.student?.name} out of this group? They stay enrolled in the course; attendance already taken is kept.`)) return
    const res = await fetch(`/api/lms/groups/${id}/participants`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enrollment_ids: [p.enrollment_id] }) })
    if (!res.ok) { toast.error("Could not update"); return }
    load()
  }

  async function makeDays() {
    const res = await fetch(`/api/lms/groups/${id}/days`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? "Could not create the days"); return }
    toast.success(data.created ? `${data.created} day${data.created === 1 ? "" : "s"} created` : "Every date already has a day")
    load()
  }
  async function dropDay(day: Day) {
    if (!confirm(`Remove ${weekday(day.session_date)}?`)) return
    const res = await fetch(`/api/lms/groups/${id}/days?day=${day.id}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? "Could not remove the day"); return }
    load()
  }

  if (error) return <div className="py-20 text-center text-slate-500">{error}</div>
  if (!d) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>

  const g = d.group
  const manage = d.can_manage
  const full = !!g.seats && d.seats_taken >= g.seats
  const instructors = d.staff.filter(s => s.role === "instructor"), facilitators = d.staff.filter(s => s.role === "facilitator")

  return (
    <div className="max-w-5xl space-y-5 pb-16">
      <Link href={d.program ? `/lms-admin/programs/${d.program.id}?tab=sessions` : manage ? `/lms-admin/courses/${d.course?.id}` : "/lms-admin"} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#1B4F8A]">
        <ArrowLeft className="h-3.5 w-3.5" /> {d.program ? `${d.program.name} · Schedule` : d.course?.title}
      </Link>

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-12 h-12 rounded-xl bg-[#1B4F8A]/10 flex items-center justify-center shrink-0"><CalendarDays className="h-6 w-6 text-[#1B4F8A]" /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{g.label}</h1>
              <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", STATUS_STYLE[g.status])}>{g.status[0].toUpperCase() + g.status.slice(1)}</span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{d.course?.title}{d.course?.course_code ? ` · ${d.course.course_code}` : ""}</p>
            <p className="text-xs mt-1">{d.program
              ? <span className="text-slate-500">Group of <b className="text-slate-700">{d.program.name}</b>{d.program.client ? ` (${d.program.client})` : ""} — only its participants</span>
              : <span className="text-violet-700">Open date — shown in the catalogue for anyone to request</span>}</p>
          </div>
          {manage && <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
            {g.status === "planned" && <Button size="sm" onClick={() => setStatus("confirmed")} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"><CheckCircle2 className="h-3.5 w-3.5" /> Confirm</Button>}
            {g.status === "confirmed" && <Button variant="outline" size="sm" onClick={() => setStatus("planned", "Back to planned? Participants will no longer see this group or its days.")} className="gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> Back to planned</Button>}
            {g.status === "confirmed" && <Button variant="outline" size="sm" onClick={() => setStatus("completed")} className="gap-1.5"><Flag className="h-3.5 w-3.5" /> Mark completed</Button>}
            {(g.status === "planned" || g.status === "confirmed") && <Button variant="outline" size="sm" onClick={() => setStatus("cancelled", "Cancel this group?")} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"><XCircle className="h-3.5 w-3.5" /> Cancel</Button>}
            {g.status === "cancelled" && <Button variant="outline" size="sm" onClick={() => setStatus("planned")} className="gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> Reopen</Button>}
            {d.seats_taken === 0 && <Button variant="outline" size="sm" onClick={remove} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></Button>}
          </div>}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5 pt-5 border-t border-slate-100 text-sm">
          <div><p className="text-xs text-slate-400 mb-0.5">When</p><p className="text-slate-800 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-slate-400" />{g.daily_start ? `${g.daily_start.slice(0, 5)}–${g.daily_end?.slice(0, 5) ?? ""}` : "Times not set"}</p><p className="text-xs text-slate-500">{d.days.length} day{d.days.length === 1 ? "" : "s"}</p></div>
          <div><p className="text-xs text-slate-400 mb-0.5">Where</p><p className="text-slate-800 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-400" />{[g.venue_name, g.city].filter(Boolean).join(", ") || "Not set"}</p>
            {g.map_url && <a href={g.map_url} target="_blank" rel="noreferrer" className="text-xs text-[#1B4F8A] hover:underline inline-flex items-center gap-1">Map <ExternalLink className="h-3 w-3" /></a>}</div>
          <div><p className="text-xs text-slate-400 mb-0.5">Delivered by</p><p className="text-slate-800 flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-slate-400" />{d.provider?.name ?? "—"}</p><p className="text-xs text-slate-500">{g.language ?? ""}</p></div>
          <div><p className="text-xs text-slate-400 mb-0.5">Seats</p><p className={cn("font-semibold flex items-center gap-1.5", full ? "text-amber-700" : "text-slate-800")}><Users className="h-3.5 w-3.5 text-slate-400" />{d.seats_taken}{g.seats ? ` / ${g.seats}` : ""}{full ? " · full" : ""}</p></div>
          <div className="sm:col-span-2"><p className="text-xs text-slate-400 mb-0.5">Instructors</p><p className="text-slate-800 flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5 text-slate-400" />{instructors.map(s => s.name).join(", ") || "—"}</p></div>
          <div className="sm:col-span-2"><p className="text-xs text-slate-400 mb-0.5">Facilitators</p><p className="text-slate-800 flex items-center gap-1.5"><ClipboardCheck className="h-3.5 w-3.5 text-slate-400" />{facilitators.map(s => s.name).join(", ") || "—"}</p></div>
        </div>
        {g.status === "planned" && <p className="mt-4 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">Participants don&apos;t see this group, its days or its files until you <b>Confirm</b> it.</p>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {([["participants", `Participants (${d.participants.length})`], ["days", `Days (${d.days.length})`], ["content", "Content"], ["exercises", "Exercises"], ["assignments", "Assignments"], ["exam", "Final exam"], ["results", "Results"], ["feedback", "Feedback"], ["materials", "Materials"]] as const).filter(([k]) => manage || k !== "feedback").map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("px-4 py-2.5 text-sm font-medium border-b-2 -mb-px", tab === k ? "border-[#1B4F8A] text-[#1B4F8A]" : "border-transparent text-slate-500 hover:text-slate-700")}>{label}</button>
        ))}
      </div>

      {tab === "participants" && (
        <div className="space-y-3">
          {d.participants.length > 1 && <GroupTeams groupId={id} participants={d.participants} />}
          {manage && <div className="flex justify-end">
            <Button size="sm" onClick={() => setAdding(true)} disabled={g.status === "cancelled" || g.status === "completed"} className="gap-1.5 bg-[#1B4F8A] hover:bg-[#163f6e] text-white"><Plus className="h-3.5 w-3.5" /> Add participants</Button>
          </div>}
          {d.participants.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-xl py-12 text-center text-sm text-slate-400">Nobody in this group yet</div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
              {d.participants.map(p => (
                <div key={p.enrollment_id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] font-bold text-sm flex items-center justify-center shrink-0">{p.student?.name?.[0]?.toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.student?.name}{p.status === "completed" && <span className="ml-2 text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full">Completed</span>}</p>
                    <p className="text-xs text-slate-400 truncate">{[p.student?.email, p.student?.company, p.program ? `${p.program.name}${p.program.client ? ` (${p.program.client})` : ""}` : "Individual"].filter(Boolean).join(" · ")}</p>
                  </div>
                  {manage && p.student && <ViewAsStudentButton studentId={p.student.id} studentName={p.student.name} />}
                  {manage && <button onClick={() => takeOut(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" title="Take out of this group"><UserMinus className="h-4 w-4" /></button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "days" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">Attendance is taken per day. Open a day to mark present, late, absent or excused.</p>
            {manage && <Button size="sm" variant="outline" onClick={makeDays} className="gap-1.5 shrink-0"><Plus className="h-3.5 w-3.5" /> Create missing days</Button>}
          </div>
          {d.days.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-xl py-12 text-center text-sm text-slate-400">No days yet</div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
              {d.days.map(day => {
                const a = day.attendance
                const marked = a ? (a.present ?? 0) + (a.late ?? 0) + (a.absent ?? 0) + (a.excused ?? 0) : 0
                return (
                  <div key={day.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="w-24 shrink-0"><p className="text-sm font-semibold text-slate-800">{weekday(day.session_date)}</p><p className="text-xs text-slate-400">{day.start_time.slice(0, 5)}–{endTime(day.start_time, day.duration_minutes)}</p></div>
                    <p className="flex-1 min-w-0 text-sm text-slate-600 truncate">{day.title}</p>
                    <p className="text-xs text-slate-500 shrink-0">{marked ? `${(a?.present ?? 0) + (a?.late ?? 0)} present · ${a?.absent ?? 0} absent${a?.excused ? ` · ${a.excused} excused` : ""}` : "Not taken yet"}</p>
                    <Link href={`/lms-admin/sessions/${day.id}`} className="text-xs font-medium text-[#1B4F8A] hover:underline shrink-0">Attendance</Link>
                    {manage && !marked && <button onClick={() => dropDay(day)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" title="Remove this day"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === "content" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Open or lock each module for this group. A module set to <b>Released in class</b> (module Options in the course builder) stays locked until you open it — e.g. open Day 2 on the morning of Day 2. Locked modules also hide their slides and files from the participants&apos; downloads.</p>
          <AccessPanel groupId={id} type="package" />
        </div>
      )}
      {tab === "exercises" && <GroupExercises groupId={id} />}
      {tab === "assignments" && <GroupAssignments groupId={id} />}
      {tab === "exam" && <GroupExam groupId={id} />}
      {tab === "results" && <GroupResults groupId={id} />}
      {tab === "feedback" && manage && <GroupFeedback groupId={id} />}

      {tab === "materials" && d.course && (
        <div className="space-y-5">
          <ReleasePanel groupId={id} />
          {manage && <MaterialsManager courseId={d.course.id} groupId={id} modules={modules} />}
        </div>
      )}

      {formValue && d.course && (
        <GroupFormDialog open={editing} onClose={() => setEditing(false)} courseId={d.course.id} initial={formValue} onSaved={() => load()} />
      )}
      <AddParticipants open={adding} onClose={() => setAdding(false)} groupId={id} candidates={d.candidates} programOnly={!!d.program}
        seatsLeft={g.seats ? Math.max(0, g.seats - d.seats_taken) : null} onDone={() => { setAdding(false); load() }} />
    </div>
  )
}

function AddParticipants({ open, onClose, groupId, candidates, programOnly, seatsLeft, onDone }: {
  open: boolean; onClose: () => void; groupId: string; candidates: Person[]; programOnly: boolean; seatsLeft: number | null; onDone: () => void
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setPicked(new Set()); setQ("") } }, [open])

  const shown = candidates.filter(c => !q || `${c.student?.name} ${c.student?.email} ${c.program?.name ?? ""}`.toLowerCase().includes(q.toLowerCase()))
  const over = seatsLeft !== null && picked.size > seatsLeft
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function add() {
    if (over && !confirm(`That's ${picked.size - seatsLeft!} more than the seats left. Add them anyway?`)) return
    setBusy(true)
    const res = await fetch(`/api/lms/groups/${groupId}/participants`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollment_ids: [...picked], override: over }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast.error(data.error ?? "Could not add"); return }
    const moved = (data.results ?? []).filter((r: any) => r.status === "moved").length
    toast.success(`${data.placed} added${moved ? ` (${moved} moved from another group)` : ""}`)
    onDone()
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Add participants</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500 -mt-1">People enrolled in this course{programOnly ? " through this group's program" : " — through a program, or individually"}. Someone already in another group is moved.</p>
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, email or program…" className="pl-9" /></div>
        {[...new Set(candidates.map(c => c.track).filter(Boolean))].length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">Pick a whole track:</span>
            {[...new Set(candidates.map(c => c.track).filter(Boolean))].map(t => (
              <button key={t} type="button" onClick={() => setPicked(p => { const n = new Set(p); candidates.filter(c => c.track === t).forEach(c => n.add(c.enrollment_id)); return n })}
                className="text-xs px-2 py-0.5 rounded-full border border-slate-200 hover:border-[#1B4F8A] hover:text-[#1B4F8A]">{t}</button>
            ))}
            <button type="button" onClick={() => setPicked(new Set(candidates.map(c => c.enrollment_id)))} className="text-xs px-2 py-0.5 rounded-full border border-slate-200 hover:border-[#1B4F8A] hover:text-[#1B4F8A]">Everyone</button>
          </div>
        )}
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[50vh] overflow-y-auto">
          {shown.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">{candidates.length ? "No match" : "Everyone enrolled in this course is already in this group. Enrol people through a program (or approve a catalogue request) first."}</p>
            : shown.map(c => (
              <label key={c.enrollment_id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={picked.has(c.enrollment_id)} onChange={() => toggle(c.enrollment_id)} className="accent-[#1B4F8A]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{c.student?.name}</p>
                  <p className="text-xs text-slate-400 truncate">{[c.student?.email, c.program ? c.program.name : "Individual", c.track].filter(Boolean).join(" · ")}</p>
                </div>
                {c.current_group && <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">In {c.current_group.label}</span>}
              </label>
            ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className={cn("text-xs", over ? "text-amber-700 font-medium" : "text-slate-500")}>
            {picked.size} chosen{seatsLeft !== null ? ` · ${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left` : ""}{over ? " — adding them goes over the limit" : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={add} disabled={!picked.size || busy} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white">{busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Add</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}


// Each participant against the course's pass rule.
function GroupResults({ groupId }: { groupId: string }) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    fetch(`/api/lms/groups/${groupId}/results`).then(r => r.json()).then(d => setRows(d.rows ?? [])).catch(() => setRows([]))
  }, [groupId])
  if (!rows) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
  if (!rows.length) return <div className="border-2 border-dashed border-slate-200 rounded-xl py-12 text-center text-sm text-slate-400">Nobody in this group yet</div>
  const keys: { key: string; label: string }[] = []
  for (const r of rows) for (const c of r.result?.components ?? []) if (!keys.some(k => k.key === c.key)) keys.push({ key: c.key, label: c.label })
  const examOnly = rows.every(r => r.result?.mode !== "rule")
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-xs text-slate-500 mr-auto">Group report — participants, attendance by day, each part of the result, certificates, evaluation.</span>
        <a href={`/api/lms/reports/delivery/${groupId}/pdf`} className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-200 rounded-lg px-3 py-1.5 hover:border-[#1B4F8A] hover:text-[#1B4F8A]">PDF (internal)</a>
        <a href={`/api/lms/reports/delivery/${groupId}/pdf?audience=client`} className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-200 rounded-lg px-3 py-1.5 hover:border-[#1B4F8A] hover:text-[#1B4F8A]" title="Leaves out instructor ratings, comments and e-mail addresses">PDF for the client</a>
        <a href={`/api/lms/reports/delivery/${groupId}/xlsx`} className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-200 rounded-lg px-3 py-1.5 hover:border-[#1B4F8A] hover:text-[#1B4F8A]">Excel</a>
      </div>
      {examOnly && <p className="text-xs text-slate-500">This course completes by passing the final exam. Set a pass rule in the course&apos;s Settings → Completion &amp; grading to weigh in assignments, exercises and attendance.</p>}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Participant</th>
              {keys.map(k => <th key={k.key} className="px-3 py-2.5 font-medium text-center">{k.label}</th>)}
              <th className="px-3 py-2.5 font-medium text-center">Score</th>
              <th className="px-3 py-2.5 font-medium text-center">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => (
              <Fragment key={r.enrollment_id}>
                <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(open === r.enrollment_id ? null : r.enrollment_id)}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.student?.name}</td>
                  {keys.map(k => {
                    const c = r.result?.components?.find((x: any) => x.key === k.key)
                    return <td key={k.key} className="px-3 py-2.5">{c ? <span className="flex items-center justify-center gap-1.5"><ComponentBadge c={c} /><span className="text-xs text-slate-600">{c.score !== null ? `${c.score}%` : "—"}</span></span> : <span className="block text-center text-slate-300">—</span>}</td>
                  })}
                  <td className="px-3 py-2.5 text-center font-semibold text-slate-800">{r.result?.score !== null && r.result?.score !== undefined ? `${r.result.score}%` : "—"}</td>
                  <td className="px-3 py-2.5 text-center"><ResultPill r={r.result} /></td>
                </tr>
                {open === r.enrollment_id && r.result?.reasons?.length > 0 && (
                  <tr><td colSpan={keys.length + 3} className="px-4 py-2 text-xs text-slate-500 bg-slate-50">{r.result.reasons.join(" · ")}</td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">Click a row to see what's missing. The course completes (and the certificate issues) automatically once someone passes.</p>
    </div>
  )
}
