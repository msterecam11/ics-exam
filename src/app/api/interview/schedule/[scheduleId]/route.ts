import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Ctx = { params: Promise<{ scheduleId: string }> }

// GET /api/interview/schedule/[scheduleId]
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { scheduleId } = await params

  const { data, error } = await db
    .from("schedules")
    .select(`
      *,
      assessment_groups ( id, name, scheduled_date ),
      role_tracks       ( id, name )
    `)
    .eq("id", scheduleId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH /api/interview/schedule/[scheduleId]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { scheduleId } = await params
  const body = await req.json()

  const allowed = [
    "name","description","location","status",
    "interview_format","timezone","slot_duration_min",
    "buffer_min","capacity_per_slot","show_role_selector",
  ]
  const patch = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  )

  const { data, error } = await db
    .from("schedules")
    .update(patch)
    .eq("id", scheduleId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/interview/schedule/[scheduleId]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { scheduleId } = await params

  const { error } = await db
    .from("schedules")
    .delete()
    .eq("id", scheduleId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
