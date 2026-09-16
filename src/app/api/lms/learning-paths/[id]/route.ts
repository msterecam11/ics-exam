import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { ensureEnrollment } from "@/lib/lms-enrollment"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// GET — learning path with ordered courses + members
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params

  const { data: path, error } = await db
    .from("lms_learning_paths")
    .select("id, title, description, certificate_enabled, created_at")
    .eq("id", id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!path) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: pathCourses } = await db
    .from("lms_learning_path_courses")
    .select("id, order_index, lms_courses(id, title, status)")
    .eq("path_id", id)
    .order("order_index", { ascending: true })

  const courses = (pathCourses ?? []).map((pc: any) => ({
    path_course_id: pc.id,
    order_index:    pc.order_index,
    ...pc.lms_courses,
  }))

  // Members. This embedded lms_students(..., is_active); lms_students has no
  // is_active column, so the query failed and — because the error branch was
  // silently skipped — the member list was always empty. Same defect as the
  // cohort page. Students have no active/inactive state, so is_active is
  // returned as true for the page's Active badge.
  const { data: memberRows, error: memberErr } = await db
    .from("lms_learning_path_members")
    .select("added_at, lms_students(id, name, email, company)")
    .eq("path_id", id)
    .order("added_at", { ascending: false })

  if (memberErr) console.error("[learning-paths] member query failed", { pathId: id, memberErr })

  const members: any[] = (memberRows ?? []).map((m: any) => ({
    added_at: m.added_at,
    ...m.lms_students,
    is_active: true,
  }))

  return NextResponse.json({ ...path, courses, members })
}

// POST — actions: add_course | remove_course | reorder_courses | add_members | remove_member | enroll
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: pathId } = await params
  const body = await req.json().catch(() => ({}))
  const { action } = body

  // ── Add course ────────────────────────────────────────────────
  if (action === "add_course") {
    const { course_id } = body
    if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 })

    const { count } = await db
      .from("lms_learning_path_courses")
      .select("*", { count: "exact", head: true })
      .eq("path_id", pathId)

    const { data, error } = await db
      .from("lms_learning_path_courses")
      .insert({ path_id: pathId, course_id, order_index: count ?? 0 })
      .select("id, order_index, lms_courses(id, title, status)")
      .single()

    if ((error as any)?.code === "23505") return NextResponse.json({ error: "This course is already in the learning path" }, { status: 409 })
    if (error) return NextResponse.json({ error: "Could not add course" }, { status: 500 })
    return NextResponse.json({
      path_course_id: (data as any).id,
      order_index:    (data as any).order_index,
      ...(data as any).lms_courses,
    }, { status: 201 })
  }

  // ── Remove course ─────────────────────────────────────────────
  if (action === "remove_course") {
    const { path_course_id } = body
    if (!path_course_id) return NextResponse.json({ error: "path_course_id required" }, { status: 400 })

    const { error } = await db
      .from("lms_learning_path_courses")
      .delete()
      .eq("id", path_course_id)
      .eq("path_id", pathId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Reorder courses ───────────────────────────────────────────
  if (action === "reorder_courses") {
    const { order } = body as { order: { path_course_id: string; order_index: number }[] }
    if (!Array.isArray(order)) return NextResponse.json({ error: "order required" }, { status: 400 })

    await Promise.all(
      order.map(({ path_course_id, order_index }) =>
        db.from("lms_learning_path_courses")
          .update({ order_index })
          .eq("id", path_course_id)
          .eq("path_id", pathId)
      )
    )
    return NextResponse.json({ ok: true })
  }

  // ── Add members (and auto-enroll into all path courses) ──────
  if (action === "add_members") {
    const { student_ids, send_email = true } = body as { student_ids: string[]; send_email?: boolean }
    if (!student_ids?.length) return NextResponse.json({ error: "student_ids required" }, { status: 400 })

    const memberRows = student_ids.map((sid: string) => ({
      path_id:    pathId,
      student_id: sid,
      added_by:   session.user.id,
    }))

    const { error: memberErr } = await db
      .from("lms_learning_path_members")
      .upsert(memberRows, { onConflict: "path_id,student_id", ignoreDuplicates: true })

    if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 })

    // Auto-enroll new members into every course in this path
    const { data: pathCourses } = await db
      .from("lms_learning_path_courses")
      .select("course_id, lms_courses(title)")
      .eq("path_id", pathId)
      .order("order_index", { ascending: true })

    let enrolled = 0, skipped = 0, full = 0

    if (pathCourses?.length) {
      const { data: students } = await db
        .from("lms_students")
        .select("id, name, email")
        .in("id", student_ids)

      const studentMap = Object.fromEntries((students ?? []).map((s: any) => [s.id, s]))

      for (const sid of student_ids) {
        const student = studentMap[sid]
        for (const pc of pathCourses) {
          const courseId = pc.course_id

          // Shared rule (lib/lms-enrollment): reactivates a dropped enrollment
          // instead of skipping it, and respects course capacity.
          const result = await ensureEnrollment({ studentId: sid, courseId: courseId, enrolledBy: session.user.id })
          if (result === "full") { full++; continue }
          if (result !== "enrolled" && result !== "reactivated") { skipped++; continue }
          enrolled++

          if (send_email && student?.email) {
            try {
              const { sendEmail, buildEnrollmentEmail } = await import("@/lib/email")
              const courseTitle = (pc as any).lms_courses?.title ?? "your course"
              const { subject, html } = buildEnrollmentEmail({ studentName: student.name ?? "Student", courseTitle, courseId })
              await sendEmail({ type: "enrollment", to: student.email, subject, html, studentId: sid, courseId })
            } catch { /* email failure is non-fatal */ }
          }
        }
      }
    }

    return NextResponse.json({ ok: true, added: student_ids.length, enrolled, skipped, full })
  }

  // ── Remove member ─────────────────────────────────────────────
  if (action === "remove_member") {
    const { student_id } = body as { student_id: string }
    if (!student_id) return NextResponse.json({ error: "student_id required" }, { status: 400 })

    const { error } = await db
      .from("lms_learning_path_members")
      .delete()
      .eq("path_id", pathId)
      .eq("student_id", student_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Enroll all members into all path courses ──────────────────
  if (action === "enroll") {
    const { send_email = true } = body

    const [{ data: pathCourses }, { data: members }] = await Promise.all([
      db.from("lms_learning_path_courses")
        .select("course_id, lms_courses(title)")
        .eq("path_id", pathId)
        .order("order_index", { ascending: true }),
      db.from("lms_learning_path_members")
        .select("student_id, lms_students(id, name, email)")
        .eq("path_id", pathId),
    ])

    if (!pathCourses?.length) return NextResponse.json({ error: "No courses in this path" }, { status: 400 })
    if (!members?.length)     return NextResponse.json({ ok: true, enrolled: 0, skipped: 0 })

    let enrolled = 0, skipped = 0, full = 0

    for (const m of members) {
      const student   = (m as any).lms_students
      const studentId = student?.id ?? m.student_id

      for (const pc of pathCourses) {
        const courseId = pc.course_id

        // Shared rule (lib/lms-enrollment): reactivates a dropped enrollment
        // instead of skipping it, and respects course capacity.
        const result = await ensureEnrollment({ studentId: studentId, courseId: courseId, enrolledBy: session.user.id })
        if (result === "full") { full++; continue }
        if (result !== "enrolled" && result !== "reactivated") { skipped++; continue }
        enrolled++

        if (send_email && student?.email) {
          try {
            const { sendEmail, buildEnrollmentEmail } = await import("@/lib/email")
            const courseTitle = (pc as any).lms_courses?.title ?? "your course"
            const { subject, html } = buildEnrollmentEmail({ studentName: student.name ?? "Student", courseTitle, courseId })
            await sendEmail({ type: "enrollment", to: student.email, subject, html, studentId, courseId })
          } catch { /* email failure is non-fatal */ }
        }
      }
    }

    return NextResponse.json({ ok: true, enrolled, skipped, full })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
