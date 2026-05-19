import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ groupId: string }> }

// ── POST — wipe all scores + qualitative assessments for this group ───────────
// Does NOT change group status, locked state, candidates, or assessors.

export async function POST(_: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params

  // Verify group exists
  const { data: group } = await db
    .from("assessment_groups")
    .select("id, status, locked")
    .eq("id", groupId)
    .single()

  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })
  if (group.locked) return NextResponse.json({ error: "Group is locked — unlock before resetting" }, { status: 409 })

  // Get all candidate IDs in this group
  const { data: candidates } = await db
    .from("interview_candidates")
    .select("id")
    .eq("group_id", groupId)

  const candidateIds = (candidates ?? []).map((c: any) => c.id)

  // 1. Delete all competency scores
  if (candidateIds.length > 0) {
    const { error: scoresErr } = await db
      .from("scores")
      .delete()
      .in("candidate_id", candidateIds)
    if (scoresErr) return NextResponse.json({ error: scoresErr.message }, { status: 500 })
  }

  // 2. Delete all qualitative assessments (remarks, gap analysis, recommendation, confirmed)
  const { error: qualErr } = await db
    .from("candidate_assessments")
    .delete()
    .eq("group_id", groupId)

  if (qualErr) return NextResponse.json({ error: qualErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, cleared: candidateIds.length })
}
