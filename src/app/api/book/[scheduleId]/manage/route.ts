import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  createCalendarEvent,
  buildBookingEventBody,
  deleteCalendarEvent,
  sendConfirmationEmail,
} from "@/lib/ms-graph"
import { blockPoolSlots, unblockPoolSlots } from "@/lib/slot-pool"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"

type Ctx = { params: Promise<{ scheduleId: string }> }

// ─── GET — fetch booking by confirmation code ─────────────────────────────────
export async function GET(req: NextRequest, { params }: Ctx) {
  // 30 lookups per IP per minute (anti-enumeration)
  const rl = rateLimit(req, "manage-get", 30, 60 * 1000)
  if (!rl.ok) return rateLimitResponse(rl)

  const { scheduleId } = await params
  const code = req.nextUrl.searchParams.get("code")?.toUpperCase()

  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 })

  // Load booking
  const { data: booking } = await db
    .from("schedule_bookings")
    .select(`
      id, candidate_name, candidate_email, slot_id, status,
      confirmation_code, candidate_track_id, ms_teams_url,
      schedule_slots ( start_utc, end_utc )
    `)
    .eq("schedule_id", scheduleId)
    .eq("confirmation_code", code)
    .single()

  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  if (booking.status === "cancelled") {
    return NextResponse.json({ error: "This booking has been cancelled" }, { status: 410 })
  }

  // Load schedule info
  const { data: schedule } = await db
    .from("schedules")
    .select("id, name, location, timezone, interview_format, slot_duration_min, status")
    .eq("id", scheduleId)
    .single()

  if (!schedule || schedule.status !== "active") {
    return NextResponse.json({ error: "Schedule not found or no longer active" }, { status: 404 })
  }

  // Load available slots (excluding current booked slot)
  const { data: slots } = await db
    .from("schedule_slot_availability")
    .select("slot_id, start_utc, end_utc, availability, remaining")
    .eq("schedule_id", scheduleId)
    .eq("availability", "available")
    .neq("slot_id", booking.slot_id)
    .order("start_utc", { ascending: true })

  return NextResponse.json({ booking, schedule, availableSlots: slots ?? [] })
}

// ─── PATCH — reschedule to a new slot ────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Ctx) {
  // 10 reschedule attempts per IP per 15 minutes
  const rl = rateLimit(req, "manage-patch", 10, 15 * 60 * 1000)
  if (!rl.ok) return rateLimitResponse(rl)

  const { scheduleId } = await params
  const { confirmation_code, new_slot_id } = await req.json()

  if (!confirmation_code || !new_slot_id) {
    return NextResponse.json({ error: "confirmation_code and new_slot_id are required" }, { status: 400 })
  }

  const code = (confirmation_code as string).toUpperCase()

  // Find booking
  const { data: booking } = await db
    .from("schedule_bookings")
    .select("*")
    .eq("schedule_id", scheduleId)
    .eq("confirmation_code", code)
    .single()

  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  if (booking.status === "cancelled") {
    return NextResponse.json({ error: "This booking has been cancelled" }, { status: 410 })
  }

  // Check new slot availability
  const { data: slotAvail } = await db
    .from("schedule_slot_availability")
    .select("slot_id, start_utc, end_utc, availability")
    .eq("slot_id", new_slot_id)
    .single()

  if (!slotAvail || slotAvail.availability !== "available") {
    return NextResponse.json({ error: "This slot is no longer available" }, { status: 409 })
  }

  // Load schedule
  const { data: schedule } = await db
    .from("schedules")
    .select("id, name, location, timezone, interview_format, internal_attendees, slot_pool_id")
    .eq("id", scheduleId)
    .single()

  if (!schedule) return NextResponse.json({ error: "Schedule not found" }, { status: 404 })

  // Load track name
  let trackName: string | undefined
  if (booking.candidate_track_id) {
    const { data: track } = await db
      .from("role_tracks").select("name").eq("id", booking.candidate_track_id).single()
    trackName = track?.name
  }

  // Unblock pool slots from old booking, delete old calendar event
  await unblockPoolSlots(booking.id).catch(() => null)
  if (booking.ms_event_id) {
    await deleteCalendarEvent(booking.ms_event_id).catch(() => null)
  }

  // Create new calendar event
  let ms_event_id:  string | null = null
  let ms_teams_url: string | null = null

  try {
    const eventBody = buildBookingEventBody({
      candidateName:  booking.candidate_name,
      candidateEmail: booking.candidate_email,
      scheduleName:   schedule.name,
      location:       schedule.location ?? undefined,
      trackName,
      confirmCode:    booking.confirmation_code,
    })

    const event = await createCalendarEvent({
      subject:           `Interview (Rescheduled): ${booking.candidate_name} — ${schedule.name}`,
      startUtc:          slotAvail.start_utc,
      endUtc:            slotAvail.end_utc,
      location:          schedule.location ?? undefined,
      body:              eventBody,
      attendeeEmail:     booking.candidate_email,
      attendeeName:      booking.candidate_name,
      isOnline:          schedule.interview_format === "online",
      internalAttendees: (schedule as any).internal_attendees ?? [],
    })

    ms_event_id  = event.eventId
    ms_teams_url = event.teamsUrl
  } catch (e) {
    console.error("MS Graph reschedule event error (non-fatal):", e)
  }

  // Update booking with new slot
  await db
    .from("schedule_bookings")
    .update({ slot_id: new_slot_id, ms_event_id, ms_teams_url })
    .eq("id", booking.id)

  // Block new overlapping slots in sibling schedules
  if ((schedule as any).slot_pool_id) {
    await blockPoolSlots({
      scheduleId,
      slotPoolId: (schedule as any).slot_pool_id,
      startUtc:   slotAvail.start_utc,
      endUtc:     slotAvail.end_utc,
      bookingId:  booking.id,
    }).catch(() => null)
  }

  // Send reschedule email (non-fatal)
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const manageUrl = `${appUrl}/book/${scheduleId}/manage?code=${booking.confirmation_code}`

  try {
    await sendConfirmationEmail({
      candidateName:  booking.candidate_name,
      candidateEmail: booking.candidate_email,
      scheduleName:   schedule.name,
      startUtc:       slotAvail.start_utc,
      endUtc:         slotAvail.end_utc,
      timezone:       schedule.timezone,
      confirmCode:    booking.confirmation_code,
      location:       schedule.location ?? undefined,
      teamsUrl:       ms_teams_url,
      trackName,
      manageUrl,
      isReschedule:   true,
    })
  } catch (e) {
    console.error("Reschedule email error (non-fatal):", e)
  }

  return NextResponse.json({
    success:     true,
    slot:        { start_utc: slotAvail.start_utc, end_utc: slotAvail.end_utc },
    ms_teams_url,
  })
}

// ─── DELETE — cancel booking ──────────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Ctx) {
  // 10 cancel attempts per IP per 15 minutes
  const rl = rateLimit(req, "manage-delete", 10, 15 * 60 * 1000)
  if (!rl.ok) return rateLimitResponse(rl)

  const { scheduleId } = await params
  const { confirmation_code } = await req.json()

  if (!confirmation_code) {
    return NextResponse.json({ error: "confirmation_code is required" }, { status: 400 })
  }

  const code = (confirmation_code as string).toUpperCase()

  const { data: booking } = await db
    .from("schedule_bookings")
    .select("id, ms_event_id, status")
    .eq("schedule_id", scheduleId)
    .eq("confirmation_code", code)
    .single()

  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  if (booking.status === "cancelled") {
    return NextResponse.json({ error: "Already cancelled" }, { status: 410 })
  }

  // Cancel the booking
  await db
    .from("schedule_bookings")
    .update({ status: "cancelled" })
    .eq("id", booking.id)

  // Unblock pool slots + delete calendar event
  await Promise.all([
    unblockPoolSlots(booking.id).catch(() => null),
    booking.ms_event_id ? deleteCalendarEvent(booking.ms_event_id).catch(() => null) : Promise.resolve(),
  ])

  return NextResponse.json({ success: true })
}
