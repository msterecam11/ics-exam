// One onsite group.
//
// GET    — the group with its course, staff, participants, the course's other
//          enrolments that could join, and its days (with attendance counts)
// PATCH  — edit fields, change status, or replace the staff list (admin)
// DELETE — only while nobody is in it and no attendance was taken (admin)

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff } from "@/lib/staff-access"
import { todayISO } from "@/lib/lms-enrollment"
import { checkCourseCompletion } from "@/lib/lms-completion"
import {
  GROUP_COLUMNS, GROUP_STATUSES, SEAT_STATUSES, loadGroup, readGroupInput, readStaff, seatsTaken, groupLabel,
  syncGroupDayDetails, type CourseGroup, type GroupStatus,
} from "@/lib/lms-groups"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const { id } = await params
  const group = await loadGroup(id)
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })

  const [courseRes, providerRes, staffRes, staffOptRes, enrRes, daysRes] = await Promise.all([
    db.from("lms_courses").select("id, title, course_code, delivery_mode, provider_id, status").eq("id", group.course_id).single(),
    group.provider_id ? db.from("lms_service_providers").select("id, name").eq("id", group.provider_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("lms_group_staff").select("role, admin_users(id, name, email, role)").eq("group_id", id),
    db.from("admin_users").select("id, name, email, role").in("role", ["admin", "instructor", "facilitator"]).eq("is_active", true).order("name"),
    db.from("lms_enrollments")
      .select("id, status, group_id, enrolled_at, program_id, lms_students(id, name, email, company), lms_programs(id, name, is_individual, lms_companies(name))")
      .eq("course_id", group.course_id).in("status", SEAT_STATUSES),
    db.from("lms_sessions").select("id, title, session_date, start_time, duration_minutes, location, closed_at").eq("group_id", id).order("session_date"),
  ])

  const enrolments = (enrRes.data ?? []) as any[]
  const otherGroupIds = [...new Set(enrolments.map(e => e.group_id).filter((x: any) => x && x !== id))] as string[]
  const { data: otherGroups } = otherGroupIds.length
    ? await db.from("lms_course_groups").select("id, name, start_date, end_date, city").in("id", otherGroupIds)
    : { data: [] as any[] }
  const labelOf = new Map(((otherGroups ?? []) as any[]).map(o => [o.id, groupLabel(o)]))

  const days = (daysRes.data ?? []) as any[]
  const { data: att } = days.length
    ? await db.from("lms_attendance").select("session_id, student_id, status").in("session_id", days.map(d => d.id))
    : { data: [] as any[] }
  const countsBy = new Map<string, Record<string, number>>()
  for (const a of (att ?? []) as any[]) {
    const c = countsBy.get(a.session_id) ?? { present: 0, late: 0, absent: 0, excused: 0 }
    c[a.status] = (c[a.status] ?? 0) + 1
    countsBy.set(a.session_id, c)
  }

  const person = (e: any) => ({
    enrollment_id: e.id, status: e.status, enrolled_at: e.enrolled_at,
    student: e.lms_students ?? null,
    program: e.lms_programs && !e.lms_programs.is_individual ? { id: e.lms_programs.id, name: e.lms_programs.name, client: e.lms_programs.lms_companies?.name ?? null } : null,
  })
  const participants = enrolments.filter(e => e.group_id === id).map(person)
    .sort((a, b) => (a.student?.name ?? "").localeCompare(b.student?.name ?? ""))
  const candidates = enrolments.filter(e => e.group_id !== id && e.status === "active")
    .map(e => ({ ...person(e), current_group: e.group_id ? { id: e.group_id, label: labelOf.get(e.group_id) ?? "Another group" } : null }))
    .sort((a, b) => (a.student?.name ?? "").localeCompare(b.student?.name ?? ""))

  return NextResponse.json({
    group: { ...group, label: groupLabel(group) },
    course: courseRes.data,
    provider: providerRes.data ?? null,
    staff: ((staffRes.data ?? []) as any[]).filter(s => s.admin_users).map(s => ({ user_id: s.admin_users.id, name: s.admin_users.name, email: s.admin_users.email, role: s.role })),
    staffOptions: staffOptRes.data ?? [],
    seats_taken: participants.length,
    participants,
    candidates,
    days: days.map(d => ({ ...d, attendance: countsBy.get(d.id) ?? null })),
  })
}

export async function PATCH(req: Request, { params }: Params) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any
  const { id } = await params
  const group = await loadGroup(id)
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })
  const body = await req.json().catch(() => ({}))

  const input = readGroupInput(body, { partial: true, current: group })
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 })
  const updates: Record<string, any> = { ...input.value }

  // Status
  if (body.status !== undefined && body.status !== group.status) {
    const next = body.status as GroupStatus
    if (!GROUP_STATUSES.includes(next)) return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    if (next === "completed" && group.end_date > todayISO())
      return NextResponse.json({ error: "A group can be marked completed once its last day has passed" }, { status: 409 })
    if (next === "cancelled") {
      const taken = (await seatsTaken([id])).get(id) ?? 0
      if (taken > 0)
        return NextResponse.json({ error: `Move or remove the ${taken} participant${taken === 1 ? "" : "s"} first — nobody is left stranded by a cancellation`, participants: taken }, { status: 409 })
    }
    updates.status = next
  }

  // New dates: days that would fall outside them go — unless attendance was
  // taken on one, which is history and stops the change.
  const newStart = updates.start_date ?? group.start_date, newEnd = updates.end_date ?? group.end_date
  let dropDays: string[] = []
  if (newStart !== group.start_date || newEnd !== group.end_date) {
    const { data: days } = await db.from("lms_sessions").select("id, session_date").eq("group_id", id)
    const outside = ((days ?? []) as any[]).filter(d => d.session_date < newStart || d.session_date > newEnd)
    if (outside.length) {
      const { count } = await db.from("lms_attendance").select("id", { count: "exact", head: true }).in("session_id", outside.map(d => d.id))
      if ((count ?? 0) > 0) return NextResponse.json({ error: "Attendance was taken on a day outside the new dates — those days can't be dropped" }, { status: 409 })
      dropDays = outside.map(d => d.id)
    }
  }

  // Staff (replaces the list when given)
  let staffList: { user_id: string; role: string }[] | null = null
  if (body.staff !== undefined) {
    const s = readStaff(body.staff)
    if (!s.ok) return NextResponse.json({ error: s.error }, { status: 400 })
    if (s.list.length) {
      const { data: users } = await db.from("admin_users").select("id").in("id", s.list.map(x => x.user_id)).in("role", ["admin", "instructor", "facilitator"])
      if ((users ?? []).length !== new Set(s.list.map(x => x.user_id)).size)
        return NextResponse.json({ error: "Only staff accounts can be assigned" }, { status: 400 })
    }
    staffList = s.list
  }

  let updated: CourseGroup = group
  if (Object.keys(updates).length) {
    const { data, error } = await db.from("lms_course_groups")
      .update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select(GROUP_COLUMNS).single()
    if (error || !data) return NextResponse.json({ error: "Could not save the group" }, { status: 500 })
    updated = data as unknown as CourseGroup
  }
  if (dropDays.length) await db.from("lms_sessions").delete().in("id", dropDays)
  if (["daily_start", "daily_end", "venue_name", "city"].some(k => k in updates)) await syncGroupDayDetails(updated)
  if (staffList) {
    await db.from("lms_group_staff").delete().eq("group_id", id)
    if (staffList.length) await db.from("lms_group_staff").insert(staffList.map(s => ({ group_id: id, user_id: s.user_id, role: s.role })))
  }

  // The group has finished: attendance is final, so each participant's pass
  // rule can now be decided.
  if (updates.status === "completed") {
    const { data: people } = await db.from("lms_enrollments").select("id, student_id").eq("group_id", id).eq("status", "active")
    for (const p of (people ?? []) as any[]) await checkCourseCompletion(p.student_id, group.course_id, p.id).catch(() => {})
  }

  await auditLog(session, "lms.group.update", "lms_course_group", id, groupLabel(updated), {
    fields: Object.keys(updates), ...(updates.status ? { status: updates.status } : {}), ...(staffList ? { staff: staffList.length } : {}), dropped_days: dropDays.length,
  })
  return NextResponse.json({ ...updated, label: groupLabel(updated) })
}

export async function DELETE(_req: Request, { params }: Params) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any
  const { id } = await params
  const group = await loadGroup(id)
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })

  const { count: people } = await db.from("lms_enrollments").select("id", { count: "exact", head: true }).eq("group_id", id)
  if ((people ?? 0) > 0) return NextResponse.json({ error: "This group has participants — move or remove them first, or cancel it instead" }, { status: 409 })
  const { data: days } = await db.from("lms_sessions").select("id").eq("group_id", id)
  const dayIds = ((days ?? []) as any[]).map(d => d.id)
  if (dayIds.length) {
    const { count } = await db.from("lms_attendance").select("id", { count: "exact", head: true }).in("session_id", dayIds)
    if ((count ?? 0) > 0) return NextResponse.json({ error: "Attendance was taken in this group — it can be cancelled, not deleted" }, { status: 409 })
  }

  // Its own materials: the files first, then the rows go with the group.
  const { data: mats } = await db.from("lms_materials").select("storage_path").eq("group_id", id)
  const paths = ((mats ?? []) as any[]).map(m => m.storage_path).filter(Boolean)
  if (paths.length) await db.storage.from("lms-materials").remove(paths)
  if (dayIds.length) await db.from("lms_sessions").delete().in("id", dayIds)
  const { error } = await db.from("lms_course_groups").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "Could not delete the group" }, { status: 500 })

  await auditLog(session, "lms.group.delete", "lms_course_group", id, groupLabel(group), { course_id: group.course_id })
  return NextResponse.json({ ok: true })
}
