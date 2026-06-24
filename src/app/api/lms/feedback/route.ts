import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getStudentSession } from "@/lib/lms-auth"
import { auth } from "@/lib/auth"

// POST /api/lms/feedback — student submits feedback
export async function POST(req: NextRequest) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const {
    course_id, rating_overall, rating_content,
    rating_platform, rating_pace, rating_materials, comments,
  } = body

  if (!course_id || !rating_overall) {
    return NextResponse.json({ error: "course_id and rating_overall required" }, { status: 400 })
  }

  const { data: enrollment } = await db
    .from("lms_enrollments")
    .select("id, status")
    .eq("student_id", student.id)
    .eq("course_id", course_id)
    .single()

  if (!enrollment || enrollment.status !== "completed") {
    return NextResponse.json({ error: "Course not completed" }, { status: 403 })
  }

  const { data: course } = await db
    .from("lms_courses")
    .select("feedback_enabled, feedback_anonymous")
    .eq("id", course_id)
    .single()

  if (!course?.feedback_enabled) {
    return NextResponse.json({ error: "Feedback not enabled for this course" }, { status: 403 })
  }

  const { data: existing } = await db
    .from("lms_feedback")
    .select("id")
    .eq("student_id", student.id)
    .eq("course_id", course_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: "Already submitted" }, { status: 409 })
  }

  const { data, error } = await db
    .from("lms_feedback")
    .insert({
      student_id:        student.id,
      course_id,
      rating_overall,
      rating_content:    rating_content    ?? null,
      // rating_instructor column repurposed as platform rating
      rating_instructor: rating_platform   ?? null,
      rating_pace:       rating_pace       ?? null,
      rating_materials:  rating_materials  ?? null,
      comments:          comments?.trim()  || null,
      is_anonymous:      course.feedback_anonymous,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

// GET /api/lms/feedback?course_id=X  — admin reads feedback
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get("course_id")

  if (!courseId) {
    // All courses with feedback stats
    const { data: courses } = await db
      .from("lms_courses")
      .select("id, title, feedback_enabled, feedback_anonymous")
      .neq("status", "archived")
      .order("title")

    const { data: stats } = await db
      .from("lms_feedback")
      .select("course_id, rating_overall, submitted_at")

    const statsByCourse = new Map<string, {
      count: number; sumOverall: number; lastSubmitted: string | null
    }>()

    for (const row of stats ?? []) {
      const s = statsByCourse.get(row.course_id) ?? { count: 0, sumOverall: 0, lastSubmitted: null }
      s.count++
      s.sumOverall += row.rating_overall ?? 0
      if (!s.lastSubmitted || row.submitted_at > s.lastSubmitted) s.lastSubmitted = row.submitted_at
      statsByCourse.set(row.course_id, s)
    }

    const enriched = (courses ?? []).map((c: any) => {
      const s = statsByCourse.get(c.id)
      return {
        ...c,
        response_count: s?.count ?? 0,
        avg_overall:    s ? Math.round((s.sumOverall / s.count) * 10) / 10 : null,
        last_submitted: s?.lastSubmitted ?? null,
      }
    })

    return NextResponse.json(enriched)
  }

  // Single course — full feedback
  const { data: course } = await db
    .from("lms_courses")
    .select("id, title, feedback_enabled, feedback_anonymous")
    .eq("id", courseId)
    .single()

  const { data: rows, error } = await db
    .from("lms_feedback")
    .select(`
      id, rating_overall, rating_content, rating_instructor,
      rating_pace, rating_materials, comments, is_anonymous, submitted_at,
      lms_students(id, name, email)
    `)
    .eq("course_id", courseId)
    .order("submitted_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const safe = (rows ?? []).map((r: any) => ({
    id:               r.id,
    rating_overall:   r.rating_overall,
    rating_content:   r.rating_content,
    rating_platform:  r.rating_instructor, // stored in rating_instructor column
    rating_pace:      r.rating_pace,
    rating_materials: r.rating_materials,
    comments:         r.comments,
    is_anonymous:     r.is_anonymous,
    submitted_at:     r.submitted_at,
    student:          r.is_anonymous ? null : r.lms_students,
  }))

  return NextResponse.json({ course, rows: safe })
}
