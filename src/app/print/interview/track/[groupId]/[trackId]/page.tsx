import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import { buildCandidateReport, buildGroupStats } from "@/lib/interview-scoring"
import type { RawScore, RawQualitative, ConfigSnapshot } from "@/lib/interview-scoring"
import TrackReportCanvas from "@/components/interview/reports/TrackReportCanvas"

export default async function PrintTrackPage({
  params,
  searchParams,
}: {
  params:       Promise<{ groupId: string; trackId: string }>
  searchParams: Promise<{ pdf_secret?: string }>
}) {
  // ── Auth: accept pdf_secret (Puppeteer) or live session ──────────────────
  const { pdf_secret } = await searchParams
  const validSecret = process.env.NEXTAUTH_SECRET && pdf_secret === process.env.NEXTAUTH_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session || !["admin", "instructor"].includes(session.user?.role ?? ""))
      redirect("/auth/login")
  }

  const { groupId, trackId } = await params

  // ── 1. Group + snapshot ──────────────────────────────────────────────────
  const { data: group } = await db
    .from("assessment_groups")
    .select("id, name, status, config_snapshot, scheduled_date")
    .eq("id", groupId)
    .single()

  if (!group || !group.config_snapshot) notFound()
  if (!["complete", "published"].includes(group.status)) notFound()

  const snapshot = group.config_snapshot as ConfigSnapshot

  // ── 2. Track ─────────────────────────────────────────────────────────────
  const { data: track } = await db
    .from("role_tracks")
    .select("id, name")
    .eq("id", trackId)
    .single()

  if (!track) notFound()

  // ── 3. Candidates in this track ──────────────────────────────────────────
  const { data: candidates } = await db
    .from("interview_candidates")
    .select("id, full_name, position, track_id, years_experience")
    .eq("group_id", groupId)
    .eq("track_id", trackId)
    .order("full_name")

  const candidateIds = (candidates ?? []).map((c: any) => c.id)
  if (candidateIds.length === 0) notFound()

  // ── 4. Live assessor pillar_weights ──────────────────────────────────────
  const { data: gaRows } = await db
    .from("group_assessors")
    .select("assessor_id, pillar_weights")
    .eq("group_id", groupId)

  const liveAssessorWeights: Record<string, Record<string, number>> = {}
  for (const ga of gaRows ?? []) liveAssessorWeights[(ga as any).assessor_id] = (ga as any).pillar_weights ?? {}

  const liveSnapshot: ConfigSnapshot = { ...snapshot, assessor_weights: liveAssessorWeights }

  // ── 5. Scores ────────────────────────────────────────────────────────────
  const { data: scoreData } = await db
    .from("scores")
    .select("candidate_id, assessor_id, competency_id, value, evidence")
    .in("candidate_id", candidateIds)

  const scores = (scoreData ?? []) as RawScore[]

  // ── 6. Qualitative ───────────────────────────────────────────────────────
  const { data: qualData } = await db
    .from("candidate_assessments")
    .select("candidate_id, assessor_id, remarks, gap_analysis, recommendation, confirmed, confirmed_at")
    .eq("group_id", groupId)
    .in("candidate_id", candidateIds)

  const qualitative = (qualData ?? []) as RawQualitative[]

  // ── 7. Compute reports ───────────────────────────────────────────────────
  const reports = (candidates ?? []).map((c: any) => {
    const candidateQual = qualitative.filter(q => q.candidate_id === c.id)
    return buildCandidateReport(c.id, liveSnapshot, scores, candidateQual, trackId)
  })

  const candidateMeta = (candidates ?? []).map((c: any) => ({ id: c.id, track_id: trackId, track_name: track.name }))
  const track_stats = buildGroupStats(reports, candidateMeta, liveSnapshot)

  // ── 8. AI cache ──────────────────────────────────────────────────────────
  const { data: cacheRows } = await db
    .from("interview_report_cache")
    .select("section, content")
    .eq("group_id", groupId)
    .eq("track_id", trackId)

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
        <TrackReportCanvas
          group={{ id: group.id, name: group.name, status: group.status, scheduled_date: group.scheduled_date }}
          track={track}
          candidates={candidates ?? []}
          reports={reports}
          track_stats={track_stats}
          snapshot={liveSnapshot}
          aiCache={aiCache}
        />
      </div>
    </>
  )
}
