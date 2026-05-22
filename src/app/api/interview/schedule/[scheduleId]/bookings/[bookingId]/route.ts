import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { deleteCalendarEvent } from "@/lib/ms-graph"
import { unblockPoolSlots } from "@/lib/slot-pool"

type Ctx = { params: Promise<{ scheduleId: string; bookingId: string }> }

// PATCH /api/interview/schedule/[scheduleId]/bookings/[bookingId]
// Used to cancel a booking or mark as no_show
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { bookingId } = await params
  const { status } = await req.json()

  if (!["confirmed", "cancelled", "no_show"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  // Fetch current booking to get ms_event_id
  const { data: booking } = await db
    .from("schedule_bookings")
    .select("ms_event_id, status")
    .eq("id", bookingId)
    .single()

  // If cancelling — delete calendar event + unblock pool slots
  if (status === "cancelled") {
    await Promise.all([
      booking?.ms_event_id ? deleteCalendarEvent(booking.ms_event_id).catch(e => console.error("MS Graph delete event error:", e)) : Promise.resolve(),
      unblockPoolSlots(bookingId).catch(e => console.error("Pool unblock error:", e)),
    ])
  }

  const patch: Record<string, any> = {
    status,
    ...(status === "cancelled" ? { cancelled_at: new Date().toISOString() } : {}),
  }

  const { data, error } = await db
    .from("schedule_bookings")
    .update(patch)
    .eq("id", bookingId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
