import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ groupId: string }> }

// GET — load full scoring data for this assessor + group
export async function GET(_: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { groupId } = await params
  const assessorId = session.user.id

  // Verify assessor is assigned to this group
  const { data: assignment } = await db
    .from("group_assessors")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("assessor_id", assessorId)
    .single()

  if (!assignment && !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Not assigned to this group" }, { status: 403 })

  const [groupRes, candidatesRes, scoresRes] = await Promise.all([
    db.from("assessment_groups")
      .select("id, name, status, locked, config_snapshot")
      .eq("id", groupId)
      .single(),
    db.from("interview_candidates")
      .select("id, full_name, position, track_id, years_experience, role_tracks(id, name)")
      .eq("group_id", groupId)
      .order("created_at"),
    db.from("scores")
      .select("id, candidate_id, competency_id, value, notes")
      .eq("assessor_id", assessorId)
      .in(
        "candidate_id",
        // subquery workaround: fetch candidate ids first
        (await db.from("interview_candidates").select("id").eq("group_id", groupId)).data?.map((c: any) => c.id) ?? []
      ),
  ])

  if (!groupRes.data) return NextResponse.json({ error: "Group not found" }, { status: 404 })

  return NextResponse.json({
    group:      groupRes.data,
    candidates: candidatesRes.data ?? [],
    scores:     scoresRes.data ?? [],
  })
}

// POST — upsert a single score
export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { groupId } = await params
  const body = await req.json().catch(() => ({}))
  const { candidate_id, competency_id, value, notes } = body

  if (!candidate_id || !competency_id || value === undefined)
    return NextResponse.json({ error: "candidate_id, competency_id, value required" }, { status: 400 })

  if (value < 1 || value > 5)
    return NextResponse.json({ error: "value must be 1–5" }, { status: 400 })

  // Check group is not locked
  const { data: group } = await db
    .from("assessment_groups")
    .select("locked, status")
    .eq("id", groupId)
    .single()

  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })
  if (group.locked) return NextResponse.json({ error: "Group is locked — scores cannot be changed" }, { status: 409 })
  if (group.status !== "active") return NextResponse.json({ error: "Group is not active" }, { status: 409 })

  const assessorId = session.user.id

  const { data, error } = await db
    .from("scores")
    .upsert(
      { candidate_id, assessor_id: assessorId, competency_id, value, notes: notes ?? null },
      { onConflict: "candidate_id,assessor_id,competency_id" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
