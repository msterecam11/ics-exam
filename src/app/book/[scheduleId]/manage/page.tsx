"use client"

import { useEffect, useState, Suspense } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Image from "next/image"
import {
  Calendar, Clock, Loader2, CheckCircle2, AlertCircle,
  XCircle, ArrowLeftRight, ChevronRight, ArrowLeft, MapPin, Globe,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

function fmtDate(utc: string, tz: string) {
  return new Date(utc).toLocaleDateString("en-GB", {
    timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
}
function fmtTime(utc: string, tz: string) {
  return new Date(utc).toLocaleTimeString("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  })
}
function groupSlotsByDate(slots: any[], tz: string) {
  const map: Record<string, any[]> = {}
  for (const s of slots) {
    const d = fmtDate(s.start_utc, tz)
    if (!map[d]) map[d] = []
    map[d].push(s)
  }
  return map
}

type View = "lookup" | "booking" | "reschedule" | "cancelled" | "done-reschedule" | "done-cancel"

function ManageContent() {
  const { scheduleId } = useParams() as { scheduleId: string }
  const searchParams   = useSearchParams()

  const [view,           setView]          = useState<View>("lookup")
  const [codeInput,      setCodeInput]     = useState(searchParams.get("code") ?? "")
  const [booking,        setBooking]       = useState<any>(null)
  const [schedule,       setSchedule]      = useState<any>(null)
  const [availableSlots, setAvailableSlots] = useState<any[]>([])
  const [selectedSlot,   setSelectedSlot]  = useState<string | null>(null)
  const [loading,        setLoading]       = useState(false)
  const [confirming,     setConfirming]    = useState(false)
  const [error,          setError]         = useState<string | null>(null)
  const [showCancel,     setShowCancel]    = useState(false)
  const [newSlot,        setNewSlot]       = useState<any>(null)

  const tz = schedule?.timezone ?? "Asia/Dubai"

  // Auto-lookup if code is in URL
  useEffect(() => {
    const code = searchParams.get("code")
    if (code) fetchBooking(code)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchBooking(code: string) {
    if (!code.trim()) return
    setLoading(true)
    setError(null)
    const res  = await fetch(`/api/book/${scheduleId}/manage?code=${encodeURIComponent(code.trim().toUpperCase())}`)
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      if (res.status === 410) { setView("cancelled"); return }
      setError(data.error ?? "Booking not found")
      return
    }

    setBooking(data.booking)
    setSchedule(data.schedule)
    setAvailableSlots(data.availableSlots)
    setView("booking")
  }

  async function handleReschedule() {
    if (!selectedSlot) return
    setConfirming(true)
    const res  = await fetch(`/api/book/${scheduleId}/manage`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ confirmation_code: booking.confirmation_code, new_slot_id: selectedSlot }),
    })
    const data = await res.json()
    setConfirming(false)

    if (!res.ok) { toast.error(data.error ?? "Reschedule failed"); return }

    const found = availableSlots.find(s => s.slot_id === selectedSlot)
    setNewSlot(found)
    setView("done-reschedule")
  }

  async function handleCancel() {
    setConfirming(true)
    const res  = await fetch(`/api/book/${scheduleId}/manage`, {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ confirmation_code: booking.confirmation_code }),
    })
    const data = await res.json()
    setConfirming(false)

    if (!res.ok) { toast.error(data.error ?? "Cancellation failed"); return }
    setView("done-cancel")
  }

  // ── Loading spinner ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1B4F8A] mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Looking up your booking…</p>
      </div>
    </div>
  )

  // ── Cancelled state ──────────────────────────────────────────────────────────
  if (view === "cancelled") return (
    <div className="max-w-md mx-auto px-4 py-16 text-center space-y-5">
      <Image src="/logo/logo-dark-blue.png" alt="ICS Aviation" width={100} height={28} className="object-contain mx-auto" />
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
        <XCircle className="h-8 w-8 text-red-500" />
      </div>
      <h2 className="text-xl font-extrabold text-slate-700">Booking Cancelled</h2>
      <p className="text-slate-500 text-sm">This booking has already been cancelled and can no longer be managed.</p>
      <p className="text-[10px] text-slate-300 uppercase tracking-widest">ICS Aviation · Integrated Consulting Services</p>
    </div>
  )

  // ── Done: rescheduled ────────────────────────────────────────────────────────
  if (view === "done-reschedule") return (
    <div className="max-w-md mx-auto px-4 py-16 text-center space-y-5">
      <Image src="/logo/logo-dark-blue.png" alt="ICS Aviation" width={100} height={28} className="object-contain mx-auto" />
      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
      </div>
      <div>
        <h2 className="text-xl font-extrabold text-[#1B4F8A]">Booking Rescheduled!</h2>
        <p className="text-slate-500 text-sm mt-1">A new confirmation email has been sent to you.</p>
      </div>
      {newSlot && (
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 space-y-3 text-left shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">New Slot</p>
          <div className="flex items-center gap-3 text-slate-700">
            <Calendar className="h-4 w-4 text-[#1B4F8A] shrink-0" />
            <span className="text-sm font-semibold">{fmtDate(newSlot.start_utc, tz)}</span>
          </div>
          <div className="flex items-center gap-3 text-slate-700">
            <Clock className="h-4 w-4 text-[#1B4F8A] shrink-0" />
            <span className="text-sm font-semibold">{fmtTime(newSlot.start_utc, tz)} – {fmtTime(newSlot.end_utc, tz)}</span>
          </div>
        </div>
      )}
      <p className="text-[10px] text-slate-300 uppercase tracking-widest">ICS Aviation · Integrated Consulting Services</p>
    </div>
  )

  // ── Done: cancelled ──────────────────────────────────────────────────────────
  if (view === "done-cancel") return (
    <div className="max-w-md mx-auto px-4 py-16 text-center space-y-5">
      <Image src="/logo/logo-dark-blue.png" alt="ICS Aviation" width={100} height={28} className="object-contain mx-auto" />
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
        <XCircle className="h-8 w-8 text-slate-400" />
      </div>
      <div>
        <h2 className="text-xl font-extrabold text-slate-700">Booking Cancelled</h2>
        <p className="text-slate-500 text-sm mt-1">Your booking has been cancelled and the slot has been released.</p>
      </div>
      <p className="text-[10px] text-slate-300 uppercase tracking-widest">ICS Aviation · Integrated Consulting Services</p>
    </div>
  )

  // ── Code lookup form ─────────────────────────────────────────────────────────
  if (view === "lookup") return (
    <div className="max-w-md mx-auto px-4 py-16 space-y-6">
      <div className="text-center">
        <Image src="/logo/logo-dark-blue.png" alt="ICS Aviation" width={100} height={28} className="object-contain mx-auto mb-5" />
        <h1 className="text-xl font-extrabold text-[#1B4F8A]">Manage Your Booking</h1>
        <p className="text-sm text-slate-500 mt-1">Enter your confirmation code to reschedule or cancel</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1 block">Confirmation Code</label>
          <Input
            placeholder="e.g. ABC-1234"
            value={codeInput}
            onChange={e => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Enter") fetchBooking(codeInput) }}
            className="rounded-xl font-mono text-center text-lg tracking-widest uppercase"
          />
        </div>
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        <Button className="w-full bg-[#1B4F8A] hover:bg-[#1B4F8A]/90 h-11 font-bold gap-2"
          onClick={() => fetchBooking(codeInput)} disabled={!codeInput.trim()}>
          Find My Booking <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )

  // ── Reschedule: slot picker ──────────────────────────────────────────────────
  if (view === "reschedule") {
    const slotsByDate = groupSlotsByDate(availableSlots, tz)
    return (
      <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("booking")} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <ArrowLeft className="h-5 w-5 text-slate-500" />
          </button>
          <div>
            <h1 className="text-lg font-extrabold text-[#1B4F8A]">Choose a New Slot</h1>
            <p className="text-xs text-slate-400">{availableSlots.length} slot{availableSlots.length !== 1 ? "s" : ""} available</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          {availableSlots.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No other slots available</p>
              <p className="text-xs mt-1">All other slots are fully booked.</p>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {Object.entries(slotsByDate).map(([date, daySlots]) => (
                <div key={date}>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{date}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {daySlots.map((s: any) => {
                      const isSelected = selectedSlot === s.slot_id
                      return (
                        <button key={s.slot_id}
                          onClick={() => setSelectedSlot(s.slot_id)}
                          className={cn("flex flex-col items-center justify-center py-3 px-4 rounded-xl border-2 transition-all",
                            isSelected
                              ? "border-[#1B4F8A] bg-[#1B4F8A] text-white"
                              : "border-slate-200 hover:border-[#1B4F8A]/40 bg-white hover:bg-[#1B4F8A]/5")}>
                          <span className={cn("text-base font-black", isSelected ? "text-white" : "text-[#1B4F8A]")}>
                            {fmtTime(s.start_utc, tz)}
                          </span>
                          <span className={cn("text-[10px]", isSelected ? "text-white/70" : "text-slate-400")}>
                            → {fmtTime(s.end_utc, tz)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button
          className="w-full bg-[#1B4F8A] hover:bg-[#1B4F8A]/90 h-12 font-bold gap-2"
          disabled={!selectedSlot || confirming}
          onClick={handleReschedule}>
          {confirming
            ? <><Loader2 className="h-5 w-5 animate-spin" /> Rescheduling…</>
            : <><CheckCircle2 className="h-5 w-5" /> Confirm New Slot</>}
        </Button>
      </div>
    )
  }

  // ── Booking view ─────────────────────────────────────────────────────────────
  const slot = booking?.schedule_slots
  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-5">
      <div className="text-center">
        <Image src="/logo/logo-dark-blue.png" alt="ICS Aviation" width={100} height={28} className="object-contain mx-auto mb-4" />
        <h1 className="text-xl font-extrabold text-[#1B4F8A]">Your Booking</h1>
        {schedule?.name && <p className="text-sm text-slate-500 mt-1">{schedule.name}</p>}
      </div>

      {/* Booking details */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Interview Details</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-3 text-slate-700">
            <Calendar className="h-4 w-4 text-[#1B4F8A] shrink-0" />
            <span className="text-sm font-semibold">{slot ? fmtDate(slot.start_utc, tz) : "—"}</span>
          </div>
          <div className="flex items-center gap-3 text-slate-700">
            <Clock className="h-4 w-4 text-[#1B4F8A] shrink-0" />
            <span className="text-sm font-semibold">
              {slot ? `${fmtTime(slot.start_utc, tz)} – ${fmtTime(slot.end_utc, tz)}` : "—"}
              <span className="text-slate-400 font-normal text-xs ml-1">({tz.split("/").pop()?.replace(/_/g," ")})</span>
            </span>
          </div>
          {schedule?.location && (
            <div className="flex items-center gap-3 text-slate-700">
              <MapPin className="h-4 w-4 text-[#1B4F8A] shrink-0" />
              <span className="text-sm">{schedule.location}</span>
            </div>
          )}
          {booking?.ms_teams_url && (
            <div className="flex items-center gap-3 text-slate-700">
              <Globe className="h-4 w-4 text-[#1B4F8A] shrink-0" />
              <a href={booking.ms_teams_url} target="_blank" rel="noopener noreferrer"
                className="text-sm text-[#1B4F8A] font-semibold underline underline-offset-2">
                Join Teams Meeting
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation code */}
      <div className="bg-[#1B4F8A]/8 border border-[#1B4F8A]/20 rounded-2xl px-5 py-4 text-center">
        <p className="text-xs text-[#1B4F8A]/70 uppercase tracking-widest font-semibold mb-1">Confirmation Code</p>
        <p className="text-2xl font-black text-[#1B4F8A] font-mono tracking-widest">{booking?.confirmation_code}</p>
      </div>

      {/* Actions */}
      {!showCancel ? (
        <div className="space-y-3">
          {availableSlots.length > 0 ? (
            <Button className="w-full bg-[#1B4F8A] hover:bg-[#1B4F8A]/90 h-12 font-bold gap-2"
              onClick={() => setView("reschedule")}>
              <ArrowLeftRight className="h-4 w-4" /> Reschedule My Slot
            </Button>
          ) : (
            <div className="text-center text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              No other slots available for rescheduling
            </div>
          )}
          <Button variant="outline" className="w-full h-11 font-semibold text-red-500 border-red-200 hover:bg-red-50 hover:border-red-300 gap-2"
            onClick={() => setShowCancel(true)}>
            <XCircle className="h-4 w-4" /> Cancel My Booking
          </Button>
        </div>
      ) : (
        // Cancel confirmation
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-700">Cancel your booking?</p>
              <p className="text-xs text-red-500 mt-0.5">This action cannot be undone. Your slot will be released.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-10" onClick={() => setShowCancel(false)} disabled={confirming}>
              Keep It
            </Button>
            <Button className="flex-1 h-10 bg-red-500 hover:bg-red-600 text-white font-bold gap-1.5"
              onClick={handleCancel} disabled={confirming}>
              {confirming ? <><Loader2 className="h-4 w-4 animate-spin" /> Cancelling…</> : "Yes, Cancel"}
            </Button>
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-300 uppercase tracking-widest text-center">
        ICS Aviation · Integrated Consulting Services
      </p>
    </div>
  )
}

export default function ManagePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#1B4F8A]" />
      </div>
    }>
      <ManageContent />
    </Suspense>
  )
}
