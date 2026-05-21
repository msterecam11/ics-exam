import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Ctx = { params: Promise<{ scheduleId: string }> }

// GET /api/interview/schedule/[scheduleId]/bookings
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { scheduleId } = await params

  const { data, error } = await db
    .from("schedule_bookings")
    .select(`
      id, candidate_name, candidate_email, candidate_phone,
      confirmation_code, status, notes, ms_event_id, ms_teams_url,
      booked_at, cancelled_at,
      slot_id,
      schedule_slots ( start_utc, end_utc ),
      candidate_id,
      interview_candidates ( full_name, position ),
      candidate_track_id,
      role_tracks ( name )
    `)
    .eq("schedule_id", scheduleId)
    .order("booked_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
