import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ groupId: string }> }

export async function POST(_: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params

  // Load group + config (flat, no nested joins)
  const { data: group } = await db
    .from("assessment_groups")
    .select("id, status, config_id")
    .eq("id", groupId)
    .single()

  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (group.status !== "draft")
    return NextResponse.json({ error: "Only draft groups can be activated" }, { status: 409 })

  // Load the assessor × pillar weight matrix for this group
  const { data: gaRows } = await db
    .from("group_assessors")
    .select("assessor_id, pillar_weights")
    .eq("group_id", groupId)

  // Build assessor_weights map: { assessorId: { pillarId: weight } }
  const assessor_weights: Record<string, Record<string, number>> = {}
  for (const ga of gaRows ?? []) {
    assessor_weights[ga.assessor_id] = ga.pillar_weights ?? {}
  }

  // Load config separately to avoid nested join issues
  const { data: config } = await db
    .from("assessment_configs")
    .select(`
      id, name, assessor_weights, verdict_thresholds,
      insight_thresholds, rater_divergence_threshold,
      pillars (
        id, name, weight, order_index, applicable_track_ids, knockout_threshold,
        competencies ( id, name, description, weight, order_index )
      )
    `)
    .eq("id", group.config_id)
    .single()

  if (!config) return NextResponse.json({ error: "No config attached" }, { status: 400 })

  // Normalise verdict_thresholds — config stores it as array [{key,label,min,max}],
  // but scoring engine needs object { strong_yes, yes, marginal }
  const rawVT = config.verdict_thresholds as any
  const verdict_thresholds_normalised = Array.isArray(rawVT)
    ? Object.fromEntries(rawVT.map((t: any) => [t.key, t.min]))
    : rawVT

  // Build frozen snapshot — all score calculations + reports use this, never the live config
  const snapshot = {
    id:                        config.id,
    name:                      config.name,
    assessor_weights,          // built from group_assessors.pillar_weights
    verdict_thresholds:        verdict_thresholds_normalised,
    insight_thresholds:        config.insight_thresholds,
    rater_divergence_threshold: config.rater_divergence_threshold,
    pillars: ((config.pillars as any[]) ?? [])
      .sort((a, b) => a.order_index - b.order_index)
      .map(p => ({
        id:                   p.id,
        name:                 p.name,
        weight:               p.weight,
        order_index:          p.order_index,
        applicable_track_ids: p.applicable_track_ids,
        knockout_threshold:   p.knockout_threshold ?? null,
        competencies: ((p.competencies as any[]) ?? [])
          .sort((a: any, b: any) => a.order_index - b.order_index)
          .map((c: any) => ({
            id:          c.id,
            name:        c.name,
            description: c.description ?? null,
            weight:      c.weight,
            order_index: c.order_index,
          })),
      })),
  }

  const { data, error } = await db
    .from("assessment_groups")
    .update({ status: "active", config_snapshot: snapshot })
    .eq("id", groupId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
