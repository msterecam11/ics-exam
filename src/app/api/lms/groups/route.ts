// Onsite groups of a course.
//
// GET  ?course_id=   — the course's groups, with seats taken, days and staff
// POST               — create a group (admin). Body: the group's fields,
//                      course_id, staff: [{ user_id, role }], generate_days
//
// Instructors and facilitators get their own view of their groups later
// (Phase 3); managing groups is an admin job.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff } from "@/lib/staff-access"
import {
  GROUP_COLUMNS, isUuid, readGroupInput, readStaff, seatsTaken, generateGroupDays, groupLabel, type CourseGroup,
} from "@/lib/lms-groups"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const courseId = new URL(req.url).searchParams.get("course_id")
  if (!isUuid(courseId)) return NextResponse.json({ error: "course_id required" }, { status: 400 })

  const { data, error } = await db.from("lms_course_groups")
    .select(`${GROUP_COLUMNS}, lms_service_providers(id, name)`)
    .eq("course_id", courseId)
    .order("start_date", { ascending: false })
  if (error) return NextResponse.json({ error: "Could not load groups" }, { status: 500 })
  const groups = (data ?? []) as any[]
  const ids = groups.map(x => x.id)

  const [taken, { data: staff }, { data: days }] = await Promise.all([
    seatsTaken(ids),
    ids.length ? db.from("lms_group_staff").select("group_id, role, admin_users(id, name)").in("group_id", ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db.from("lms_sessions").select("group_id").in("group_id", ids) : Promise.resolve({ data: [] as any[] }),
  ])
  const staffBy = new Map<string, any[]>()
  for (const s of (staff ?? []) as any[]) {
    if (!staffBy.has(s.group_id)) staffBy.set(s.group_id, [])
    staffBy.get(s.group_id)!.push({ id: s.admin_users?.id, name: s.admin_users?.name, role: s.role })
  }
  const dayCount = new Map<string, number>()
  for (const d of (days ?? []) as any[]) dayCount.set(d.group_id, (dayCount.get(d.group_id) ?? 0) + 1)

  return NextResponse.json(groups.map(x => ({
    ...x,
    label: groupLabel(x),
    provider: x.lms_service_providers ?? null,
    seats_taken: taken.get(x.id) ?? 0,
    days: dayCount.get(x.id) ?? 0,
    staff: staffBy.get(x.id) ?? [],
  })))
}

export async function POST(req: Request) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any
  const body = await req.json().catch(() => ({}))

  if (!isUuid(body.course_id)) return NextResponse.json({ error: "course_id required" }, { status: 400 })
  const { data: course } = await db.from("lms_courses").select("id, title, status, delivery_mode, provider_id").eq("id", body.course_id).maybeSingle()
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 })
  if ((course as any).status === "archived") return NextResponse.json({ error: "This course is archived" }, { status: 409 })
  if ((course as any).delivery_mode === "online")
    return NextResponse.json({ error: "Groups are for onsite and hybrid courses — change the delivery mode first" }, { status: 400 })

  const input = readGroupInput(body, { partial: false })
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 })
  // A new group takes the course's provider unless one is chosen.
  const value = { ...input.value, provider_id: input.value.provider_id ?? (course as any).provider_id ?? null }

  const staff = readStaff(body.staff)
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: 400 })
  if (staff.list.length) {
    const { data: users } = await db.from("admin_users").select("id").in("id", staff.list.map(s => s.user_id)).in("role", ["admin", "instructor", "facilitator"])
    if ((users ?? []).length !== new Set(staff.list.map(s => s.user_id)).size)
      return NextResponse.json({ error: "Only staff accounts can be assigned" }, { status: 400 })
  }

  const { data: created, error } = await db.from("lms_course_groups")
    .insert({ ...value, course_id: course.id, status: "planned", created_by: g.session.id })
    .select(GROUP_COLUMNS).single()
  if (error || !created) return NextResponse.json({ error: "Could not create the group" }, { status: 500 })
  const group = created as unknown as CourseGroup

  if (staff.list.length)
    await db.from("lms_group_staff").insert(staff.list.map(s => ({ group_id: group.id, user_id: s.user_id, role: s.role })))

  let days = 0
  if (body.generate_days !== false) {
    try { days = await generateGroupDays(group, (course as any).title, g.session.id) } catch { /* the group exists; days can be added from its page */ }
  }

  await auditLog(session, "lms.group.create", "lms_course_group", group.id, groupLabel(group), { course_id: course.id, days })
  return NextResponse.json({ ...group, days }, { status: 201 })
}
