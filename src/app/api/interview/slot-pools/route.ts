import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// GET /api/interview/slot-pools — list all pools with schedule count
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: pools, error } = await db
    .from("slot_pools")
    .select("id, name, created_at")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach schedule count to each pool
  const ids = (pools ?? []).map((p: any) => p.id)
  if (ids.length === 0) return NextResponse.json([])

  const { data: schedules } = await db
    .from("schedules")
    .select("slot_pool_id, name")
    .in("slot_pool_id", ids)

  const poolMap: Record<string, any[]> = {}
  for (const s of schedules ?? []) {
    if (!poolMap[s.slot_pool_id]) poolMap[s.slot_pool_id] = []
    poolMap[s.slot_pool_id].push(s.name)
  }

  const enriched = (pools ?? []).map((p: any) => ({
    ...p,
    schedule_count: (poolMap[p.id] ?? []).length,
    schedule_names: poolMap[p.id] ?? [],
  }))

  return NextResponse.json(enriched)
}

// POST /api/interview/slot-pools — create a new pool
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })

  const { data, error } = await db
    .from("slot_pools")
    .insert({ name: name.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/interview/slot-pools — rename a pool
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id, name } = await req.json()
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })

  const { data, error } = await db
    .from("slot_pools")
    .update({ name: name.trim() })
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/interview/slot-pools?id=xxx — delete a pool
// Schedules linked to this pool will have slot_pool_id set to null (unlinked, not deleted)
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

  // Unlink any schedules from this pool before deleting
  await db.from("schedules").update({ slot_pool_id: null }).eq("slot_pool_id", id)

  const { error } = await db.from("slot_pools").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
