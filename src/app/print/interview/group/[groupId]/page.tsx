import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import { buildCandidateReport, buildGroupStats } from "@/lib/interview-scoring"
import type { RawScore, RawQualitative, ConfigSnapshot } from "@/lib/interview-scoring"
import GroupReportCanvas from "@/components/interview/reports/GroupReportCanvas"

export default async function PrintGroupPage({
  params,
  searchParams,
}: {
  params:       Promise<{ groupId: string }>
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

  const { groupId } = await params

  // ── 1. Group + snapshot ──────────────────────────────────────────────────
  const { data: group } = await db
    .from("assessment_groups")
    .select("id, name, status, config_snapshot, location, scheduled_date")
    .eq("id", groupId)
    .single()

  if (!group || !group.config_snapshot) notFound()
  if (!["complete", "published"].includes(group.status)) notFound()

  const snapshot = group.config_snapshot as ConfigSnapshot

  // ── 2. Candidates ────────────────────────────────────────────────────────
  const { data: candidatesRaw } = await db
    .from("interview_candidates")
    .select("id, full_name, position, track_id, years_experience, created_at")
    .eq("group_id", groupId)
    .order("created_at")

  const candidateIds = (candidatesRaw ?? []).map((c: any) => c.id)

  // ── 3. Track names ───────────────────────────────────────────────────────
  const trackIds = [...new Set((candidatesRaw ?? []).map((c: any) => c.track_id).filter(Boolean))] as string[]
  let trackMap: Record<string, string> = {}
  if (trackIds.length > 0) {
    const { data: tracks } = await db.from("role_tracks").select("id, name").in("id", trackIds)
    for (const t of tracks ?? []) trackMap[t.id] = t.name
  }

  const candidates = (candidatesRaw ?? []).map((c: any) => ({
    ...c,
    track_name: c.track_id ? (trackMap[c.track_id] ?? null) : null,
  }))

  // ── 4. Assessors + live pillar_weights ───────────────────────────────────
  const { data: gaRows } = await db
    .from("group_assessors")
    .select("assessor_id, pillar_weights")
    .eq("group_id", groupId)

  const assessorIds = (gaRows ?? []).map((ga: any) => ga.assessor_id)
  const liveAssessorWeights: Record<string, Record<string, number>> = {}
  for (const ga of gaRows ?? []) liveAssessorWeights[(ga as any).assessor_id] = (ga as any).pillar_weights ?? {}

  let assessors: { id: string; name: string; email: string }[] = []
  if (assessorIds.length > 0) {
    const { data: users } = await db.from("admin_users").select("id, name, email").in("id", assessorIds)
    assessors = users ?? []
  }

  // ── 5. Scores ────────────────────────────────────────────────────────────
  let scores: RawScore[] = []
  if (candidateIds.length > 0) {
    const { data } = await db
      .from("scores")
      .select("candidate_id, assessor_id, competency_id, value, evidence")
      .in("candidate_id", candidateIds)
    scores = (data ?? []) as RawScore[]
  }

  // ── 6. Qualitative ───────────────────────────────────────────────────────
  let qualitative: RawQualitative[] = []
  if (candidateIds.length > 0) {
    const { data } = await db
      .from("candidate_assessments")
      .select("candidate_id, assessor_id, remarks, gap_analysis, recommendation, confirmed, confirmed_at")
      .eq("group_id", groupId)
    qualitative = (data ?? []) as RawQualitative[]
  }

  // ── 7. Compute reports ───────────────────────────────────────────────────
  const liveSnapshot: ConfigSnapshot = { ...snapshot, assessor_weights: liveAssessorWeights }

  const reports = (candidates).map((c: any) => {
    const candidateQual = qualitative.filter(q => q.candidate_id === c.id)
    return buildCandidateReport(c.id, liveSnapshot, scores, candidateQual, c.track_id ?? null)
  })

  const candidateMeta = candidates.map((c: any) => ({
    id: c.id, track_id: c.track_id, track_name: c.track_id ? (trackMap[c.track_id] ?? null) : null,
  }))
  const group_stats = buildGroupStats(reports, candidateMeta, liveSnapshot)

  // ── 8. AI cache ──────────────────────────────────────────────────────────
  const { data: cacheRows } = await db
    .from("interview_report_cache")
    .select("section, content")
    .eq("group_id", groupId)
    .is("candidate_id", null)
    .is("track_id", null)

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
        <GroupReportCanvas
          group={{ id: group.id, name: group.name, status: group.status, location: group.location, scheduled_date: group.scheduled_date }}
          candidates={candidates}
          assessors={assessors}
          reports={reports}
          group_stats={group_stats}
          snapshot={liveSnapshot}
          aiCache={aiCache}
        />
      </div>
    </>
  )
}
