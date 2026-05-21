import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Ctx = { params: Promise<{ scheduleId: string }> }

// GET /api/interview/schedule/[scheduleId]/slots
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { scheduleId } = await params

  const { data, error } = await db
    .from("schedule_slot_availability")
    .select("*")
    .eq("schedule_id", scheduleId)
    .order("start_utc", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/interview/schedule/[scheduleId]/slots
// Auto-generates slots from a date + time range using schedule settings
// Body: { date: "2026-06-15", start_time: "09:00", end_time: "16:00", track_id?: string }
export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { scheduleId } = await params
  const body = await req.json()
  const { date, start_time, end_time, track_id } = body

  if (!date || !start_time || !end_time) {
    return NextResponse.json({ error: "date, start_time and end_time are required" }, { status: 400 })
  }

  // Load schedule for duration + buffer + timezone
  const { data: schedule, error: sErr } = await db
    .from("schedules")
    .select("slot_duration_min, buffer_min, capacity_per_slot, timezone")
    .eq("id", scheduleId)
    .single()

  if (sErr || !schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 })
  }

  const { slot_duration_min, buffer_min, capacity_per_slot, timezone } = schedule

  // Convert admin's local time (in `tz`) to UTC.
  // Uses noon UTC as a stable reference to avoid day-boundary issues and
  // is completely server-timezone-agnostic (no new Date("...local string")).
  function localToUtc(dateStr: string, timeStr: string, tz: string): Date {
    const [year, month, day] = dateStr.split("-").map(Number)
    const [hour, minute]     = timeStr.split(":").map(Number)

    // Anchor at noon UTC on the given date — this stays on the same local
    // calendar day for all UTC offsets we realistically support (±12 h).
    const noonUtc = Date.UTC(year, month - 1, day, 12, 0)

    // Ask Intl what time `tz` shows at that noon-UTC instant.
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date(noonUtc))

    const get  = (t: string) => parseInt(parts.find(p => p.type === t)!.value)
    const tzNoonMin = get("hour") * 60 + get("minute")

    // diffMinutes = how many minutes local lags behind / leads UTC
    // e.g. Dubai UTC+4: at noon UTC (720 min) local shows 16:00 (960 min)
    //   → local leads UTC by 240 min → to convert local→UTC subtract 240 min
    //   → diff = 720 − 960 = −240  → UTC = local + diff ✓
    const diffMinutes = 12 * 60 - tzNoonMin

    const midnightUtc = Date.UTC(year, month - 1, day, 0, 0)
    return new Date(midnightUtc + (hour * 60 + minute + diffMinutes) * 60_000)
  }

  const startUtc = localToUtc(date, start_time, timezone)
  const endUtc   = localToUtc(date, end_time,   timezone)

  if (endUtc <= startUtc) {
    return NextResponse.json({ error: "end_time must be after start_time" }, { status: 400 })
  }

  // Generate slots
  const slotMs   = slot_duration_min * 60_000
  const bufferMs = buffer_min        * 60_000
  const stepMs   = slotMs + bufferMs

  const slots: { schedule_id: string; track_id: string | null; start_utc: string; end_utc: string; capacity: number }[] = []
  let cursor = startUtc.getTime()

  while (cursor + slotMs <= endUtc.getTime()) {
    slots.push({
      schedule_id: scheduleId,
      track_id:    track_id ?? null,
      start_utc:   new Date(cursor).toISOString(),
      end_utc:     new Date(cursor + slotMs).toISOString(),
      capacity:    capacity_per_slot,
    })
    cursor += stepMs
  }

  if (slots.length === 0) {
    return NextResponse.json({ error: "No slots generated — check time range and duration" }, { status: 400 })
  }

  const { data, error } = await db
    .from("schedule_slots")
    .insert(slots)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ generated: slots.length, slots: data }, { status: 201 })
}
