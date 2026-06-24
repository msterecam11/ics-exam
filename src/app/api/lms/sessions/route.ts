import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// GET /api/lms/sessions              — all sessions (global schedule view)
// GET /api/lms/sessions?course_id=x  — filtered by course
// GET /api/lms/sessions?module_id=x  — filtered by module
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get("course_id")
  const moduleId = searchParams.get("module_id")

  let query = db
    .from("lms_sessions")
    .select(`
      id, title, session_date, start_time, duration_minutes,
      location, recording_url, materials, late_threshold,
      notes, closed_at, created_at,
      module_id, course_id,
      lms_courses(title)
    `)
    .order("session_date", { ascending: false })
    .order("start_time",   { ascending: false })

  if (courseId) query = query.eq("course_id", courseId)
  if (moduleId) query = query.eq("module_id", moduleId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with attendance counts
  const sessionIds = (data ?? []).map((s: any) => s.id)
  let attCount: Record<string, number> = {}
  if (sessionIds.length) {
    const { data: att } = await db
      .from("lms_attendance")
      .select("session_id, status")
      .in("session_id", sessionIds)
      .in("status", ["present", "late"])

    for (const a of att ?? []) {
      attCount[a.session_id] = (attCount[a.session_id] ?? 0) + 1
    }
  }

  const enriched = (data ?? []).map((s: any) => ({
    ...s,
    course_title: (s.lms_courses as any)?.title ?? null,
    lms_courses: undefined,
    attendance_count: attCount[s.id] ?? 0,
    is_open: s.closed_at === null,
  }))

  return NextResponse.json(enriched)
}

// POST — create session
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const {
    module_id, course_id, title,
    session_date, start_time, duration_minutes,
    location, late_threshold, notes, materials,
  } = body

  if (!module_id)    return NextResponse.json({ error: "module_id required" },  { status: 400 })
  if (!course_id)    return NextResponse.json({ error: "course_id required" },  { status: 400 })
  if (!title?.trim()) return NextResponse.json({ error: "title required" },     { status: 400 })
  if (!session_date) return NextResponse.json({ error: "session_date required" }, { status: 400 })
  if (!start_time)   return NextResponse.json({ error: "start_time required" }, { status: 400 })

  const { data, error } = await db
    .from("lms_sessions")
    .insert({
      module_id,
      course_id,
      title:            title.trim(),
      session_date,
      start_time,
      duration_minutes: duration_minutes ?? 60,
      location:         location?.trim()  || null,
      late_threshold:   late_threshold    ?? 15,
      notes:            notes?.trim()     || null,
      materials:        materials         ?? [],
      created_by:       session.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH — update session (or open/close it)
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { id, action, ...fields } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Special actions: open / close
  if (action === "open") {
    const { data, error } = await db
      .from("lms_sessions")
      .update({ closed_at: null })
      .eq("id", id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === "close") {
    const { data, error } = await db
      .from("lms_sessions")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const allowed = [
    "title", "session_date", "start_time", "duration_minutes",
    "location", "recording_url", "materials", "late_threshold", "notes",
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in fields) updates[key] = fields[key]
  }

  const { data, error } = await db
    .from("lms_sessions")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — remove session (only if no attendance recorded)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { count } = await db
    .from("lms_attendance")
    .select("*", { count: "exact", head: true })
    .eq("session_id", id)
    .in("status", ["present", "late"])

  if ((count ?? 0) > 0)
    return NextResponse.json(
      { error: "Cannot delete — attendance has been recorded for this session" },
      { status: 409 }
    )

  const { error } = await db.from("lms_sessions").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
