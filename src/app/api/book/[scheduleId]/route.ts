import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

type Ctx = { params: Promise<{ scheduleId: string }> }

// GET /api/book/[scheduleId]
// Public endpoint — returns schedule info for the candidate booking page
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { scheduleId } = await params

  const { data, error } = await db
    .from("schedules")
    .select(`
      id, name, description, location, booking_mode, source_type,
      interview_format, timezone, slot_duration_min, buffer_min,
      capacity_per_slot, status, show_role_selector,
      group_id, track_id,
      assessment_groups ( id, name ),
      role_tracks       ( id, name )
    `)
    .eq("id", scheduleId)
    .eq("status", "active")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "Schedule not found or no longer active" }, { status: 404 })
  }

  return NextResponse.json(data)
}
