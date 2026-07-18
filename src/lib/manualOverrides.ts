// Shared manual-score override logic — used by the candidate-level manual
// report/answers routes and by the Group/Course aggregate reports' manual
// mode. Centralizes what was previously copy-pasted in three places.

import { db } from "@/lib/db"

export interface ManualOverrideEntry {
  manualScoreId: string
  achievedScore: number
  overrides: Map<string, number> // candidate_answer_id -> manual_score_achieved
}

// Batch-loads every candidate's manual score in one pair of queries, keyed
// by candidate_id. Aggregate (Group/Course) reports only honor CONFIRMED
// manual scores — a draft is an admin's in-progress attempt and shouldn't
// silently show up in a report other people might view or download. This
// differs from the candidate-level admin UI, which surfaces drafts too
// (for the live preview before confirming).
export async function loadManualScoresForCandidates(
  candidateIds: string[]
): Promise<Map<string, ManualOverrideEntry>> {
  const result = new Map<string, ManualOverrideEntry>()
  if (candidateIds.length === 0) return result

  const { data: scores } = await db
    .from("manual_scores")
    .select("id, candidate_id, achieved_score")
    .in("candidate_id", candidateIds)
    .eq("status", "confirmed")
    .order("created_at", { ascending: false })

  const activeByCandidate = new Map<string, { id: string; achieved_score: number }>()
  for (const row of scores ?? []) {
    // Only one confirmed version can exist per candidate at a time in
    // practice (editing supersedes the prior one), but guard against races
    // by keeping the first (most recent, thanks to the ORDER BY) seen.
    if (!activeByCandidate.has(row.candidate_id)) {
      activeByCandidate.set(row.candidate_id, { id: row.id, achieved_score: row.achieved_score })
    }
  }
  if (activeByCandidate.size === 0) return result

  const manualScoreIds = [...activeByCandidate.values()].map((v) => v.id)
  const { data: overrideRows } = await db
    .from("manual_score_answer_overrides")
    .select("manual_score_id, candidate_answer_id, manual_score_achieved")
    .in("manual_score_id", manualScoreIds)

  const overridesByManualScoreId = new Map<string, Map<string, number>>()
  for (const o of overrideRows ?? []) {
    if (!overridesByManualScoreId.has(o.manual_score_id)) overridesByManualScoreId.set(o.manual_score_id, new Map())
    overridesByManualScoreId.get(o.manual_score_id)!.set(o.candidate_answer_id, o.manual_score_achieved)
  }

  for (const [candidateId, { id, achieved_score }] of activeByCandidate) {
    result.set(candidateId, {
      manualScoreId: id,
      achievedScore: achieved_score,
      overrides: overridesByManualScoreId.get(id) ?? new Map(),
    })
  }
  return result
}

// Returns { total_score, passed } for a candidate, substituting their
// manual score/pass-fail if one is active, otherwise the real values.
export function applyManualOverride(
  candidate: { total_score: number | null; passed: boolean | null },
  manualMap: Map<string, ManualOverrideEntry>,
  candidateId: string,
  passingScore: number
): { total_score: number; passed: boolean } {
  const manual = manualMap.get(candidateId)
  if (!manual) return { total_score: candidate.total_score ?? 0, passed: candidate.passed ?? false }
  return { total_score: manual.achievedScore, passed: manual.achievedScore >= passingScore }
}

// Overlays a candidate's manual answer overrides (if any) onto their
// candidate_answers rows — untouched answers fall back to the real value.
export function overlayAnswerOverrides<T extends { id: string; candidate_id: string; score_achieved: number }>(
  answers: T[],
  manualMap: Map<string, ManualOverrideEntry>
): T[] {
  return answers.map((a) => {
    const manual = manualMap.get(a.candidate_id)
    if (!manual) return a
    const override = manual.overrides.get(a.id)
    return override === undefined ? a : { ...a, score_achieved: override }
  })
}
