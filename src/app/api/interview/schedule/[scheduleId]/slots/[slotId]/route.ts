import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Ctx = { params: Promise<{ scheduleId: string; slotId: string }> }

// PATCH /api/interview/schedule/[scheduleId]/slots/[slotId]
// Toggle block / update capacity
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { slotId } = await params
  const body = await req.json()

  const patch: Record<string, any> = {}
  if (typeof body.is_blocked === "boolean") patch.is_blocked = body.is_blocked
  if (typeof body.capacity   === "number")  patch.capacity   = body.capacity

  const { data, error } = await db
    .from("schedule_slots")
    .update(patch)
    .eq("id", slotId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/interview/schedule/[scheduleId]/slots/[slotId]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { slotId } = await params

  // Check if any confirmed bookings exist for this slot
  const { count } = await db
    .from("schedule_bookings")
    .select("id", { count: "exact", head: true })
    .eq("slot_id", slotId)
    .eq("status", "confirmed")

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Cannot delete a slot that has confirmed bookings" },
      { status: 409 }
    )
  }

  const { error } = await db.from("schedule_slots").delete().eq("id", slotId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
