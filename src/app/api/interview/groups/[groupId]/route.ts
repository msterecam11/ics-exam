import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ groupId: string }> }

export async function GET(_: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { groupId } = await params

  const { data, error } = await db
    .from("assessment_groups")
    .select(`
      id, name, location, scheduled_date, status, config_snapshot, locked, created_at,
      assessment_configs (
        id, name, description, assessor_weights, verdict_thresholds,
        pillars (
          id, name, weight, order_index, applicable_track_ids,
          competencies ( id, name, weight, order_index )
        )
      ),
      interview_candidates ( id, full_name, position, track_id, years_experience, notes, created_at,
        role_tracks ( id, name )
      ),
      group_assessors ( assessor_id,
        admin_users ( id, name, email, role )
      )
    `)
    .eq("id", groupId)
    .single()

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params
  const body = await req.json().catch(() => ({}))

  const allowed = ["name", "location", "scheduled_date"]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "No valid fields" }, { status: 400 })

  const { data, error } = await db
    .from("assessment_groups")
    .update(updates)
    .eq("id", groupId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params

  // Only allow deleting draft groups
  const { data: group } = await db.from("assessment_groups").select("status").eq("id", groupId).single()
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (group.status !== "draft")
    return NextResponse.json({ error: "Only draft groups can be deleted" }, { status: 409 })

  const { error } = await db.from("assessment_groups").delete().eq("id", groupId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
