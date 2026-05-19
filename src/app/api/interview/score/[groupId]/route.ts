import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ groupId: string }> }

// ── helpers ───────────────────────────────────────────────────────────────────

async function getGroupOrFail(groupId: string) {
  const { data } = await db
    .from("assessment_groups")
    .select("id, name, status, locked, config_snapshot")
    .eq("id", groupId)
    .single()
  return data
}

async function getCandidateIds(groupId: string): Promise<string[]> {
  const { data } = await db
    .from("interview_candidates")
    .select("id")
    .eq("group_id", groupId)
  return (data ?? []).map((c: any) => c.id)
}

// ── GET — load full scoring data ──────────────────────────────────────────────

export async function GET(_: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { groupId } = await params
  const assessorId  = session.user.id

  // Verify assignment (admins/instructors skip)
  const isManager = ["admin", "instructor"].includes(session.user.role ?? "")
  if (!isManager) {
    const { data: assignment } = await db
      .from("group_assessors")
      .select("group_id")
      .eq("group_id", groupId)
      .eq("assessor_id", assessorId)
      .single()
    if (!assignment) return NextResponse.json({ error: "Not assigned to this group" }, { status: 403 })
  }

  const group = await getGroupOrFail(groupId)
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })

  const candidateIds = await getCandidateIds(groupId)

  // Fetch assessor's pillar weights
  const { data: assessorMeta } = await db
    .from("group_assessors")
    .select("pillar_weights")
    .eq("group_id", groupId)
    .eq("assessor_id", assessorId)
    .single()

  const [candidatesRes, scoresRes, qualRes] = await Promise.all([
    db.from("interview_candidates")
      .select("id, full_name, position, track_id, years_experience, role_tracks(id, name)")
      .eq("group_id", groupId)
      .order("created_at"),
    candidateIds.length > 0
      ? db.from("scores")
          .select("id, candidate_id, competency_id, value, evidence")
          .eq("assessor_id", assessorId)
          .in("candidate_id", candidateIds)
      : { data: [] },
    candidateIds.length > 0
      ? db.from("candidate_assessments")
          .select("candidate_id, remarks, gap_analysis, recommendation, confirmed, confirmed_at")
          .eq("assessor_id", assessorId)
          .eq("group_id", groupId)
      : { data: [] },
  ])

  return NextResponse.json({
    group,
    candidates:     candidatesRes.data ?? [],
    scores:         scoresRes.data     ?? [],
    qualitative:    qualRes.data       ?? [],
    // pillar_weights: { [pillarId]: weight } — weight=0 means this assessor is excluded from that pillar
    pillar_weights: (assessorMeta as any)?.pillar_weights ?? {},
  })
}

// ── POST — upsert a single competency score ───────────────────────────────────

export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { groupId } = await params
  const body = await req.json().catch(() => ({}))
  const { candidate_id, competency_id, value, evidence } = body

  if (!candidate_id || !competency_id || value === undefined)
    return NextResponse.json({ error: "candidate_id, competency_id, value required" }, { status: 400 })

  const numValue = parseFloat(String(value))
  if (isNaN(numValue) || numValue < 1 || numValue > 5)
    return NextResponse.json({ error: "value must be between 1 and 5" }, { status: 400 })

  const group = await getGroupOrFail(groupId)
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })
  if (group.locked)          return NextResponse.json({ error: "Group is locked" }, { status: 409 })
  if (group.status !== "active") return NextResponse.json({ error: "Group is not active" }, { status: 409 })

  // Verify candidate_id actually belongs to this group (prevents cross-group score injection)
  const { data: candidateCheck } = await db
    .from("interview_candidates")
    .select("id")
    .eq("id", candidate_id)
    .eq("group_id", groupId)
    .single()
  if (!candidateCheck)
    return NextResponse.json({ error: "Candidate not found in this group" }, { status: 403 })

  const assessorId = session.user.id

  const { data, error } = await db
    .from("scores")
    .upsert(
      {
        candidate_id,
        assessor_id:  assessorId,
        competency_id,
        value:        numValue,
        evidence:     evidence ?? null,
      },
      { onConflict: "candidate_id,assessor_id,competency_id" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ── PATCH — upsert qualitative analysis (remarks / gap / recommendation / confirm) ─

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { groupId } = await params
  const body = await req.json().catch(() => ({}))
  const { candidate_id, remarks, gap_analysis, recommendation, confirmed } = body

  if (!candidate_id) return NextResponse.json({ error: "candidate_id required" }, { status: 400 })

  const group = await getGroupOrFail(groupId)
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })
  if (group.locked) return NextResponse.json({ error: "Group is locked" }, { status: 409 })

  const assessorId = session.user.id
  const now = new Date().toISOString()

  const { data, error } = await db
    .from("candidate_assessments")
    .upsert(
      {
        candidate_id,
        assessor_id:    assessorId,
        group_id:       groupId,
        remarks:        remarks        ?? null,
        gap_analysis:   gap_analysis   ?? null,
        recommendation: recommendation ?? null,
        confirmed:      confirmed === true,
        confirmed_at:   confirmed === true ? now : null,
      },
      { onConflict: "candidate_id,assessor_id" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
