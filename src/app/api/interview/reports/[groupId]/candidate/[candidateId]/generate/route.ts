export const maxDuration = 60  // Vercel serverless timeout — same as exam system

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { buildCandidateReport } from "@/lib/interview-scoring"
import type { RawScore, RawQualitative, ConfigSnapshot } from "@/lib/interview-scoring"
import { genCandidateInsights, genPillarEvidenceRephrase, genQualitativeRephrase, QuotaExceededError } from "@/lib/interview-ai"

type Params = { params: Promise<{ groupId: string; candidateId: string }> }

/**
 * POST /api/interview/reports/[groupId]/candidate/[candidateId]/generate
 *
 * Generates the expert report for ONE candidate only.
 * Same pattern as the exam system — one call per candidate, not bulk.
 *
 * Total API calls:
 *   1 × genCandidateInsights (70b — all narrative sections in one JSON)
 *   N × genPillarEvidenceRephrase (8b fast — one per pillar)
 *   ─────────────────────────────────────────────────────
 *   ~5 calls total for a 4-pillar config (~$0.001)
 */
export async function POST(_: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId, candidateId } = await params

  // ── 1. Group + snapshot ──────────────────────────────────────────────────
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

  // ── 2. Candidate ─────────────────────────────────────────────────────────
  const { data: candidate } = await db
    .from("interview_candidates")
    .select("id, full_name, position, track_id, years_experience")
    .eq("id", candidateId)
    .eq("group_id", groupId)
    .single()

  if (!candidate)
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 })

  // Resolve track name
  let trackName: string | null = null
  if (candidate.track_id) {
    const { data: track } = await db.from("role_tracks").select("name").eq("id", candidate.track_id).single()
    trackName = track?.name ?? null
  }

  // ── 3. Assessors + live pillar_weights ───────────────────────────────────
  const { data: gaRows } = await db
    .from("group_assessors")
    .select("assessor_id, pillar_weights")
    .eq("group_id", groupId)

  const assessorIds = (gaRows ?? []).map((ga: any) => ga.assessor_id)
  const liveAssessorWeights: Record<string, Record<string, number>> = {}
  for (const ga of gaRows ?? []) {
    liveAssessorWeights[(ga as any).assessor_id] = (ga as any).pillar_weights ?? {}
  }

  let assessorMap: Record<string, { id: string; name: string }> = {}
  if (assessorIds.length > 0) {
    const { data: users } = await db.from("admin_users").select("id, name").in("id", assessorIds)
    for (const u of users ?? []) assessorMap[u.id] = u
  }
  const assessorNames: Record<string, string> = Object.fromEntries(
    Object.entries(assessorMap).map(([id, u]) => [id, u.name])
  )

  // ── 4. Scores + qualitative ──────────────────────────────────────────────
  const [scoresRes, qualRes] = await Promise.all([
    db.from("scores")
      .select("candidate_id, assessor_id, competency_id, value, evidence")
      .eq("candidate_id", candidateId),
    db.from("candidate_assessments")
      .select("candidate_id, assessor_id, remarks, gap_analysis, recommendation, confirmed, confirmed_at")
      .eq("candidate_id", candidateId)
      .eq("group_id", groupId),
  ])

  const scores      = (scoresRes.data ?? []) as RawScore[]
  const qualitative = (qualRes.data ?? []) as RawQualitative[]

  // ── 5. Build report (live weights override frozen snapshot) ──────────────
  const liveSnapshot: ConfigSnapshot = { ...snapshot, assessor_weights: liveAssessorWeights }
  const report = buildCandidateReport(candidateId, liveSnapshot, scores, qualitative, candidate.track_id ?? null)

  // ── Cache helper — checks Supabase errors, returns true on success ────────
  let sectionsSaved = 0
  async function saveCache(section: string, content: unknown): Promise<void> {
    // Coerce to string — model occasionally returns objects/arrays for string fields
    const str = content == null
      ? null
      : typeof content === "string"
        ? content
        : JSON.stringify(content)
    if (!str?.trim()) return
    await db.from("interview_report_cache").delete().match({ section, group_id: groupId, candidate_id: candidateId })
    const { error } = await db
      .from("interview_report_cache")
      .insert({ section, content: str, group_id: groupId, candidate_id: candidateId })
    if (error) console.error("[saveCache] Supabase insert error for section", section, ":", error)
    else sectionsSaved++
  }

  console.log("[generate] Starting for candidate:", candidateId, "group:", groupId)
  console.log("[generate] GROQ key present (interview):", !!process.env.GROQ_API_KEY_INTERVIEW)
  console.log("[generate] GROQ key present (fallback):", !!process.env.GROQ_API_KEY)

  try {
    // ── CALL 1 — All narrative insights (1 call, 70b model) ───────────────
    const insights = await genCandidateInsights(
      candidate.full_name,
      trackName,
      report,
      liveSnapshot,
      qualitative,
      assessorNames,
    )

    console.log("[generate] insights result:", insights ? "OK" : "NULL — genCandidateInsights returned null")

    if (insights) {
      // Qualitative synthesis — rebuild as object for UI compatibility
      const qualSynthesis = (insights.qualitative_remarks || insights.qualitative_gaps || insights.qualitative_rec)
        ? JSON.stringify({ remarks: insights.qualitative_remarks, gap_analysis: insights.qualitative_gaps, recommendation: insights.qualitative_rec })
        : null

      // Development area insights — rebuild as Record<id, insight> for UI compatibility
      const devAreaInsights = insights.development_insights?.length
        ? JSON.stringify(Object.fromEntries(insights.development_insights.map(d => [d.id, d.insight])))
        : null

      await Promise.all([
        saveCache("executive_summary",         insights.executive_summary),
        saveCache("verdict_explanation",       insights.verdict_explanation),
        saveCache("what_would_change",         insights.what_would_change),
        saveCache("profile_interpretation",    insights.profile_interpretation),
        saveCache("red_thread",                insights.red_thread),
        saveCache("strengths_narrative",       insights.strengths_narrative),
        saveCache("weaknesses_narrative",      insights.weaknesses_narrative),
        saveCache("forward_focus",             insights.forward_focus),
        saveCache("recommendation",            insights.recommendation),
        saveCache("qualitative_synthesis",     qualSynthesis),
        saveCache("development_plan",          insights.development_plan),
        saveCache("development_courses",       insights.development_courses ? JSON.stringify(insights.development_courses) : null),
        saveCache("development_area_insights", devAreaInsights),
        // Pillar stories — array → individual cache keys by pillar ID
        ...(insights.pillar_stories ?? []).map(p =>
          saveCache(`pillar_story_${p.id}`, p.story)
        ),
      ])
    }

    // ── Qualitative rephrase — polish raw assessor text (fast model) ──────
    if (qualitative.length > 0) {
      await new Promise(r => setTimeout(r, 600))
      const qualRephrased = await genQualitativeRephrase(candidate.full_name, qualitative, assessorNames)
      if (qualRephrased) {
        await Promise.all(
          Object.entries(qualRephrased).map(([assessorId, text]) =>
            saveCache(`qual_rephrase_${assessorId}`, JSON.stringify(text))
          )
        )
      }
    }

    // ── Evidence rephrase per pillar (fast model, 8b) ─────────────────────
    for (let i = 0; i < report.pillar_results.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 600))
      const pr        = report.pillar_results[i]
      const rephrased = await genPillarEvidenceRephrase(candidate.full_name, pr, assessorNames)
      if (rephrased) {
        await Promise.all(
          Object.entries(rephrased).map(([competencyId, assessorEvidence]) =>
            saveCache(`evidence_rephrase_${competencyId}`, JSON.stringify(assessorEvidence))
          )
        )
      }
    }

    // Warn if nothing was saved (AI returned unparseable response)
    console.log("[generate] sectionsSaved:", sectionsSaved)
    if (sectionsSaved === 0) {
      return NextResponse.json(
        { error: "AI returned an unexpected response. Please try again." },
        { status: 500 }
      )
    }
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(
        { error: "AI quota reached. Please wait a few minutes and try again, or check your Groq usage at console.groq.com." },
        { status: 429 }
      )
    }
    throw err
  }

  return NextResponse.json({ ok: true, sections_saved: sectionsSaved, message: "Expert Report generated successfully" })
}
