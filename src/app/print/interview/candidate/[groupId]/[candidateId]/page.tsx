import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import { buildCandidateReport } from "@/lib/interview-scoring"
import type { RawScore, RawQualitative, ConfigSnapshot } from "@/lib/interview-scoring"
import CandidateReportCanvas from "@/components/interview/reports/CandidateReportCanvas"

export default async function PrintCandidatePage({
  params,
  searchParams,
}: {
  params:       Promise<{ groupId: string; candidateId: string }>
  searchParams: Promise<{ pdf_secret?: string }>
}) {
  // ── Auth: accept pdf_secret (Puppeteer) or live session ──────────────────
  const { pdf_secret } = await searchParams
  const validSecret = process.env.PDF_INTERNAL_SECRET && pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session || !["admin", "instructor"].includes(session.user?.role ?? ""))
      redirect("/auth/login")
  }

  const { groupId, candidateId } = await params

  // ── 1. Group + snapshot ──────────────────────────────────────────────────
  const { data: group } = await db
    .from("assessment_groups")
    .select("id, name, status, config_snapshot, location, scheduled_date")
    .eq("id", groupId)
    .single()

  if (!group || !group.config_snapshot) notFound()
  if (!["complete", "published"].includes(group.status)) notFound()

  const snapshot = group.config_snapshot as ConfigSnapshot

  // ── 2. Candidate ─────────────────────────────────────────────────────────
  const { data: candidate } = await db
    .from("interview_candidates")
    .select("id, full_name, position, track_id, years_experience, employment_id")
    .eq("id", candidateId)
    .eq("group_id", groupId)
    .single()

  if (!candidate) notFound()

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
  const assessor_pillar_weights: Record<string, Record<string, number>> = {}
  for (const ga of gaRows ?? []) assessor_pillar_weights[(ga as any).assessor_id] = (ga as any).pillar_weights ?? {}

  let assessors: { id: string; name: string; email: string }[] = []
  if (assessorIds.length > 0) {
    const { data: users } = await db.from("admin_users").select("id, name, email").in("id", assessorIds)
    assessors = users ?? []
  }

  // ── 4. Scores ────────────────────────────────────────────────────────────
  const { data: scoreData } = await db
    .from("scores")
    .select("candidate_id, assessor_id, competency_id, value, evidence")
    .eq("candidate_id", candidateId)

  const scores = (scoreData ?? []) as RawScore[]

  // ── 5. Qualitative ───────────────────────────────────────────────────────
  const { data: qualData } = await db
    .from("candidate_assessments")
    .select("candidate_id, assessor_id, remarks, gap_analysis, recommendation, confirmed, confirmed_at")
    .eq("candidate_id", candidateId)
    .eq("group_id", groupId)

  const qualitative = (qualData ?? []) as RawQualitative[]

  // ── 6. Compute report ────────────────────────────────────────────────────
  const liveSnapshot: ConfigSnapshot = { ...snapshot, assessor_weights: assessor_pillar_weights }
  const report = buildCandidateReport(candidateId, liveSnapshot, scores, qualitative, candidate.track_id ?? null)

  // ── 7. AI cache ──────────────────────────────────────────────────────────
  const { data: cacheRows } = await db
    .from("interview_report_cache")
    .select("section, content")
    .eq("group_id", groupId)
    .eq("candidate_id", candidateId)

  const aiCache: Record<string, string> = {}
  for (const row of cacheRows ?? []) aiCache[row.section] = row.content

  return (
    <>
      <style>{`
        html, body { margin: 0 !important; padding: 0 !important; }
        .page-break  { break-before: page; }
        .avoid-break { break-inside: avoid; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      `}</style>
      <div style={{ background: "white" }}>
        <CandidateReportCanvas
          group={{ id: group.id, name: group.name, status: group.status, location: group.location, scheduled_date: group.scheduled_date }}
          candidate={{ ...candidate, track_name: trackName }}
          assessors={assessors}
          assessor_pillar_weights={assessor_pillar_weights}
          snapshot={liveSnapshot}
          report={report}
          aiCache={aiCache}
        />
      </div>
    </>
  )
}
