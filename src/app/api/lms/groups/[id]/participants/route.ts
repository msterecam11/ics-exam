// Who is in a group.
//
// POST   { enrollment_ids, override? } — place (or move) enrolments of the
//        course into this group. Seats are a hard limit; an admin may override.
// DELETE { enrollment_ids }            — take them out of the group (their
//        enrolment in the course stays; attendance already taken stays).

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff } from "@/lib/staff-access"
import { loadGroup, placeInGroup, groupLabel, isUuid } from "@/lib/lms-groups"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any
  const { id } = await params
  const group = await loadGroup(id)
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body.enrollment_ids) ? body.enrollment_ids : []
  const r = await placeInGroup(group, ids, { override: body.override === true })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })

  const placed = r.results.filter(x => x.status === "placed" || x.status === "moved").length
  await auditLog(session, "lms.group.participants.add", "lms_course_group", id, groupLabel(group), { placed, override: body.override === true })
  return NextResponse.json({ results: r.results, placed })
}

export async function DELETE(req: Request, { params }: Params) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any
  const { id } = await params
  const group = await loadGroup(id)
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const ids = (Array.isArray(body.enrollment_ids) ? body.enrollment_ids : []).filter(isUuid)
  if (!ids.length) return NextResponse.json({ error: "Choose at least one participant" }, { status: 400 })

  const { data, error } = await db.from("lms_enrollments").update({ group_id: null })
    .eq("group_id", id).in("id", ids).select("id")
  if (error) return NextResponse.json({ error: "Could not update" }, { status: 500 })

  await auditLog(session, "lms.group.participants.remove", "lms_course_group", id, groupLabel(group), { removed: (data ?? []).length })
  return NextResponse.json({ removed: (data ?? []).length })
}
