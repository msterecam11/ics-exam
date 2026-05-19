import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ configId: string }> }

export async function GET(_: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { configId } = await params

  // ── Full query (requires config_enhancements.sql migration) ──────────────
  const { data, error } = await db
    .from("assessment_configs")
    .select(`
      id, name, description, assessor_weights, verdict_thresholds,
      insight_thresholds, rater_divergence_threshold, created_at,
      pillars (
        id, name, weight, order_index, applicable_track_ids, knockout_threshold,
        competencies ( id, name, description, weight, order_index )
      )
    `)
    .eq("id", configId)
    .single()

  if (!error && data) return NextResponse.json(data)

  // ── Fallback: new columns may not exist yet — try base schema ────────────
  const { data: base, error: baseErr } = await db
    .from("assessment_configs")
    .select(`
      id, name, description, assessor_weights, verdict_thresholds, created_at,
      pillars (
        id, name, weight, order_index, applicable_track_ids,
        competencies ( id, name, description, weight, order_index )
      )
    `)
    .eq("id", configId)
    .single()

  if (baseErr || !base) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Inject defaults for columns that don't exist yet
  return NextResponse.json({
    ...base,
    insight_thresholds: [],
    rater_divergence_threshold: null,
    pillars: (base.pillars ?? []).map((p: any) => ({ ...p, knockout_threshold: null })),
  })
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { configId } = await params
  const body = await req.json().catch(() => ({}))

  // Fields that can be patched on the config itself
  const allowed = ["name", "description", "assessor_weights", "verdict_thresholds",
                   "insight_thresholds", "rater_divergence_threshold"]
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

  // Verify config exists
  const { data: config } = await db.from("assessment_configs").select("id").eq("id", configId).single()
  if (!config) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // ── Cascade through all groups that use this config ───────────────────────
  const { data: groups } = await db
    .from("assessment_groups")
    .select("id")
    .eq("config_id", configId)
  const groupIds = (groups ?? []).map((g: any) => g.id)

  if (groupIds.length > 0) {
    // Get all candidates across those groups
    const { data: candidates } = await db
      .from("interview_candidates")
      .select("id")
      .in("group_id", groupIds)
    const candidateIds = (candidates ?? []).map((c: any) => c.id)

    // Delete scores
    if (candidateIds.length > 0) {
      await db.from("scores").delete().in("candidate_id", candidateIds)
    }

    // Delete qualitative assessments
    await db.from("candidate_assessments").delete().in("group_id", groupIds)

    // Delete candidates
    await db.from("interview_candidates").delete().in("group_id", groupIds)

    // Delete assessor assignments
    await db.from("group_assessors").delete().in("group_id", groupIds)

    // Delete AI report cache
    await db.from("interview_report_cache").delete().in("group_id", groupIds)

    // Delete the groups
    await db.from("assessment_groups").delete().in("id", groupIds)
  }

  // ── Delete config structure (competencies → pillars → config) ─────────────
  const { data: pillars } = await db
    .from("pillars")
    .select("id")
    .eq("config_id", configId)
  const pillarIds = (pillars ?? []).map((p: any) => p.id)

  if (pillarIds.length > 0) {
    await db.from("competencies").delete().in("pillar_id", pillarIds)
    await db.from("pillars").delete().in("id", pillarIds)
  }

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
    const { pillar_id, name, weight, applicable_track_ids, knockout_threshold } = body
    if (!pillar_id) return NextResponse.json({ error: "pillar_id required" }, { status: 400 })
    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (weight !== undefined) updates.weight = weight
    if (applicable_track_ids !== undefined) updates.applicable_track_ids = applicable_track_ids
    if ("knockout_threshold" in body) updates.knockout_threshold = knockout_threshold ?? null

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
    const { pillar_id, name, weight = 1, description } = body
    if (!pillar_id || !name?.trim()) return NextResponse.json({ error: "pillar_id and name required" }, { status: 400 })

    const { data: existing } = await db
      .from("competencies").select("order_index").eq("pillar_id", pillar_id)
      .order("order_index", { ascending: false }).limit(1)
    const nextIndex = (existing?.[0]?.order_index ?? -1) + 1

    const { data, error } = await db
      .from("competencies")
      .insert({ pillar_id, name: name.trim(), weight, order_index: nextIndex, description: description ?? null })
      .select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  // ── Update competency ─────────────────────────────────────────────────────
  if (action === "update_competency") {
    const { competency_id, name, weight, description } = body
    if (!competency_id) return NextResponse.json({ error: "competency_id required" }, { status: 400 })
    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (weight !== undefined) updates.weight = weight
    if (description !== undefined) updates.description = description

    // Verify competency belongs to a pillar in this config
    const { data: compCheck } = await db.from("competencies").select("pillar_id").eq("id", competency_id).single()
    if (!compCheck) return NextResponse.json({ error: "Competency not found" }, { status: 404 })
    const { data: pillarCheck } = await db.from("pillars").select("id").eq("id", compCheck.pillar_id).eq("config_id", configId).single()
    if (!pillarCheck) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { data, error } = await db.from("competencies").update(updates).eq("id", competency_id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // ── Delete competency ─────────────────────────────────────────────────────
  if (action === "delete_competency") {
    const { competency_id } = body
    if (!competency_id) return NextResponse.json({ error: "competency_id required" }, { status: 400 })

    // Verify competency belongs to a pillar in this config
    const { data: compCheck } = await db.from("competencies").select("pillar_id").eq("id", competency_id).single()
    if (!compCheck) return NextResponse.json({ error: "Competency not found" }, { status: 404 })
    const { data: pillarCheck } = await db.from("pillars").select("id").eq("id", compCheck.pillar_id).eq("config_id", configId).single()
    if (!pillarCheck) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { error } = await db.from("competencies").delete().eq("id", competency_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
