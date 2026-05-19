export const maxDuration = 60

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { buildCandidateReport, buildGroupStats } from "@/lib/interview-scoring"
import type { RawScore, RawQualitative, ConfigSnapshot } from "@/lib/interview-scoring"
import {
  genGroupNarrative, genSystemicGapDetector,
  genTrackSummary, genCommonStrengthsGaps,
  genAssessorBiasReport, genTalentMapCommentary, genCohortPrediction,
  genAlternativePaths,
} from "@/lib/interview-ai"

type Params = { params: Promise<{ groupId: string }> }

/**
 * POST /api/interview/reports/[groupId]/generate
 *
 * Triggers AI generation for the entire group.
 * Optimised for low API consumption:
 *  – Evidence rephrased in ONE call per pillar (not per competency)
 *  – Development area insights in ONE call per candidate
 *  – Uses fast model for simple rephrasing; large model for key insights
 *  – Skips sections with no data
 *  – 500ms delay between candidates to respect Groq rate limits
 */
export async function POST(_: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params

  // ── Load group + snapshot ────────────────────────────────────────────────
  const { data: group } = await db
    .from("assessment_groups")
    .select("id, name, status, config_snapshot")
    .eq("id", groupId)
    .single()

  if (!group || !group.config_snapshot)
    return NextResponse.json({ error: "Group not found or not activated" }, { status: 404 })

  if (!["complete", "published"].includes(group.status))
    return NextResponse.json({ error: "Group must be complete or published" }, { status: 409 })

  const snapshot = group.config_snapshot as ConfigSnapshot

  // ── Candidates ───────────────────────────────────────────────────────────
  const { data: candidates } = await db
    .from("interview_candidates")
    .select("id, full_name, position, track_id, years_experience")
    .eq("group_id", groupId)

  const candidateIds = (candidates ?? []).map((c: any) => c.id)

  // Track names
  const trackIds = [...new Set((candidates ?? []).map((c: any) => c.track_id).filter(Boolean))] as string[]
  let trackMap: Record<string, string> = {}
  if (trackIds.length > 0) {
    const { data: tracks } = await db.from("role_tracks").select("id, name").in("id", trackIds)
    for (const t of tracks ?? []) trackMap[t.id] = t.name
  }

  // ── Assessors + live pillar_weights ──────────────────────────────────────
  const { data: gaRows } = await db
    .from("group_assessors")
    .select("assessor_id, pillar_weights")
    .eq("group_id", groupId)

  const assessorIds = (gaRows ?? []).map((ga: any) => ga.assessor_id)

  const liveAssessorWeights: Record<string, Record<string, number>> = {}
  for (const ga of gaRows ?? []) {
    liveAssessorWeights[(ga as any).assessor_id] = (ga as any).pillar_weights ?? {}
  }

  let assessorMap: Record<string, { id: string; name: string; email: string }> = {}
  if (assessorIds.length > 0) {
    const { data: users } = await db.from("admin_users").select("id, name, email").in("id", assessorIds)
    for (const u of users ?? []) assessorMap[u.id] = u
  }
  // ── Scores + Qualitative ─────────────────────────────────────────────────
  let scores: RawScore[] = []
  let qualitative: RawQualitative[] = []
  if (candidateIds.length > 0) {
    const [scoresRes, qualRes] = await Promise.all([
      db.from("scores").select("candidate_id, assessor_id, competency_id, value, evidence").in("candidate_id", candidateIds),
      db.from("candidate_assessments").select("candidate_id, assessor_id, remarks, gap_analysis, recommendation, confirmed, confirmed_at").eq("group_id", groupId),
    ])
    scores      = (scoresRes.data ?? []) as RawScore[]
    qualitative = (qualRes.data ?? []) as RawQualitative[]
  }

  // ── Use live snapshot (live assessor_weights override) ───────────────────
  const liveSnapshot: ConfigSnapshot = { ...snapshot, assessor_weights: liveAssessorWeights }

  // Build computed reports with live weights
  const reports = (candidates ?? []).map((c: any) => {
    const candidateQual = qualitative.filter(q => q.candidate_id === c.id)
    return { candidate: c, report: buildCandidateReport(c.id, liveSnapshot, scores, candidateQual, c.track_id ?? null) }
  })

  const candidateMeta = (candidates ?? []).map((c: any) => ({
    id: c.id, track_id: c.track_id, track_name: c.track_id ? (trackMap[c.track_id] ?? null) : null,
  }))
  const groupStats = buildGroupStats(reports.map(r => r.report), candidateMeta, liveSnapshot)

  // ── Cache helper ─────────────────────────────────────────────────────────
  // Always pass ALL three scope columns (null for unset) so Supabase NOT-NULL
  // constraints are never violated and the ai-cache GET query (IS NULL filter)
  // matches correctly.
  async function saveCache(
    section: string,
    content: string | null,
    scope: { group_id?: string; candidate_id?: string; track_id?: string }
  ) {
    if (!content?.trim()) return
    const row = {
      section,
      content,
      group_id:     scope.group_id     ?? null,
      candidate_id: scope.candidate_id ?? null,
      track_id:     scope.track_id     ?? null,
    }
    await db.from("interview_report_cache")
      .delete()
      .match({ section, group_id: row.group_id, candidate_id: row.candidate_id, track_id: row.track_id })
    const { error } = await db.from("interview_report_cache").insert(row)
    if (error) console.error(`[generate] saveCache failed for section="${section}":`, error.message)
  }

  // ── GROUP-level AI ────────────────────────────────────────────────────────
  const pillar0 = liveSnapshot.pillars?.[0]?.name ?? "Pillar 1"
  const pillar1 = liveSnapshot.pillars?.[1]?.name ?? "Pillar 2"

  let groupNarrative: string | null      = null
  let systemicGap: string | null         = null
  let talentMapCommentary: string | null = null
  let cohortPrediction: string | null    = null
  let assessorBias: string | null        = null

  try {
    ;[groupNarrative, systemicGap, talentMapCommentary, cohortPrediction] = await Promise.all([
      genGroupNarrative(group.name, groupStats, liveSnapshot),
      genSystemicGapDetector(groupStats, groupStats.total_candidates),
      genTalentMapCommentary(groupStats, [pillar0, pillar1]),
      genCohortPrediction(group.name, groupStats),
    ])
    console.log("[generate] group AI — narrative:", !!groupNarrative, "systemic:", !!systemicGap, "talentMap:", !!talentMapCommentary, "cohort:", !!cohortPrediction)
  } catch (err: any) {
    console.error("[generate] group AI error:", err?.message ?? err)
    return NextResponse.json({ error: "AI generation failed: " + (err?.message ?? "unknown error") }, { status: 500 })
  }

  // Assessor bias — needs assessor_summaries built from loaded data
  const assessorSummaryList = assessorIds.map(aId => {
    const aScores  = scores.filter(s => s.assessor_id === aId).map(s => s.value).filter((v): v is number => v != null)
    const avg      = aScores.length > 0 ? aScores.reduce((s, v) => s + v, 0) / aScores.length : 0
    const allAvg   = scores.map(s => s.value).filter((v): v is number => v != null)
    const groupAvg = allAvg.length > 0 ? allAvg.reduce((s, v) => s + v, 0) / allAvg.length : 0
    const central  = aScores.filter(v => v >= 3.0 && v <= 3.8).length
    return {
      name:                 assessorMap[aId]?.name ?? "Unknown",
      avg_score:            Math.round(avg * 100) / 100,
      group_avg:            Math.round(groupAvg * 100) / 100,
      score_range:          { min: aScores.length > 0 ? Math.min(...aScores) : 0, max: aScores.length > 0 ? Math.max(...aScores) : 0 },
      central_tendency_pct: aScores.length > 0 ? Math.round((central / aScores.length) * 100) : 0,
    }
  }).filter(a => a.avg_score > 0)

  try {
    assessorBias = await genAssessorBiasReport(assessorSummaryList)
    console.log("[generate] assessorBias:", !!assessorBias)
  } catch (err: any) {
    console.error("[generate] assessorBias error:", err?.message ?? err)
  }

  await Promise.all([
    saveCache("group_narrative",       groupNarrative,       { group_id: groupId }),
    saveCache("systemic_gap",          systemicGap,          { group_id: groupId }),
    saveCache("talent_map_commentary", talentMapCommentary,  { group_id: groupId }),
    saveCache("cohort_prediction",     cohortPrediction,     { group_id: groupId }),
    saveCache("assessor_bias",         assessorBias,         { group_id: groupId }),
  ])

  // ── TRACK-level AI ───────────────────────────────────────────────────────
  for (const trackId of trackIds) {
    const trackReports = reports.filter(r => r.candidate?.track_id === trackId).map(r => r.report)
    try {
      const [trackSummary, commonStrengthsGaps] = await Promise.all([
        genTrackSummary(trackMap[trackId] ?? "Unknown Track", trackReports, groupStats),
        genCommonStrengthsGaps(trackMap[trackId] ?? "Unknown Track", groupStats.pillar_averages, groupStats.divergent_competencies),
      ])
      await Promise.all([
        saveCache("track_summary",         trackSummary,        { group_id: groupId, track_id: trackId }),
        saveCache("common_strengths_gaps", commonStrengthsGaps, { group_id: groupId, track_id: trackId }),
      ])
    } catch (err: any) {
      console.error(`[generate] track ${trackId} AI error:`, err?.message ?? err)
    }
  }

  // ── ALTERNATIVE PATHS (non-passing candidates) ──────────────────────────
  let alternativePaths: string | null = null
  const nonPassingCandidates = reports
    .filter(({ report }) => report.verdict === "marginal" || report.verdict === "no")
    .map(({ candidate, report }) => ({
      name:          candidate.full_name,
      verdict:       report.verdict,
      overall_score: report.overall_score,
      primary_track: candidate.track_id ? (trackMap[candidate.track_id] ?? null) : null,
      pillars:       report.pillar_results.map(pr => ({
        name:          pr.pillar.name,
        score:         pr.pillar_score,
        insight_label: pr.insight_label,
      })),
    }))

  if (nonPassingCandidates.length > 0) {
    try {
      alternativePaths = await genAlternativePaths(group.name, nonPassingCandidates, Object.values(trackMap))
      console.log("[generate] alternativePaths:", !!alternativePaths)
    } catch (err: any) {
      console.error("[generate] alternativePaths error:", err?.message ?? err)
    }
    await saveCache("alternative_paths", alternativePaths, { group_id: groupId })
  }

  const savedSections = [groupNarrative, systemicGap, talentMapCommentary, cohortPrediction, assessorBias, alternativePaths].filter(Boolean).length
  console.log(`[generate] done — ${savedSections} group sections saved`)

  if (savedSections === 0)
    return NextResponse.json({ error: "AI returned no content — check GROQ_API_KEY_INTERVIEW and rate limits" }, { status: 500 })

  return NextResponse.json({ ok: true, message: `Expert Group Report generated — ${savedSections} sections saved` })
}
