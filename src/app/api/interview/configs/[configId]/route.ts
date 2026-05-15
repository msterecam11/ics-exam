import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ configId: string }> }

export async function GET(_: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { configId } = await params

  const { data, error } = await db
    .from("assessment_configs")
    .select(`
      id, name, description, assessor_weights, verdict_thresholds, created_at,
      pillars (
        id, name, weight, order_index, applicable_track_ids,
        competencies ( id, name, weight, order_index )
      )
    `)
    .eq("id", configId)
    .single()

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { configId } = await params
  const body = await req.json().catch(() => ({}))

  // Fields that can be patched on the config itself
  const allowed = ["name", "description", "assessor_weights", "verdict_thresholds"]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "No valid fields" }, { status: 400 })

  const { data, error } = await db
    .from("assessment_configs")
    .update(updates)
    .eq("id", configId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { configId } = await params

  // Block deletion if any active/complete/published groups reference this config
  const { count } = await db
    .from("assessment_groups")
    .select("*", { count: "exact", head: true })
    .eq("config_id", configId)
    .neq("status", "draft")

  if ((count ?? 0) > 0)
    return NextResponse.json({ error: "Cannot delete — config is used by active groups" }, { status: 409 })

  const { error } = await db.from("assessment_configs").delete().eq("id", configId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── Pillar & Competency sub-resources ─────────────────────────────────────────
// POST /api/interview/configs/[configId]  with action in body

export async function PUT(req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { configId } = await params
  const body = await req.json().catch(() => ({}))
  const { action } = body

  // ── Add pillar ────────────────────────────────────────────────────────────
  if (action === "add_pillar") {
    const { name, weight = 1, applicable_track_ids = [] } = body
    if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 })

    const { data: existing } = await db
      .from("pillars").select("order_index").eq("config_id", configId)
      .order("order_index", { ascending: false }).limit(1)
    const nextIndex = (existing?.[0]?.order_index ?? -1) + 1

    const { data, error } = await db
      .from("pillars")
      .insert({ config_id: configId, name: name.trim(), weight, order_index: nextIndex, applicable_track_ids })
      .select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  // ── Update pillar ─────────────────────────────────────────────────────────
  if (action === "update_pillar") {
    const { pillar_id, name, weight, applicable_track_ids } = body
    if (!pillar_id) return NextResponse.json({ error: "pillar_id required" }, { status: 400 })
    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (weight !== undefined) updates.weight = weight
    if (applicable_track_ids !== undefined) updates.applicable_track_ids = applicable_track_ids

    const { data, error } = await db.from("pillars").update(updates).eq("id", pillar_id).eq("config_id", configId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // ── Delete pillar ─────────────────────────────────────────────────────────
  if (action === "delete_pillar") {
    const { pillar_id } = body
    if (!pillar_id) return NextResponse.json({ error: "pillar_id required" }, { status: 400 })
    const { error } = await db.from("pillars").delete().eq("id", pillar_id).eq("config_id", configId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Add competency ────────────────────────────────────────────────────────
  if (action === "add_competency") {
    const { pillar_id, name, weight = 1 } = body
    if (!pillar_id || !name?.trim()) return NextResponse.json({ error: "pillar_id and name required" }, { status: 400 })

    const { data: existing } = await db
      .from("competencies").select("order_index").eq("pillar_id", pillar_id)
      .order("order_index", { ascending: false }).limit(1)
    const nextIndex = (existing?.[0]?.order_index ?? -1) + 1

    const { data, error } = await db
      .from("competencies")
      .insert({ pillar_id, name: name.trim(), weight, order_index: nextIndex })
      .select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  // ── Update competency ─────────────────────────────────────────────────────
  if (action === "update_competency") {
    const { competency_id, name, weight } = body
    if (!competency_id) return NextResponse.json({ error: "competency_id required" }, { status: 400 })
    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (weight !== undefined) updates.weight = weight

    const { data, error } = await db.from("competencies").update(updates).eq("id", competency_id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // ── Delete competency ─────────────────────────────────────────────────────
  if (action === "delete_competency") {
    const { competency_id } = body
    if (!competency_id) return NextResponse.json({ error: "competency_id required" }, { status: 400 })
    const { error } = await db.from("competencies").delete().eq("id", competency_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
