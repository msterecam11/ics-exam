import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getStudentSession, PREVIEW_READ_ONLY } from "@/lib/lms-auth"
import { getCurrentEnrollment } from "@/lib/lms-enrollment"
import { auth } from "@/lib/auth"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import {
  getFeedbackState, parseRating, parseRecommend, parseText,
  readFeedbackRatings, readFeedbackComments, FEEDBACK_ROW_COLUMNS,
} from "@/lib/lms-feedback"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/lms/feedback — student submits course feedback (FB-2 / FB-4)
// Body: { course_id, rating_overall*, rating_content, rating_platform, rating_pace,
//         rating_materials, rating_instructor, recommend, comment_went_well, comment_improve }
export async function POST(req: NextRequest) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (student.preview) return NextResponse.json(PREVIEW_READ_ONLY, { status: 403 })

  const { allowed, retryAfterSeconds } = await rateLimit(`lms-feedback:${student.id}`, 20, 600)
  if (!allowed) return res429(retryAfterSeconds)

  const body = await req.json().catch(() => ({}))
  const courseId = body?.course_id
  if (typeof courseId !== "string" || !UUID_RE.test(courseId))
    return NextResponse.json({ error: "course_id required" }, { status: 400 })

  // Feedback belongs to the current enrollment (one per program run).
  const enrollment = await getCurrentEnrollment(student.id, courseId)
  if (!enrollment || enrollment.access === "none")
    return NextResponse.json({ error: "Not enrolled in this course" }, { status: 403 })

  const state = await getFeedbackState(enrollment)
  if (!state.settings.enabled) return NextResponse.json({ error: "Feedback isn't collected for this course" }, { status: 403 })
  if (state.submitted)          return NextResponse.json({ error: "Already submitted" }, { status: 409 })
  if (!state.reason)            return NextResponse.json({ error: "Feedback opens when you complete the course" }, { status: 403 })

  const ratings: Record<string, number | null> = {}
  for (const [key, label, required] of [
    ["rating_overall", "Overall", true], ["rating_content", "Content", false], ["rating_platform", "Platform", false],
    ["rating_pace", "Pace", false], ["rating_materials", "Materials", false], ["rating_instructor", "Instructor", false],
  ] as const) {
    const r = parseRating(body[key], label, required)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    ratings[key] = r.value
  }
  // Only asked when the program has instructors or classes.
  if (!state.askInstructor) ratings.rating_instructor = null
  const recommend = parseRecommend(body.recommend)
  if (!recommend.ok) return NextResponse.json({ error: recommend.error }, { status: 400 })

  const { error } = await db.from("lms_feedback").insert({
    student_id:        student.id,
    enrollment_id:     enrollment.id,
    program_id:        enrollment.program_id,
    course_id:         courseId,
    form_version:      2,
    ...ratings,
    recommend:         recommend.value,
    comment_went_well: parseText(body.comment_went_well),
    comment_improve:   parseText(body.comment_improve),
    is_anonymous:      state.settings.anonymous,
    asked_reason:      state.reason,
  })
  if (error) {
    if ((error as any).code === "23505") return NextResponse.json({ error: "Already submitted" }, { status: 409 })
    return NextResponse.json({ error: "Could not save your feedback" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// GET /api/lms/feedback?course_id=X[&program_id=Y] — staff read one course's feedback.
// Anonymous responses never carry the student (FB-6).
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get("course_id")
  const programId = searchParams.get("program_id")
  if (!courseId || !UUID_RE.test(courseId)) return NextResponse.json({ error: "course_id required" }, { status: 400 })
  if (programId && programId !== "none" && !UUID_RE.test(programId)) return NextResponse.json({ error: "Invalid program" }, { status: 400 })

  const { data: course } = await db.from("lms_courses").select("id, title, feedback_enabled, feedback_anonymous").eq("id", courseId).maybeSingle()
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 })

  let q = db.from("lms_feedback")
    .select(`${FEEDBACK_ROW_COLUMNS}, lms_students(id, name, email), lms_programs(id, name, feedback_anonymous)`)
    .eq("course_id", courseId)
    .order("submitted_at", { ascending: false })
  if (programId === "none") q = q.is("program_id", null)
  else if (programId) q = q.eq("program_id", programId)
  const { data: rows, error } = await q
  if (error) return NextResponse.json({ error: "Could not load feedback" }, { status: 500 })

  // Programs that have feedback for this course, for the filter.
  const { data: allRows } = await db.from("lms_feedback").select("program_id, lms_programs(id, name)").eq("course_id", courseId)
  const programs = new Map<string, string>()
  let outside = 0
  for (const r of (allRows ?? []) as any[]) {
    if (r.program_id && r.lms_programs) programs.set(r.program_id, r.lms_programs.name)
    else outside++
  }

  const safe = ((rows ?? []) as any[]).map(r => {
    // Hidden when the response was anonymous, or its program is anonymous now.
    const anonymous = r.is_anonymous || r.lms_programs?.feedback_anonymous === true
    return {
      id:           r.id,
      ratings:      readFeedbackRatings(r),
      recommend:    r.recommend ?? null,
      comments:     readFeedbackComments(r),
      is_anonymous: anonymous,
      asked_reason: r.asked_reason ?? "completed",
      submitted_at: r.submitted_at,
      program:      r.lms_programs ? { id: r.lms_programs.id, name: r.lms_programs.name } : null,
      student:      anonymous ? null : r.lms_students,
    }
  })

  return NextResponse.json({
    course,
    rows: safe,
    programs: [...programs.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    outside_programs: outside,
  })
}
