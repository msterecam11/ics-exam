import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { coursesForTrack } from "@/lib/lms-programs"
import { guardStaff, canSeeProgram, canSeeTrack, canTakeAttendance, forbidden } from "@/lib/staff-access"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

const SESSION_COLUMNS = `
  id, title, session_date, start_time, duration_minutes,
  location, meeting_link, recording_url, materials, late_threshold,
  notes, agenda, topics_covered, instructor_notes,
  closed_at, created_at, module_id, course_id, program_id, track_id,
  lms_courses(title), lms_programs(id, name, status), lms_program_tracks(id, name), lms_modules(id, title)`

// GET /api/lms/sessions
//   ?program_id=  ?course_id=  ?module_id=  ?id=
export async function GET(req: Request) {
  // IR-7 — an instructor sees the classes of their own programs only.
  const g = await guardStaff()
  if (!g.ok) return g.res

  const { searchParams } = new URL(req.url)
  let query = db
    .from("lms_sessions")
    .select(SESSION_COLUMNS)
    .order("session_date", { ascending: false })
    .order("start_time",   { ascending: false })

  if (!g.scope.isAdmin) query = query.in("program_id", g.scope.programIds)

  for (const key of ["id", "program_id", "course_id", "module_id"] as const) {
    const v = searchParams.get(key)
    if (v) {
      if (!UUID_RE.test(v)) return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 })
      query = query.eq(key, v)
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: "Could not load sessions" }, { status: 500 })

  // Attendance counts (attended = present or late; marked = any record)
  const sessionIds = (data ?? []).map((s: any) => s.id)
  const attended: Record<string, number> = {}
  const marked: Record<string, number> = {}
  if (sessionIds.length) {
    const { data: att } = await db
      .from("lms_attendance")
      .select("session_id, status")
      .in("session_id", sessionIds)
    for (const a of (att ?? []) as any[]) {
      marked[a.session_id] = (marked[a.session_id] ?? 0) + 1
      if (a.status === "present" || a.status === "late") attended[a.session_id] = (attended[a.session_id] ?? 0) + 1
    }
  }

  return NextResponse.json((data ?? []).map((s: any) => ({
    ...s,
    course_title:   s.lms_courses?.title ?? null,
    program_name:   s.lms_programs?.name ?? null,
    program_status: s.lms_programs?.status ?? null,
    track_name:     s.lms_program_tracks?.name ?? null,
    module_title:   s.lms_modules?.title ?? null,
    lms_courses: undefined, lms_programs: undefined, lms_program_tracks: undefined, lms_modules: undefined,
    attendance_count: attended[s.id] ?? 0,
    marked_count:     marked[s.id] ?? 0,
    is_open: s.closed_at === null,
  })))
}

type Parsed = { ok: true; values: Record<string, unknown> } | { ok: false; error: string; status?: number }

// Validates the schedulable fields. `partial` = PATCH.
function parseFields(body: any, partial: boolean): Parsed {
  const v: Record<string, unknown> = {}
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body ?? {}, k)

  if (has("title") || !partial) {
    const t = typeof body.title === "string" ? body.title.trim() : ""
    if (!t) return { ok: false, error: "Title is required" }
    v.title = t.slice(0, 200)
  }
  if (has("session_date") || !partial) {
    if (typeof body.session_date !== "string" || !DATE_RE.test(body.session_date)) return { ok: false, error: "A valid date is required" }
    v.session_date = body.session_date
  }
  if (has("start_time") || !partial) {
    if (typeof body.start_time !== "string" || !TIME_RE.test(body.start_time)) return { ok: false, error: "A valid start time is required" }
    v.start_time = body.start_time
  }
  if (has("duration_minutes") || !partial) {
    const n = Number(body.duration_minutes ?? 60)
    if (!Number.isInteger(n) || n < 5 || n > 24 * 60) return { ok: false, error: "Duration must be 5 to 1440 minutes" }
    v.duration_minutes = n
  }
  if (has("late_threshold")) {
    const n = Number(body.late_threshold)
    if (!Number.isInteger(n) || n < 0 || n > 240) return { ok: false, error: "Late threshold must be 0 to 240 minutes" }
    v.late_threshold = n
  }
  for (const [k, max] of [["location", 300], ["notes", 5000], ["agenda", 5000], ["topics_covered", 5000], ["instructor_notes", 5000]] as const) {
    if (!has(k)) continue
    const val = body[k]
    if (val !== null && typeof val !== "string") return { ok: false, error: `Invalid ${k.replace("_", " ")}` }
    v[k] = val?.trim() ? val.trim().slice(0, max) : null
  }
  for (const k of ["meeting_link", "recording_url"] as const) {
    if (!has(k)) continue
    const val = typeof body[k] === "string" ? body[k].trim() : ""
    if (val && !/^https?:\/\//i.test(val)) return { ok: false, error: `${k === "meeting_link" ? "Meeting link" : "Recording link"} must start with http(s)://` }
    v[k] = val || null
  }
  if (has("materials")) {
    if (!Array.isArray(body.materials)) return { ok: false, error: "Invalid materials" }
    v.materials = body.materials
  }
  return { ok: true, values: v }
}

/**
 * Checks that the course (and optional track / module) belong to the program:
 * the course must be delivered to that track (or, for all tracks, to someone
 * in the program) — otherwise nobody would be on the session's roster.
 */
async function validateScope(programId: string, trackId: string | null, courseId: string, moduleId: string | null): Promise<string | null> {
  const { data: program } = await db.from("lms_programs").select("id, status, structure").eq("id", programId).maybeSingle()
  if (!program) return "Program not found"
  if ((program as any).status === "archived") return "Sessions can't be added to an archived program"
  if (trackId) {
    if ((program as any).structure !== "tracks") return "This program doesn't use tracks"
    const { data: t } = await db.from("lms_program_tracks").select("id").eq("id", trackId).eq("program_id", programId).maybeSingle()
    if (!t) return "Track not found in this program"
    if (!(await coursesForTrack(programId, trackId)).includes(courseId)) return "That track doesn't take this course"
  } else {
    const { data: tracks } = await db.from("lms_program_tracks").select("id").eq("program_id", programId)
    const sets = await Promise.all([null, ...((tracks ?? []) as any[]).map(t => t.id)].map(t => coursesForTrack(programId, t)))
    if (!sets.some(s => s.includes(courseId))) return "This program doesn't deliver that course"
  }
  if (moduleId) {
    const { data: mod } = await db.from("lms_modules").select("id").eq("id", moduleId).eq("course_id", courseId).maybeSingle()
    if (!mod) return "Module not found in this course"
  }
  return null
}

// POST — schedule a session for a program
// Body: { program_id, track_id?, course_id, module_id?, title, session_date, start_time, duration_minutes?, ... }
export async function POST(req: Request) {
  const g = await guardStaff()
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

  const body = await req.json().catch(() => ({}))
  const programId = typeof body.program_id === "string" && UUID_RE.test(body.program_id) ? body.program_id : null
  const courseId  = typeof body.course_id === "string" && UUID_RE.test(body.course_id) ? body.course_id : null
  const trackId   = typeof body.track_id === "string" && UUID_RE.test(body.track_id) ? body.track_id : null
  const moduleId  = typeof body.module_id === "string" && UUID_RE.test(body.module_id) ? body.module_id : null
  // Sessions are scheduled for a program's group; the course is a template.
  if (!programId) return NextResponse.json({ error: "Choose the program this session is for" }, { status: 400 })
  if (!courseId)  return NextResponse.json({ error: "Choose the course" }, { status: 400 })
  // IR-7 — only on their own programs, and only on tracks they cover.
  if (!canSeeProgram(g.scope, programId) || !canSeeTrack(g.scope, programId, trackId)) return forbidden()

  const parsed = parseFields(body, false)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const scopeError = await validateScope(programId, trackId, courseId, moduleId)
  if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 })

  const { data, error } = await db
    .from("lms_sessions")
    .insert({
      ...parsed.values,
      program_id: programId, track_id: trackId, course_id: courseId, module_id: moduleId,
      late_threshold: parsed.values.late_threshold ?? 15,
      materials: parsed.values.materials ?? [],
      created_by: session.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: "Could not schedule the session" }, { status: 500 })
  await auditLog(session, "lms.session.create", "lms_session", (data as any).id, (data as any).title, { program_id: programId })
  return NextResponse.json(data, { status: 201 })
}

// PATCH — update a session, or close / reopen it
// Body: { id, action?: "open" | "close", ...fields }
export async function PATCH(req: Request) {
  const g = await guardStaff({ allowFacilitator: true })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

  const body = await req.json().catch(() => ({}))
  const { id, action } = body
  if (typeof id !== "string" || !UUID_RE.test(id)) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: current } = await db.from("lms_sessions").select("id, title, program_id, track_id, group_id, course_id, module_id").eq("id", id).maybeSingle()
  if (!current) return NextResponse.json({ error: "Session not found" }, { status: 404 })
  if (!canTakeAttendance(g.scope, current as any)) return forbidden()
  // A facilitator may open or close the day (with its wrap-up notes), nothing else.
  if (g.scope.role === "facilitator") {
    const extra = Object.keys(body).filter(k => !["id", "action", "topics_covered", "instructor_notes"].includes(k))
    if ((action !== "open" && action !== "close") || extra.length) return forbidden()
  }

  const parsed = parseFields(body, true)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const updates: Record<string, unknown> = { ...parsed.values }

  if (action === "open") updates.closed_at = null
  else if (action === "close") updates.closed_at = new Date().toISOString()
  else if (action !== undefined) return NextResponse.json({ error: "Unknown action" }, { status: 400 })

  // Moving the session to another track / module of the same program + course.
  const c = current as any
  if (c.program_id && (Object.prototype.hasOwnProperty.call(body, "track_id") || Object.prototype.hasOwnProperty.call(body, "module_id"))) {
    const trackId  = Object.prototype.hasOwnProperty.call(body, "track_id") ? (body.track_id || null) : c.track_id
    const moduleId = Object.prototype.hasOwnProperty.call(body, "module_id") ? (body.module_id || null) : c.module_id
    if ((trackId && !UUID_RE.test(trackId)) || (moduleId && !UUID_RE.test(moduleId)))
      return NextResponse.json({ error: "Invalid track or module" }, { status: 400 })
    const scopeError = await validateScope(c.program_id, trackId, c.course_id, moduleId)
    if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 })
    updates.track_id = trackId
    updates.module_id = moduleId
  }

  if (!Object.keys(updates).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  const { data, error } = await db.from("lms_sessions").update(updates).eq("id", id).select().single()
  if (error) return NextResponse.json({ error: "Could not update the session" }, { status: 500 })
  await auditLog(session, `lms.session.${action ?? "update"}`, "lms_session", id, c.title, { fields: Object.keys(updates) })
  return NextResponse.json(data)
}

// DELETE — remove a session (admin only; only if no attendance recorded)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Any attendance record blocks deletion. This counted only present/late, so a
  // session whose records were all entered manually as "excused" (with a note)
  // or "absent" could be deleted, cascading those records away.
  const { count, error: cErr } = await db
    .from("lms_attendance")
    .select("*", { count: "exact", head: true })
    .eq("session_id", id)
  if (cErr) return NextResponse.json({ error: "Could not verify the session is safe to delete" }, { status: 500 })

  if ((count ?? 0) > 0)
    return NextResponse.json(
      { error: "Cannot delete — attendance has been recorded for this session" },
      { status: 409 }
    )

  const { data: s } = await db.from("lms_sessions").select("title").eq("id", id).maybeSingle()
  const { error } = await db.from("lms_sessions").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "Could not delete the session" }, { status: 500 })
  await auditLog(session, "lms.session.delete", "lms_session", id, (s as any)?.title ?? null)
  return NextResponse.json({ ok: true })
}
