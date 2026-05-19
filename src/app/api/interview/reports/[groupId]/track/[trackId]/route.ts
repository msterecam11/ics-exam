import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { buildCandidateReport, buildGroupStats } from "@/lib/interview-scoring"
import type { RawScore, RawQualitative, ConfigSnapshot } from "@/lib/interview-scoring"

type Params = { params: Promise<{ groupId: string; trackId: string }> }

/**
 * GET /api/interview/reports/[groupId]/track/[trackId]
 * Computed report data for all candidates in one track.
 */
export async function GET(_: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId, trackId } = await params

  // ── 1. Group + snapshot ──────────────────────────────────────────────────
  const { data: group } = await db
    .from("assessment_groups")
    .select("id, name, status, config_snapshot")
    .eq("id", groupId)
    .single()

  if (!group || !group.config_snapshot)
    return NextResponse.json({ error: "Group not found or not activated" }, { status: 404 })

  const snapshot = group.config_snapshot as ConfigSnapshot

  // ── 2. Track ─────────────────────────────────────────────────────────────
  const { data: track } = await db
    .from("role_tracks")
    .select("id, name")
    .eq("id", trackId)
    .single()

  if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 })

  // ── 3. Candidates in this track ──────────────────────────────────────────
  const { data: candidates } = await db
    .from("interview_candidates")
    .select("id, full_name, position, track_id, years_experience")
    .eq("group_id", groupId)
    .eq("track_id", trackId)
    .order("full_name")

  const candidateIds = (candidates ?? []).map((c: any) => c.id)
  if (candidateIds.length === 0) {
    return NextResponse.json({ error: "No candidates in this track" }, { status: 404 })
  }

  // ── 3b. Live assessor pillar_weights ────────────────────────────────────
  const { data: gaRows } = await db
    .from("group_assessors")
    .select("assessor_id, pillar_weights")
    .eq("group_id", groupId)

  const liveAssessorWeights: Record<string, Record<string, number>> = {}
  for (const ga of gaRows ?? []) {
    liveAssessorWeights[(ga as any).assessor_id] = (ga as any).pillar_weights ?? {}
  }

  // Merge live weights into snapshot so scoring engine uses current configuration
  const liveSnapshot: ConfigSnapshot = { ...snapshot, assessor_weights: liveAssessorWeights }

  // ── 4. Scores ────────────────────────────────────────────────────────────
  const { data: scoreData } = await db
    .from("scores")
    .select("candidate_id, assessor_id, competency_id, value, evidence")
    .in("candidate_id", candidateIds)

  const scores = (scoreData ?? []) as RawScore[]

  // ── 5. Qualitative ───────────────────────────────────────────────────────
  const { data: qualData } = await db
    .from("candidate_assessments")
    .select("candidate_id, assessor_id, remarks, gap_analysis, recommendation, confirmed, confirmed_at")
    .eq("group_id", groupId)
    .in("candidate_id", candidateIds)

  const qualitative = (qualData ?? []) as RawQualitative[]

  // ── 6. Compute reports ───────────────────────────────────────────────────
  const reports = (candidates ?? []).map((c: any) => {
    const candidateQual = qualitative.filter(q => q.candidate_id === c.id)
    return buildCandidateReport(c.id, liveSnapshot, scores, candidateQual, trackId)
  })

  const candidateMeta = (candidates ?? []).map((c: any) => ({
    id: c.id, track_id: trackId, track_name: track.name,
  }))
  const trackStats = buildGroupStats(reports, candidateMeta, liveSnapshot)

  return NextResponse.json({
    group:      { id: group.id, name: group.name, status: group.status },
    track,
    candidates: candidates ?? [],
    snapshot:   liveSnapshot,
    reports,
    track_stats: trackStats,
  })
}
