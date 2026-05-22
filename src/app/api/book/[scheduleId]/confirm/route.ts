import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createCalendarEvent, buildBookingEventBody, sendConfirmationEmail } from "@/lib/ms-graph"
import { blockPoolSlots } from "@/lib/slot-pool"

type Ctx = { params: Promise<{ scheduleId: string }> }

// POST /api/book/[scheduleId]/confirm
// Public endpoint — candidate confirms a slot booking
// Body: {
//   slot_id, candidate_id?, candidate_name, candidate_email,
//   candidate_phone?, candidate_track_id?, notes?
// }
export async function POST(req: NextRequest, { params }: Ctx) {
  const { scheduleId } = await params
  const body = await req.json()

  const {
    slot_id,
    candidate_id,
    candidate_name,
    candidate_email,
    candidate_phone,
    candidate_track_id,
    notes,
  } = body

  // Validate required fields
  if (!slot_id)          return NextResponse.json({ error: "slot_id is required" },          { status: 400 })
  if (!candidate_name)   return NextResponse.json({ error: "candidate_name is required" },   { status: 400 })
  if (!candidate_email)  return NextResponse.json({ error: "candidate_email is required" },  { status: 400 })

  // Basic input validation
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(candidate_email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
  }
  if (typeof candidate_name !== "string" || candidate_name.trim().length > 200) {
    return NextResponse.json({ error: "candidate_name is invalid" }, { status: 400 })
  }
  if (candidate_phone && (typeof candidate_phone !== "string" || candidate_phone.length > 30)) {
    return NextResponse.json({ error: "candidate_phone is invalid" }, { status: 400 })
  }
  if (notes && (typeof notes !== "string" || notes.length > 2000)) {
    return NextResponse.json({ error: "notes must be under 2000 characters" }, { status: 400 })
  }

  // Load schedule info
  const { data: schedule, error: sErr } = await db
    .from("schedules")
    .select("id, name, location, interview_format, status, timezone, internal_attendees, slot_pool_id")
    .eq("id", scheduleId)
    .eq("status", "active")
    .single()

  if (sErr || !schedule) {
    return NextResponse.json({ error: "Schedule not found or no longer active" }, { status: 404 })
  }

  // Check slot availability (use view for accurate count)
  const { data: slotAvail, error: avErr } = await db
    .from("schedule_slot_availability")
    .select("slot_id, start_utc, end_utc, availability, remaining")
    .eq("slot_id", slot_id)
    .single()

  if (avErr || !slotAvail) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 })
  }

  if (slotAvail.availability !== "available") {
    return NextResponse.json(
      { error: slotAvail.availability === "full" ? "This slot is fully booked" : "This slot is not available" },
      { status: 409 }
    )
  }

  // Check candidate hasn't already booked this schedule (system mode)
  if (candidate_id) {
    const { count } = await db
      .from("schedule_bookings")
      .select("id", { count: "exact", head: true })
      .eq("schedule_id", scheduleId)
      .eq("candidate_id", candidate_id)
      .eq("status", "confirmed")

    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: "You already have a booking for this schedule" }, { status: 409 })
    }
  }

  // Load track name for calendar event
  let trackName: string | undefined
  if (candidate_track_id) {
    const { data: track } = await db
      .from("role_tracks")
      .select("name")
      .eq("id", candidate_track_id)
      .single()
    trackName = track?.name
  }

  // Create the booking record
  const { data: booking, error: bErr } = await db
    .from("schedule_bookings")
    .insert({
      schedule_id:        scheduleId,
      slot_id,
      candidate_id:       candidate_id       ?? null,
      candidate_name:     candidate_name.trim(),
      candidate_email:    candidate_email.trim().toLowerCase(),
      candidate_phone:    candidate_phone     ?? null,
      candidate_track_id: candidate_track_id ?? null,
      notes:              notes               ?? null,
      status:             "confirmed",
    })
    .select()
    .single()

  if (bErr || !booking) {
    return NextResponse.json({ error: bErr?.message ?? "Booking failed" }, { status: 500 })
  }

  // Create Microsoft Teams calendar event (non-fatal if it fails)
  let ms_event_id:  string | null = null
  let ms_teams_url: string | null = null

  try {
    const eventBody = buildBookingEventBody({
      candidateName:  candidate_name,
      candidateEmail: candidate_email,
      scheduleName:   schedule.name,
      location:       schedule.location ?? undefined,
      trackName,
      confirmCode:    booking.confirmation_code,
    })

    const event = await createCalendarEvent({
      subject:       `Interview: ${candidate_name} — ${schedule.name}`,
      startUtc:      slotAvail.start_utc,
      endUtc:        slotAvail.end_utc,
      location:      schedule.location ?? undefined,
      body:          eventBody,
      attendeeEmail:      candidate_email,
      attendeeName:       candidate_name,
      isOnline:           schedule.interview_format === "online",
      internalAttendees:  (schedule as any).internal_attendees ?? [],
    })

    ms_event_id  = event.eventId
    ms_teams_url = event.teamsUrl

    // Update booking with MS Graph IDs
    await db
      .from("schedule_bookings")
      .update({ ms_event_id, ms_teams_url })
      .eq("id", booking.id)
  } catch (e) {
    console.error("MS Graph calendar event error (non-fatal):", e)
  }

  // Send confirmation email to candidate (non-fatal)
  // Block overlapping slots in sibling schedules sharing the same slot pool
  if ((schedule as any).slot_pool_id) {
    await blockPoolSlots({
      scheduleId,
      slotPoolId: (schedule as any).slot_pool_id,
      startUtc:   slotAvail.start_utc,
      endUtc:     slotAvail.end_utc,
      bookingId:  booking.id,
    }).catch(e => console.error("Pool blocking error (non-fatal):", e))
  }

  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const manageUrl  = `${appUrl}/book/${scheduleId}/manage?code=${booking.confirmation_code}`
  const receiptUrl = `${appUrl}/api/book/${scheduleId}/receipt?code=${booking.confirmation_code}`

  try {
    await sendConfirmationEmail({
      candidateName:  candidate_name,
      candidateEmail: candidate_email,
      scheduleName:   schedule.name,
      startUtc:       slotAvail.start_utc,
      endUtc:         slotAvail.end_utc,
      timezone:       schedule.timezone,
      confirmCode:    booking.confirmation_code,
      location:       schedule.location ?? undefined,
      teamsUrl:       ms_teams_url,
      trackName,
      manageUrl,
      receiptUrl,
    })
  } catch (e) {
    console.error("Confirmation email error (non-fatal):", e)
  }

  return NextResponse.json({
    success:           true,
    confirmation_code: booking.confirmation_code,
    booking_id:        booking.id,
    slot:              { start_utc: slotAvail.start_utc, end_utc: slotAvail.end_utc },
    ms_teams_url,
    schedule:          { name: schedule.name, location: schedule.location, timezone: schedule.timezone },
  }, { status: 201 })
}
