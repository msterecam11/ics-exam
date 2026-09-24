// Onsite groups (scheduled deliveries).
//
// GET  ?course_id=   — every group of the course (client programs' and open
//                      dates), with seats taken, days, staff and owner program
// GET  ?program_id=  — the program's Schedule: its onsite courses, their
//                      groups, and how many people aren't placed yet
// POST               — create a group (admin). Body: the group's fields,
//                      course_id, program_id? (a client program's own group;
//                      none = an open date for the catalogue),
//                      staff: [{ user_id, role }], generate_days
//
// A program's group is private to it; when it's the program's only upcoming
// group for the course, the program's participants are placed automatically.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff } from "@/lib/staff-access"
import {
  GROUP_COLUMNS, isUuid, readGroupInput, readStaff, seatsTaken, generateGroupDays, groupLabel, autoPlaceInProgramGroup, type CourseGroup,
} from "@/lib/lms-groups"
import { allProgramCourses } from "@/lib/lms-programs"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const programId = sp.get("program_id")
  if (programId) return programSchedule(programId)

  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const courseId = sp.get("course_id")
  if (!isUuid(courseId)) return NextResponse.json({ error: "course_id required" }, { status: 400 })

  const { data, error } = await db.from("lms_course_groups")
    .select(`${GROUP_COLUMNS}, lms_service_providers(id, name), lms_programs(id, name)`)
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
    program: x.lms_programs ? { id: x.lms_programs.id, name: x.lms_programs.name } : null,
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

  // A client program's own group: the course must be part of that program.
  let programId: string | null = null
  if (body.program_id) {
    if (!isUuid(body.program_id)) return NextResponse.json({ error: "Invalid program" }, { status: 400 })
    const { data: program } = await db.from("lms_programs").select("id, status").eq("id", body.program_id).maybeSingle()
    if (!program) return NextResponse.json({ error: "Program not found" }, { status: 404 })
    if ((program as any).status === "archived") return NextResponse.json({ error: "This program is archived" }, { status: 409 })
    if (!(await allProgramCourses(body.program_id)).includes(course.id))
      return NextResponse.json({ error: "This course is not part of the program" }, { status: 400 })
    programId = body.program_id
  }

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
    .insert({ ...value, course_id: course.id, program_id: programId, status: "planned", created_by: g.session.id })
    .select(GROUP_COLUMNS).single()
  if (error || !created) return NextResponse.json({ error: "Could not create the group" }, { status: 500 })
  const group = created as unknown as CourseGroup

  if (staff.list.length)
    await db.from("lms_group_staff").insert(staff.list.map(s => ({ group_id: group.id, user_id: s.user_id, role: s.role })))

  let days = 0
  if (body.generate_days !== false) {
    try { days = await generateGroupDays(group, (course as any).title, g.session.id) } catch { /* the group exists; days can be added from its page */ }
  }

  // The program's only group for this course: its people go straight in.
  const auto = programId ? await autoPlaceInProgramGroup(programId, course.id).catch(() => ({ placed: 0, groups: 0 })) : null

  await auditLog(session, "lms.group.create", "lms_course_group", group.id, groupLabel(group), { course_id: course.id, program_id: programId, days, placed: auto?.placed ?? 0 })
  return NextResponse.json({ ...group, days, placed: auto?.placed ?? 0, program_groups: auto?.groups ?? null }, { status: 201 })
}

// ── A program's Schedule ─────────────────────────────────────────────────────
async function programSchedule(programId: string) {
  const g = await guardStaff()
  if (!g.ok) return g.res
  if (!isUuid(programId)) return NextResponse.json({ error: "Invalid program" }, { status: 400 })
  if (!g.scope.isAdmin && !g.scope.programIds.includes(programId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const courseIds = await allProgramCourses(programId)
  const { data: courses } = courseIds.length
    ? await db.from("lms_courses").select("id, title, course_code, delivery_mode, provider_id").in("id", courseIds)
    : { data: [] as any[] }
  const onsite = ((courses ?? []) as any[]).filter(c => c.delivery_mode !== "online")
  const onsiteIds = onsite.map(c => c.id)

  const [{ data: groups }, { data: enrols }] = await Promise.all([
    onsiteIds.length
      ? db.from("lms_course_groups").select(`${GROUP_COLUMNS}, lms_service_providers(id, name)`).eq("program_id", programId).in("course_id", onsiteIds).order("start_date")
      : Promise.resolve({ data: [] as any[] }),
    onsiteIds.length
      ? db.from("lms_enrollments").select("course_id, group_id").eq("program_id", programId).in("course_id", onsiteIds).eq("status", "active")
      : Promise.resolve({ data: [] as any[] }),
  ])
  const rows = (groups ?? []) as any[]
  const ids = rows.map(r => r.id)
  const [taken, { data: staff }, { data: days }] = await Promise.all([
    seatsTaken(ids),
    ids.length ? db.from("lms_group_staff").select("group_id, role, admin_users(id, name)").in("group_id", ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db.from("lms_sessions").select("group_id").in("group_id", ids) : Promise.resolve({ data: [] as any[] }),
  ])
  const unplaced = new Map<string, number>(), enrolled = new Map<string, number>()
  for (const e of (enrols ?? []) as any[]) {
    enrolled.set(e.course_id, (enrolled.get(e.course_id) ?? 0) + 1)
    if (!e.group_id) unplaced.set(e.course_id, (unplaced.get(e.course_id) ?? 0) + 1)
  }
  return NextResponse.json({
    courses: onsite.map(c => ({
      id: c.id, title: c.title, course_code: c.course_code, delivery_mode: c.delivery_mode, provider_id: c.provider_id,
      enrolled: enrolled.get(c.id) ?? 0, unplaced: unplaced.get(c.id) ?? 0,
      groups: rows.filter(r => r.course_id === c.id).map(r => ({
        id: r.id, label: groupLabel(r), status: r.status, start_date: r.start_date, end_date: r.end_date,
        daily_start: r.daily_start, daily_end: r.daily_end, city: r.city, venue_name: r.venue_name, seats: r.seats,
        seats_taken: taken.get(r.id) ?? 0, days: ((days ?? []) as any[]).filter(d => d.group_id === r.id).length,
        provider: r.lms_service_providers ?? null,
        staff: ((staff ?? []) as any[]).filter(s => s.group_id === r.id).map(s => ({ id: s.admin_users?.id, name: s.admin_users?.name, role: s.role })),
      })),
    })),
  })
}
