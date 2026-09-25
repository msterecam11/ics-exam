// Teams of an onsite group.
//
// GET                          — the teams and who is in each
// POST   { name }              — add a team
// PATCH  { team_id, name }     — rename
// DELETE ?team_id=             — remove (its members become unassigned)
// PUT    { enrollment_id, team_id | null } — put a participant in a team
//
// Admins and the group's instructors.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardStaff, forbidden } from "@/lib/staff-access"
import { loadGroup, isUuid, SEAT_STATUSES } from "@/lib/lms-groups"

export const dynamic = "force-dynamic"
type Params = { params: Promise<{ id: string }> }

async function access(id: string) {
  const g = await guardStaff()
  if (!g.ok) return { ok: false as const, res: g.res }
  if (!g.scope.isAdmin && !g.scope.instructorGroupIds.includes(id)) return { ok: false as const, res: forbidden() }
  const group = await loadGroup(id)
  if (!group) return { ok: false as const, res: NextResponse.json({ error: "Group not found" }, { status: 404 }) }
  return { ok: true as const, group }
}
const cleanName = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 60) : "")

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const a = await access(id)
  if (!a.ok) return a.res
  const [{ data: teams }, { data: people }] = await Promise.all([
    db.from("lms_group_teams").select("id, name, order_index").eq("group_id", id).order("order_index").order("created_at"),
    db.from("lms_enrollments").select("id, team_id, lms_students(name)").eq("group_id", id).in("status", SEAT_STATUSES),
  ])
  const rows = (people ?? []) as any[]
  return NextResponse.json({
    teams: ((teams ?? []) as any[]).map(t => ({ id: t.id, name: t.name, members: rows.filter(p => p.team_id === t.id).map(p => ({ enrollment_id: p.id, name: p.lms_students?.name ?? "" })) })),
    assignment: Object.fromEntries(rows.map(p => [p.id, p.team_id ?? null])),
  })
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const a = await access(id)
  if (!a.ok) return a.res
  const body = await req.json().catch(() => ({}))
  const { count } = await db.from("lms_group_teams").select("id", { count: "exact", head: true }).eq("group_id", id)
  const name = cleanName(body.name) || `Team ${(count ?? 0) + 1}`
  const { data, error } = await db.from("lms_group_teams").insert({ group_id: id, name, order_index: count ?? 0 }).select("id, name").single()
  if (error) return NextResponse.json({ error: "Could not add the team" }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const a = await access(id)
  if (!a.ok) return a.res
  const body = await req.json().catch(() => ({}))
  const name = cleanName(body.name)
  if (!isUuid(body.team_id) || !name) return NextResponse.json({ error: "team_id and a name required" }, { status: 400 })
  await db.from("lms_group_teams").update({ name }).eq("id", body.team_id).eq("group_id", id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params
  const a = await access(id)
  if (!a.ok) return a.res
  const teamId = new URL(req.url).searchParams.get("team_id")
  if (!isUuid(teamId)) return NextResponse.json({ error: "team_id required" }, { status: 400 })
  await db.from("lms_group_teams").delete().eq("id", teamId).eq("group_id", id)
  return NextResponse.json({ ok: true })
}

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params
  const a = await access(id)
  if (!a.ok) return a.res
  const body = await req.json().catch(() => ({}))
  if (!isUuid(body.enrollment_id)) return NextResponse.json({ error: "enrollment_id required" }, { status: 400 })
  const teamId = body.team_id === null || body.team_id === "" ? null : body.team_id
  if (teamId !== null) {
    if (!isUuid(teamId)) return NextResponse.json({ error: "Invalid team" }, { status: 400 })
    const { data: t } = await db.from("lms_group_teams").select("id").eq("id", teamId).eq("group_id", id).maybeSingle()
    if (!t) return NextResponse.json({ error: "That team isn't in this group" }, { status: 400 })
  }
  const { data, error } = await db.from("lms_enrollments").update({ team_id: teamId }).eq("id", body.enrollment_id).eq("group_id", id).select("id")
  if (error || !data?.length) return NextResponse.json({ error: "Not a participant of this group" }, { status: 400 })
  return NextResponse.json({ ok: true })
}
