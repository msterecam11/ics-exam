import { NextResponse } from "next/server"
import { notifyCertificateIssued } from "@/lib/lms-completion"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { reapplyExamPassMark, type PassMarkRegradeResult } from "@/lib/lms-exam-regrade"
import { guardStaff, canEditCourse } from "@/lib/staff-access"

// GET — list courses
export async function GET(req: Request) {
  // IR-12 — course authoring.
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

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
  // IR-12 — course authoring.
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

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
  // IR-12 — course authoring.
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

  const body = await req.json().catch(() => ({}))
  const { id, instructor_ids, ...fields } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  // IR-12 — an instructor may build a course, but publishing it (or taking it
  // down) is a decision for an admin, and it has to be a course of theirs.
  if (!g.scope.isAdmin) {
    if (Object.prototype.hasOwnProperty.call(fields, "status"))
      return NextResponse.json({ error: "Only an admin can publish or archive a course" }, { status: 403 })
    if (!(await canEditCourse(g.scope, id)))
      return NextResponse.json({ error: "That course isn't one of yours" }, { status: 403 })
  }

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

  const passMarkSent = "final_exam_pass_mark" in fields
  if (passMarkSent) {
    const mark = Number(fields.final_exam_pass_mark)
    if (fields.final_exam_pass_mark == null || !Number.isInteger(mark) || mark < 0 || mark > 100)
      return NextResponse.json({ error: "Final exam pass mark must be a whole number from 0 to 100" }, { status: 400 })
    updates.final_exam_pass_mark = mark
  }

  const { data, error } = await db
    .from("lms_courses")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The "Auto-release certificate" setting is the single control for releasing
  // certificates. When it's turned ON, release any certs currently held for
  // this course (so completed students get them without a separate button).
  if (fields.certificate_auto_release === true) {
    // Only certificates of enrollments OUTSIDE programs: a program has its own
    // release setting, which the course default doesn't override.
    const { data: programEnrollments } = await db
      .from("lms_enrollments").select("id").eq("course_id", id).not("program_id", "is", null)
    let release = db.from("lms_certificates")
      .update({ released_at: new Date().toISOString(), released_by: session.user.id })
      .eq("course_id", id)
      .is("released_at", null)
      .is("revoked_at", null)
    const programIds = (programEnrollments ?? []).map((e: any) => e.id)
    if (programIds.length) release = release.or(`enrollment_id.is.null,enrollment_id.not.in.(${programIds.join(",")})`)
    const { data: released } = await release.select("student_id, course_id, enrollment_id")
    // EM-7 — tell each student their certificate is now downloadable.
    for (const c of (released ?? []) as any[])
      await notifyCertificateIssued(c.student_id, c.course_id, c.enrollment_id)
  }

  // Keep the exam module's own pass_mark in sync with the course setting so the
  // exam player displays the same number grading uses (single source of truth).
  if (passMarkSent) {
    const { data: examModules } = await db
      .from("lms_modules")
      .select("id, activity_settings")
      .eq("course_id", id)
      .eq("module_type", "final_exam")

    for (const m of examModules ?? []) {
      await db.from("lms_modules")
        .update({ activity_settings: { ...((m as any).activity_settings ?? {}), pass_mark: updates.final_exam_pass_mark } })
        .eq("id", (m as any).id)
    }
  }

  // Existing exam results follow the pass mark (see lms-exam-regrade.ts). The
  // settings form sends the mark on every save; re-applying is idempotent — it
  // only writes attempts whose verdict differs — so an unchanged mark is a
  // read-only no-op, and a run that failed part-way is completed by the next save.
  let regrade: PassMarkRegradeResult | null = null
  if (passMarkSent) {
    try {
      regrade = await reapplyExamPassMark(id)
    } catch (err) {
      console.error("[courses] pass mark re-check failed", { courseId: id, err })
      return NextResponse.json(
        { ...data, regrade_error: "Settings were saved, but existing exam results could not all be re-checked. Save again to retry." },
        { status: 200 }
      )
    }
  }

  // Update instructors if provided
  if (Array.isArray(instructor_ids)) {
    await db.from("lms_course_instructors").delete().eq("course_id", id)
    if (instructor_ids.length) {
      await db.from("lms_course_instructors").insert(
        instructor_ids.map(iid => ({ course_id: id, instructor_id: iid }))
      )
    }
  }

  return NextResponse.json(regrade ? { ...data, regrade } : data)
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
