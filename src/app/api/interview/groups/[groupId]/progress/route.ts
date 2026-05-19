import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ groupId: string }> }

/**
 * GET /api/interview/groups/[groupId]/progress
 *
 * Admin view of per-assessor scoring progress.
 * Applies the same filters as the assessor scoring page:
 *   1. Pillar weight filter  — only pillars where assessor weight > 0
 *   2. Track filter          — only pillars whose applicable_track_ids include the candidate's track (or all tracks)
 *
 * A candidate is skipped entirely for an assessor if they have 0 applicable pillars.
 * Progress = how many of their applicable candidates have been confirmed / in-progress / not started.
 */
export async function GET(_: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params

  // ── 1. Group snapshot + candidates + assessors in parallel ───────────────────
  const [groupRes, candidatesRes, gaRows] = await Promise.all([
    db.from("assessment_groups")
      .select("config_snapshot")
      .eq("id", groupId)
      .single(),
    db.from("interview_candidates")
      .select("id, track_id")
      .eq("group_id", groupId),
    db.from("group_assessors")
      .select("assessor_id, pillar_weights")
      .eq("group_id", groupId),
  ])

  const snapshot   = (groupRes.data as any)?.config_snapshot
  const pillars: {
    id: string
    applicable_track_ids: string[]
    competencies: { id: string }[]
  }[] = snapshot?.pillars ?? []

  const candidates = candidatesRes.data ?? []
  const candidateIds = candidates.map((c: any) => c.id)

  const assessorRows = gaRows.data ?? []
  const assessorIds  = assessorRows.map((ga: any) => ga.assessor_id)

  if (assessorIds.length === 0 || candidateIds.length === 0) {
    return NextResponse.json({ assessors: [], all_done: true })
  }

  // ── 2. Resolve assessor user info ────────────────────────────────────────────
  const { data: assessorUsers } = await db
    .from("admin_users")
    .select("id, name, email")
    .in("id", assessorIds)

  const userMap: Record<string, { name: string; email: string }> = {}
  for (const u of assessorUsers ?? []) userMap[u.id] = u

  // ── 3. Fetch all scores + confirmations for this group ───────────────────────
  const [scoresRes, confirmRes] = await Promise.all([
    db.from("scores")
      .select("assessor_id, candidate_id, competency_id")
      .in("candidate_id", candidateIds)
      .in("assessor_id", assessorIds),
    db.from("candidate_assessments")
      .select("assessor_id, candidate_id, confirmed")
      .eq("group_id", groupId)
      .in("assessor_id", assessorIds),
  ])

  // Build fast lookup sets
  // scored: `assessorId:candidateId:competencyId`
  const scoredSet = new Set<string>()
  for (const s of scoresRes.data ?? []) {
    scoredSet.add(`${s.assessor_id}:${s.candidate_id}:${s.competency_id}`)
  }

  // confirmed: `assessorId:candidateId`
  const confirmedSet = new Set<string>()
  for (const c of confirmRes.data ?? []) {
    if (c.confirmed) confirmedSet.add(`${c.assessor_id}:${c.candidate_id}`)
  }

  // ── 4. Helper: get applicable competency IDs for an assessor × candidate ─────
  function getApplicableCompetencyIds(
    pillarWeights: Record<string, number>,
    candidateTrackId: string | null,
  ): string[] {
    const hasWeightMap = Object.keys(pillarWeights).length > 0
    const result: string[] = []

    for (const pillar of pillars) {
      // Track filter
      const trackIds: string[] = Array.isArray(pillar.applicable_track_ids)
        ? pillar.applicable_track_ids : []
      const trackOk = trackIds.length === 0 ||
        (candidateTrackId ? trackIds.includes(candidateTrackId) : true)

      // Weight filter — missing from map = excluded when map is non-empty
      const weightOk = !hasWeightMap || (pillarWeights[pillar.id] ?? 0) > 0

      if (trackOk && weightOk) {
        for (const comp of pillar.competencies ?? []) {
          result.push(comp.id)
        }
      }
    }
    return result
  }

  // ── 5. Compute per-assessor stats ─────────────────────────────────────────────
  const assessors = assessorRows.map((ga: any) => {
    const pillarWeights: Record<string, number> = ga.pillar_weights ?? {}
    let confirmed  = 0
    let inProgress = 0
    let notStarted = 0
    let applicable = 0  // candidates this assessor actually scores

    for (const candidate of candidates) {
      const compIds = getApplicableCompetencyIds(pillarWeights, candidate.track_id)
      if (compIds.length === 0) continue  // assessor has nothing to score for this candidate

      applicable++
      const key = `${ga.assessor_id}:${candidate.id}`

      if (confirmedSet.has(key)) {
        confirmed++
      } else {
        const hasAnyScore = compIds.some(cid =>
          scoredSet.has(`${ga.assessor_id}:${candidate.id}:${cid}`)
        )
        if (hasAnyScore) inProgress++
        else             notStarted++
      }
    }

    return {
      assessor_id:  ga.assessor_id,
      name:         userMap[ga.assessor_id]?.name  ?? "Unknown",
      email:        userMap[ga.assessor_id]?.email ?? "",
      confirmed,
      in_progress:  inProgress,
      not_started:  notStarted,
      total:        applicable,
    }
  })

  const allDone = assessors.length > 0 &&
    assessors.every(a => a.total === 0 || a.confirmed === a.total)

  return NextResponse.json({ assessors, all_done: allDone })
}
