"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Copy, QrCode, Pencil, Trash2, Lock, Unlock,
  Loader2, CheckCircle2, XCircle, ExternalLink, Users,
  CalendarDays, Clock, MapPin, Download, MoreHorizontal,
  AlertTriangle, Ban,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const TAB = ["Bookings", "Slots", "Settings"] as const
type Tab = typeof TAB[number]

function formatUtcInTimezone(utc: string, tz: string) {
  return new Date(utc).toLocaleString("en-GB", {
    timeZone: tz, day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  })
}

function formatDateOnly(utc: string, tz: string) {
  return new Date(utc).toLocaleDateString("en-GB", { timeZone: tz, day: "2-digit", month: "short", year: "numeric" })
}

function formatTimeOnly(utc: string, tz: string) {
  return new Date(utc).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
}

function StatusBadge({ status }: { status: string }) {
  const s: Record<string, string> = {
    confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    cancelled:  "bg-red-100 text-red-600 border-red-200",
    no_show:    "bg-slate-100 text-slate-500 border-slate-200",
  }
  return <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border", s[status] ?? s.confirmed)}>{status.replace("_"," ")}</span>
}

export default function ScheduleDetailPage() {
  const params       = useParams()
  const searchParams = useSearchParams()
  const router       = useRouter()
  const scheduleId   = params.scheduleId as string

  const [schedule, setSchedule] = useState<any>(null)
  const [bookings, setBookings] = useState<any[]>([])
  const [slots,    setSlots]    = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<Tab>("Bookings")

  // Edit state
  const [editing,     setEditing]     = useState(!!searchParams.get("edit"))
  const [editName,    setEditName]    = useState("")
  const [editLoc,     setEditLoc]     = useState("")
  const [editDesc,    setEditDesc]    = useState("")
  const [savingEdit,  setSavingEdit]  = useState(false)

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting,      setDeleting]      = useState(false)

  // Slot actions
  const [togglingSlot, setTogglingSlot] = useState<string | null>(null)
  const [deletingSlot, setDeletingSlot] = useState<string | null>(null)

  // Booking cancel
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  useEffect(() => { loadAll() }, [scheduleId])

  async function loadAll() {
    const [sch, bkn, slt] = await Promise.all([
      fetch(`/api/interview/schedule/${scheduleId}`).then(r => r.json()),
      fetch(`/api/interview/schedule/${scheduleId}/bookings`).then(r => r.json()),
      fetch(`/api/interview/schedule/${scheduleId}/slots`).then(r => r.json()),
    ])
    setSchedule(sch.error ? null : sch)
    setBookings(Array.isArray(bkn) ? bkn : [])
    setSlots(Array.isArray(slt) ? slt : [])
    setEditName(sch.name ?? "")
    setEditLoc(sch.location ?? "")
    setEditDesc(sch.description ?? "")
    setLoading(false)
  }

  function bookingUrl() { return `${window.location.origin}/book/${scheduleId}` }
  function copyLink() { navigator.clipboard.writeText(bookingUrl()); toast.success("Link copied!") }

  async function saveEdit() {
    setSavingEdit(true)
    const res = await fetch(`/api/interview/schedule/${scheduleId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, location: editLoc, description: editDesc }),
    })
    const d = await res.json()
    setSavingEdit(false)
    if (!res.ok) { toast.error(d.error); return }
    setSchedule((p: any) => ({ ...p, ...d }))
    setEditing(false)
    toast.success("Saved!")
  }

  async function toggleStatus() {
    const next = schedule.status === "active" ? "closed" : "active"
    const res = await fetch(`/api/interview/schedule/${scheduleId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
    if (!res.ok) { toast.error("Failed"); return }
    setSchedule((p: any) => ({ ...p, status: next }))
    toast.success(next === "active" ? "Schedule reopened" : "Schedule closed")
  }

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/interview/schedule/${scheduleId}`, { method: "DELETE" })
    setDeleting(false)
    if (!res.ok) { toast.error("Failed to delete"); return }
    toast.success("Schedule deleted")
    router.push("/interview/schedule")
  }

  async function toggleBlock(slotId: string, current: boolean) {
    setTogglingSlot(slotId)
    await fetch(`/api/interview/schedule/${scheduleId}/slots/${slotId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_blocked: !current }),
    })
    setSlots(prev => prev.map(s => s.slot_id === slotId ? { ...s, is_blocked: !current, availability: !current ? "blocked" : "available" } : s))
    setTogglingSlot(null)
  }

  async function deleteSlot(slotId: string) {
    setDeletingSlot(slotId)
    const res = await fetch(`/api/interview/schedule/${scheduleId}/slots/${slotId}`, { method: "DELETE" })
    const d   = await res.json().catch(() => ({}))
    setDeletingSlot(null)
    if (!res.ok) { toast.error(d.error ?? "Cannot delete slot"); return }
    setSlots(prev => prev.filter(s => s.slot_id !== slotId))
    toast.success("Slot deleted")
  }

  async function cancelBooking(bookingId: string) {
    setCancellingId(bookingId)
    await fetch(`/api/interview/schedule/${scheduleId}/bookings/${bookingId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    })
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: "cancelled" } : b))
    setCancellingId(null)
    toast.success("Booking cancelled")
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-[#1B4F8A]" /></div>
  if (!schedule) return <div className="text-center py-20 text-slate-400">Schedule not found.</div>

  const tz       = schedule.timezone ?? "Asia/Dubai"
  const confirmed = bookings.filter(b => b.status === "confirmed").length
  const total     = bookings.length
  const pct       = slots.length > 0 ? Math.round((confirmed / slots.length) * 100) : 0

  // Group slots by date
  const slotsByDate = slots.reduce((acc: Record<string, any[]>, s) => {
    const d = formatDateOnly(s.start_utc, tz)
    if (!acc[d]) acc[d] = []
    acc[d].push(s)
    return acc
  }, {})

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/interview/schedule">
          <Button variant="ghost" size="icon" className="h-8 w-8 mt-1"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="text-lg font-bold h-9 max-w-sm" />
              <Button size="sm" className="bg-[#1B4F8A] gap-1.5" onClick={saveEdit} disabled={savingEdit}>
                {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><XCircle className="h-3 w-3" /></Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-extrabold text-[#1B4F8A] truncate">{schedule.name}</h1>
              <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border",
                schedule.status === "active"  ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                schedule.status === "closed"  ? "bg-red-100 text-red-600 border-red-200" :
                "bg-slate-100 text-slate-500 border-slate-200")}>{schedule.status}</span>
            </div>
          )}
          <p className="text-xs text-slate-400 mt-0.5">
            {schedule.slot_duration_min}min slots · {schedule.timezone}
            {schedule.location && ` · ${schedule.location}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(!editing)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button size="sm" variant="outline" className={cn("gap-1.5", schedule.status === "active" ? "text-amber-600 border-amber-300 hover:bg-amber-50" : "text-emerald-600 border-emerald-300 hover:bg-emerald-50")}
            onClick={toggleStatus}>
            {schedule.status === "active" ? <><Lock className="h-3.5 w-3.5" /> Close</> : <><Unlock className="h-3.5 w-3.5" /> Reopen</>}
          </Button>
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="destructive" disabled={deleting} onClick={handleDelete}>
                {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm Delete"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}><XCircle className="h-3.5 w-3.5" /></Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Share + Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Share */}
        <div className="col-span-2 bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Share</p>
          <div className="flex items-center gap-2 mb-3">
            <code className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[#1B4F8A] font-mono truncate">
              {bookingUrl()}
            </code>
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={copyLink}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
            <a href={bookingUrl()} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-1.5 shrink-0">
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </Button>
            </a>
          </div>
          <div className="flex gap-2">
            <a href={`/print/interview/schedule/${scheduleId}`} target="_blank" rel="noopener noreferrer" className="flex-1">
              <Button variant="outline" className="w-full gap-2 border-[#1B4F8A]/30 text-[#1B4F8A] hover:bg-[#1B4F8A]/5">
                <QrCode className="h-4 w-4" /> QR Card — Dark
              </Button>
            </a>
            <a href={`/print/interview/schedule/${scheduleId}?theme=light`} target="_blank" rel="noopener noreferrer" className="flex-1">
              <Button variant="outline" className="w-full gap-2">
                <QrCode className="h-4 w-4" /> QR Card — Light
              </Button>
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Bookings</p>
          {[
            { label: "Total slots",  value: slots.length,                              color: "#1B4F8A" },
            { label: "Confirmed",    value: confirmed,                                 color: "#10b981" },
            { label: "Available",    value: slots.filter(s => s.availability === "available").length, color: "#64748b" },
            { label: "Cancelled",    value: bookings.filter(b => b.status === "cancelled").length,    color: "#ef4444" },
          ].map(k => (
            <div key={k.label} className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{k.label}</span>
              <span className="text-sm font-black" style={{ color: k.color }}>{k.value}</span>
            </div>
          ))}
          <div className="pt-1">
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-[#1B4F8A] transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[10px] text-slate-400 text-right mt-0.5">{pct}% booked</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="flex border-b border-slate-100">
          {TAB.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-5 py-3 text-sm font-semibold transition-colors border-b-2",
                tab === t ? "border-[#1B4F8A] text-[#1B4F8A]" : "border-transparent text-slate-500 hover:text-slate-700")}>
              {t}
            </button>
          ))}
        </div>

        {/* ── Bookings Tab ── */}
        {tab === "Bookings" && (
          <div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-50">
              <p className="text-xs text-slate-400 font-semibold">{bookings.length} total booking{bookings.length !== 1 ? "s" : ""}</p>
              <Button size="sm" variant="ghost" className="text-xs gap-1.5" onClick={() => {
                const csv = ["Name,Email,Slot ("+tz+"),Track,Status,Confirmation"]
                  .concat(bookings.map(b => `${b.candidate_name},${b.candidate_email},"${b.schedule_slots ? formatUtcInTimezone(b.schedule_slots.start_utc, tz) : "—"}",${b.role_tracks?.name ?? "—"},${b.status},${b.confirmation_code}`))
                  .join("\n")
                const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv])); a.download = "bookings.csv"; a.click()
              }}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>
            {bookings.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No bookings yet</p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100">
                    <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-400 py-2.5 pl-5 pr-3">Candidate</th>
                    <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-400 py-2.5 px-3">Slot ({tz.split("/")[1]})</th>
                    <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-400 py-2.5 px-3">Track</th>
                    <th className="text-center text-[9px] font-bold uppercase tracking-wider text-slate-400 py-2.5 px-3">Status</th>
                    <th className="text-center text-[9px] font-bold uppercase tracking-wider text-slate-400 py-2.5 px-3">Teams</th>
                    <th className="py-2.5 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b: any, i) => (
                    <tr key={b.id} className={cn("border-b border-slate-50 last:border-0", i % 2 === 0 ? "bg-white" : "bg-slate-50/30")}>
                      <td className="py-2.5 pl-5 pr-3">
                        <p className="font-semibold text-slate-700">{b.candidate_name}</p>
                        <p className="text-[10px] text-slate-400">{b.candidate_email}</p>
                        <p className="text-[9px] font-mono text-slate-300 mt-0.5">{b.confirmation_code}</p>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {b.schedule_slots ? formatUtcInTimezone(b.schedule_slots.start_utc, tz) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">{b.role_tracks?.name ?? "—"}</td>
                      <td className="py-2.5 px-3 text-center"><StatusBadge status={b.status} /></td>
                      <td className="py-2.5 px-3 text-center">
                        {b.ms_teams_url
                          ? <a href={b.ms_teams_url} target="_blank" rel="noopener noreferrer" className="text-[#1B4F8A] hover:underline text-[10px] font-semibold">Open 📅</a>
                          : b.ms_event_id ? <span className="text-emerald-600 text-[10px]">✅ Created</span>
                          : <span className="text-slate-300 text-[10px]">—</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        {b.status === "confirmed" && (
                          cancellingId === b.id
                            ? <Loader2 className="h-3 w-3 animate-spin text-slate-400 mx-auto" />
                            : <Button size="sm" variant="ghost" className="h-6 text-[10px] text-red-400 hover:text-red-600 hover:bg-red-50 px-2"
                                onClick={() => cancelBooking(b.id)}>
                                Cancel
                              </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Slots Tab ── */}
        {tab === "Slots" && (
          <div className="p-5 space-y-5">
            {Object.keys(slotsByDate).length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No slots defined</p>
              </div>
            ) : (
              Object.entries(slotsByDate).map(([date, daySlots]) => (
                <div key={date}>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" /> {date}
                  </p>
                  <div className="space-y-1.5">
                    {daySlots.map((s: any) => {
                      const booking  = bookings.find(b => b.slot_id === s.slot_id && b.status === "confirmed")
                      const isBooked = !!booking
                      const isBlocked = s.is_blocked
                      return (
                        <div key={s.slot_id} className={cn("flex items-center gap-3 px-4 py-2.5 rounded-xl border",
                          isBooked  ? "bg-[#1B4F8A]/5 border-[#1B4F8A]/20" :
                          isBlocked ? "bg-slate-100 border-slate-200" :
                          "bg-white border-slate-200")}>
                          <div className={cn("w-2 h-2 rounded-full shrink-0",
                            isBooked ? "bg-[#1B4F8A]" : isBlocked ? "bg-slate-400" : "bg-emerald-400")} />
                          <span className="text-xs font-bold text-slate-700 w-28 shrink-0">
                            {formatTimeOnly(s.start_utc, tz)} → {formatTimeOnly(s.end_utc, tz)}
                          </span>
                          <span className="flex-1 text-xs text-slate-500">
                            {isBooked   ? <span className="text-[#1B4F8A] font-semibold">{booking.candidate_name}</span> :
                             isBlocked  ? <span className="text-slate-400 italic">Blocked</span> :
                             <span className="text-emerald-600">Available</span>}
                          </span>
                          {!isBooked && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button size="sm" variant="ghost" className={cn("h-7 text-[10px] gap-1 px-2",
                                isBlocked ? "text-emerald-600 hover:bg-emerald-50" : "text-amber-600 hover:bg-amber-50")}
                                disabled={togglingSlot === s.slot_id}
                                onClick={() => toggleBlock(s.slot_id, isBlocked)}>
                                {togglingSlot === s.slot_id ? <Loader2 className="h-3 w-3 animate-spin" /> :
                                 isBlocked ? <><Unlock className="h-3 w-3" /> Unblock</> : <><Ban className="h-3 w-3" /> Block</>}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-[10px] text-red-400 hover:text-red-600 hover:bg-red-50 px-2"
                                disabled={deletingSlot === s.slot_id}
                                onClick={() => deleteSlot(s.slot_id)}>
                                {deletingSlot === s.slot_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Settings Tab ── */}
        {tab === "Settings" && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Booking Mode",   value: schedule.booking_mode },
                { label: "Source",         value: schedule.source_type ?? "—" },
                { label: "Format",         value: schedule.interview_format },
                { label: "Timezone",       value: schedule.timezone },
                { label: "Slot Duration",  value: `${schedule.slot_duration_min} min` },
                { label: "Buffer",         value: schedule.buffer_min > 0 ? `${schedule.buffer_min} min` : "None" },
                { label: "Per Slot",       value: schedule.capacity_per_slot === 1 ? "One-on-one" : `${schedule.capacity_per_slot} candidates` },
                { label: "Group",          value: schedule.assessment_groups?.name ?? "—" },
                { label: "Track / Role",   value: schedule.role_tracks?.name ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-xl px-4 py-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{label}</p>
                  <p className="text-sm font-semibold text-slate-700 capitalize">{value}</p>
                </div>
              ))}
            </div>
            {editing && (
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div><Label className="text-xs mb-1 block">Name</Label><Input value={editName} onChange={e => setEditName(e.target.value)} /></div>
                <div><Label className="text-xs mb-1 block">Location</Label><Input value={editLoc} onChange={e => setEditLoc(e.target.value)} /></div>
                <div><Label className="text-xs mb-1 block">Description</Label><Input value={editDesc} onChange={e => setEditDesc(e.target.value)} /></div>
                <Button className="bg-[#1B4F8A] gap-2" onClick={saveEdit} disabled={savingEdit}>
                  {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save Changes
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
