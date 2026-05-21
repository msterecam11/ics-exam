import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

type Ctx = { params: Promise<{ scheduleId: string }> }

// GET /api/book/[scheduleId]/candidates
// Public endpoint — returns candidate name list for system-mode booking page
// Only exposes: id, full_name, track name (no sensitive data)
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { scheduleId } = await params

  // Load the schedule to know source_type / group_id / track_id
  const { data: schedule, error: sErr } = await db
    .from("schedules")
    .select("booking_mode, source_type, group_id, track_id, status")
    .eq("id", scheduleId)
    .eq("status", "active")
    .single()

  if (sErr || !schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 })
  }

  if (schedule.booking_mode !== "system") {
    return NextResponse.json([], { status: 200 })
  }

  let query = db
    .from("interview_candidates")
    .select("id, full_name, track_id, role_tracks ( name )")
    .order("full_name", { ascending: true })

  if (schedule.source_type === "group" && schedule.group_id) {
    query = query.eq("group_id", schedule.group_id)
  } else if (schedule.source_type === "group_role" && schedule.group_id && schedule.track_id) {
    query = query.eq("group_id", schedule.group_id).eq("track_id", schedule.track_id)
  } else if (schedule.source_type === "role" && schedule.track_id) {
    query = query.eq("track_id", schedule.track_id)
  } else {
    return NextResponse.json([], { status: 200 })
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filter out candidates who already have a confirmed booking for this schedule
  // so their name disappears from the dropdown once they've booked.
  const { data: booked } = await db
    .from("schedule_bookings")
    .select("candidate_id")
    .eq("schedule_id", scheduleId)
    .eq("status", "confirmed")
    .not("candidate_id", "is", null)

  const bookedIds = new Set((booked ?? []).map((b: any) => b.candidate_id))
  const available = (data ?? []).filter((c: any) => !bookedIds.has(c.id))

  return NextResponse.json(available)
}
