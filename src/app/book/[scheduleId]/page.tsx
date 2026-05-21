"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { MapPin, Clock, Calendar, Loader2, ChevronRight, Globe, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const FORMAT_LABEL: Record<string, string> = { in_person: "In-Person", online: "Online", hybrid: "Hybrid" }

function groupSlotsByDate(slots: any[], tz: string) {
  const map: Record<string, any[]> = {}
  for (const s of slots) {
    const d = new Date(s.start_utc).toLocaleDateString("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" })
    if (!map[d]) map[d] = []
    map[d].push(s)
  }
  return map
}

function fmtTime(utc: string, tz: string) {
  return new Date(utc).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
}

function fmtTimeAdmin(utc: string, adminTz: string) {
  return new Date(utc).toLocaleTimeString("en-GB", { timeZone: adminTz, hour: "2-digit", minute: "2-digit", hour12: false })
}

export default function BookingPage() {
  const { scheduleId } = useParams() as { scheduleId: string }
  const router         = useRouter()

  const [schedule,    setSchedule]    = useState<any>(null)
  const [slots,       setSlots]       = useState<any[]>([])
  const [candidates,  setCandidates]  = useState<any[]>([])
  const [tracks,      setTracks]      = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)

  // Detected timezone
  const [userTz,      setUserTz]      = useState<string>("")

  // Form state
  const [selectedSlot,   setSelectedSlot]   = useState<string | null>(null)
  const [candidateId,    setCandidateId]     = useState("")
  const [candidateName,  setCandidateName]   = useState("")
  const [candidateEmail, setCandidateEmail]  = useState("")
  const [candidatePhone, setCandidatePhone]  = useState("")
  const [trackId,        setTrackId]         = useState("")
  const [notes,          setNotes]           = useState("")
  const [submitting,     setSubmitting]      = useState(false)
  const [submitError,    setSubmitError]     = useState<string | null>(null)

  // Step: "slot" | "details" | "confirm"
  const [step, setStep] = useState<"slot"|"details">("slot")

  useEffect(() => {
    // Detect browser timezone
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    setUserTz(tz)
  }, [])

  useEffect(() => {
    Promise.all([
      fetch(`/api/book/${scheduleId}`).then(r => r.json()),
      fetch(`/api/book/${scheduleId}/slots`).then(r => r.json()),
    ]).then(([sch, slt]) => {
      if (sch.error) { setError(sch.error); setLoading(false); return }
      setSchedule(sch)
      setSlots(Array.isArray(slt) ? slt : [])
      setLoading(false)

      // For system mode — load candidates
      if (sch.booking_mode === "system") {
        const p = new URLSearchParams({ source_type: sch.source_type })
        if (sch.group_id)  p.set("group_id", sch.group_id)
        if (sch.track_id)  p.set("track_id", sch.track_id)
        fetch(`/api/interview/schedule/candidates?${p}`)
          .then(r => r.json())
          .then(d => setCandidates(Array.isArray(d) ? d : []))
      }
    }).catch(() => { setError("Failed to load schedule"); setLoading(false) })

    // Load tracks for role selector
    fetch("/api/interview/role-tracks").then(r => r.json()).then(d => setTracks(Array.isArray(d) ? d : []))
  }, [scheduleId])

  // Auto-fill from candidate selection
  function handleCandidateSelect(id: string) {
    setCandidateId(id)
    const c = candidates.find((c: any) => c.id === id)
    if (c) {
      setCandidateName(c.full_name)
      setTrackId(c.track_id ?? "")
    }
  }

  async function handleConfirm() {
    if (!selectedSlot)    { setSubmitError("Please select a slot"); return }
    if (!candidateName)   { setSubmitError("Name is required"); return }
    if (!candidateEmail)  { setSubmitError("Email is required"); return }

    setSubmitting(true)
    setSubmitError(null)

    const res = await fetch(`/api/book/${scheduleId}/confirm`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        slot_id:            selectedSlot,
        candidate_id:       candidateId || null,
        candidate_name:     candidateName,
        candidate_email:    candidateEmail,
        candidate_phone:    candidatePhone || null,
        candidate_track_id: trackId || null,
        notes:              notes || null,
      }),
    })
    const data = await res.json()
    setSubmitting(false)

    if (!res.ok) { setSubmitError(data.error ?? "Booking failed"); return }
    router.push(`/book/${scheduleId}/confirmed?code=${data.confirmation_code}&slot=${encodeURIComponent(data.slot.start_utc)}`)
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1B4F8A] mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Loading schedule…</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center max-w-sm px-4">
        <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
        <h2 className="font-bold text-slate-700 mb-1">Schedule Not Available</h2>
        <p className="text-slate-400 text-sm">{error}</p>
      </div>
    </div>
  )

  const adminTz     = schedule.timezone ?? "Asia/Dubai"
  const tzLabel     = userTz ? userTz.replace("_", " ").replace("/", " / ") : adminTz
  const sameTimezone = userTz === adminTz

  const availableSlots  = slots.filter(s => s.availability === "available")
  const selectedSlotObj = slots.find(s => s.slot_id === selectedSlot)
  const slotsByDate     = groupSlotsByDate(availableSlots, userTz || adminTz)

  return (
    <div className="max-w-lg mx-auto px-4 py-8">

      {/* Header */}
      <div className="text-center mb-6">
        <Image src="/logo/logo-dark-blue.png" alt="ICS Aviation" width={100} height={28} className="object-contain mx-auto mb-4" />
        <h1 className="text-xl font-extrabold text-[#1B4F8A] tracking-tight">{schedule.name}</h1>
        {schedule.description && <p className="text-sm text-slate-500 mt-1">{schedule.description}</p>}
      </div>

      {/* Info bar */}
      <div className="flex items-center justify-center gap-4 text-xs text-slate-500 flex-wrap mb-6">
        {schedule.location && (
          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{schedule.location}</span>
        )}
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{schedule.slot_duration_min} min</span>
        <span className="flex items-center gap-1">
          <Globe className="h-3.5 w-3.5" />
          {FORMAT_LABEL[schedule.interview_format]}
        </span>
      </div>

      {/* Timezone note */}
      {userTz && !sameTimezone && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-[#1B4F8A] text-center mb-4 font-medium">
          🌍 Showing times in <strong>{tzLabel}</strong> (your local time)
        </div>
      )}

      {/* Step 1 — Pick a slot */}
      {step === "slot" && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60">
              <h2 className="font-bold text-slate-700 text-sm">Select Your Slot</h2>
              <p className="text-xs text-slate-400 mt-0.5">{availableSlots.length} slot{availableSlots.length !== 1 ? "s" : ""} available</p>
            </div>

            {availableSlots.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No slots available</p>
                <p className="text-xs mt-1">All slots are currently booked or closed.</p>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {Object.entries(slotsByDate).map(([date, daySlots]) => (
                  <div key={date}>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{date}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {daySlots.map((s: any) => {
                        const myTime    = fmtTime(s.start_utc, userTz || adminTz)
                        const adminTime = fmtTime(s.start_utc, adminTz)
                        const isSelected = selectedSlot === s.slot_id
                        return (
                          <button key={s.slot_id}
                            onClick={() => setSelectedSlot(s.slot_id)}
                            className={cn("flex flex-col items-center justify-center py-3 px-4 rounded-xl border-2 transition-all text-left",
                              isSelected
                                ? "border-[#1B4F8A] bg-[#1B4F8A] text-white"
                                : "border-slate-200 hover:border-[#1B4F8A]/40 bg-white hover:bg-[#1B4F8A]/5")}>
                            <span className={cn("text-base font-black", isSelected ? "text-white" : "text-[#1B4F8A]")}>{myTime}</span>
                            {!sameTimezone && (
                              <span className={cn("text-[10px] mt-0.5", isSelected ? "text-white/70" : "text-slate-400")}>
                                {adminTime} {adminTz.split("/")[1]}
                              </span>
                            )}
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
            className="w-full bg-[#1B4F8A] hover:bg-[#1B4F8A]/90 gap-2 h-12 text-base font-bold"
            disabled={!selectedSlot}
            onClick={() => setStep("details")}>
            Continue <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Step 2 — Your Details */}
      {step === "details" && (
        <div className="space-y-4">
          {/* Selected slot summary */}
          {selectedSlotObj && (
            <div className="flex items-center justify-between bg-[#1B4F8A]/8 border border-[#1B4F8A]/20 rounded-xl px-4 py-3">
              <div>
                <p className="text-xs text-[#1B4F8A]/70 font-semibold uppercase tracking-wider">Your slot</p>
                <p className="text-[#1B4F8A] font-black text-sm">
                  {new Date(selectedSlotObj.start_utc).toLocaleDateString("en-GB", { timeZone: userTz || adminTz, weekday: "short", day: "numeric", month: "short" })}
                  {" · "}
                  {fmtTime(selectedSlotObj.start_utc, userTz || adminTz)}
                  {!sameTimezone && <span className="text-[#1B4F8A]/60 text-xs ml-1">({fmtTime(selectedSlotObj.start_utc, adminTz)} UAE)</span>}
                </p>
              </div>
              <button onClick={() => setStep("slot")} className="text-xs text-[#1B4F8A] font-semibold underline underline-offset-2">Change</button>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60">
              <h2 className="font-bold text-slate-700 text-sm">Your Details</h2>
            </div>
            <div className="p-5 space-y-4">

              {/* System mode: name dropdown */}
              {schedule.booking_mode === "system" && candidates.length > 0 && (
                <div>
                  <Label className="text-xs font-semibold text-slate-600 mb-1 block">Select Your Name *</Label>
                  <select value={candidateId} onChange={e => handleCandidateSelect(e.target.value)}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30">
                    <option value="">Choose your name…</option>
                    {candidates.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.full_name}{c.role_tracks?.name ? ` — ${c.role_tracks.name}` : ""}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Free mode or fallback */}
              {(schedule.booking_mode === "free" || !candidateId) && (
                <div>
                  <Label className="text-xs font-semibold text-slate-600 mb-1 block">Full Name *</Label>
                  <Input placeholder="Your full name" value={candidateName} onChange={e => setCandidateName(e.target.value)} className="rounded-xl" />
                </div>
              )}

              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Email Address *</Label>
                <Input type="email" placeholder="your@email.com" value={candidateEmail} onChange={e => setCandidateEmail(e.target.value)} className="rounded-xl" />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Phone <span className="font-normal text-slate-400">(optional)</span></Label>
                <Input type="tel" placeholder="+971 50 000 0000" value={candidatePhone} onChange={e => setCandidatePhone(e.target.value)} className="rounded-xl" />
              </div>

              {/* Role selector */}
              {(schedule.show_role_selector && schedule.booking_mode === "free") && (
                <div>
                  <Label className="text-xs font-semibold text-slate-600 mb-1 block">Role / Track</Label>
                  <select value={trackId} onChange={e => setTrackId(e.target.value)}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30">
                    <option value="">Select your role…</option>
                    {tracks.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Notes <span className="font-normal text-slate-400">(optional)</span></Label>
                <Input placeholder="Any notes for the interviewer…" value={notes} onChange={e => setNotes(e.target.value)} className="rounded-xl" />
              </div>
            </div>
          </div>

          {submitError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" /> {submitError}
            </div>
          )}

          <Button className="w-full bg-[#1B4F8A] hover:bg-[#1B4F8A]/90 h-12 text-base font-bold gap-2"
            disabled={submitting} onClick={handleConfirm}>
            {submitting ? <><Loader2 className="h-5 w-5 animate-spin" /> Confirming…</> : <><CheckCircle2 className="h-5 w-5" /> Confirm Booking</>}
          </Button>
          <p className="text-center text-xs text-slate-400">You will receive a confirmation code after booking</p>
        </div>
      )}
    </div>
  )
}
