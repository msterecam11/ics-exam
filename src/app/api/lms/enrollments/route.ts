import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// GET /api/lms/enrollments?course_id=xxx  — list students enrolled in a course
// GET /api/lms/enrollments?student_id=xxx — list courses a student is enrolled in
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const courseId  = searchParams.get("course_id")
  const studentId = searchParams.get("student_id")

  if (!courseId && !studentId)
    return NextResponse.json({ error: "course_id or student_id required" }, { status: 400 })

  if (courseId) {
    // All enrollments for a course
    const { data, error } = await db
      .from("lms_enrollments")
      .select(`
        id, status, enrolled_at, completed_at,
        lms_students(id, name, email, company, job_title)
      `)
      .eq("course_id", courseId)
      .order("enrolled_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Attach progress %
    const studentIds = (data ?? []).map((e: any) => e.lms_students?.id).filter(Boolean)
    let progressMap: Record<string, number> = {}
    if (studentIds.length) {
      const { data: prog } = await db
        .from("lms_progress")
        .select("student_id, status")
        .eq("course_id", courseId)
        .in("student_id", studentIds)

      const totals: Record<string, number>    = {}
      const done:   Record<string, number>    = {}
      for (const row of prog ?? []) {
        totals[row.student_id] = (totals[row.student_id] ?? 0) + 1
        if (row.status === "completed")
          done[row.student_id] = (done[row.student_id] ?? 0) + 1
      }
      for (const sid of studentIds)
        progressMap[sid] = totals[sid]
          ? Math.round((done[sid] ?? 0) / totals[sid] * 100)
          : 0
    }

    const enriched = (data ?? []).map((e: any) => ({
      ...e,
      progress_pct: progressMap[e.lms_students?.id] ?? 0,
    }))
    return NextResponse.json(enriched)
  }

  // All enrollments for a student
  const { data, error } = await db
    .from("lms_enrollments")
    .select(`
      id, status, enrolled_at, completed_at,
      lms_courses(id, title, description, delivery_mode, thumbnail_url, end_date, status)
    `)
    .eq("student_id", studentId!)
    .order("enrolled_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — enroll one or more students in a course
// Body: { course_id, student_ids: string[] }
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { course_id, student_ids } = body

  if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 })
  if (!Array.isArray(student_ids) || !student_ids.length)
    return NextResponse.json({ error: "student_ids (array) required" }, { status: 400 })

  // Check course capacity
  const { data: course } = await db
    .from("lms_courses")
    .select("capacity")
    .eq("id", course_id)
    .single()

  if (course?.capacity) {
    const { count: current } = await db
      .from("lms_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("course_id", course_id)
      .eq("status", "active")

    if ((current ?? 0) + student_ids.length > course.capacity)
      return NextResponse.json(
        { error: `Course capacity (${course.capacity}) would be exceeded` },
        { status: 409 }
      )
  }

  // Upsert enrollments (skip duplicates)
  const rows = student_ids.map((sid: string) => ({
    student_id:  sid,
    course_id,
    enrolled_by: session.user.id,
    status:      "active",
  }))

  const { data, error } = await db
    .from("lms_enrollments")
    .upsert(rows, { onConflict: "student_id,course_id", ignoreDuplicates: true })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ enrolled: data?.length ?? 0 }, { status: 201 })
}

// PATCH — update enrollment status (active / completed / dropped)
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { id, status } = body
  if (!id || !status) return NextResponse.json({ error: "id and status required" }, { status: 400 })

  const validStatuses = ["active", "completed", "dropped"]
  if (!validStatuses.includes(status))
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })

  const updates: any = { status }
  if (status === "completed") updates.completed_at = new Date().toISOString()

  const { data, error } = await db
    .from("lms_enrollments")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — unenroll (hard delete, only if no progress)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Get enrollment to find student_id + course_id
  const { data: enr } = await db
    .from("lms_enrollments")
    .select("student_id, course_id")
    .eq("id", id)
    .single()

  if (enr) {
    const { count } = await db
      .from("lms_progress")
      .select("*", { count: "exact", head: true })
      .eq("student_id", enr.student_id)
      .eq("course_id", enr.course_id)

    if ((count ?? 0) > 0)
      return NextResponse.json(
        { error: "Cannot unenroll — student has progress. Drop them instead." },
        { status: 409 }
      )
  }

  const { error } = await db.from("lms_enrollments").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
