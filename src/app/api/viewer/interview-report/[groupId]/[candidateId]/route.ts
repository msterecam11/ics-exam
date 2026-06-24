import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { buildCandidateReport } from "@/lib/interview-scoring"
import type { RawScore, RawQualitative, ConfigSnapshot } from "@/lib/interview-scoring"

type Params = { params: Promise<{ groupId: string; candidateId: string }> }

export async function GET(_: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role ?? ""
  if (!["admin", "instructor", "viewer"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId, candidateId } = await params

  // Viewer: must have viewer_access with reports permission for this group (direct or via config)
  if (role === "viewer") {
    const { data: accessRows } = await db
      .from("viewer_access")
      .select("resource_type, resource_id, permissions")
      .eq("user_id", session.user.id)
      .eq("system", "interview")

    const rows = accessRows ?? []
    const directOk = rows.some(
      a => a.permissions?.reports && a.resource_type === "group" && a.resource_id === groupId
    )

    if (!directOk) {
      const { data: grp } = await db
        .from("assessment_groups")
        .select("config_id")
        .eq("id", groupId)
        .single()

      const configOk = grp?.config_id && rows.some(
        a => a.permissions?.reports && a.resource_type === "config" && a.resource_id === grp.config_id
      )

      if (!configOk) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  // ── Group + snapshot ────────────────────────────────────────────────────────
  const { data: group } = await db
    .from("assessment_groups")
    .select("id, name, status, config_snapshot, location, scheduled_date")
    .eq("id", groupId)
    .single()

  if (!group?.config_snapshot)
    return NextResponse.json({ error: "Group not found or not activated" }, { status: 404 })

  const snapshot = group.config_snapshot as ConfigSnapshot

  // ── Candidate ───────────────────────────────────────────────────────────────
  const { data: candidate } = await db
    .from("interview_candidates")
    .select("id, full_name, position, track_id, years_experience, notes")
    .eq("id", candidateId)
    .eq("group_id", groupId)
    .single()

  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 })

  let trackName: string | null = null
  if (candidate.track_id) {
    const { data: track } = await db.from("role_tracks").select("name").eq("id", candidate.track_id).single()
    trackName = track?.name ?? null
  }

  // ── Assessors ───────────────────────────────────────────────────────────────
  const { data: gaRows } = await db
    .from("group_assessors")
    .select("assessor_id, pillar_weights")
    .eq("group_id", groupId)

  const assessorIds = (gaRows ?? []).map((ga: any) => ga.assessor_id)
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

  // ── Scores + qualitative ────────────────────────────────────────────────────
  const { data: scoreData } = await db
    .from("scores")
    .select("candidate_id, assessor_id, competency_id, value, evidence")
    .eq("candidate_id", candidateId)

  const { data: qualData } = await db
    .from("candidate_assessments")
    .select("candidate_id, assessor_id, remarks, gap_analysis, recommendation, confirmed, confirmed_at")
    .eq("candidate_id", candidateId)
    .eq("group_id", groupId)

  // ── Build report ────────────────────────────────────────────────────────────
  const liveSnapshot: ConfigSnapshot = { ...snapshot, assessor_weights: assessor_pillar_weights }

  const report = buildCandidateReport(
    candidateId,
    liveSnapshot,
    (scoreData ?? []) as RawScore[],
    (qualData ?? []) as RawQualitative[],
    candidate.track_id ?? null,
  )

  return NextResponse.json({
    group:    { id: group.id, name: group.name, status: group.status, location: group.location, scheduled_date: group.scheduled_date },
    candidate: { ...candidate, track_name: trackName },
    assessors: Object.values(assessorMap),
    assessor_pillar_weights,
    snapshot:  liveSnapshot,
    report,
  })
}
