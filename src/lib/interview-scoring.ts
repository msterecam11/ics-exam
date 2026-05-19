/**
 * Interview Scoring Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure computation — no DB calls. Takes the frozen config_snapshot plus raw
 * score rows and produces fully computed report data.
 *
 * All numbers are rounded to 2 decimal places throughout.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SnapshotCompetency {
  id: string
  name: string
  description: string | null
  weight: number
  order_index: number
}

export interface SnapshotPillar {
  id: string
  name: string
  weight: number
  order_index: number
  applicable_track_ids: string[] | null
  competencies: SnapshotCompetency[]
}

export interface ConfigSnapshot {
  id: string
  name: string
  assessor_weights: Record<string, Record<string, number>> // { assessorId: { pillarId: weight } }
  // Stored as either object { strong_yes, yes, marginal } or array [{ key, label, min, max }]
  verdict_thresholds: any
  insight_thresholds: {
    top_strength: { min: number; max: number }
    watch_list:   { min: number; max: number }
    development:  { min: number; max: number }
  }
  rater_divergence_threshold: number
  pillars: SnapshotPillar[]
}

/**
 * Resolved verdict label map — built from whatever format verdict_thresholds uses.
 * Keys are "strong_yes" | "yes" | "marginal" | "no".
 * Labels come from the config's custom label field if available.
 */
export type VerdictLabelMap = Record<Verdict, string>

export function buildVerdictLabels(raw: any): VerdictLabelMap {
  const defaults: VerdictLabelMap = {
    strong_yes: "Strong Yes",
    yes:        "Yes",
    marginal:   "Marginal",
    no:         "No",
  }
  if (!raw) return defaults
  if (Array.isArray(raw) && raw.length > 0) {
    const VERDICT_ORDER: Verdict[] = ["strong_yes", "yes", "marginal"]
    const sorted = [...raw]
      .filter((t: any) => typeof t.min === "number")
      .sort((a: any, b: any) => b.min - a.min)
    sorted.forEach((t: any, i: number) => {
      const v = VERDICT_ORDER[i]
      if (v && t.label) defaults[v] = t.label
    })
  }
  return defaults
}

export interface RawScore {
  candidate_id: string
  assessor_id: string
  competency_id: string
  value: number            // 1.00–5.00 decimal
  evidence: string | null
}

export interface RawQualitative {
  candidate_id: string
  assessor_id: string
  remarks: string | null
  gap_analysis: string | null
  recommendation: string | null
  confirmed: boolean
  confirmed_at: string | null
}

// ── Output types ──────────────────────────────────────────────────────────────

export type InsightLabel = "top_strength" | "watch_list" | "development" | "none"
export type Verdict      = "strong_yes"   | "yes"        | "marginal"    | "no"

export interface CompetencyResult {
  competency: SnapshotCompetency
  // per-assessor: { assessorId: score }
  assessor_scores: Record<string, number>
  weighted_avg: number          // weighted by assessor pillar_weights
  divergence: number            // max spread between assessors
  is_divergent: boolean
  // evidence per assessor
  evidence: Record<string, string | null>
}

export interface PillarResult {
  pillar: SnapshotPillar
  competency_results: CompetencyResult[]
  pillar_score: number          // weighted avg of competency weighted_avgs
  insight_label: InsightLabel
}

export interface CandidateReportData {
  candidate_id: string
  pillar_results: PillarResult[]
  overall_score: number
  verdict: Verdict
  divergent_competencies: Array<{ pillar_name: string; competency_name: string; spread: number }>
  qualitative: RawQualitative[] // per assessor
  assessor_ids: string[]        // assessors who scored this candidate
}

export interface GroupStatsData {
  total_candidates: number
  verdict_distribution: Record<Verdict, number>
  pillar_averages: Array<{ pillar_id: string; pillar_name: string; avg: number; insight_label: InsightLabel }>
  candidate_ranking: Array<{
    rank: number
    candidate_id: string
    overall_score: number
    verdict: Verdict
    pillar_scores: Record<string, number>  // pillarId → score
  }>
  divergent_competencies: Array<{ pillar_name: string; competency_name: string; avg_spread: number }>
  track_breakdown: Record<string, { track_name: string; count: number; avg_score: number; verdicts: Record<Verdict, number> }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

function getAssessorPillarWeight(
  snapshot: ConfigSnapshot,
  assessorId: string,
  pillarId: string,
): number {
  // pillar_weights is per-assessor per-pillar, stored in assessor_weights on snapshot
  const w = snapshot.assessor_weights?.[assessorId]?.[pillarId]
  // If not set, default to 100 (full weight)
  return w ?? 100
}

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Compute weighted average score for one competency.
 * Assessors with pillar_weight = 0 are excluded entirely.
 */
function computeCompetencyResult(
  competency: SnapshotCompetency,
  pillarId: string,
  scoresForCandidate: RawScore[],
  snapshot: ConfigSnapshot,
): CompetencyResult {
  const competencyScores = scoresForCandidate.filter(s => s.competency_id === competency.id)

  const assessor_scores: Record<string, number> = {}
  const evidence: Record<string, string | null>  = {}
  let   weightedSum  = 0
  let   totalWeight  = 0

  for (const s of competencyScores) {
    const pillarWeight = getAssessorPillarWeight(snapshot, s.assessor_id, pillarId)

    // Always record the score for display (so UI can show who submitted)
    assessor_scores[s.assessor_id] = s.value
    evidence[s.assessor_id]        = s.evidence

    // Only contribute to the weighted average if this assessor has non-zero weight
    if (pillarWeight > 0) {
      weightedSum += s.value * pillarWeight
      totalWeight += pillarWeight
    }
  }

  const weighted_avg = totalWeight > 0 ? r2(weightedSum / totalWeight) : 0

  // Divergence = max spread between assessors who participated
  const vals = Object.values(assessor_scores)
  const divergence = vals.length >= 2
    ? r2(Math.max(...vals) - Math.min(...vals))
    : 0

  const is_divergent = snapshot.rater_divergence_threshold != null && divergence > snapshot.rater_divergence_threshold

  return {
    competency,
    assessor_scores,
    weighted_avg,
    divergence,
    is_divergent,
    evidence,
  }
}

/**
 * Compute pillar score = weighted avg of competency weighted_avgs.
 */
function computePillarResult(
  pillar: SnapshotPillar,
  scoresForCandidate: RawScore[],
  snapshot: ConfigSnapshot,
): PillarResult {
  const competency_results = pillar.competencies.map(c =>
    computeCompetencyResult(c, pillar.id, scoresForCandidate, snapshot)
  )

  // Weighted avg across competencies (by competency.weight)
  const totalCompWeight = pillar.competencies.reduce((s, c) => s + c.weight, 0)
  const pillarScore = totalCompWeight > 0
    ? r2(
        competency_results.reduce((sum, cr) => sum + cr.weighted_avg * cr.competency.weight, 0)
        / totalCompWeight
      )
    : 0

  const insight_label = assignInsightLabel(pillarScore, snapshot)

  return {
    pillar,
    competency_results,
    pillar_score: pillarScore,
    insight_label,
  }
}

/**
 * Assign insight label to a score.
 */
export function assignInsightLabel(score: number, snapshot: ConfigSnapshot): InsightLabel {
  const t = snapshot.insight_thresholds
  // Guard: must be a non-null object with the expected keys (not null, array, or empty {})
  if (!t || Array.isArray(t) || !t.top_strength || !t.watch_list || !t.development) return "none"
  if (score >= t.top_strength.min && score <= t.top_strength.max) return "top_strength"
  if (score >= t.watch_list.min   && score <= t.watch_list.max)   return "watch_list"
  if (score >= t.development.min  && score <= t.development.max)  return "development"
  return "none"
}

/**
 * Normalise verdict_thresholds into an ordered list of { min, verdict } pairs.
 *
 * Handles two DB storage formats:
 *   Array format (config editor): [{ key, label, min, max }] — any key names, any labels
 *   Object format (legacy):       { strong_yes, yes, marginal }
 *
 * Returns thresholds sorted descending by min so the scoring loop can use
 * the first match (highest threshold wins).
 */
export function normaliseVerdictThresholds(
  raw: any,
): Array<{ min: number; verdict: Verdict }> {
  const VERDICT_ORDER: Verdict[] = ["strong_yes", "yes", "marginal"]

  if (!raw) return []

  // ── Object format: { strong_yes: 4.5, yes: 3.5, marginal: 3.0 } ─────────
  if (!Array.isArray(raw) && typeof raw === "object") {
    // Try named keys first
    const named: Array<{ min: number; verdict: Verdict }> = []
    if (typeof raw.strong_yes === "number") named.push({ min: raw.strong_yes, verdict: "strong_yes" })
    if (typeof raw.yes        === "number") named.push({ min: raw.yes,        verdict: "yes"        })
    if (typeof raw.marginal   === "number") named.push({ min: raw.marginal,   verdict: "marginal"   })
    if (named.length > 0) return named.sort((a, b) => b.min - a.min)
  }

  // ── Array format: [{ key, label, min, max }] — keys may be custom ────────
  if (Array.isArray(raw) && raw.length > 0) {
    // Sort by min descending; assign verdicts by position (highest = strong_yes)
    const sorted = [...raw]
      .filter((t: any) => typeof t.min === "number")
      .sort((a: any, b: any) => b.min - a.min)

    return sorted.map((t: any, i: number) => ({
      min:     t.min as number,
      verdict: (VERDICT_ORDER[i] ?? "marginal") as Verdict,
    }))
  }

  return []
}

/**
 * Determine verdict from overall score.
 * Works with any threshold label names — verdict is determined by score position
 * among the configured thresholds (highest threshold = strong_yes, etc.).
 */
export function determineVerdict(overallScore: number, snapshot: ConfigSnapshot): Verdict {
  const thresholds = normaliseVerdictThresholds(snapshot.verdict_thresholds)
  if (thresholds.length === 0) return "no"
  for (const t of thresholds) {
    if (overallScore >= t.min) return t.verdict
  }
  return "no"
}

/**
 * Build the full computed report for one candidate.
 */
export function buildCandidateReport(
  candidateId: string,
  snapshot: ConfigSnapshot,
  allScores: RawScore[],           // all scores for this group (filtered internally)
  qualitative: RawQualitative[],   // all qualitative rows for this candidate
  trackId: string | null,
): CandidateReportData {
  const scoresForCandidate = allScores.filter(s => s.candidate_id === candidateId)

  // Filter pillars applicable to this candidate's track
  const applicablePillars = snapshot.pillars.filter(p => {
    if (!p.applicable_track_ids || p.applicable_track_ids.length === 0) return true
    if (!trackId) return true
    return p.applicable_track_ids.includes(trackId)
  })

  const pillar_results = applicablePillars
    .sort((a, b) => a.order_index - b.order_index)
    .map(p => computePillarResult(p, scoresForCandidate, snapshot))

  // Overall score = weighted avg of pillar scores (by pillar.weight)
  const totalPillarWeight = applicablePillars.reduce((s, p) => s + p.weight, 0)
  const overall_score = totalPillarWeight > 0
    ? r2(
        pillar_results.reduce((sum, pr) => sum + pr.pillar_score * pr.pillar.weight, 0)
        / totalPillarWeight
      )
    : 0

  const verdict = determineVerdict(overall_score, snapshot)

  // Collect all divergent competencies
  const divergent_competencies = pillar_results.flatMap(pr =>
    pr.competency_results
      .filter(cr => cr.is_divergent)
      .map(cr => ({
        pillar_name:      pr.pillar.name,
        competency_name:  cr.competency.name,
        spread:           cr.divergence,
      }))
  )

  // Unique assessors who scored this candidate
  const assessor_ids = [...new Set(scoresForCandidate.map(s => s.assessor_id))]

  return {
    candidate_id: candidateId,
    pillar_results,
    overall_score,
    verdict,
    divergent_competencies,
    qualitative,
    assessor_ids,
  }
}

/**
 * Build group-level statistics from an array of candidate reports.
 */
export function buildGroupStats(
  reports: CandidateReportData[],
  candidateMeta: Array<{ id: string; track_id: string | null; track_name: string | null }>,
  snapshot: ConfigSnapshot,
): GroupStatsData {
  const total_candidates = reports.length

  // Verdict distribution
  const verdict_distribution: Record<Verdict, number> = {
    strong_yes: 0, yes: 0, marginal: 0, no: 0,
  }
  for (const r of reports) verdict_distribution[r.verdict]++

  // Pillar averages
  const pillarScoreMap: Record<string, number[]> = {}
  for (const r of reports) {
    for (const pr of r.pillar_results) {
      if (!pillarScoreMap[pr.pillar.id]) pillarScoreMap[pr.pillar.id] = []
      pillarScoreMap[pr.pillar.id].push(pr.pillar_score)
    }
  }
  const pillar_averages = snapshot.pillars
    .sort((a, b) => a.order_index - b.order_index)
    .map(p => {
      const scores = pillarScoreMap[p.id] ?? []
      const avg    = scores.length > 0 ? r2(scores.reduce((s, v) => s + v, 0) / scores.length) : 0
      return {
        pillar_id:     p.id,
        pillar_name:   p.name,
        avg,
        insight_label: assignInsightLabel(avg, snapshot),
      }
    })

  // Candidate ranking
  const metaMap = Object.fromEntries(candidateMeta.map(m => [m.id, m]))
  const candidate_ranking = [...reports]
    .sort((a, b) => b.overall_score - a.overall_score)
    .map((r, i) => {
      const pillar_scores: Record<string, number> = {}
      for (const pr of r.pillar_results) pillar_scores[pr.pillar.id] = pr.pillar_score
      return {
        rank:          i + 1,
        candidate_id:  r.candidate_id,
        overall_score: r.overall_score,
        verdict:       r.verdict,
        pillar_scores,
      }
    })

  // Divergent competencies — avg spread across all candidates
  const divMap: Record<string, { pillar_name: string; competency_name: string; spreads: number[] }> = {}
  for (const r of reports) {
    for (const dc of r.divergent_competencies) {
      const key = `${dc.pillar_name}:${dc.competency_name}`
      if (!divMap[key]) divMap[key] = { ...dc, spreads: [] }
      divMap[key].spreads.push(dc.spread)
    }
  }
  const divergent_competencies = Object.values(divMap)
    .map(d => ({
      pillar_name:      d.pillar_name,
      competency_name:  d.competency_name,
      avg_spread:       r2(d.spreads.reduce((s, v) => s + v, 0) / d.spreads.length),
    }))
    .sort((a, b) => b.avg_spread - a.avg_spread)

  // Track breakdown
  const track_breakdown: GroupStatsData["track_breakdown"] = {}
  for (const r of reports) {
    const meta      = metaMap[r.candidate_id]
    const trackId   = meta?.track_id   ?? "unknown"
    const trackName = meta?.track_name ?? "Unknown Track"
    if (!track_breakdown[trackId]) {
      track_breakdown[trackId] = {
        track_name: trackName,
        count:      0,
        avg_score:  0,
        verdicts:   { strong_yes: 0, yes: 0, marginal: 0, no: 0 },
      }
    }
    const tb = track_breakdown[trackId]
    tb.count++
    tb.avg_score = r2((tb.avg_score * (tb.count - 1) + r.overall_score) / tb.count)
    tb.verdicts[r.verdict]++
  }

  return {
    total_candidates,
    verdict_distribution,
    pillar_averages,
    candidate_ranking,
    divergent_competencies,
    track_breakdown,
  }
}
