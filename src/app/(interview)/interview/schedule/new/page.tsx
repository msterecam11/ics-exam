"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Loader2, Clock, Users, Globe, Plus, Trash2, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ── Defined outside component to prevent remounting on each render ────────────
function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50/60">
        <span className="w-6 h-6 rounded-full bg-[#1B4F8A] text-white text-xs font-bold flex items-center justify-center shrink-0">{n}</span>
        <h2 className="font-bold text-slate-800">{title}</h2>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  )
}

const TIMEZONES = [
  { label: "Gulf Standard Time — UTC+4 (Dubai/Abu Dhabi)", value: "Asia/Dubai" },
  { label: "Arabia Standard Time — UTC+3 (Riyadh/KSA)", value: "Asia/Riyadh" },
  { label: "Central European Time — UTC+1 (Algeria/France)", value: "Africa/Algiers" },
  { label: "Greenwich Mean Time — UTC+0 (London)", value: "Europe/London" },
  { label: "Pakistan Standard Time — UTC+5 (Karachi)", value: "Asia/Karachi" },
  { label: "India Standard Time — UTC+5:30 (Mumbai)", value: "Asia/Kolkata" },
  { label: "Philippine Time — UTC+8 (Manila)", value: "Asia/Manila" },
  { label: "Eastern European Time — UTC+2 (Cairo)", value: "Africa/Cairo" },
  { label: "Jordan Time — UTC+3 (Amman)", value: "Asia/Amman" },
]

const DURATIONS = [15, 20, 30, 45, 60, 90]
const BUFFERS   = [0, 5, 10, 15, 20, 30]

type DayRow = { date: string; start: string; end: string }

function generateSlotPreviews(start: string, end: string, durMin: number, bufMin: number): string[] {
  if (!start || !end || !durMin) return []
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  const startMins = sh * 60 + sm
  const endMins   = eh * 60 + em
  if (endMins <= startMins) return []
  const step   = durMin + bufMin
  const slots: string[] = []
  let cur = startMins
  while (cur + durMin <= endMins) {
    const s = `${String(Math.floor(cur / 60)).padStart(2,"0")}:${String(cur % 60).padStart(2,"0")}`
    const e = cur + durMin
    const es = `${String(Math.floor(e / 60)).padStart(2,"0")}:${String(e % 60).padStart(2,"0")}`
    slots.push(`${s}→${es}`)
    cur += step
  }
  return slots
}

export default function NewSchedulePage() {
  const router = useRouter()

  // Basic info
  const [name,        setName]        = useState("")
  const [description, setDescription] = useState("")
  const [location,    setLocation]    = useState("")

  // Booking mode
  const [bookingMode,  setBookingMode]  = useState<"system"|"free">("system")
  const [sourceType,   setSourceType]   = useState<"group"|"group_role"|"role">("group")
  const [groupId,      setGroupId]      = useState("")
  const [trackId,      setTrackId]      = useState("")
  const [showRoleSel,  setShowRoleSel]  = useState(false)

  // Format
  const [format,   setFormat]   = useState<"in_person"|"online"|"hybrid">("in_person")
  const [timezone, setTimezone] = useState("Asia/Dubai")

  // Slot settings
  const [durMin, setDurMin] = useState(45)
  const [bufMin, setBufMin] = useState(15)
  const [capSlot, setCapSlot] = useState(1)

  // Day rows
  const [days, setDays] = useState<DayRow[]>([{ date: "", start: "09:00", end: "16:00" }])

  // Data
  const [groups, setGroups] = useState<any[]>([])
  const [tracks, setTracks] = useState<any[]>([])
  const [candidateCount, setCandidateCount] = useState<number | null>(null)

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/interview/groups").then(r => r.json()).then(d => setGroups(Array.isArray(d) ? d : []))
    fetch("/api/interview/role-tracks").then(r => r.json()).then(d => setTracks(Array.isArray(d) ? d : []))
  }, [])

  // Preview candidate count
  useEffect(() => {
    if (bookingMode !== "system") { setCandidateCount(null); return }
    const params = new URLSearchParams({ source_type: sourceType })
    if (sourceType === "group" && groupId)           params.set("group_id", groupId)
    if (sourceType === "group_role" && groupId)      params.set("group_id", groupId)
    if (sourceType === "group_role" && trackId)      params.set("track_id", trackId)
    if (sourceType === "role" && trackId)            params.set("track_id", trackId)
    const ready = sourceType === "group" ? !!groupId
                : sourceType === "group_role" ? !!(groupId && trackId)
                : !!trackId
    if (!ready) { setCandidateCount(null); return }
    fetch(`/api/interview/schedule/candidates?${params}`)
      .then(r => r.json())
      .then(d => setCandidateCount(Array.isArray(d) ? d.length : null))
      .catch(() => setCandidateCount(null))
  }, [bookingMode, sourceType, groupId, trackId])

  function addDay() { setDays(prev => [...prev, { date: "", start: "09:00", end: "16:00" }]) }
  function removeDay(i: number) { setDays(prev => prev.filter((_, idx) => idx !== i)) }
  function updateDay(i: number, field: keyof DayRow, val: string) {
    setDays(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: val } : d))
  }

  async function handleSubmit() {
    if (!name.trim()) { toast.error("Schedule name is required"); return }
    const validDays = days.filter(d => d.date && d.start && d.end)
    if (validDays.length === 0) { toast.error("Add at least one day with slots"); return }

    setSaving(true)

    // 1 — Create schedule
    const res = await fetch("/api/interview/schedule", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        name, description, location,
        booking_mode:      bookingMode,
        source_type:       bookingMode === "system" ? sourceType : null,
        group_id:          bookingMode === "system" && (sourceType === "group" || sourceType === "group_role") ? groupId || null : null,
        track_id:          bookingMode === "system" && (sourceType === "group_role" || sourceType === "role") ? trackId || null : null,
        show_role_selector: bookingMode === "free" ? showRoleSel : false,
        interview_format:  format,
        timezone,
        slot_duration_min: durMin,
        buffer_min:        bufMin,
        capacity_per_slot: capSlot,
      }),
    })
    const schedule = await res.json()
    if (!res.ok) { toast.error(schedule.error ?? "Failed to create schedule"); setSaving(false); return }

    // 2 — Generate slots for each day
    for (const day of validDays) {
      await fetch(`/api/interview/schedule/${schedule.id}/slots`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ date: day.date, start_time: day.start, end_time: day.end }),
      })
    }

    setSaving(false)
    toast.success("Schedule created!")
    router.push(`/interview/schedule/${schedule.id}`)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/interview/schedule">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-xl font-extrabold text-[#1B4F8A]">New Schedule</h1>
          <p className="text-xs text-slate-400">Set up an interview schedule and generate a booking link</p>
        </div>
      </div>

      {/* ① Basic Info */}
      <Section n="1" title="Basic Info">
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Schedule Name *</Label>
            <Input placeholder="e.g. Batch 3 — First Officer Interviews" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Description <span className="font-normal text-slate-400">(shown to candidate)</span></Label>
            <Input placeholder="e.g. Please arrive 10 minutes before your slot." value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Location</Label>
            <Input placeholder="e.g. ICS Aviation HQ — Room 4A" value={location} onChange={e => setLocation(e.target.value)} />
          </div>
        </div>
      </Section>

      {/* ② Booking Mode */}
      <Section n="2" title="Booking Mode">
        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { val: "system", icon: Users,  label: "System-Connected", sub: "Pull candidates from your system" },
            { val: "free",   icon: Globe,  label: "Free / Open",      sub: "Anyone with the link can book"   },
          ].map(({ val, icon: Icon, label, sub }) => (
            <button key={val} onClick={() => setBookingMode(val as any)}
              className={cn("flex flex-col items-start gap-1 p-4 rounded-xl border-2 text-left transition-all",
                bookingMode === val ? "border-[#1B4F8A] bg-[#1B4F8A]/5" : "border-slate-200 hover:border-slate-300")}>
              <div className="flex items-center gap-2">
                <Icon className={cn("h-4 w-4", bookingMode === val ? "text-[#1B4F8A]" : "text-slate-400")} />
                <span className={cn("text-sm font-bold", bookingMode === val ? "text-[#1B4F8A]" : "text-slate-700")}>{label}</span>
              </div>
              <span className="text-xs text-slate-500 leading-snug">{sub}</span>
            </button>
          ))}
        </div>

        {/* System mode options */}
        {bookingMode === "system" && (
          <div className="space-y-3 pt-1">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-2 block">Source</Label>
              <div className="space-y-2">
                {[
                  { val: "group",      label: "By Group",       sub: "All candidates in a group" },
                  { val: "group_role", label: "Group + Role",   sub: "Filter by group AND role"  },
                  { val: "role",       label: "By Role only",   sub: "All candidates with a role across the system" },
                ].map(({ val, label, sub }) => (
                  <label key={val} className={cn("flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                    sourceType === val ? "border-[#1B4F8A]/40 bg-[#1B4F8A]/5" : "border-slate-200 hover:border-slate-300")}>
                    <input type="radio" className="accent-[#1B4F8A]" checked={sourceType === val} onChange={() => setSourceType(val as any)} />
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{label}</p>
                      <p className="text-xs text-slate-400">{sub}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            {(sourceType === "group" || sourceType === "group_role") && (
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Group</Label>
                <select value={groupId} onChange={e => setGroupId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-[#1B4F8A]">
                  <option value="">Select a group…</option>
                  {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}
            {(sourceType === "group_role" || sourceType === "role") && (
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Role / Track</Label>
                <select value={trackId} onChange={e => setTrackId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-[#1B4F8A]">
                  <option value="">Select a role…</option>
                  {tracks.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            {candidateCount !== null && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg font-semibold">
                👥 {candidateCount} candidate{candidateCount !== 1 ? "s" : ""} will appear in the name dropdown
              </p>
            )}
          </div>
        )}

        {/* Free mode options */}
        {bookingMode === "free" && (
          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:border-slate-300">
            <input type="checkbox" className="accent-[#1B4F8A]" checked={showRoleSel} onChange={e => setShowRoleSel(e.target.checked)} />
            <div>
              <p className="text-sm font-semibold text-slate-700">Show role selector</p>
              <p className="text-xs text-slate-400">Candidate picks their role / track before booking</p>
            </div>
          </label>
        )}
      </Section>

      {/* ③ Format & Timezone */}
      <Section n="3" title="Format & Timezone">
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-2 block">Interview Format</Label>
          <div className="grid grid-cols-3 gap-2">
            {["in_person","online","hybrid"].map(f => (
              <button key={f} onClick={() => setFormat(f as any)}
                className={cn("py-2 px-3 rounded-xl border-2 text-xs font-bold capitalize transition-all",
                  format === f ? "border-[#1B4F8A] bg-[#1B4F8A] text-white" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
                {f.replace("_"," ")}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Organisation Timezone</Label>
          <select value={timezone} onChange={e => setTimezone(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-[#1B4F8A]">
            {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
          </select>
          <p className="text-xs text-slate-400 mt-1">Slots are defined in this timezone. Candidates see their local equivalent automatically.</p>
        </div>
      </Section>

      {/* ④ Slot Settings */}
      <Section n="4" title="Slot Settings">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Slot Duration</Label>
            <select value={durMin} onChange={e => setDurMin(Number(e.target.value))}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-[#1B4F8A]">
              {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Buffer Between</Label>
            <select value={bufMin} onChange={e => setBufMin(Number(e.target.value))}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-[#1B4F8A]">
              {BUFFERS.map(b => <option key={b} value={b}>{b === 0 ? "None" : `${b} min`}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-1 block">Per Slot</Label>
            <select value={capSlot} onChange={e => setCapSlot(Number(e.target.value))}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-[#1B4F8A]">
              {[1,2,3,4,5,10].map(n => <option key={n} value={n}>{n === 1 ? "1 — One-on-one" : `${n} candidates`}</option>)}
            </select>
          </div>
        </div>
        {bufMin > 0 && (
          <p className="text-xs text-[#1B4F8A] bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg">
            <Clock className="h-3 w-3 inline mr-1" />
            One candidate every <strong>{durMin + bufMin} minutes</strong> ({durMin} min interview + {bufMin} min buffer)
          </p>
        )}
      </Section>

      {/* ⑤ Add Time Slots */}
      <Section n="5" title="Add Time Slots">
        <div className="space-y-3">
          {days.map((day, i) => {
            const previews = generateSlotPreviews(day.start, day.end, durMin, bufMin)
            return (
              <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 p-3 bg-slate-50/60">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] text-slate-500 mb-1 block">Date</Label>
                      <Input type="date" value={day.date} onChange={e => updateDay(i, "date", e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-slate-500 mb-1 block">Start</Label>
                      <Input type="time" value={day.start} onChange={e => updateDay(i, "start", e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-slate-500 mb-1 block">End</Label>
                      <Input type="time" value={day.end} onChange={e => updateDay(i, "end", e.target.value)} className="h-8 text-xs" />
                    </div>
                  </div>
                  {days.length > 1 && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0 mt-4"
                      onClick={() => removeDay(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {previews.length > 0 && (
                  <div className="px-3 py-2 border-t border-slate-100 bg-white">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Eye className="h-3 w-3" /> {previews.length} slots generated
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {previews.map(p => (
                        <span key={p} className="text-[10px] bg-[#1B4F8A]/8 text-[#1B4F8A] border border-[#1B4F8A]/20 px-2 py-0.5 rounded-full font-medium">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <Button variant="outline" size="sm" className="gap-2 w-full text-xs" onClick={addDay}>
            <Plus className="h-3.5 w-3.5" /> Add Another Day
          </Button>
        </div>
      </Section>

      {/* Actions */}
      <div className="flex items-center justify-between pb-8">
        <Link href="/interview/schedule">
          <Button variant="outline">Cancel</Button>
        </Link>
        <Button className="bg-[#1B4F8A] hover:bg-[#1B4F8A]/90 gap-2 px-6" onClick={handleSubmit} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : "Create Schedule →"}
        </Button>
      </div>
    </div>
  )
}
