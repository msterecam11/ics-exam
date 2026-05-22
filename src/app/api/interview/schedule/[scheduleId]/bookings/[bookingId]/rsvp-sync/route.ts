import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAttendeeStatus, deleteCalendarEvent } from "@/lib/ms-graph"
import { unblockPoolSlots } from "@/lib/slot-pool"

type Ctx = { params: Promise<{ scheduleId: string; bookingId: string }> }

// POST /api/interview/schedule/[scheduleId]/bookings/[bookingId]/rsvp-sync
// Admin-only — fetches the candidate's calendar response from MS Graph
// and updates our rsvp_status field to match.
export async function POST(_req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { scheduleId, bookingId } = await params

  // Load booking — scope to scheduleId to prevent IDOR
  const { data: booking, error: bErr } = await db
    .from("schedule_bookings")
    .select("id, ms_event_id, candidate_email, rsvp_status")
    .eq("id", bookingId)
    .eq("schedule_id", scheduleId)
    .single()

  if (bErr || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }

  if (!booking.ms_event_id) {
    return NextResponse.json(
      { error: "No calendar event linked to this booking", rsvp_status: booking.rsvp_status },
      { status: 422 }
    )
  }

  // Fetch attendee response from MS Graph
  let rsvp_status: string
  try {
    rsvp_status = await getAttendeeStatus(booking.ms_event_id, booking.candidate_email)
  } catch (e: any) {
    return NextResponse.json({ error: `MS Graph error: ${e.message}` }, { status: 502 })
  }

  const changed = rsvp_status !== booking.rsvp_status
  const declined = rsvp_status === "declined"

  if (changed || declined) {
    const patch: Record<string, string> = { rsvp_status }

    // If candidate declined → cancel the booking so the slot is freed
    if (declined) patch.status = "cancelled"

    await db
      .from("schedule_bookings")
      .update(patch)
      .eq("id", bookingId)

    // Remove the calendar event and unblock pool slots
    if (declined) {
      await Promise.all([
        unblockPoolSlots(bookingId).catch(() => null),
        booking.ms_event_id ? deleteCalendarEvent(booking.ms_event_id).catch(() => null) : Promise.resolve(),
      ])
    }
  }

  return NextResponse.json({ rsvp_status, changed, auto_cancelled: declined })
}
