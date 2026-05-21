import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

type Ctx = { params: Promise<{ scheduleId: string }> }

// GET /api/book/[scheduleId]/slots
// Public endpoint — returns available slots for the booking page
// Only returns future slots that are not full or blocked
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { scheduleId } = await params

  const now = new Date().toISOString()

  const { data, error } = await db
    .from("schedule_slot_availability")
    .select("slot_id, track_id, start_utc, end_utc, capacity, booked_count, remaining, availability")
    .eq("schedule_id", scheduleId)
    .gte("start_utc", now)
    .order("start_utc", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
