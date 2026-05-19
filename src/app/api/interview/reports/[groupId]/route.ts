import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { buildCandidateReport, buildGroupStats } from "@/lib/interview-scoring"
import type { RawScore, RawQualitative, ConfigSnapshot } from "@/lib/interview-scoring"

type Params = { params: Promise<{ groupId: string }> }

/**
 * GET /api/interview/reports/[groupId]
 * Full computed group report data — scores, verdicts, stats for all candidates.
 * Accessible by admin/instructor only.
 */
export async function GET(_: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params

  // ── 1. Load group + snapshot ─────────────────────────────────────────────
  const { data: group } = await db
    .from("assessment_groups")
    .select("id, name, status, config_snapshot, location, scheduled_date")
    .eq("id", groupId)
    .single()

  if (!group)           return NextResponse.json({ error: "Not found" },           { status: 404 })
  if (!group.config_snapshot) return NextResponse.json({ error: "No snapshot — group not activated" }, { status: 400 })
  if (!["complete", "published"].includes(group.status))
    return NextResponse.json({ error: "Reports only available for complete/published groups" }, { status: 409 })

  const snapshot = group.config_snapshot as ConfigSnapshot

  // ── 2. Load candidates ───────────────────────────────────────────────────
  const { data: candidates } = await db
    .from("interview_candidates")
    .select("id, full_name, position, track_id, years_experience, created_at")
    .eq("group_id", groupId)
    .order("created_at")

  const candidateIds = (candidates ?? []).map((c: any) => c.id)

  // ── 3. Resolve track names ───────────────────────────────────────────────
  const trackIds = [...new Set((candidates ?? []).map((c: any) => c.track_id).filter(Boolean))] as string[]
  let trackMap: Record<string, string> = {}
  if (trackIds.length > 0) {
    const { data: tracks } = await db.from("role_tracks").select("id, name").in("id", trackIds)
    for (const t of tracks ?? []) trackMap[t.id] = t.name
  }

  // ── 4. Load assessors in group (with live pillar_weights) ───────────────
  const { data: gaRows } = await db
    .from("group_assessors")
    .select("assessor_id, pillar_weights")
    .eq("group_id", groupId)

  const assessorIds = (gaRows ?? []).map((ga: any) => ga.assessor_id)

  // Build live assessor_weights map from group_assessors (overrides frozen snapshot)
  const liveAssessorWeights: Record<string, Record<string, number>> = {}
  for (const ga of gaRows ?? []) {
    liveAssessorWeights[(ga as any).assessor_id] = (ga as any).pillar_weights ?? {}
  }

  let assessorMap: Record<string, { id: string; name: string; email: string }> = {}
  if (assessorIds.length > 0) {
    const { data: users } = await db
      .from("admin_users")
      .select("id, name, email")
      .in("id", assessorIds)
    for (const u of users ?? []) assessorMap[u.id] = u
  }

  // ── 5. Load all scores ───────────────────────────────────────────────────
  let scores: RawScore[] = []
  if (candidateIds.length > 0) {
    const { data } = await db
      .from("scores")
      .select("candidate_id, assessor_id, competency_id, value, evidence")
      .in("candidate_id", candidateIds)
    scores = (data ?? []) as RawScore[]
  }

  // ── 6. Load all qualitative ──────────────────────────────────────────────
  let qualitative: RawQualitative[] = []
  if (candidateIds.length > 0) {
    const { data } = await db
      .from("candidate_assessments")
      .select("candidate_id, assessor_id, remarks, gap_analysis, recommendation, confirmed, confirmed_at")
      .eq("group_id", groupId)
    qualitative = (data ?? []) as RawQualitative[]
  }

  // ── 7. Build per-candidate reports ───────────────────────────────────────
  // Use live assessor_weights (not frozen snapshot) so scoring reflects current config
  const liveSnapshot: ConfigSnapshot = { ...snapshot, assessor_weights: liveAssessorWeights }

  let reports: ReturnType<typeof buildCandidateReport>[]
  let groupStats: ReturnType<typeof buildGroupStats>
  try {
    reports = (candidates ?? []).map((c: any) => {
      const candidateQual = qualitative.filter(q => q.candidate_id === c.id)
      return buildCandidateReport(c.id, liveSnapshot, scores, candidateQual, c.track_id ?? null)
    })

    // ── 8. Build group stats ───────────────────────────────────────────────
    const candidateMeta = (candidates ?? []).map((c: any) => ({
      id:         c.id,
      track_id:   c.track_id,
      track_name: c.track_id ? (trackMap[c.track_id] ?? null) : null,
    }))
    groupStats = buildGroupStats(reports, candidateMeta, liveSnapshot)
  } catch (err: any) {
    console.error("[report] scoring engine error:", err)
    return NextResponse.json({ error: `Scoring engine error: ${err?.message ?? "unknown"}` }, { status: 500 })
  }

  // ── 9. Assessor scoring summaries (for bias report) ──────────────────────
  const assessorSummaries = assessorIds.map(assessorId => {
    const aScores = scores.filter(s => s.assessor_id === assessorId).map(s => s.value)
    const groupAvg = scores.length > 0 ? scores.reduce((s, v) => s + v.value, 0) / scores.length : 0
    const avg = aScores.length > 0 ? aScores.reduce((s, v) => s + v, 0) / aScores.length : 0
    const centralCount = aScores.filter(v => v >= 3.0 && v <= 3.8).length
    return {
      id:   assessorId,
      name: assessorMap[assessorId]?.name ?? "Unknown",
      avg_score:             Math.round(avg * 100) / 100,
      group_avg:             Math.round(groupAvg * 100) / 100,
      score_range:           { min: Math.min(...aScores, 5), max: Math.max(...aScores, 1) },
      central_tendency_pct:  aScores.length > 0 ? Math.round((centralCount / aScores.length) * 100) : 0,
    }
  })

  return NextResponse.json({
    group: {
      id:             group.id,
      name:           group.name,
      status:         group.status,
      location:       group.location,
      scheduled_date: group.scheduled_date,
    },
    snapshot: liveSnapshot,
    candidates: (candidates ?? []).map((c: any) => ({
      ...c,
      track_name: c.track_id ? (trackMap[c.track_id] ?? null) : null,
    })),
    assessors: Object.values(assessorMap),
    assessor_summaries: assessorSummaries,
    reports,          // CandidateReportData[]
    group_stats: groupStats,
  })
}
