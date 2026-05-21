import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// GET /api/interview/schedule — list all schedules
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await db
    .from("schedules")
    .select(`
      id, name, description, location, booking_mode, source_type,
      interview_format, timezone, slot_duration_min, buffer_min,
      capacity_per_slot, status, created_at, updated_at,
      group_id, track_id,
      assessment_groups ( id, name ),
      role_tracks       ( id, name )
    `)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach booking + slot counts
  const ids = (data ?? []).map((s: any) => s.id)
  if (ids.length === 0) return NextResponse.json([])

  const { data: slotCounts } = await db
    .from("schedule_slots")
    .select("schedule_id")
    .in("schedule_id", ids)

  const { data: bookingCounts } = await db
    .from("schedule_bookings")
    .select("schedule_id")
    .in("schedule_id", ids)
    .eq("status", "confirmed")

  const slotMap    = Object.fromEntries(ids.map((id: string) => [id, 0]))
  const bookingMap = Object.fromEntries(ids.map((id: string) => [id, 0]))
  for (const s of slotCounts    ?? []) slotMap[s.schedule_id]++
  for (const b of bookingCounts ?? []) bookingMap[b.schedule_id]++

  const enriched = (data ?? []).map((s: any) => ({
    ...s,
    slot_count:    slotMap[s.id]    ?? 0,
    booking_count: bookingMap[s.id] ?? 0,
  }))

  return NextResponse.json(enriched)
}

// POST /api/interview/schedule — create schedule
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const {
    name, description, location,
    booking_mode, source_type,
    group_id, track_id,
    show_role_selector,
    interview_format,
    timezone,
    slot_duration_min,
    buffer_min,
    capacity_per_slot,
    internal_attendees,
    slot_pool_id,
  } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  const { data, error } = await db
    .from("schedules")
    .insert({
      name:               name.trim(),
      description:        description   ?? null,
      location:           location      ?? null,
      booking_mode:       booking_mode  ?? "system",
      source_type:        source_type   ?? null,
      group_id:           group_id      ?? null,
      track_id:           track_id      ?? null,
      show_role_selector: show_role_selector ?? false,
      interview_format:   interview_format   ?? "in_person",
      timezone:           timezone           ?? "Asia/Dubai",
      slot_duration_min:  slot_duration_min  ?? 30,
      buffer_min:         buffer_min         ?? 0,
      capacity_per_slot:  capacity_per_slot  ?? 1,
      internal_attendees: Array.isArray(internal_attendees) ? internal_attendees.filter(Boolean) : [],
      slot_pool_id:       slot_pool_id ?? null,
      status:             "active",
      created_by:         session.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
