import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ groupId: string }> }

// ── GET — list all assessor accounts available to assign ──────────────────

export async function GET(_: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await params // not used but required to resolve

  const { data, error } = await db
    .from("admin_users")
    .select("id, name, email, role")
    .eq("role", "assessor")
    .order("name")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ── POST — add assessor to group, auto-init pillar weights at 100 ─────────

export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params
  const body = await req.json().catch(() => ({}))
  const { assessor_id } = body
  if (!assessor_id) return NextResponse.json({ error: "assessor_id required" }, { status: 400 })

  // Fetch the group's config_id so we can look up pillar IDs
  const { data: group } = await db
    .from("assessment_groups")
    .select("config_id")
    .eq("id", groupId)
    .single()

  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })

  // Load pillars for this config to initialise weights at 100 for each
  const { data: pillars } = await db
    .from("pillars")
    .select("id")
    .eq("config_id", group.config_id)

  const defaultWeights: Record<string, number> = {}
  for (const p of pillars ?? []) defaultWeights[p.id] = 100

  const { error } = await db
    .from("group_assessors")
    .insert({ group_id: groupId, assessor_id, pillar_weights: defaultWeights })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, pillar_weights: defaultWeights }, { status: 201 })
}

// ── PATCH — update pillar_weights and/or candidate_ids for one assessor ──────

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params
  const body = await req.json().catch(() => ({}))
  const { assessor_id, pillar_weights } = body

  if (!assessor_id) return NextResponse.json({ error: "assessor_id required" }, { status: 400 })
  if (!pillar_weights) return NextResponse.json({ error: "pillar_weights required" }, { status: 400 })

  // Clamp all values 0–100
  const clamped: Record<string, number> = {}
  for (const [pid, val] of Object.entries(pillar_weights as Record<string, number>)) {
    clamped[pid] = Math.min(100, Math.max(0, Math.round(Number(val))))
  }
  const updates = { pillar_weights: clamped }

  const { error } = await db
    .from("group_assessors")
    .update(updates)
    .eq("group_id", groupId)
    .eq("assessor_id", assessor_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── DELETE — remove assessor from group ───────────────────────────────────

export async function DELETE(req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params
  const { searchParams } = new URL(req.url)
  const assessor_id = searchParams.get("assessor_id")
  if (!assessor_id) return NextResponse.json({ error: "assessor_id required" }, { status: 400 })

  const { error } = await db
    .from("group_assessors")
    .delete()
    .eq("group_id", groupId)
    .eq("assessor_id", assessor_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
