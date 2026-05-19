import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ groupId: string }> }

export async function GET(_: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { groupId } = await params

  // ── 1. Core group ──────────────────────────────────────────────────────────
  const { data: group, error: groupErr } = await db
    .from("assessment_groups")
    .select("id, name, location, scheduled_date, status, config_snapshot, locked, created_at, config_id")
    .eq("id", groupId)
    .single()

  if (groupErr || !group) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // ── 2. Config with nested pillars / competencies (flat joins are fine here) ─
  const { data: config } = await db
    .from("assessment_configs")
    .select(`
      id, name, description, assessor_weights, verdict_thresholds,
      pillars (
        id, name, weight, order_index, applicable_track_ids,
        competencies ( id, name, description, weight, order_index )
      )
    `)
    .eq("id", group.config_id)
    .single()

  // ── 3. Candidates (with track name resolved separately to avoid nested join issues) ─
  const { data: candidates } = await db
    .from("interview_candidates")
    .select("id, full_name, position, track_id, years_experience, notes, created_at")
    .eq("group_id", groupId)
    .order("created_at")

  // Resolve track names
  const trackIds = [...new Set((candidates ?? []).map(c => c.track_id).filter(Boolean))] as string[]
  let tracksMap: Record<string, { id: string; name: string }> = {}
  if (trackIds.length > 0) {
    const { data: tracks } = await db
      .from("role_tracks")
      .select("id, name")
      .in("id", trackIds)
    for (const t of tracks ?? []) tracksMap[t.id] = t
  }
  const candidatesWithTracks = (candidates ?? []).map(c => ({
    ...c,
    role_tracks: c.track_id ? (tracksMap[c.track_id] ?? null) : null,
  }))

  // ── 4. Assessors — fetch IDs then users separately (avoids nested join) ────
  const { data: gaRows } = await db
    .from("group_assessors")
    .select("assessor_id, pillar_weights, candidate_ids")
    .eq("group_id", groupId)

  const assessorIds = (gaRows ?? []).map(ga => ga.assessor_id)
  let assessorMap: Record<string, any> = {}
  if (assessorIds.length > 0) {
    const { data: assessorUsers } = await db
      .from("admin_users")
      .select("id, name, email, role")
      .in("id", assessorIds)
    for (const a of assessorUsers ?? []) assessorMap[a.id] = a
  }
  const group_assessors = (gaRows ?? []).map(ga => ({
    assessor_id:    ga.assessor_id,
    pillar_weights: ga.pillar_weights ?? {},
    candidate_ids:  ga.candidate_ids  ?? null,
    admin_users:    assessorMap[ga.assessor_id] ?? null,
  }))

  return NextResponse.json({
    ...group,
    assessment_configs: config ?? null,
    interview_candidates: candidatesWithTracks,
    group_assessors,
  })
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params
  const body = await req.json().catch(() => ({}))

  const allowed = ["name", "location", "scheduled_date"]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "No valid fields" }, { status: 400 })

  const { data, error } = await db
    .from("assessment_groups")
    .update(updates)
    .eq("id", groupId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params

  // Verify group exists
  const { data: group } = await db.from("assessment_groups").select("id").eq("id", groupId).single()
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // ── Cascade delete ────────────────────────────────────────────────────────
  // 1. Get all candidate IDs in this group
  const { data: candidates } = await db
    .from("interview_candidates")
    .select("id")
    .eq("group_id", groupId)
  const candidateIds = (candidates ?? []).map((c: any) => c.id)

  // 2. Delete scores (linked to candidate_id)
  if (candidateIds.length > 0) {
    await db.from("scores").delete().in("candidate_id", candidateIds)
  }

  // 3. Delete candidate qualitative assessments
  await db.from("candidate_assessments").delete().eq("group_id", groupId)

  // 4. Delete candidates
  await db.from("interview_candidates").delete().eq("group_id", groupId)

  // 5. Delete assessor assignments
  await db.from("group_assessors").delete().eq("group_id", groupId)

  // 6. Delete AI report cache
  await db.from("interview_report_cache").delete().eq("group_id", groupId)

  // 7. Delete the group itself
  const { error } = await db.from("assessment_groups").delete().eq("id", groupId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
