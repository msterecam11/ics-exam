"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Copy, QrCode, Pencil, Trash2, Lock, Unlock,
  Loader2, CheckCircle2, XCircle, ExternalLink, Users,
  CalendarDays, Clock, MapPin, Download, MoreHorizontal,
  AlertTriangle, Ban, Plus, Eye, ChevronDown, ChevronUp, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import QRCardPrint from "@/components/interview/schedule/QRCardPrint"
import { toPng } from "html-to-image"
import jsPDF from "jspdf"

const TAB = ["Bookings", "Slots", "Settings"] as const
type Tab = typeof TAB[number]

function expandDateRange(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate) return []
  const dates: string[] = []
  const cur = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  if (end < cur) return []
  while (cur <= end) {
    dates.push(cur.toISOString().split("T")[0])
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function generateSlotPreviews(start: string, end: string, durMin: number, bufMin: number): string[] {
  if (!start || !end || !durMin) return []
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  const startMins = sh * 60 + sm
  const endMins   = eh * 60 + em
  if (endMins <= startMins) return []
  const step = durMin + bufMin
  const slots: string[] = []
  let cur = startMins
  while (cur + durMin <= endMins) {
    const s  = `${String(Math.floor(cur / 60)).padStart(2,"0")}:${String(cur % 60).padStart(2,"0")}`
    const e  = cur + durMin
    const es = `${String(Math.floor(e / 60)).padStart(2,"0")}:${String(e % 60).padStart(2,"0")}`
    slots.push(`${s}→${es}`)
    cur += step
  }
  return slots
}

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

function RsvpBadge({ rsvp }: { rsvp: string }) {
  const cfg: Record<string, { cls: string; icon: string; label: string }> = {
    pending:   { cls: "bg-amber-50 text-amber-600 border-amber-200",      icon: "⏳", label: "Pending"   },
    accepted:  { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "✅", label: "Accepted"  },
    tentative: { cls: "bg-blue-50 text-blue-600 border-blue-200",          icon: "❓", label: "Tentative" },
    declined:  { cls: "bg-red-50 text-red-600 border-red-200",             icon: "❌", label: "Declined"  },
  }
  const c = cfg[rsvp] ?? cfg.pending
  return (
    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 w-fit mx-auto", c.cls)}>
      {c.icon} {c.label}
    </span>
  )
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
  const [editing,       setEditing]       = useState(!!searchParams.get("edit"))
  const [editName,      setEditName]      = useState("")
  const [editLoc,       setEditLoc]       = useState("")
  const [editDesc,      setEditDesc]      = useState("")
  const [editFormat,    setEditFormat]    = useState("")
  const [editTimezone,  setEditTimezone]  = useState("")
  const [editDuration,  setEditDuration]  = useState(30)
  const [editBuffer,    setEditBuffer]    = useState(0)
  const [editCapacity,  setEditCapacity]  = useState(1)
  const [savingEdit,    setSavingEdit]    = useState(false)

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting,      setDeleting]      = useState(false)

  // Slot actions
  const [togglingSlot, setTogglingSlot] = useState<string | null>(null)
  const [deletingSlot, setDeletingSlot] = useState<string | null>(null)

  // Booking cancel
  const [cancellingId,  setCancellingId]  = useState<string | null>(null)
  // RSVP sync from calendar
  const [syncingAll, setSyncingAll] = useState(false)

  // QR card modal
  const [showQrModal,   setShowQrModal]   = useState(false)
  const [downloading,   setDownloading]   = useState(false)
  const qrCardRef = useRef<HTMLDivElement>(null)

  // Add slots form
  const [showAddDay,   setShowAddDay]   = useState(false)
  const [addMode,      setAddMode]      = useState<"range"|"single">("range")
  const [newStartDate, setNewStartDate] = useState("")
  const [newEndDate,   setNewEndDate]   = useState("")
  const [newStart,     setNewStart]     = useState("09:00")
  const [newEnd,       setNewEnd]       = useState("17:00")
  const [addingSlots,  setAddingSlots]  = useState(false)

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
    setEditFormat(sch.interview_format ?? "in_person")
    setEditTimezone(sch.timezone ?? "Asia/Dubai")
    setEditDuration(sch.slot_duration_min ?? 30)
    setEditBuffer(sch.buffer_min ?? 0)
    setEditCapacity(sch.capacity_per_slot ?? 1)
    setLoading(false)
  }

  function bookingUrl() { return `${window.location.origin}/book/${scheduleId}` }
  function copyLink() { navigator.clipboard.writeText(bookingUrl()); toast.success("Link copied!") }

  async function downloadQrCard() {
    if (!qrCardRef.current) return
    setDownloading(true)
    try {
      const png      = await toPng(qrCardRef.current, { cacheBust: true, pixelRatio: 2 })
      const cardW    = qrCardRef.current.offsetWidth
      const cardH    = qrCardRef.current.offsetHeight
      // Convert px to mm (96 dpi → mm)
      const mmW      = (cardW * 25.4) / 96
      const mmH      = (cardH * 25.4) / 96
      const pdf      = new jsPDF({ orientation: "landscape", unit: "mm", format: [mmW, mmH] })
      pdf.addImage(png, "PNG", 0, 0, mmW, mmH)
      pdf.save(`${schedule?.name ?? "interview"}-qr-card.pdf`)
      toast.success("QR card downloaded as PDF!")
    } catch {
      toast.error("Download failed, please try again")
    } finally {
      setDownloading(false)
    }
  }

  async function saveEdit() {
    setSavingEdit(true)
    const res = await fetch(`/api/interview/schedule/${scheduleId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:              editName,
        location:          editLoc,
        description:       editDesc,
        interview_format:  editFormat,
        timezone:          editTimezone,
        slot_duration_min: editDuration,
        buffer_min:        editBuffer,
        capacity_per_slot: editCapacity,
      }),
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

  async function syncAllRsvp() {
    const withEvent = bookings.filter(b => b.ms_event_id && b.status === "confirmed")
    if (withEvent.length === 0) { toast.info("No calendar events to sync"); return }

    setSyncingAll(true)
    let updated = 0

    await Promise.all(withEvent.map(async (b) => {
      const res = await fetch(
        `/api/interview/schedule/${scheduleId}/bookings/${b.id}/rsvp-sync`,
        { method: "POST" }
      )
      if (!res.ok) return
      const data = await res.json()
      if (data.changed) {
        setBookings(prev => prev.map(x => x.id === b.id ? { ...x, rsvp_status: data.rsvp_status } : x))
        updated++
      }
    }))

    setSyncingAll(false)
    if (updated > 0) toast.success(`${updated} RSVP${updated > 1 ? "s" : ""} updated from calendar`)
    else toast.info("All RSVPs already up to date")
  }

  async function handleAddSlots() {
    setAddingSlots(true)
    let totalGenerated = 0

    if (addMode === "single") {
      // Single slot: end = start + slot_duration_min
      if (!newStartDate || !newStart) { toast.error("Please select a date and time"); setAddingSlots(false); return }
      const [h, m] = newStart.split(":").map(Number)
      const endMins = h * 60 + m + schedule.slot_duration_min
      const singleEnd = `${String(Math.floor(endMins / 60)).padStart(2,"0")}:${String(endMins % 60).padStart(2,"0")}`
      const res = await fetch(`/api/interview/schedule/${scheduleId}/slots`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: newStartDate, start_time: newStart, end_time: singleEnd }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed to add slot"); setAddingSlots(false); return }
      totalGenerated = data.generated
    } else {
      // Date range mode
      if (!newStartDate || !newEndDate) { toast.error("Please select a date range"); setAddingSlots(false); return }
      const dates = expandDateRange(newStartDate, newEndDate)
      for (const date of dates) {
        const res = await fetch(`/api/interview/schedule/${scheduleId}/slots`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, start_time: newStart, end_time: newEnd }),
        })
        const data = await res.json()
        if (res.ok) totalGenerated += data.generated
      }
    }

    setAddingSlots(false)
    toast.success(`${totalGenerated} slot${totalGenerated !== 1 ? "s" : ""} added!`)
    setShowAddDay(false)
    setNewStartDate(""); setNewEndDate("")
    const slt = await fetch(`/api/interview/schedule/${scheduleId}/slots`).then(r => r.json())
    setSlots(Array.isArray(slt) ? slt : [])
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
    <>
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
          <Button variant="outline" className="w-full gap-2 border-[#1B4F8A]/30 text-[#1B4F8A] hover:bg-[#1B4F8A]/5"
            onClick={() => setShowQrModal(true)}>
            <QrCode className="h-4 w-4" /> QR Invite Card
          </Button>
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
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="text-xs gap-1.5 text-[#1B4F8A] hover:bg-[#1B4F8A]/5"
                  onClick={syncAllRsvp} disabled={syncingAll}>
                  {syncingAll
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Syncing…</>
                    : <><span className="text-sm leading-none">↻</span> Sync RSVPs</>}
                </Button>
                <Button size="sm" variant="ghost" className="text-xs gap-1.5" onClick={() => {
                  const csv = ["Name,Email,Slot ("+tz+"),Track,Status,RSVP,Confirmation"]
                    .concat(bookings.map(b => `${b.candidate_name},${b.candidate_email},"${b.schedule_slots ? formatUtcInTimezone(b.schedule_slots.start_utc, tz) : "—"}",${b.role_tracks?.name ?? "—"},${b.status},${b.rsvp_status ?? "pending"},${b.confirmation_code}`))
                    .join("\n")
                  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv])); a.download = "bookings.csv"; a.click()
                }}>
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </Button>
              </div>
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
                    <th className="text-center text-[9px] font-bold uppercase tracking-wider text-slate-400 py-2.5 px-3">RSVP</th>
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
                        <RsvpBadge rsvp={b.rsvp_status ?? "pending"} />
                      </td>
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
            {Object.keys(slotsByDate).length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No slots defined</p>
              </div>
            )}
            {(
              <>
              {Object.entries(slotsByDate).map(([date, daySlots]) => (
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
              ))}

              {/* ── Add Slots panel ── */}
              <div className="border border-dashed border-slate-300 rounded-xl overflow-hidden">
                <button onClick={() => setShowAddDay(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                  <span className="flex items-center gap-2"><Plus className="h-4 w-4 text-[#1B4F8A]" />Add Slots</span>
                  {showAddDay ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </button>

                {showAddDay && (
                  <div className="border-t border-dashed border-slate-200 px-4 py-4 bg-slate-50/40 space-y-3">

                    {/* Mode toggle */}
                    <div className="grid grid-cols-2 gap-2">
                      {(["range","single"] as const).map(m => (
                        <button key={m} onClick={() => setAddMode(m)}
                          className={cn("py-1.5 px-3 rounded-lg border text-xs font-semibold transition-all",
                            addMode === m ? "border-[#1B4F8A] bg-[#1B4F8A] text-white" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
                          {m === "range" ? "📅 Date Range" : "🕐 Single Slot"}
                        </button>
                      ))}
                    </div>

                    {addMode === "range" ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-slate-500 font-semibold mb-1 block">Start Date</Label>
                            <Input type="date" value={newStartDate}
                              onChange={e => { setNewStartDate(e.target.value); if (!newEndDate || newEndDate < e.target.value) setNewEndDate(e.target.value) }}
                              className="h-8 text-xs" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-slate-500 font-semibold mb-1 block">End Date <span className="font-normal text-slate-400">(same = 1 day)</span></Label>
                            <Input type="date" value={newEndDate} min={newStartDate}
                              onChange={e => setNewEndDate(e.target.value)} className="h-8 text-xs" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-slate-500 font-semibold mb-1 block">Daily Start ({tz.split("/")[1]})</Label>
                            <Input type="time" value={newStart} onChange={e => setNewStart(e.target.value)} className="h-8 text-xs" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-slate-500 font-semibold mb-1 block">Daily End ({tz.split("/")[1]})</Label>
                            <Input type="time" value={newEnd} onChange={e => setNewEnd(e.target.value)} className="h-8 text-xs" />
                          </div>
                        </div>
                        {(() => {
                          const previews  = generateSlotPreviews(newStart, newEnd, schedule.slot_duration_min, schedule.buffer_min)
                          const dateCount = expandDateRange(newStartDate, newEndDate).length
                          const multiDay  = dateCount > 1
                          return previews.length > 0 ? (
                            <div>
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                {multiDay ? `${previews.length} slots/day × ${dateCount} days = ${previews.length * dateCount} total` : `${previews.length} slots`}
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {previews.map(p => <span key={p} className="text-[10px] bg-[#1B4F8A]/8 text-[#1B4F8A] border border-[#1B4F8A]/20 px-2 py-0.5 rounded-full font-medium">{p}</span>)}
                              </div>
                            </div>
                          ) : null
                        })()}
                      </>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-slate-500 font-semibold mb-1 block">Date</Label>
                          <Input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} className="h-8 text-xs" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-500 font-semibold mb-1 block">Slot Start ({tz.split("/")[1]})</Label>
                          <Input type="time" value={newStart} onChange={e => setNewStart(e.target.value)} className="h-8 text-xs" />
                        </div>
                        {newStart && (
                          <div className="col-span-2">
                            <p className="text-[10px] text-slate-400 bg-slate-100 rounded-lg px-3 py-2">
                              One slot: <strong>{newStart}</strong> → <strong>
                                {(() => { const [h,m] = newStart.split(":").map(Number); const e = h*60+m+schedule.slot_duration_min; return `${String(Math.floor(e/60)).padStart(2,"0")}:${String(e%60).padStart(2,"0")}` })()}
                              </strong> ({schedule.slot_duration_min} min)
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <Button className="bg-[#1B4F8A] hover:bg-[#1B4F8A]/90 gap-2 h-8 text-xs px-4"
                        onClick={handleAddSlots} disabled={addingSlots}>
                        {addingSlots ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</> : <><Plus className="h-3.5 w-3.5" /> Generate</>}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowAddDay(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
              </>
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
              <div className="space-y-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Edit Settings</p>

                {/* Basic info */}
                <div className="space-y-3">
                  <div><Label className="text-xs mb-1 block font-semibold text-slate-600">Name</Label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} /></div>
                  <div><Label className="text-xs mb-1 block font-semibold text-slate-600">Location</Label>
                    <Input value={editLoc} onChange={e => setEditLoc(e.target.value)} placeholder="e.g. ICS HQ — Room 4A" /></div>
                  <div><Label className="text-xs mb-1 block font-semibold text-slate-600">Description</Label>
                    <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Shown to candidates on the booking page" /></div>
                </div>

                {/* Format & Timezone */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1 block font-semibold text-slate-600">Interview Format</Label>
                    <select value={editFormat} onChange={e => setEditFormat(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-[#1B4F8A]">
                      {["in_person","online","hybrid"].map(f => <option key={f} value={f}>{f.replace("_"," ")}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block font-semibold text-slate-600">Timezone</Label>
                    <select value={editTimezone} onChange={e => setEditTimezone(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-[#1B4F8A]">
                      {[
                        { label: "Dubai / Abu Dhabi (UTC+4)",  value: "Asia/Dubai"      },
                        { label: "Riyadh / KSA (UTC+3)",       value: "Asia/Riyadh"     },
                        { label: "Algeria / France (UTC+1)",   value: "Africa/Algiers"  },
                        { label: "London (UTC+0)",             value: "Europe/London"   },
                        { label: "Karachi (UTC+5)",            value: "Asia/Karachi"    },
                        { label: "Mumbai (UTC+5:30)",          value: "Asia/Kolkata"    },
                        { label: "Manila (UTC+8)",             value: "Asia/Manila"     },
                        { label: "Cairo (UTC+2)",              value: "Africa/Cairo"    },
                        { label: "Amman (UTC+3)",              value: "Asia/Amman"      },
                      ].map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Slot settings */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs mb-1 block font-semibold text-slate-600">Slot Duration</Label>
                    <select value={editDuration} onChange={e => setEditDuration(Number(e.target.value))}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-[#1B4F8A]">
                      {[15,20,30,45,60,90].map(d => <option key={d} value={d}>{d} min</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block font-semibold text-slate-600">Buffer</Label>
                    <select value={editBuffer} onChange={e => setEditBuffer(Number(e.target.value))}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-[#1B4F8A]">
                      {[0,5,10,15,20,30].map(b => <option key={b} value={b}>{b === 0 ? "None" : `${b} min`}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block font-semibold text-slate-600">Per Slot</Label>
                    <select value={editCapacity} onChange={e => setEditCapacity(Number(e.target.value))}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-[#1B4F8A]">
                      {[1,2,3,4,5,10].map(n => <option key={n} value={n}>{n === 1 ? "1 — One-on-one" : `${n} candidates`}</option>)}
                    </select>
                  </div>
                </div>

                <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠️ Changing duration, buffer or timezone only affects <strong>new slots</strong> added after saving. Existing slots are not modified.
                </p>

                <div className="flex items-center gap-2">
                  <Button className="bg-[#1B4F8A] gap-2" onClick={saveEdit} disabled={savingEdit}>
                    {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save Changes
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* ── QR Card Modal ── */}
    {showQrModal && schedule && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-6"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={e => { if (e.target === e.currentTarget) setShowQrModal(false) }}
      >
        <div className="relative bg-transparent flex flex-col items-center gap-4 max-w-full">
          {/* Top toolbar */}
          <div className="flex gap-3 items-center self-stretch justify-between">
            <p className="text-white font-semibold text-sm">QR Invite Card</p>
            <div className="flex gap-2">
              <Button
                onClick={downloadQrCard}
                disabled={downloading}
                className="gap-2 bg-white text-[#1B4F8A] hover:bg-blue-50 border border-white/20 shadow-lg"
              >
                {downloading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Download className="h-4 w-4" />
                }
                {downloading ? "Downloading…" : "Download PDF"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowQrModal(false)}
                className="gap-2 border-white/30 text-white bg-white/10 hover:bg-white/20"
              >
                <X className="h-4 w-4" /> Close
              </Button>
            </div>
          </div>

          {/* Card preview */}
          <div className="overflow-hidden rounded-xl shadow-2xl" style={{ maxWidth: "90vw", overflowX: "auto" }}>
            <QRCardPrint
              ref={qrCardRef}
              schedule={schedule}
              firstSlot={slots.length > 0 ? slots.reduce((a: any, b: any) => a.start_utc < b.start_utc ? a : b) : null}
              lastSlot={slots.length > 0 ? slots.reduce((a: any, b: any) => a.end_utc > b.end_utc ? a : b) : null}
              bookingUrl={bookingUrl()}
            />
          </div>
        </div>
      </div>
    )}
    </>
  )
}
