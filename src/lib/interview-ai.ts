/**
 * Interview Report AI Functions
 * ─────────────────────────────────────────────────────────────────────────────
 * All Groq calls for report generation. Each function is self-contained,
 * fails gracefully (returns null — UI shows skeleton), and uses the same
 * retry pattern as the existing ai-scoring.ts.
 *
 * Model: llama-3.3-70b-versatile (same as exam scoring)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Groq from "groq-sdk"
import type {
  CandidateReportData,
  GroupStatsData,
  PillarResult,
  CompetencyResult,
  RawQualitative,
  ConfigSnapshot,
} from "./interview-scoring"
import { normaliseVerdictThresholds, buildVerdictLabels } from "./interview-scoring"

// Separate Groq client for interview system — uses its own API key and quota,
// completely independent from the exam system (GROQ_API_KEY).
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY_INTERVIEW ?? process.env.GROQ_API_KEY ?? "placeholder" })

// ── Models ────────────────────────────────────────────────────────────────────
// Both calls now use 8b-instant — 14,400 TPM pool (vs 70b's 6,000 TPM).
// Groq rate limits are per-account, not per-key, so the 70b pool was shared
// across all test runs and exhausted quickly. 8b handles structured JSON well.
const MODEL_INSIGHT = "llama-3.1-8b-instant"  // main insights call (large TPM pool)
const MODEL_FAST    = "llama-3.1-8b-instant"  // evidence rephrase

// ── Retry helper ──────────────────────────────────────────────────────────────

// Thrown when Groq quota is exhausted after all retries — caught in routes to return a clean 429
export class QuotaExceededError extends Error {
  constructor() { super("AI quota exceeded") }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 2000): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || err?.message?.includes("rate") || err?.message?.includes("quota")
      if (isRateLimit) {
        if (attempt === retries) throw new QuotaExceededError()  // all retries exhausted → surface to UI
        // RPM limits reset in seconds — wait and retry with exponential backoff: 3s, 6s, 12s
        await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)))
        continue
      }
      if (attempt === retries) throw err
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
    }
  }
  throw new Error("Max retries exceeded")
}

async function askGroq(
  prompt: string,
  maxTokens = 300,
  model = MODEL_INSIGHT,
): Promise<string | null> {
  // Let QuotaExceededError bubble up — routes catch it and return 429 to the UI
  const res = await withRetry(() =>
    groq.chat.completions.create({
      model,
      messages:    [{ role: "user", content: prompt }],
      temperature: 0.35,
      max_tokens:  maxTokens,
    })
  )
  return res.choices[0]?.message?.content?.trim() ?? null
}

// ── JSON repair helper ────────────────────────────────────────────────────────
// Handles truncated or slightly malformed JSON from the model (e.g. cut off at
// token limit mid-array, trailing commas, unclosed brackets).
function repairJson(str: string): string {
  // 1. Remove trailing commas before } or ]
  let s = str.replace(/,\s*([}\]])/g, "$1")

  // 2. Close any unclosed string at the very end (truncated mid-value)
  //    Count unescaped quotes to detect an open string
  let inString = false
  let i = 0
  while (i < s.length) {
    if (s[i] === "\\") { i += 2; continue }   // skip escaped char
    if (s[i] === '"') inString = !inString
    i++
  }
  if (inString) s += '"'   // close the dangling string

  // 3. Close unclosed arrays and objects (from deepest to shallowest)
  const stack: string[] = []
  inString = false
  for (let j = 0; j < s.length; j++) {
    const c = s[j]
    if (c === "\\" && inString) { j++; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === "{") stack.push("}")
    else if (c === "[") stack.push("]")
    else if (c === "}" || c === "]") stack.pop()
  }
  // Append missing closers in reverse order
  s += stack.reverse().join("")

  return s
}

// ── Verdict threshold helper ──────────────────────────────────────────────────
// Returns human-readable threshold line regardless of DB format (array or object)
function verdictThresholdLine(snapshot: ConfigSnapshot): string {
  const labels  = buildVerdictLabels(snapshot.verdict_thresholds)
  const norms   = normaliseVerdictThresholds(snapshot.verdict_thresholds)
  if (norms.length === 0) return "Thresholds not configured"
  return norms
    .map(t => `${labels[t.verdict]} ≥ ${t.min}`)
    .join(" | ")
}

// ── Context builder helpers ───────────────────────────────────────────────────

function pillarSummary(pr: PillarResult): string {
  const label = { top_strength: "Top Strength", watch_list: "Watch List", development: "Development Area", none: "—" }[pr.insight_label]
  return `${pr.pillar.name}: ${pr.pillar_score}/5.00 (${label})`
}

function competencySummary(cr: CompetencyResult): string {
  const scores = Object.entries(cr.assessor_scores)
    .map(([, v]) => v.toFixed(2))
    .join(", ")
  return `${cr.competency.name}: avg=${cr.weighted_avg} [assessors: ${scores}]${cr.is_divergent ? " ⚠ DIVERGENT" : ""}`
}

// ── CANDIDATE INSIGHTS (single merged call — mirrors exam scoring pattern) ────

// Uses arrays not UUID-keyed maps — same pattern as exam system (more reliable for LLM JSON output)
export interface CandidateInsights {
  executive_summary:       string | null
  verdict_explanation:     string | null
  what_would_change:       string | null
  profile_interpretation:  string | null
  red_thread:              string | null
  strengths_narrative:     string | null  // top strengths across the interview
  weaknesses_narrative:    string | null  // key gaps across the interview
  forward_focus:           string | null  // what candidate must focus on next
  recommendation:          string | null  // clear final recommendation with conditions
  qualitative_remarks:     string | null
  qualitative_gaps:        string | null
  qualitative_rec:         string | null
  development_plan:        string | null
  development_courses:     Array<{ competency: string; course: string; provider: string; duration: string; description: string }> | null
  development_insights:    Array<{ id: string; insight: string }> | null
  pillar_stories:          Array<{ id: string; story: string }>
}

/**
 * genCandidateInsights — ONE call, returns everything for one candidate.
 * Mirrors exam system pattern exactly:
 *  - 70b model (reliable complex JSON)
 *  - Arrays not UUID-keyed maps (model-friendly)
 *  - Regex fallback extraction: cleaned.match(/\{[\s\S]*\}/)
 *  - Returns null only on total failure (never throws)
 */
export async function genCandidateInsights(
  candidateName: string,
  trackName: string | null,
  report: CandidateReportData,
  snapshot: ConfigSnapshot,
  qualitative: RawQualitative[],
  assessorNames: Record<string, string>,
): Promise<CandidateInsights | null> {
  const verdictLabels = buildVerdictLabels(snapshot.verdict_thresholds)
  const verdictLabel  = verdictLabels[report.verdict] ?? report.verdict.replace("_", " ").toUpperCase()
  const norms         = normaliseVerdictThresholds(snapshot.verdict_thresholds)

  // Next verdict tier
  const VERDICT_ORDER = ["strong_yes", "yes", "marginal"] as const
  const currentIdx    = VERDICT_ORDER.indexOf(report.verdict as any)
  const nextVerdict   = currentIdx > 0 ? VERDICT_ORDER[currentIdx - 1] : null
  const nextThreshold = nextVerdict ? (norms.find(t => t.verdict === nextVerdict)?.min ?? null) : null
  const nextLabel     = nextVerdict ? (verdictLabels[nextVerdict] ?? nextVerdict) : null

  // Pillar scores (readable, no UUIDs in prompt)
  const pillarLines = report.pillar_results.map(pr =>
    `  ${pr.pillar.name}: ${pr.pillar_score}/5.00 — ${pr.competency_results.map(cr =>
      `${cr.competency.name} ${cr.weighted_avg}${cr.is_divergent ? "⚠" : ""}`
    ).join(", ")}`
  ).join("\n")

  // Weak areas
  const weakAreas = report.pillar_results.flatMap(pr =>
    pr.competency_results
      .filter(cr => cr.weighted_avg < 3.5)
      .map(cr => ({ id: cr.competency.id, pillar: pr.pillar.name, name: cr.competency.name, score: cr.weighted_avg }))
  )

  // Qualitative
  const qualLines = qualitative.length > 0
    ? qualitative.map(q =>
        `${assessorNames[q.assessor_id] ?? "Assessor"}: ${(q.remarks ?? "").slice(0, 150)} | ${(q.gap_analysis ?? "").slice(0, 150)} | ${(q.recommendation ?? "").slice(0, 150)}`
      ).join("\n")
    : null

  // Pillar story template (use name — not UUID — in prompt, map back by index after)
  const pillarNames = report.pillar_results.map(pr => pr.pillar.name).join(", ")

  const prompt = `You are an expert aviation assessor at ICS Aviation. Generate a structured assessment report for ${candidateName}${trackName ? ` (${trackName})` : ""}.

Overall score: ${report.overall_score}/5.00 | Verdict: ${verdictLabel}
Verdict thresholds: ${verdictThresholdLine(snapshot)}
${nextLabel && nextThreshold ? `Next level (${nextLabel}) requires ≥ ${nextThreshold}` : "Already at highest level"}

Pillar & Competency Scores:
${pillarLines}

Weak areas (score < 3.5):
${weakAreas.length > 0 ? weakAreas.map(w => `  ${w.pillar} → ${w.name}: ${w.score}`).join("\n") : "  None"}

Assessor qualitative input:
${qualLines ?? "  None submitted"}

Return ONLY valid JSON (no markdown). Exact structure required:
{
  "executive_summary": "3-4 professional sentences for a senior committee. Reference scores. Do not start with The candidate.",
  "verdict_explanation": "2-3 sentences on what mathematically drove this verdict.",
  "what_would_change": "${nextLabel && nextThreshold ? `2-3 sentences on what score changes reach ${nextLabel} (≥${nextThreshold}).` : "1 sentence noting highest level already achieved."}",
  "profile_interpretation": "2-3 sentences on the shape of the competency profile.",
  "red_thread": "2-3 sentences identifying the key hidden pattern across all scores.",
  "strengths_narrative": "2-3 sentences on the candidate's top demonstrated strengths across the interview.",
  "weaknesses_narrative": ${weakAreas.length > 0 ? '"2-3 sentences on the key gaps and development needs identified across the interview."' : "null"},
  "forward_focus": "2-3 sentences on what the candidate must prioritise in the next 12 months to grow.",
  "recommendation": "2-3 sentences with a clear final recommendation. State explicitly whether to proceed, hold, or decline, and any conditions.",
  "qualitative_remarks": ${qualLines ? '"2-3 sentence synthesis of assessor remarks"' : "null"},
  "qualitative_gaps": ${qualLines ? '"2-3 sentence synthesis of gap analyses"' : "null"},
  "qualitative_rec": ${qualLines ? '"2-3 sentence synthesised recommendation"' : "null"},
  "development_plan": ${weakAreas.length > 0 ? '[{"area":"competency area name","intervention":"specific action to take","timeline":"X months","owner":"person or role responsible"}]' : "null"},
  "development_courses": ${weakAreas.length > 0 ? '[{"competency":"name","course":"title","provider":"CAE/IATA/FlightSafety/etc","duration":"X days","description":"under 12 words"}]' : "null"},
  "development_insights": ${weakAreas.length > 0 ? `[${weakAreas.map(w => `{"id":"${w.id}","insight":"one actionable sentence max 20 words for ${w.name}"}`).join(",")}]` : "null"},
  "pillar_stories": [${report.pillar_results.map(pr => `{"id":"${pr.pillar.id}","story":"2 sentences about ${pr.pillar.name} pillar"}`).join(",")}]
}`

  try {
    console.log("[interview-ai] genCandidateInsights → calling Groq (8b)…")
    const raw = await askGroq(prompt, 3000)
    console.log("[interview-ai] raw response length:", raw?.length ?? 0)
    if (!raw) { console.error("[interview-ai] askGroq returned null/empty"); return null }
    // Same extraction pattern as exam system (reports/candidate/[candidateId]/route.ts line 181)
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    const match   = cleaned.match(/\{[\s\S]*\}/)
    const jsonStr = match ? match[0] : cleaned
    const parsed  = JSON.parse(repairJson(jsonStr)) as CandidateInsights
    console.log("[interview-ai] JSON parsed OK — keys:", Object.keys(parsed).join(", "))
    return parsed
  } catch (err) {
    if (err instanceof QuotaExceededError) throw err  // surface to route → 429 response
    console.error("[interview-ai] genCandidateInsights error:", err)
    return null
  }
}

// ── INDIVIDUAL REPORT AI FUNCTIONS ───────────────────────────────────────────

/**
 * 3.1 — Executive Summary (hero section)
 * 3–4 lines summarising the whole candidate.
 */
export async function genExecutiveSummary(
  candidateName: string,
  trackName: string | null,
  report: CandidateReportData,
  configName: string,
): Promise<string | null> {
  const pillars = report.pillar_results.map(pillarSummary).join("\n")
  const verdict = report.verdict.replace("_", " ").toUpperCase()

  return askGroq(`
You are an expert aviation assessor writing a professional assessment report for ${candidateName} (${trackName ?? "unknown track"}).
Assessment framework: ${configName}
Overall score: ${report.overall_score}/5.00 | Verdict: ${verdict}
Pillar scores:
${pillars}

Write a concise 3–4 sentence executive summary of this candidate for a senior hiring committee.
Be specific, reference actual pillar scores, and use professional aviation assessment language.
Do NOT use bullet points. Do NOT start with "The candidate". Be direct and analytical.
`, 300)
}

/**
 * 3.2 — What drove this verdict
 */
export async function genVerdictExplanation(
  candidateName: string,
  report: CandidateReportData,
  snapshot: ConfigSnapshot,
): Promise<string | null> {
  const pillars   = report.pillar_results.map(pr =>
    `${pr.pillar.name}: ${pr.pillar_score} (weight ${pr.pillar.weight}%)`
  ).join(", ")
  const verdict   = report.verdict.replace("_", " ").toUpperCase()
  const labels    = buildVerdictLabels(snapshot.verdict_thresholds)
  const verdictLabel = labels[report.verdict] ?? verdict

  return askGroq(`
Assessment verdict for ${candidateName}: ${verdictLabel} (overall score: ${report.overall_score}/5.00)
Verdict thresholds: ${verdictThresholdLine(snapshot)}
Pillar contributions: ${pillars}

In 2–3 sentences, explain exactly what mathematical and qualitative factors drove this verdict.
Reference specific pillar weights and scores. Be precise, not generic.
`, 250)
}

/**
 * 3.3 — What would have changed it
 */
export async function genWhatWouldChangeIt(
  candidateName: string,
  report: CandidateReportData,
  snapshot: ConfigSnapshot,
): Promise<string | null> {
  const verdict     = report.verdict
  const labels      = buildVerdictLabels(snapshot.verdict_thresholds)
  const verdictLabel = labels[verdict] ?? verdict.replace("_", " ").toUpperCase()
  const norms       = normaliseVerdictThresholds(snapshot.verdict_thresholds)
  const worstPillar = [...report.pillar_results].sort((a, b) => a.pillar_score - b.pillar_score)[0]

  // Find the next tier up
  const VERDICT_ORDER = ["strong_yes", "yes", "marginal"] as const
  const currentIdx    = VERDICT_ORDER.indexOf(verdict as any)
  const nextVerdict   = currentIdx > 0 ? VERDICT_ORDER[currentIdx - 1] : null
  const nextThreshold = nextVerdict ? norms.find(t => t.verdict === nextVerdict)?.min : null
  const nextLabel     = nextVerdict ? (labels[nextVerdict] ?? nextVerdict) : null

  return askGroq(`
${candidateName} received a verdict of ${verdictLabel} with overall score ${report.overall_score}/5.00.
Verdict thresholds: ${verdictThresholdLine(snapshot)}
Weakest pillar: ${worstPillar ? `${worstPillar.pillar.name} scored ${worstPillar.pillar_score}` : "N/A"}
${nextLabel && nextThreshold ? `Next level: ${nextLabel} requires overall ≥ ${nextThreshold}` : "Already at highest level."}

In 2–3 sentences, explain concretely what specific score changes would have altered this verdict.
Reference exact numbers and pillar names. Help the candidate and committee understand the margin.
`, 250)
}

/**
 * 3.4 — Profile interpretation (under radar chart)
 */
export async function genProfileInterpretation(
  candidateName: string,
  trackName: string | null,
  report: CandidateReportData,
): Promise<string | null> {
  const pillars = report.pillar_results.map(pillarSummary).join("\n")

  return askGroq(`
Aviation assessor analysing radar profile for ${candidateName} (${trackName ?? "unknown track"}).
Pillar scores:
${pillars}

In 2–3 sentences, interpret the SHAPE of this profile — is it balanced or asymmetric?
What does the pattern suggest about this candidate's strengths and background?
Use professional aviation language. Be insightful, not generic.
`, 250)
}

/**
 * 3.5 — Pillar story (called per pillar)
 */
export async function genPillarStory(
  candidateName: string,
  pillarResult: PillarResult,
): Promise<string | null> {
  const comps = pillarResult.competency_results.map(competencySummary).join("\n")

  return askGroq(`
Aviation assessor writing about the ${pillarResult.pillar.name} pillar for ${candidateName}.
Pillar score: ${pillarResult.pillar_score}/5.00
Competency breakdown:
${comps}

In 2 sentences, narrate what the competency scores reveal about this candidate's ${pillarResult.pillar.name} capabilities.
Connect the individual scores into a coherent story. Be specific and analytical.
`, 200)
}

/**
 * 3.6 — Intra-pillar variance note (when spread within a pillar is high)
 */
export async function genIntraPillarVariance(
  candidateName: string,
  pillarResult: PillarResult,
): Promise<string | null> {
  const scores = pillarResult.competency_results.map(cr => `${cr.competency.name}: ${cr.weighted_avg}`).join(", ")
  const maxScore = Math.max(...pillarResult.competency_results.map(cr => cr.weighted_avg))
  const minScore = Math.min(...pillarResult.competency_results.map(cr => cr.weighted_avg))
  const spread   = Math.round((maxScore - minScore) * 100) / 100

  return askGroq(`
In the ${pillarResult.pillar.name} pillar for ${candidateName}, there is a notable variance between competency scores.
Competency scores: ${scores}
Spread: ${spread} points (highest ${maxScore}, lowest ${minScore})

In 1–2 sentences, explain what this intra-pillar variance likely indicates about the candidate.
What might explain strong performance in some competencies but weaker in others within the same pillar?
`, 180)
}

/**
 * 3.7 — Divergence interpretation (per flagged competency)
 */
export async function genDivergenceInterpretation(
  candidateName: string,
  pillarName: string,
  cr: CompetencyResult,
  assessorNames: Record<string, string>,
): Promise<string | null> {
  const scores = Object.entries(cr.assessor_scores)
    .map(([id, v]) => `${assessorNames[id] ?? id}: ${v}`)
    .join(", ")

  return askGroq(`
Assessor rater divergence detected for ${candidateName} on competency "${cr.competency.name}" (${pillarName} pillar).
Assessor scores: ${scores}
Spread: ${cr.divergence} points (threshold exceeded)

In 2 sentences, explain what this level of assessor disagreement might indicate.
Could it reflect inconsistent candidate performance across scenarios, or different assessor interpretation standards?
Suggest whether a follow-up observation is warranted.
`, 200)
}

/**
 * 3.8 — Red thread (hidden pattern across ALL competencies)
 */
export async function genRedThread(
  candidateName: string,
  report: CandidateReportData,
): Promise<string | null> {
  const allComps = report.pillar_results.flatMap(pr =>
    pr.competency_results.map(cr => ({
      pillar: pr.pillar.name,
      name:   cr.competency.name,
      score:  cr.weighted_avg,
      label:  pr.insight_label,
    }))
  )
  const strong = allComps.filter(c => c.score >= 4).map(c => `${c.name} (${c.score})`).join(", ")
  const weak   = allComps.filter(c => c.score < 3).map(c => `${c.name} (${c.score})`).join(", ")

  return askGroq(`
Analysing hidden patterns across ALL competency scores for ${candidateName}.
Strong competencies (≥4.0): ${strong || "none"}
Weak competencies (<3.0): ${weak || "none"}
All scores by pillar:
${allComps.map(c => `[${c.pillar}] ${c.name}: ${c.score}`).join("\n")}

In 2–3 sentences, identify the single most meaningful pattern (the "red thread") that connects the strong and weak areas.
What underlying characteristic or background factor might explain this pattern?
This should feel like a genuine insight, not just a restatement of the scores.
`, 280)
}

/**
 * 3.9 — Evidence tone analysis (reads language of assessor evidence)
 */
export async function genEvidenceToneAnalysis(
  candidateName: string,
  evidenceByPillar: Array<{ pillar: string; competency: string; evidence: Record<string, string | null> }>,
  assessorNames: Record<string, string>,
): Promise<string | null> {
  const evidenceText = evidenceByPillar
    .flatMap(e =>
      Object.entries(e.evidence)
        .filter(([, v]) => v)
        .map(([id, v]) => `[${e.pillar} / ${e.competency} / ${assessorNames[id] ?? id}]: "${v}"`)
    )
    .slice(0, 20) // limit tokens
    .join("\n")

  if (!evidenceText) return null

  return askGroq(`
Analysing the language used by assessors in their evidence notes for ${candidateName}.
Evidence samples:
${evidenceText}

In 2–3 sentences, analyse the tone and language patterns in these evidence notes.
Do assessors use confident, positive language in certain areas but hesitant or corrective language in others?
This analysis should surface qualitative signals that corroborate or contradict the numerical scores.
`, 280)
}

/**
 * 3.10 — Qualitative synthesis (merges all assessor remarks/gap/recommendation)
 */
export async function genQualitativeSynthesis(
  candidateName: string,
  qualitative: RawQualitative[],
  assessorNames: Record<string, string>,
): Promise<{ remarks: string; gap_analysis: string; recommendation: string } | null> {
  if (qualitative.length === 0) return null

  const remarksAll   = qualitative.map(q => `${assessorNames[q.assessor_id] ?? "Assessor"}: ${q.remarks ?? "—"}`).join("\n")
  const gapAll       = qualitative.map(q => `${assessorNames[q.assessor_id] ?? "Assessor"}: ${q.gap_analysis ?? "—"}`).join("\n")
  const recAll       = qualitative.map(q => `${assessorNames[q.assessor_id] ?? "Assessor"}: ${q.recommendation ?? "—"}`).join("\n")

  const prompt = `
You are synthesising multiple assessor qualitative evaluations for ${candidateName} into a single coherent narrative.
Write three separate paragraphs: one for REMARKS, one for GAP ANALYSIS, one for RECOMMENDATION.
Each paragraph should be 2–3 sentences and synthesise ALL assessors' views, noting where they agree or differ.
Use professional aviation assessment language.

Assessor Remarks:
${remarksAll}

Assessor Gap Analysis:
${gapAll}

Assessor Recommendations:
${recAll}

Respond ONLY in this exact JSON format (no markdown):
{"remarks":"...","gap_analysis":"...","recommendation":"..."}`

  try {
    const raw = await askGroq(prompt, 600)
    if (!raw) return null
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

/**
 * 3.11 — Development plan (Watch List / Marginal / No candidates)
 */
export async function genDevelopmentPlan(
  candidateName: string,
  report: CandidateReportData,
): Promise<string | null> {
  const gaps = report.pillar_results
    .flatMap(pr => pr.competency_results
      .filter(cr => cr.weighted_avg < 3.5)
      .map(cr => `${pr.pillar.name} → ${cr.competency.name}: ${cr.weighted_avg}/5.00`)
    )
  if (gaps.length === 0) return null

  return askGroq(`
Aviation assessor creating a development plan for ${candidateName}.
Verdict: ${report.verdict.replace("_", " ").toUpperCase()} | Overall: ${report.overall_score}/5.00
Areas needing development (score < 3.5):
${gaps.join("\n")}

Write a structured development plan with 2–3 priorities.
For each priority include: the specific area, a concrete intervention (e.g. sim session type, workshop, written assessment),
an estimated timeline, and who should own it (e.g. Type Rating Instructor, CRM Facilitator).
Format as a numbered list. Be specific and actionable, not generic.
`, 450)
}

/**
 * 3.12 — ROI of development (projected score after fixing gaps)
 */
export async function genROIOfDevelopment(
  candidateName: string,
  report: CandidateReportData,
  snapshot: ConfigSnapshot,
): Promise<string | null> {
  if (report.verdict === "strong_yes") return null

  const gaps = report.pillar_results
    .filter(pr => pr.pillar_score < 3.8)
    .map(pr => `${pr.pillar.name}: current ${pr.pillar_score} → target 3.8+`)

  if (gaps.length === 0) return null

  return askGroq(`
${candidateName} currently scores ${report.overall_score}/5.00.
Development areas:
${gaps.join("\n")}
Verdict thresholds: ${verdictThresholdLine(snapshot)}

In 2 sentences, explain what improvement in these areas would mean for projected overall score and verdict.
Reference specific numbers and what verdict would be unlocked.
`, 180)
}

/**
 * 3.10b — Qualitative rephrase (per-assessor remarks/gap/rec — polished, same meaning)
 *
 * Returns: { [assessor_id]: { remarks: string; gap_analysis: string; recommendation: string } }
 * Saved as qualitative_rephrase_${assessor_id} per assessor.
 */
export async function genQualitativeRephrase(
  candidateName: string,
  qualitative: RawQualitative[],
  assessorNames: Record<string, string>,
): Promise<Record<string, { remarks: string; gap_analysis: string; recommendation: string }> | null> {
  if (qualitative.length === 0) return null

  const block = qualitative.map(q => {
    const name = assessorNames[q.assessor_id] ?? "Assessor"
    return `[${q.assessor_id}] ${name}:\n  Remarks: ${q.remarks ?? "—"}\n  Gap Analysis: ${q.gap_analysis ?? "—"}\n  Recommendation: ${q.recommendation ?? "—"}`
  }).join("\n\n")

  const template: Record<string, object> = {}
  for (const q of qualitative) {
    template[q.assessor_id] = { remarks: "...", gap_analysis: "...", recommendation: "..." }
  }

  const prompt = `You are polishing assessor evaluation notes for ${candidateName}.
Rephrase each assessor's remarks, gap analysis, and recommendation into professional, formal language.
Keep the same meaning and all specific observations. Fix grammar. Use aviation assessment language.
One paragraph per field (2-3 sentences max each).

Assessor evaluations:
${block}

Respond ONLY in this JSON format (no markdown), using the exact assessor IDs shown:
${JSON.stringify(template)}`

  try {
    const raw = await askGroq(prompt, 1200, MODEL_FAST)
    if (!raw) return null
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    return JSON.parse(match ? match[0] : cleaned)
  } catch {
    return null
  }
}

/**
 * 3.11b — Evidence rephrase (ONE call per entire pillar, replaces per-competency calls)
 *
 * Returns: { [competency_id]: { [assessor_id]: "rephrased single sentence" } }
 * Saves as evidence_rephrase_${competency_id} per competency.
 * Uses fast model — simple rephrasing task.
 */
export async function genPillarEvidenceRephrase(
  candidateName: string,
  pillarResult: PillarResult,
  assessorNames: Record<string, string>,
): Promise<Record<string, Record<string, string>> | null> {
  // Build only competencies that have at least one evidence entry
  const competenciesWithEvidence = pillarResult.competency_results
    .map(cr => ({
      id:       cr.competency.id,
      name:     cr.competency.name,
      entries:  Object.entries(cr.evidence).filter(([, v]) => v && v.trim().length > 0),
    }))
    .filter(c => c.entries.length > 0)

  if (competenciesWithEvidence.length === 0) return null

  // Build compact evidence listing
  const evidenceBlock = competenciesWithEvidence
    .map(c =>
      `[${c.id}] "${c.name}":\n` +
      c.entries.map(([id, v]) => `  ${assessorNames[id] ?? id}: ${v}`).join("\n")
    )
    .join("\n\n")

  // Build template for JSON response
  const template: Record<string, Record<string, string>> = {}
  for (const c of competenciesWithEvidence) {
    template[c.id] = Object.fromEntries(c.entries.map(([id]) => [id, "..."]))
  }

  const prompt = `
You are polishing assessor evidence notes for ${candidateName} in the ${pillarResult.pillar.name} pillar.
Rephrase each assessor's notes into ONE clear, professional sentence (max 25 words).
Fix spelling/grammar. Keep the meaning. Use aviation-appropriate language.

Evidence (grouped by competency ID):
${evidenceBlock}

Respond ONLY in this JSON format (no markdown). Use the exact competency IDs and assessor IDs shown:
${JSON.stringify(template)}`

  try {
    const raw = await askGroq(prompt, 800, MODEL_FAST)
    if (!raw) return null
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

/**
 * 3.11d — Development area insights (ONE call for all weak competencies)
 *
 * Returns: { [competency_id]: "short insight text" }
 * Saved as development_area_insights (JSON) at candidate level.
 */
export async function genDevelopmentAreaInsights(
  candidateName: string,
  weakCompetencies: Array<{ competency_id: string; pillarName: string; competencyName: string; score: number }>,
): Promise<Record<string, string> | null> {
  if (weakCompetencies.length === 0) return null

  const template: Record<string, string> = {}
  for (const w of weakCompetencies) template[w.competency_id] = "..."

  const areasList = weakCompetencies
    .map(w => `[${w.competency_id}] ${w.pillarName} → ${w.competencyName}: ${w.score}/5.00`)
    .join("\n")

  const prompt = `
Aviation HR expert writing short development insights for ${candidateName}.
For each weak competency, write ONE actionable sentence (max 20 words) explaining what specific improvement is needed.

Weak competencies:
${areasList}

Respond ONLY in this JSON format (no markdown), using exact IDs:
${JSON.stringify(template)}`

  try {
    const raw = await askGroq(prompt, 600, MODEL_FAST)
    if (!raw) return null
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

/**
 * 3.11c — Development course recommendations
 * Returns specific course recommendations per weak competency area.
 */
export async function genDevelopmentCourses(
  candidateName: string,
  report: CandidateReportData,
): Promise<Array<{ competency: string; course: string; provider: string; duration: string; description: string }> | null> {
  const gaps = report.pillar_results.flatMap(pr =>
    pr.competency_results
      .filter(cr => cr.weighted_avg < 3.5)
      .map(cr => `${pr.pillar.name} → ${cr.competency.name}: ${cr.weighted_avg}/5.00`)
  )
  if (gaps.length === 0) return null

  const prompt = `
Aviation HR specialist recommending specific training courses for ${candidateName}.
Identified development gaps:
${gaps.join("\n")}

For each gap, recommend one specific, realistic aviation training course or programme.
Respond ONLY in this exact JSON array format (no markdown):
[{"competency":"...","course":"...","provider":"...","duration":"...","description":"..."}]
Keep descriptions under 15 words. Use real aviation training providers (CAE, FlightSafety, IATA, ICAO, manufacturer training centres, etc.).
Limit to max 5 courses.`

  try {
    const raw = await askGroq(prompt, 600)
    if (!raw) return null
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

// ── TRACK REPORT AI FUNCTIONS ─────────────────────────────────────────────────

/**
 * 3.13 — Track summary
 */
export async function genTrackSummary(
  trackName: string,
  reports: CandidateReportData[],
  stats: GroupStatsData,
): Promise<string | null> {
  const verdicts = stats.track_breakdown
  const avgScore = reports.length > 0
    ? (reports.reduce((s, r) => s + r.overall_score, 0) / reports.length).toFixed(2)
    : "N/A"

  const pillarAvgs = reports.length > 0
    ? stats.pillar_averages.map(p => `${p.pillar_name}: ${p.avg}`).join(", ")
    : "N/A"

  return askGroq(`
Aviation assessor summarising the ${trackName} track cohort.
Total candidates: ${reports.length} | Average score: ${avgScore}/5.00
Verdict breakdown: ${JSON.stringify(verdicts[Object.keys(verdicts).find(k => verdicts[k as any]?.track_name === trackName) ?? ""]?.verdicts ?? {})}
Pillar averages: ${pillarAvgs}

Write a 3–4 sentence summary of this track cohort's overall performance.
What characterises this group? What are the standout patterns? Use professional language.
`, 320)
}

/**
 * 3.14 — Common strengths and gaps (track level)
 */
export async function genCommonStrengthsGaps(
  trackName: string,
  pillarAverages: GroupStatsData["pillar_averages"],
  divergentCompetencies: GroupStatsData["divergent_competencies"],
): Promise<string | null> {
  const strong = pillarAverages.filter(p => p.insight_label === "top_strength").map(p => `${p.pillar_name} (${p.avg})`).join(", ")
  const weak   = pillarAverages.filter(p => p.insight_label === "development").map(p => `${p.pillar_name} (${p.avg})`).join(", ")
  const divg   = divergentCompetencies.slice(0, 3).map(d => `${d.competency_name} (spread ${d.avg_spread})`).join(", ")

  return askGroq(`
${trackName} track cohort analysis.
Pillar averages: ${pillarAverages.map(p => `${p.pillar_name}: ${p.avg}`).join(", ")}
Group-wide strengths: ${strong || "none identified"}
Group-wide gaps: ${weak || "none identified"}
Most divergent competencies: ${divg || "none"}

In 2–3 sentences, identify the most meaningful common strengths and gaps for this track cohort.
If gaps appear across all candidates, suggest whether this reflects a training programme issue rather than individual weakness.
`, 280)
}

// ── GROUP REPORT AI FUNCTIONS ─────────────────────────────────────────────────

/**
 * 3.15 — Group narrative (bullet format for report rendering)
 */
export async function genGroupNarrative(
  groupName: string,
  stats: GroupStatsData,
  snapshot: ConfigSnapshot,
): Promise<string | null> {
  const dist    = stats.verdict_distribution
  const pillars = stats.pillar_averages.map(p => `${p.pillar_name}: ${p.avg}`).join(", ")

  return askGroq(`
Aviation assessment group: ${groupName}
Total candidates: ${stats.total_candidates}
Verdict distribution: Strong Yes: ${dist.strong_yes}, Yes: ${dist.yes}, Marginal: ${dist.marginal}, No: ${dist.no}
Pillar averages: ${pillars}

Write exactly 3–4 bullet points summarising this cohort for senior leadership.
Each bullet must start with "• " and be one complete, insightful sentence.
Topics: overall cohort quality, most significant finding, standout pillar pattern, any concern or flag.
Aviation assessment language. Return bullets only — no intro sentence, no trailing text.
`, 350)
}

/**
 * 3.16 — Systemic gap detector (bullet format)
 */
export async function genSystemicGapDetector(
  stats: GroupStatsData,
  totalCandidates: number,
): Promise<string | null> {
  const weakPillars = stats.pillar_averages.filter(p => p.insight_label === "development" || p.avg < 3.0)
  if (weakPillars.length === 0) return null

  return askGroq(`
Assessment group systemic gap analysis.
Total candidates: ${totalCandidates}
Pillars below standard across the cohort:
${weakPillars.map(p => `${p.pillar_name}: avg ${p.avg}/5.00`).join("\n")}

Write 2–3 bullet points assessing whether these cohort-wide weaknesses indicate a systemic training gap
rather than individual candidate deficiency. If so, what upstream intervention would address the root cause?
Each bullet must start with "• " and be one complete sentence.
Return bullets only — no intro sentence.
`, 280)
}

/**
 * 3.17 — Assessor bias report (admin-only)
 */
export async function genAssessorBiasReport(
  assessorScoreSummaries: Array<{
    name: string
    avg_score: number
    group_avg: number
    score_range: { min: number; max: number }
    central_tendency_pct: number // % of scores between 3.0–3.8
  }>,
): Promise<string | null> {
  if (assessorScoreSummaries.length === 0) return null

  const summaries = assessorScoreSummaries.map(a =>
    `${a.name}: avg ${a.avg_score} (group avg ${a.group_avg}, diff ${(a.avg_score - a.group_avg).toFixed(2)}), ` +
    `range ${a.score_range.min}–${a.score_range.max}, central tendency: ${a.central_tendency_pct}%`
  ).join("\n")

  return askGroq(`
Assessor calibration analysis for this assessment group:
${summaries}

In 2–3 sentences per assessor, flag any evidence of scoring bias:
- Severity bias (consistently below group avg)
- Leniency bias (consistently above group avg)
- Central tendency (too many scores in the 3.0–3.8 range)
Then give a 1-sentence overall calibration recommendation.
Professional, factual tone — this is an internal admin report.
`, 400)
}

/**
 * 3.18 — Talent map commentary (bullet format)
 */
export async function genTalentMapCommentary(
  stats: GroupStatsData,
  pillarNames: [string, string], // the two axes used
): Promise<string | null> {
  const ranking = stats.candidate_ranking.slice(0, 8) // top 8 for context

  return askGroq(`
Aviation talent map analysis. Candidates plotted on ${pillarNames[0]} (X-axis) vs ${pillarNames[1]} (Y-axis).
Bubble size represents overall score. Candidate positions:
${ranking.map(r => `Candidate ${r.rank}: ${pillarNames[0]}=${r.pillar_scores[Object.keys(r.pillar_scores)[0]] ?? "?"}, ${pillarNames[1]}=${r.pillar_scores[Object.keys(r.pillar_scores)[1]] ?? "?"}, overall=${r.overall_score}, verdict=${r.verdict}`).join("\n")}

Write 2–3 bullet points narrating what the talent map reveals about the cohort distribution.
Consider: distinct clusters, isolated outliers, balanced vs skewed spread, correlation between the two pillars.
Each bullet must start with "• " and be one complete sentence.
Return bullets only — no intro sentence.
`, 250)
}

/**
 * 3.19 — Cohort prediction (bullet format)
 */
export async function genCohortPrediction(
  groupName: string,
  stats: GroupStatsData,
): Promise<string | null> {
  const dist = stats.verdict_distribution

  return askGroq(`
Forward-looking cohort prediction for assessment group: ${groupName}
Strong Yes: ${dist.strong_yes} | Yes: ${dist.yes} | Marginal: ${dist.marginal} | No: ${dist.no}
Total: ${stats.total_candidates}

Write 2–3 bullet points with a forward-looking prediction for this cohort.
Address: who will likely excel quickly on the line, who needs structured support, and which marginal candidates
have realistic paths to the next standard level.
Each bullet must start with "• " and be one complete sentence.
Return bullets only — no intro sentence.
`, 280)
}

/**
 * 3.20 — Alternative paths (for non-passing candidates)
 * Analyses each marginal/no candidate's strongest pillars and recommends
 * alternative aviation career paths where those strengths are valued.
 */
export async function genAlternativePaths(
  groupName: string,
  nonPassingCandidates: Array<{
    name: string
    verdict: string
    overall_score: number
    primary_track: string | null
    pillars: Array<{ name: string; score: number; insight_label: string }>
  }>,
  allTracks: string[],
): Promise<string | null> {
  if (nonPassingCandidates.length === 0) return null

  const candidatesText = nonPassingCandidates.map(c => {
    const sorted = [...c.pillars].sort((a, b) => b.score - a.score)
    const pillarLines = sorted.map(p => `    ${p.name}: ${p.score.toFixed(2)}`).join("\n")
    return `${c.name} — primary track: ${c.primary_track ?? "Unassigned"}, overall: ${c.overall_score.toFixed(2)}/5.00, verdict: ${c.verdict}\n${pillarLines}`
  }).join("\n\n")

  const tracksLine = allTracks.length > 0 ? allTracks.join(", ") : "Safety, Operations, Technical, Training"

  return askGroq(`
You are a senior aviation HR specialist providing alternative career path guidance for candidates who did not fully pass their primary track assessment.

Assessment group: ${groupName}
Organisation's available tracks/roles: ${tracksLine}

Candidates who did not pass and their pillar scores (sorted strongest first):
${candidatesText}

For each candidate, analyse their strongest pillar scores and recommend 1–2 alternative aviation specialisations where their demonstrated strengths would be genuinely valued.
Think broadly: Safety & Quality Assurance, Training & Standards, Ground Operations, Dispatch, Technical/Maintenance, Air Traffic Control support, Crew Resource Management facilitation, etc.
A candidate strong in Safety but weak in Operations → recommend Safety Officer or Quality Auditor.
A candidate strong in Technical/CRM but weak operationally → recommend Training Captain or Line Check Airman support.

Return one bullet point per candidate starting with "• ". Each bullet must be 1–2 sentences:
• [Name] (scored X/5 in [Track]): Demonstrates strongest capability in [Pillar] ([score]) — recommend exploring [Alternative Path], where this competency is a core requirement and [brief reason this fits their profile].

Return bullets only. No preamble. No trailing recommendation. Professional aviation language.
`, 550)
}
