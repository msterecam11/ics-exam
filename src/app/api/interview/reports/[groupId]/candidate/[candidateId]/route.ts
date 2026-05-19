import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { buildCandidateReport } from "@/lib/interview-scoring"
import type { RawScore, RawQualitative, ConfigSnapshot } from "@/lib/interview-scoring"

type Params = { params: Promise<{ groupId: string; candidateId: string }> }

/**
 * GET /api/interview/reports/[groupId]/candidate/[candidateId]
 * Full computed report for one candidate.
 */
export async function GET(_: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId, candidateId } = await params

  // ── 1. Group + snapshot ──────────────────────────────────────────────────
  const { data: group } = await db
    .from("assessment_groups")
    .select("id, name, status, config_snapshot, location, scheduled_date")
    .eq("id", groupId)
    .single()

  if (!group || !group.config_snapshot)
    return NextResponse.json({ error: "Group not found or not activated" }, { status: 404 })

  const snapshot = group.config_snapshot as ConfigSnapshot

  // ── 2. Candidate ─────────────────────────────────────────────────────────
  const { data: candidate } = await db
    .from("interview_candidates")
    .select("id, full_name, position, track_id, years_experience, notes")
    .eq("id", candidateId)
    .eq("group_id", groupId)
    .single()

  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 })

  // Resolve track name
  let trackName: string | null = null
  if (candidate.track_id) {
    const { data: track } = await db.from("role_tracks").select("name").eq("id", candidate.track_id).single()
    trackName = track?.name ?? null
  }

  // ── 3. Assessors (with live pillar_weights for display) ──────────────────
  const { data: gaRows } = await db
    .from("group_assessors")
    .select("assessor_id, pillar_weights")
    .eq("group_id", groupId)

  const assessorIds = (gaRows ?? []).map((ga: any) => ga.assessor_id)

  // Live per-assessor per-pillar weights (used in UI for column filtering)
  const assessor_pillar_weights: Record<string, Record<string, number>> = {}
  for (const ga of gaRows ?? []) {
    assessor_pillar_weights[ga.assessor_id] = (ga as any).pillar_weights ?? {}
  }

  let assessorMap: Record<string, { id: string; name: string; email: string }> = {}
  if (assessorIds.length > 0) {
    const { data: users } = await db
      .from("admin_users")
      .select("id, name, email")
      .in("id", assessorIds)
    for (const u of users ?? []) assessorMap[u.id] = u
  }

  // ── 4. Scores for this candidate ─────────────────────────────────────────
  const { data: scoreData } = await db
    .from("scores")
    .select("candidate_id, assessor_id, competency_id, value, evidence")
    .eq("candidate_id", candidateId)

  const scores = (scoreData ?? []) as RawScore[]

  // ── 5. Qualitative for this candidate ────────────────────────────────────
  const { data: qualData } = await db
    .from("candidate_assessments")
    .select("candidate_id, assessor_id, remarks, gap_analysis, recommendation, confirmed, confirmed_at")
    .eq("candidate_id", candidateId)
    .eq("group_id", groupId)

  const qualitative = (qualData ?? []) as RawQualitative[]

  // ── 6. Compute report ────────────────────────────────────────────────────
  // Override frozen snapshot assessor_weights with live group_assessors data.
  // This ensures scoring always reflects the current per-assessor per-pillar
  // weights, even if the snapshot was activated before weights were configured.
  const liveSnapshot: ConfigSnapshot = { ...snapshot, assessor_weights: assessor_pillar_weights }

  const report = buildCandidateReport(
    candidateId,
    liveSnapshot,
    scores,
    qualitative,
    candidate.track_id ?? null,
  )

  return NextResponse.json({
    group: {
      id:             group.id,
      name:           group.name,
      status:         group.status,
      location:       group.location,
      scheduled_date: group.scheduled_date,
    },
    candidate: { ...candidate, track_name: trackName },
    assessors: Object.values(assessorMap),
    assessor_pillar_weights,         // live per-assessor per-pillar weights for display
    snapshot: liveSnapshot,          // snapshot with live assessor_weights merged in
    report,
  })
}
