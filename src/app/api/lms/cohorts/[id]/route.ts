import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// GET /api/lms/cohorts/[id]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params

  // Fetch cohort — fall back to basic columns if migration not run
  let cohort: any = null
  const { data: cohortFull, error: cohortErr } = await db
    .from("lms_cohorts")
    .select("id, name, description, mode, start_date, end_date, certificate_enabled, created_at")
    .eq("id", id)
    .single()

  if (cohortErr) {
    const { data: basic, error: basicErr } = await db
      .from("lms_cohorts").select("id, name, created_at").eq("id", id).single()
    if (basicErr) return NextResponse.json({ error: basicErr.message }, { status: 500 })
    cohort = basic
  } else {
    cohort = cohortFull
  }

  if (!cohort) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const mode = cohort.mode ?? "unified"

  // Courses (unified) — from lms_cohort_courses
  let cohortCourses: any[] = []
  if (mode === "unified") {
    const { data: cc } = await db
      .from("lms_cohort_courses")
      .select("id, order_index, lms_courses(id, title, status)")
      .eq("cohort_id", id)
      .order("order_index", { ascending: true })

    cohortCourses = (cc ?? []).map((c: any) => ({
      cohort_course_id: c.id,
      order_index:      c.order_index,
      ...(c.lms_courses ?? {}),
    }))
  }

  // Tracks with courses (specialization) — from lms_cohort_tracks + lms_cohort_track_courses
  let tracks: any[] = []
  if (mode === "specialization") {
    const { data: trackRows } = await db
      .from("lms_cohort_tracks")
      .select("id, name, order_index, lms_cohort_track_courses(id, order_index, lms_courses(id, title, status))")
      .eq("cohort_id", id)
      .order("order_index", { ascending: true })

    tracks = (trackRows ?? []).map((t: any) => ({
      id:          t.id,
      name:        t.name,
      order_index: t.order_index,
      courses:     ((t.lms_cohort_track_courses ?? []) as any[])
        .sort((a, b) => a.order_index - b.order_index)
        .map((tc: any) => ({
          track_course_id: tc.id,
          order_index:     tc.order_index,
          ...(tc.lms_courses ?? {}),
        })),
    }))
  }

  // Members — try with track_id, fall back without
  let members: any[] = []
  const { data: membersWithTrack, error: membersErr } = await db
    .from("lms_cohort_members")
    .select("student_id, added_at, track_id, lms_students(id, name, email, company, nationality, is_active)")
    .eq("cohort_id", id)
    .order("added_at", { ascending: false })

  if (membersErr) {
    const { data: basic } = await db
      .from("lms_cohort_members")
      .select("student_id, added_at, lms_students(id, name, email, company, nationality, is_active)")
      .eq("cohort_id", id)
      .order("added_at", { ascending: false })
    members = (basic ?? []).map((m: any) => ({ track_id: null, added_at: m.added_at, ...m.lms_students }))
  } else {
    members = (membersWithTrack ?? []).map((m: any) => ({
      track_id: m.track_id,
      added_at: m.added_at,
      ...m.lms_students,
    }))
  }

  return NextResponse.json({ ...cohort, mode, courses: cohortCourses, tracks, members })
}

// POST — sub-actions
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: cohortId } = await params
  const body = await req.json().catch(() => ({}))
  const { action } = body

  // ── Add members ───────────────────────────────────────────────
  if (action === "add_members") {
    const { student_ids, track_id } = body as { student_ids: string[]; track_id?: string }
    if (!student_ids?.length) return NextResponse.json({ error: "student_ids required" }, { status: 400 })

    const rows = student_ids.map((sid: string) => ({
      cohort_id:  cohortId,
      student_id: sid,
      track_id:   track_id || null,
      added_by:   session.user.id,
    }))

    const { error } = await db
      .from("lms_cohort_members")
      .upsert(rows, { onConflict: "cohort_id,student_id", ignoreDuplicates: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, added: student_ids.length })
  }

  // ── Remove member ─────────────────────────────────────────────
  if (action === "remove_member") {
    const { student_id } = body as { student_id: string }
    if (!student_id) return NextResponse.json({ error: "student_id required" }, { status: 400 })

    const { error } = await db
      .from("lms_cohort_members")
      .delete()
      .eq("cohort_id", cohortId)
      .eq("student_id", student_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Assign track to member ────────────────────────────────────
  if (action === "assign_track") {
    const { student_id, track_id } = body as { student_id: string; track_id: string | null }
    if (!student_id) return NextResponse.json({ error: "student_id required" }, { status: 400 })

    const { error } = await db
      .from("lms_cohort_members")
      .update({ track_id: track_id || null })
      .eq("cohort_id", cohortId)
      .eq("student_id", student_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Add course (unified) ──────────────────────────────────────
  if (action === "add_course") {
    const { course_id } = body
    if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 })

    const { count } = await db
      .from("lms_cohort_courses")
      .select("*", { count: "exact", head: true })
      .eq("cohort_id", cohortId)

    const { data, error } = await db
      .from("lms_cohort_courses")
      .insert({ cohort_id: cohortId, course_id, order_index: count ?? 0 })
      .select("id, order_index, lms_courses(id, title, status)")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      cohort_course_id: (data as any).id,
      order_index:      (data as any).order_index,
      ...(data as any).lms_courses,
    }, { status: 201 })
  }

  // ── Remove course (unified) ───────────────────────────────────
  if (action === "remove_course") {
    const { cohort_course_id } = body
    if (!cohort_course_id) return NextResponse.json({ error: "cohort_course_id required" }, { status: 400 })

    const { error } = await db
      .from("lms_cohort_courses")
      .delete()
      .eq("id", cohort_course_id)
      .eq("cohort_id", cohortId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Reorder courses (unified) ─────────────────────────────────
  if (action === "reorder_courses") {
    const { order } = body as { order: { cohort_course_id: string; order_index: number }[] }
    if (!Array.isArray(order)) return NextResponse.json({ error: "order required" }, { status: 400 })

    await Promise.all(
      order.map(({ cohort_course_id, order_index }) =>
        db.from("lms_cohort_courses")
          .update({ order_index })
          .eq("id", cohort_course_id)
          .eq("cohort_id", cohortId)
      )
    )
    return NextResponse.json({ ok: true })
  }

  // ── Enroll: all members into cohort courses / track courses ───
  if (action === "enroll") {
    const { send_email = true, track_id } = body

    const { data: cohort } = await db
      .from("lms_cohorts")
      .select("mode")
      .eq("id", cohortId)
      .single()

    const mode = (cohort as any)?.mode ?? "unified"
    let enrolled = 0, skipped = 0

    if (mode === "unified") {
      const [{ data: courses }, { data: members }] = await Promise.all([
        db.from("lms_cohort_courses").select("course_id, lms_courses(title)")
          .eq("cohort_id", cohortId).order("order_index"),
        db.from("lms_cohort_members").select("student_id, lms_students(id, name, email)")
          .eq("cohort_id", cohortId),
      ])

      if (!courses?.length) return NextResponse.json({ error: "No courses in this cohort" }, { status: 400 })

      for (const m of members ?? []) {
        const student   = (m as any).lms_students
        const studentId = student?.id ?? m.student_id

        for (const c of courses) {
          const { data: ex } = await db.from("lms_enrollments").select("id")
            .eq("student_id", studentId).eq("course_id", c.course_id).single()
          if (ex) { skipped++; continue }

          const { error } = await db.from("lms_enrollments").insert({
            student_id: studentId, course_id: c.course_id, status: "active",
            enrolled_at: new Date().toISOString(), enrolled_by: session.user.id,
          })
          if (error) { skipped++; continue }
          enrolled++

          if (send_email && student?.email) {
            try {
              const { sendEmail, buildEnrollmentEmail } = await import("@/lib/email")
              const courseTitle = (c as any).lms_courses?.title ?? "your course"
              const { subject, html } = buildEnrollmentEmail({ studentName: student.name ?? "Student", courseTitle, courseId: c.course_id })
              await sendEmail({ type: "enrollment", to: student.email, subject, html, studentId, courseId: c.course_id })
            } catch { /* non-fatal */ }
          }
        }
      }
    } else {
      // Specialization — enroll each student into their track's courses
      let tracksQuery = db.from("lms_cohort_tracks")
        .select("id")
        .eq("cohort_id", cohortId)
      if (track_id) tracksQuery = tracksQuery.eq("id", track_id)

      const { data: trackList } = await tracksQuery

      for (const track of trackList ?? []) {
        const [{ data: courses }, { data: members }] = await Promise.all([
          db.from("lms_cohort_track_courses").select("course_id, lms_courses(title)")
            .eq("track_id", track.id).order("order_index"),
          db.from("lms_cohort_members").select("student_id, lms_students(id, name, email)")
            .eq("cohort_id", cohortId).eq("track_id", track.id),
        ])

        for (const m of members ?? []) {
          const student   = (m as any).lms_students
          const studentId = student?.id ?? m.student_id

          for (const c of courses ?? []) {
            const { data: ex } = await db.from("lms_enrollments").select("id")
              .eq("student_id", studentId).eq("course_id", c.course_id).single()
            if (ex) { skipped++; continue }

            const { error } = await db.from("lms_enrollments").insert({
              student_id: studentId, course_id: c.course_id, status: "active",
              enrolled_at: new Date().toISOString(), enrolled_by: session.user.id,
            })
            if (error) { skipped++; continue }
            enrolled++

            if (send_email && student?.email) {
              try {
                const { sendEmail, buildEnrollmentEmail } = await import("@/lib/email")
                const courseTitle = (c as any).lms_courses?.title ?? "your course"
                const { subject, html } = buildEnrollmentEmail({ studentName: student.name ?? "Student", courseTitle, courseId: c.course_id })
                await sendEmail({ type: "enrollment", to: student.email, subject, html, studentId, courseId: c.course_id })
              } catch { /* non-fatal */ }
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: true, enrolled, skipped })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
