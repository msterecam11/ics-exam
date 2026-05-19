import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ groupId: string }> }

/**
 * POST /api/interview/groups/[groupId]/resync-snapshot
 *
 * Re-reads the current live config and rebuilds config_snapshot without
 * changing the group status, locked state, or any scoring data.
 *
 * Use this when the config (pillar track assignments, weights, thresholds)
 * was updated AFTER the group was activated, causing the frozen snapshot
 * to be stale.
 */
export async function POST(_: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params

  // Load the group
  const { data: group } = await db
    .from("assessment_groups")
    .select("id, status, locked, config_id")
    .eq("id", groupId)
    .single()

  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Re-fetch current assessor weight matrix from group_assessors
  const { data: gaRows } = await db
    .from("group_assessors")
    .select("assessor_id, pillar_weights")
    .eq("group_id", groupId)

  const assessor_weights: Record<string, Record<string, number>> = {}
  for (const ga of gaRows ?? []) {
    assessor_weights[ga.assessor_id] = ga.pillar_weights ?? {}
  }

  // Re-fetch the live config — try with new columns first, fall back to base
  let { data: config, error: configErr } = await db
    .from("assessment_configs")
    .select(`
      id, name, assessor_weights, verdict_thresholds,
      insight_thresholds, rater_divergence_threshold,
      pillars (
        id, name, weight, order_index, applicable_track_ids,
        competencies ( id, name, description, weight, order_index )
      )
    `)
    .eq("id", group.config_id)
    .single()

  if (configErr || !config) {
    // Fallback: select without enhanced columns
    const fallback = await db
      .from("assessment_configs")
      .select(`
        id, name, assessor_weights, verdict_thresholds,
        pillars (
          id, name, weight, order_index, applicable_track_ids,
          competencies ( id, name, description, weight, order_index )
        )
      `)
      .eq("id", group.config_id)
      .single()

    if (fallback.error || !fallback.data)
      return NextResponse.json({ error: "Config not found" }, { status: 404 })

    config = {
      ...fallback.data,
      insight_thresholds: null,
      rater_divergence_threshold: null,
    } as any
  }

  // Normalise verdict_thresholds — config stores it as array [{key,label,min,max}],
  // but scoring engine needs object { strong_yes, yes, marginal }
  const rawVT2 = (config as any).verdict_thresholds
  const verdict_thresholds_normalised2 = Array.isArray(rawVT2)
    ? Object.fromEntries(rawVT2.map((t: any) => [t.key, t.min]))
    : rawVT2

  // Rebuild the snapshot from the CURRENT live config
  const snapshot = {
    id:                         config!.id,
    name:                       config!.name,
    assessor_weights,
    verdict_thresholds:         verdict_thresholds_normalised2,
    insight_thresholds:         (config as any).insight_thresholds ?? null,
    rater_divergence_threshold: (config as any).rater_divergence_threshold ?? null,
    pillars: ((config!.pillars as any[]) ?? [])
      .sort((a, b) => a.order_index - b.order_index)
      .map((p: any) => ({
        id:                   p.id,
        name:                 p.name,
        weight:               p.weight,
        order_index:          p.order_index,
        applicable_track_ids: Array.isArray(p.applicable_track_ids) ? p.applicable_track_ids : [],
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

  const { data: updated, error: updateErr } = await db
    .from("assessment_groups")
    .update({ config_snapshot: snapshot })
    .eq("id", groupId)
    .select()
    .single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, config_snapshot: updated.config_snapshot })
}
