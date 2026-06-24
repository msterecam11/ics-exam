import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// Returns resolved interview data for the current viewer.
// Handles both scope types: group (one group) and config (all groups using that config).
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role
  if (role !== "viewer" && role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: accessRows, error: accessErr } = await db
    .from("viewer_access")
    .select("id, resource_type, resource_id, label, permissions")
    .eq("user_id", session.user.id)
    .eq("system", "interview")

  if (accessErr) return NextResponse.json({ error: accessErr.message }, { status: 500 })
  if (!accessRows || accessRows.length === 0) return NextResponse.json([])

  const items: any[] = []

  for (const row of accessRows) {
    let groupIds: string[] = []

    if (row.resource_type === "group") {
      groupIds = [row.resource_id]

    } else if (row.resource_type === "config") {
      const { data: groups } = await db
        .from("assessment_groups")
        .select("id")
        .eq("config_id", row.resource_id)
      groupIds = (groups ?? []).map((g: any) => g.id)
    }

    if (groupIds.length === 0) {
      items.push({ access_id: row.id, resource_type: row.resource_type, resource_id: row.resource_id, label: row.label, permissions: row.permissions, groups: [] })
      continue
    }

    // Fetch groups with their candidates, scoring progress, and assessor pillar weights
    const { data: groups } = await db
      .from("assessment_groups")
      .select(`
        id, name, status, scheduled_date, config_snapshot,
        interview_candidates(
          id, full_name, position, years_experience, track_id,
          role_tracks(name),
          scores(assessor_id, value),
          candidate_assessments(recommendation, confirmed)
        ),
        group_assessors(assessor_id, pillar_weights)
      `)
      .in("id", groupIds)

    const resolvedGroups = (groups ?? []).map((g: any) => {
      const pillars: any[] = g.config_snapshot?.pillars ?? []
      const groupAssessors: any[] = g.group_assessors ?? []

      const candidates = (g.interview_candidates ?? []).map((c: any) => {
        const allScores: any[] = c.scores ?? []
        // Count unique assessors who have submitted at least one score
        const scoredBy = new Set(allScores.map((s: any) => s.assessor_id)).size
        // Average competency score (1–5 scale) across all submitted scores
        const avgScore = allScores.length > 0
          ? Math.round((allScores.reduce((sum: number, s: any) => sum + (s.value ?? 0), 0) / allScores.length) * 10) / 10
          : null

        // Total assessors = those who have weight > 0 on at least one pillar
        // that applies to this candidate's track (mirrors the scoring page filter)
        const applicablePillarIds = new Set(
          pillars
            .filter((p: any) => {
              const trackIds: string[] = p.applicable_track_ids ?? []
              return trackIds.length === 0 || (c.track_id && trackIds.includes(c.track_id))
            })
            .map((p: any) => p.id)
        )

        const totalAssessors = groupAssessors.filter((ga: any) => {
          const weights: Record<string, number> = ga.pillar_weights ?? {}
          return Object.entries(weights).some(
            ([pillarId, weight]) => applicablePillarIds.has(pillarId) && Number(weight) > 0
          )
        }).length

        const assessment = (c.candidate_assessments ?? [])[0] ?? null

        return {
          id:               c.id,
          full_name:        c.full_name,
          position:         c.position ?? null,
          years_experience: c.years_experience ?? null,
          track_name:       c.role_tracks?.name ?? null,
          group_id:         g.id,
          group_name:       g.name,
          scoring_progress: { scored_by: scoredBy, total_assessors: totalAssessors },
          avg_score:        avgScore,
          recommendation:   assessment?.recommendation ?? null,
          confirmed:        assessment?.confirmed ?? false,
        }
      })

      return {
        id:   g.id,
        name: g.name,
        status: g.status,
        scheduled_date: g.scheduled_date,
        candidates,
      }
    })

    items.push({
      access_id:     row.id,
      resource_type: row.resource_type,
      resource_id:   row.resource_id,
      label:         row.label ?? "",
      permissions:   row.permissions ?? {},
      groups:        resolvedGroups,
    })
  }

  return NextResponse.json(items)
}
