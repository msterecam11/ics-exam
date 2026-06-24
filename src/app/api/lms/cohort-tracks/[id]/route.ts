import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// GET — track with courses
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params

  const { data: track, error } = await db
    .from("lms_cohort_tracks")
    .select("id, name, order_index, cohort_id, lms_cohort_track_courses(id, order_index, lms_courses(id, title, status))")
    .eq("id", id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!track) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const courses = ((track as any).lms_cohort_track_courses ?? [])
    .sort((a: any, b: any) => a.order_index - b.order_index)
    .map((tc: any) => ({
      track_course_id: tc.id,
      order_index:     tc.order_index,
      ...(tc.lms_courses ?? {}),
    }))

  return NextResponse.json({ ...track, courses, lms_cohort_track_courses: undefined })
}

// POST — actions: add_course | remove_course | reorder_courses
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: trackId } = await params
  const body = await req.json().catch(() => ({}))
  const { action } = body

  if (action === "add_course") {
    const { course_id } = body
    if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 })

    const { count } = await db
      .from("lms_cohort_track_courses")
      .select("*", { count: "exact", head: true })
      .eq("track_id", trackId)

    const { data, error } = await db
      .from("lms_cohort_track_courses")
      .insert({ track_id: trackId, course_id, order_index: count ?? 0 })
      .select("id, order_index, lms_courses(id, title, status)")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      track_course_id: (data as any).id,
      order_index:     (data as any).order_index,
      ...(data as any).lms_courses,
    }, { status: 201 })
  }

  if (action === "remove_course") {
    const { track_course_id } = body
    if (!track_course_id) return NextResponse.json({ error: "track_course_id required" }, { status: 400 })

    const { error } = await db
      .from("lms_cohort_track_courses")
      .delete()
      .eq("id", track_course_id)
      .eq("track_id", trackId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === "reorder_courses") {
    const { order } = body as { order: { track_course_id: string; order_index: number }[] }
    if (!Array.isArray(order)) return NextResponse.json({ error: "order required" }, { status: 400 })

    await Promise.all(
      order.map(({ track_course_id, order_index }) =>
        db.from("lms_cohort_track_courses")
          .update({ order_index })
          .eq("id", track_course_id)
          .eq("track_id", trackId)
      )
    )
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
