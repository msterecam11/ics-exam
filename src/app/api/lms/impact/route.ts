// POST /api/lms/impact — a participant answers the impact questionnaire.
// Body: { course_id, ratings: { applied, performance, worth, support: 1–5 }, example?, barriers? }
// Only once it's due (some months after completing) and only once.
// Gives an impact score 0–100 of its own; completion and certificates are untouched.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getStudentSession, PREVIEW_READ_ONLY } from "@/lib/lms-auth"
import { getCurrentEnrollment } from "@/lib/lms-enrollment"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import { isUuid } from "@/lib/lms-groups"
import { impactState, impactScore, readRatings, cleanText, IMPACT_RATINGS } from "@/lib/lms-evaluations"

export async function POST(req: Request) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (student.preview) return NextResponse.json(PREVIEW_READ_ONLY, { status: 403 })
  const { allowed, retryAfterSeconds } = await rateLimit(`lms-impact:${student.id}`, 20, 600)
  if (!allowed) return res429(retryAfterSeconds)

  const body = await req.json().catch(() => ({}))
  if (!isUuid(body.course_id)) return NextResponse.json({ error: "course_id required" }, { status: 400 })
  const enrollment = await getCurrentEnrollment(student.id, body.course_id)
  if (!enrollment) return NextResponse.json({ error: "Not enrolled in this course" }, { status: 403 })
  const { data: course } = await db.from("lms_courses").select("id, impact_enabled").eq("id", body.course_id).maybeSingle()
  const state = course ? await impactState(enrollment, course as any) : { due: false as const }
  if (!state.due) return NextResponse.json({ error: "The questionnaire isn't open for this course" }, { status: 400 })
  if (state.answered) return NextResponse.json({ error: "You've already answered — thank you" }, { status: 409 })

  const r = readRatings(body.ratings, IMPACT_RATINGS.map(q => q.key))
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  const score = impactScore(r.ratings)
  const { error } = await db.from("lms_impact_responses").insert({
    enrollment_id: enrollment.id, student_id: student.id, course_id: body.course_id, group_id: enrollment.group_id,
    answers: { ratings: r.ratings, example: cleanText(body.example), barriers: cleanText(body.barriers) }, impact_score: score,
  })
  if (error) return NextResponse.json({ error: error.code === "23505" ? "You've already answered — thank you" : "Could not save your answers" }, { status: error.code === "23505" ? 409 : 500 })
  return NextResponse.json({ ok: true, impact_score: score })
}
