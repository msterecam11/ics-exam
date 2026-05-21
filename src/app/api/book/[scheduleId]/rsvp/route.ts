import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

type Ctx = { params: Promise<{ scheduleId: string }> }

// PATCH /api/book/[scheduleId]/rsvp
// Public endpoint — candidate updates their RSVP using their confirmation code.
// Body: { confirmation_code: string, rsvp_status: "accepted" | "declined" }
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { scheduleId } = await params
  const body = await req.json()
  const { confirmation_code, rsvp_status } = body

  if (!confirmation_code) {
    return NextResponse.json({ error: "Confirmation code is required" }, { status: 400 })
  }
  if (!["accepted", "tentative", "declined"].includes(rsvp_status)) {
    return NextResponse.json({ error: "rsvp_status must be 'accepted', 'tentative', or 'declined'" }, { status: 400 })
  }

  // Locate the booking — confirmation code is the security token
  const { data: booking, error: findErr } = await db
    .from("schedule_bookings")
    .select("id, status, rsvp_status")
    .eq("schedule_id", scheduleId)
    .eq("confirmation_code", confirmation_code.trim().toUpperCase())
    .single()

  if (findErr || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }

  if (booking.status === "cancelled") {
    return NextResponse.json({ error: "This booking has been cancelled" }, { status: 409 })
  }

  const { error: updateErr } = await db
    .from("schedule_bookings")
    .update({ rsvp_status })
    .eq("id", booking.id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ rsvp_status })
}
