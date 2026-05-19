import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ groupId: string }> }

export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params
  const body = await req.json().catch(() => ({}))
  const { full_name, employment_id, position, track_id, years_experience, notes } = body

  if (!full_name?.trim()) return NextResponse.json({ error: "full_name required" }, { status: 400 })

  // Block adding candidates to locked groups
  const { data: group } = await db.from("assessment_groups").select("locked, status").eq("id", groupId).single()
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })
  if (group.locked) return NextResponse.json({ error: "Group is locked" }, { status: 409 })

  const { data, error } = await db
    .from("interview_candidates")
    .insert({
      group_id: groupId,
      full_name: full_name.trim(),
      employment_id: employment_id?.trim() ?? null,
      position: position?.trim() ?? null,
      track_id: track_id ?? null,
      years_experience: years_experience ?? null,
      notes: notes?.trim() ?? null,
    })
    .select("*, role_tracks(id, name)")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params
  const body = await req.json().catch(() => ({}))
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const allowed = ["full_name", "employment_id", "position", "track_id", "years_experience", "notes"]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in rest) updates[key] = rest[key]
  }

  const { data, error } = await db
    .from("interview_candidates")
    .update(updates)
    .eq("id", id)
    .eq("group_id", groupId)
    .select("*, role_tracks(id, name)")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: group } = await db.from("assessment_groups").select("locked").eq("id", groupId).single()
  if (group?.locked) return NextResponse.json({ error: "Group is locked" }, { status: 409 })

  const { error } = await db.from("interview_candidates").delete().eq("id", id).eq("group_id", groupId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
