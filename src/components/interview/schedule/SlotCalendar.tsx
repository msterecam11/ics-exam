"use client"

import { Ban, Loader2, Unlock, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Slot {
  slot_id: string
  start_utc: string
  end_utc: string
  is_blocked: boolean
  availability: string
}

interface Booking {
  id: string
  slot_id: string
  status: string
  candidate_name: string
}

interface Props {
  slots: Slot[]
  bookings: Booking[]
  timezone: string
  togglingSlot: string | null
  deletingSlot: string | null
  onToggleBlock: (slotId: string, isBlocked: boolean) => void
  onDeleteSlot: (slotId: string) => void
}

function fmt(utc: string, tz: string, type: "date" | "time" | "dayname") {
  const d = new Date(utc)
  if (type === "date")
    return d.toLocaleDateString("en-GB", { timeZone: tz, day: "2-digit", month: "short", year: "numeric" })
  if (type === "time")
    return d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
  return d.toLocaleDateString("en-GB", { timeZone: tz, weekday: "short" })
}

export default function SlotCalendar({ slots, bookings, timezone, togglingSlot, deletingSlot, onToggleBlock, onDeleteSlot }: Props) {
  if (slots.length === 0) return null

  // ── Build date columns ─────────────────────────────────────────────────────
  const dateMap: Record<string, Slot[]> = {}
  for (const s of slots) {
    const key = fmt(s.start_utc, timezone, "date")
    if (!dateMap[key]) dateMap[key] = []
    dateMap[key].push(s)
  }
  const dates = Object.keys(dateMap) // already sorted from slots order

  // ── Build time rows (unique start times across all slots) ──────────────────
  const timeSet = new Set<string>()
  for (const s of slots) timeSet.add(fmt(s.start_utc, timezone, "time"))
  const times = Array.from(timeSet).sort()

  // ── Quick lookup: date+time → slot ────────────────────────────────────────
  const cellMap: Record<string, Slot> = {}
  for (const s of slots) {
    const key = `${fmt(s.start_utc, timezone, "date")}|${fmt(s.start_utc, timezone, "time")}`
    cellMap[key] = s
  }

  const bookingBySlot: Record<string, Booking> = {}
  for (const b of bookings) {
    if (b.status === "confirmed") bookingBySlot[b.slot_id] = b
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full border-collapse text-xs min-w-[480px]">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {/* Time column header */}
            <th className="px-3 py-2.5 text-left font-semibold text-slate-400 w-20 border-r border-slate-200">
              Time
            </th>
            {dates.map(date => (
              <th key={date} className="px-2 py-2.5 text-center font-semibold text-slate-600 border-r border-slate-100 last:border-r-0 min-w-[110px]">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {fmt(dateMap[date][0].start_utc, timezone, "dayname")}
                </span>
                {date}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {times.map((time, i) => (
            <tr key={time} className={cn("border-b border-slate-100 last:border-b-0", i % 2 === 0 ? "bg-white" : "bg-slate-50/40")}>
              {/* Time label */}
              <td className="px-3 py-2 font-bold text-slate-500 border-r border-slate-200 whitespace-nowrap">
                {time}
              </td>
              {dates.map(date => {
                const slot = cellMap[`${date}|${time}`]
                if (!slot) {
                  return (
                    <td key={date} className="px-2 py-2 border-r border-slate-100 last:border-r-0">
                      <div className="h-9 rounded-lg bg-slate-100/50 flex items-center justify-center">
                        <span className="text-slate-300 text-[10px]">—</span>
                      </div>
                    </td>
                  )
                }

                const booking   = bookingBySlot[slot.slot_id]
                const isBooked  = !!booking
                const isBlocked = slot.is_blocked

                return (
                  <td key={date} className="px-2 py-2 border-r border-slate-100 last:border-r-0">
                    <div className={cn(
                      "rounded-lg px-2 py-1.5 min-h-[36px] flex flex-col justify-center gap-0.5 group relative",
                      isBooked  ? "bg-[#1B4F8A]/10 border border-[#1B4F8A]/20" :
                      isBlocked ? "bg-slate-100 border border-slate-200" :
                                  "bg-emerald-50 border border-emerald-200"
                    )}>
                      {/* Status dot + label */}
                      <div className="flex items-center gap-1">
                        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                          isBooked ? "bg-[#1B4F8A]" : isBlocked ? "bg-slate-400" : "bg-emerald-400"
                        )} />
                        <span className={cn("font-semibold truncate max-w-[80px]",
                          isBooked  ? "text-[#1B4F8A]" :
                          isBlocked ? "text-slate-400 italic" :
                                      "text-emerald-700"
                        )}>
                          {isBooked   ? booking.candidate_name :
                           isBlocked  ? "Blocked" :
                                        "Free"}
                        </span>
                      </div>

                      {/* End time */}
                      <span className="text-[9px] text-slate-400 pl-2.5">
                        → {fmt(slot.end_utc, timezone, "time")}
                      </span>

                      {/* Hover actions (non-booked slots only) */}
                      {!isBooked && (
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-white/90 rounded-md px-1 py-0.5 shadow-sm border border-slate-100">
                          <button
                            title={isBlocked ? "Unblock" : "Block"}
                            disabled={togglingSlot === slot.slot_id}
                            onClick={() => onToggleBlock(slot.slot_id, isBlocked)}
                            className={cn("p-0.5 rounded hover:bg-slate-100 transition-colors",
                              isBlocked ? "text-emerald-600" : "text-amber-500")}
                          >
                            {togglingSlot === slot.slot_id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : isBlocked ? <Unlock className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                          </button>
                          <button
                            title="Delete slot"
                            disabled={deletingSlot === slot.slot_id}
                            onClick={() => onDeleteSlot(slot.slot_id)}
                            className="p-0.5 rounded text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          >
                            {deletingSlot === slot.slot_id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Trash2 className="h-3 w-3" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
