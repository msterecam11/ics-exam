import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { sendEmail, buildEnrollmentEmail } from "@/lib/email"

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
        id, status, enrolled_at, completed_at, progress_pct,
        lms_students(id, name, email, company, job_title)
      `)
      .eq("course_id", courseId)
      .order("enrolled_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Progress = the stored enrollment.progress_pct, kept current by
    // syncEnrollmentProgress on every student action. This is the single
    // source of truth shared with the student portal, dashboard, and reports.
    // (This route used to recompute it with a slightly different formula,
    // which made the admin roster disagree with everywhere else.)
    const enriched = (data ?? []).map((e: any) => ({
      ...e,
      progress_pct: Math.min(100, Math.round(e.progress_pct ?? 0)),
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

  // Split requested students into: already-active (skip), previously
  // dropped/removed (reactivate), and brand-new (insert). This makes
  // re-enrolling a dropped student work — an upsert with ignoreDuplicates
  // used to silently skip the leftover "dropped" row.
  const { data: existing } = await db
    .from("lms_enrollments")
    .select("id, student_id, status")
    .eq("course_id", course_id)
    .in("student_id", student_ids)

  const existingByStudent = new Map((existing ?? []).map((e: any) => [e.student_id, e]))
  const toInsert     = student_ids.filter((sid: string) => !existingByStudent.has(sid))
  const toReactivate = (existing ?? []).filter((e: any) => e.status !== "active")

  // Reactivate dropped/completed enrollments back to active
  if (toReactivate.length) {
    const { error: reErr } = await db
      .from("lms_enrollments")
      .update({ status: "active", completed_at: null })
      .in("id", toReactivate.map((e: any) => e.id))
    if (reErr) return NextResponse.json({ error: reErr.message }, { status: 500 })
  }

  // Insert brand-new enrollments
  let inserted: any[] = []
  if (toInsert.length) {
    const rows = toInsert.map((sid: string) => ({
      student_id:  sid,
      course_id,
      enrolled_by: session.user.id,
      status:      "active",
    }))
    const { data, error } = await db.from("lms_enrollments").insert(rows).select()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    inserted = data ?? []
  }

  // Notify only the newly-enrolled and the reactivated (not already-active) students
  const notifyIds = new Set<string>([
    ...toInsert,
    ...toReactivate.map((e: any) => e.student_id),
  ])
  const enrolledCount = inserted.length + toReactivate.length

  // Send enrollment emails (fire & forget — don't block response)
  const sendEmails = body.send_email !== false  // default true
  if (sendEmails && notifyIds.size > 0) {
    const { data: courseRow } = await db
      .from("lms_courses")
      .select("title")
      .eq("id", course_id)
      .single()

    const { data: students } = await db
      .from("lms_students")
      .select("id, name, email")
      .in("id", [...notifyIds])

    const courseTitle = courseRow?.title ?? "your course"
    for (const student of students ?? []) {
      if (!student.email) continue
      const { subject, html } = buildEnrollmentEmail({
        studentName: student.name,
        courseTitle,
        courseId:    course_id,
      })
      sendEmail({ type: "enrollment", to: student.email, subject, html,
        studentId: student.id, courseId: course_id }).catch(() => {})
    }
  }

  return NextResponse.json({ enrolled: enrolledCount }, { status: 201 })
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
