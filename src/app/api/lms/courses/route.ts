import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// GET — list courses
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") // draft | published | archived | all

  let query = db
    .from("lms_courses")
    .select(`
      id, title, description, overview_html, course_code, category, tags,
      thumbnail_url, language, delivery_mode,
      status, progress_enforcement, certificate_enabled, feedback_enabled,
      start_date, end_date, capacity, final_exam_pass_mark, created_at, updated_at, created_by,
      lms_course_instructors(instructor_id, admin_users(id, name, email))
    `)
    .order("created_at", { ascending: false })

  if (status && status !== "all") {
    query = query.eq("status", status)
  }

  // Instructors only see their own courses
  if (session.user.role === "instructor") {
    const { data: assignments } = await db
      .from("lms_course_instructors")
      .select("course_id")
      .eq("instructor_id", session.user.id)

    const courseIds = (assignments ?? []).map((a: any) => a.course_id)
    if (!courseIds.length) return NextResponse.json([])
    query = query.in("id", courseIds)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with enrollment counts
  const ids = (data ?? []).map((c: any) => c.id)
  let enrollCounts: Record<string, number> = {}
  if (ids.length) {
    const { data: enrolls } = await db
      .from("lms_enrollments")
      .select("course_id")
      .in("course_id", ids)
      .eq("status", "active")

    for (const e of enrolls ?? []) {
      enrollCounts[e.course_id] = (enrollCounts[e.course_id] ?? 0) + 1
    }
  }

  const enriched = (data ?? []).map((c: any) => ({
    ...c,
    enrollment_count: enrollCounts[c.id] ?? 0,
  }))

  return NextResponse.json(enriched)
}

// POST — create course
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const {
    title, description, thumbnail_url, language, delivery_mode,
    progress_enforcement, progress_test_every_x, min_attendance_pct,
    certificate_enabled, certificate_auto_release,
    feedback_enabled, feedback_mandatory,
    start_date, end_date, capacity, drip_days, final_exam_pass_mark,
    instructor_ids,
  } = body

  if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 })

  const { data: course, error } = await db
    .from("lms_courses")
    .insert({
      title:                    title.trim(),
      description:              description?.trim() || null,
      thumbnail_url:            thumbnail_url || null,
      language:                 language ?? "en",
      delivery_mode:            delivery_mode ?? "online",
      progress_enforcement:     progress_enforcement ?? true,
      progress_test_every_x:    progress_test_every_x || null,
      min_attendance_pct:       min_attendance_pct ?? 80,
      certificate_enabled:      certificate_enabled ?? true,
      certificate_auto_release: certificate_auto_release ?? false,
      feedback_enabled:         feedback_enabled ?? true,
      feedback_mandatory:       feedback_mandatory ?? false,
      start_date:               start_date || null,
      end_date:                 end_date || null,
      capacity:                 capacity || null,
      drip_days:                drip_days || null,
      final_exam_pass_mark:     final_exam_pass_mark ?? 70,
      created_by:               session.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Assign instructors
  const instructors = Array.isArray(instructor_ids) ? instructor_ids : []
  if (session.user.role === "instructor") instructors.push(session.user.id)

  const uniqueInstructors = [...new Set(instructors)]
  if (uniqueInstructors.length) {
    await db.from("lms_course_instructors").insert(
      uniqueInstructors.map(iid => ({ course_id: course.id, instructor_id: iid }))
    )
  }

  return NextResponse.json(course, { status: 201 })
}

// PATCH — update course
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { id, instructor_ids, ...fields } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const allowed = [
    "title","description","overview_html","course_code","category","tags",
    "thumbnail_url","language","delivery_mode","status",
    "progress_enforcement","progress_test_every_x","min_attendance_pct",
    "certificate_enabled","certificate_auto_release",
    "feedback_enabled","feedback_mandatory","feedback_anonymous",
    "start_date","end_date","capacity","drip_days","final_exam_pass_mark",
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in fields) updates[key] = fields[key]
  }

  const { data, error } = await db
    .from("lms_courses")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update instructors if provided
  if (Array.isArray(instructor_ids)) {
    await db.from("lms_course_instructors").delete().eq("course_id", id)
    if (instructor_ids.length) {
      await db.from("lms_course_instructors").insert(
        instructor_ids.map(iid => ({ course_id: id, instructor_id: iid }))
      )
    }
  }

  return NextResponse.json(data)
}

// DELETE — archive/delete course
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Soft delete: archive instead of destroy if students are enrolled
  const { count } = await db
    .from("lms_enrollments")
    .select("*", { count: "exact", head: true })
    .eq("course_id", id)

  if ((count ?? 0) > 0) {
    await db.from("lms_courses").update({ status: "archived" }).eq("id", id)
    return NextResponse.json({ ok: true, archived: true })
  }

  const { error } = await db.from("lms_courses").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted: true })
}
