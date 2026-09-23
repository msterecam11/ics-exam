// A group's days (lms_sessions rows with group_id). Attendance on them works
// through the existing attendance screen.
//
// POST   { dates? }  — create the missing days (all of them, or only these)
// DELETE ?day=<id>   — remove a day, only if no attendance was taken on it

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff } from "@/lib/staff-access"
import { loadGroup, generateGroupDays, groupLabel, isUuid } from "@/lib/lms-groups"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: Request, { params }: Params) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any
  const { id } = await params
  const group = await loadGroup(id)
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })
  if (group.status === "cancelled") return NextResponse.json({ error: "This group is cancelled" }, { status: 409 })

  const body = await req.json().catch(() => ({}))
  const dates = Array.isArray(body.dates) ? body.dates.filter((d: unknown) => typeof d === "string" && DATE_RE.test(d)) : undefined
  if (Array.isArray(body.dates) && !dates.length) return NextResponse.json({ error: "Choose a day" }, { status: 400 })
  if (dates?.some((d: string) => d < group.start_date || d > group.end_date))
    return NextResponse.json({ error: "That day is outside the group's dates" }, { status: 400 })

  const { data: course } = await db.from("lms_courses").select("title").eq("id", group.course_id).single()
  let created = 0
  try { created = await generateGroupDays(group, (course as any)?.title ?? "Course", g.session.id, dates) }
  catch { return NextResponse.json({ error: "Could not create the days" }, { status: 500 }) }

  if (created) await auditLog(session, "lms.group.days.create", "lms_course_group", id, groupLabel(group), { created })
  return NextResponse.json({ created })
}

export async function DELETE(req: Request, { params }: Params) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any
  const { id } = await params
  const dayId = new URL(req.url).searchParams.get("day")
  if (!isUuid(dayId)) return NextResponse.json({ error: "day required" }, { status: 400 })
  const group = await loadGroup(id)
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })

  const { data: day } = await db.from("lms_sessions").select("id, session_date").eq("id", dayId).eq("group_id", id).maybeSingle()
  if (!day) return NextResponse.json({ error: "Day not found" }, { status: 404 })
  const { count } = await db.from("lms_attendance").select("id", { count: "exact", head: true }).eq("session_id", dayId)
  if ((count ?? 0) > 0) return NextResponse.json({ error: "Attendance was taken on this day — it can't be removed" }, { status: 409 })

  const { error } = await db.from("lms_sessions").delete().eq("id", dayId)
  if (error) return NextResponse.json({ error: "Could not remove the day" }, { status: 500 })
  await auditLog(session, "lms.group.days.delete", "lms_course_group", id, groupLabel(group), { date: (day as any).session_date })
  return NextResponse.json({ ok: true })
}
