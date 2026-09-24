// POST /api/lms/evaluations — a participant rates one module or one instructor.
// Body: { course_id, subject_type: "module"|"instructor", subject_id, ratings: { criterion: 1–5 }, comment? }
// Only what the course asks for (lib/lms-evaluations), once it's open to them.
// Sending again replaces their earlier rating of that subject.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getStudentSession, PREVIEW_READ_ONLY } from "@/lib/lms-auth"
import { getCurrentEnrollment } from "@/lib/lms-enrollment"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import { isUuid } from "@/lib/lms-groups"
import { evaluationSubjects, criteriaFor, readRatings, cleanText } from "@/lib/lms-evaluations"

export async function POST(req: Request) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (student.preview) return NextResponse.json(PREVIEW_READ_ONLY, { status: 403 })
  const { allowed, retryAfterSeconds } = await rateLimit(`lms-evaluation:${student.id}`, 60, 600)
  if (!allowed) return res429(retryAfterSeconds)

  const body = await req.json().catch(() => ({}))
  if (!isUuid(body.course_id) || !isUuid(body.subject_id) || !["module", "instructor"].includes(body.subject_type))
    return NextResponse.json({ error: "course_id, subject_type and subject_id required" }, { status: 400 })

  const enrollment = await getCurrentEnrollment(student.id, body.course_id)
  if (!enrollment || enrollment.access === "none") return NextResponse.json({ error: "Not enrolled in this course" }, { status: 403 })
  const { data: course } = await db.from("lms_courses").select("id, evaluate_modules, evaluate_instructors").eq("id", body.course_id).maybeSingle()
  const subjects = course ? await evaluationSubjects(enrollment, course as any) : null
  const subject = subjects?.find(s => s.type === body.subject_type && s.id === body.subject_id)
  if (!subject) return NextResponse.json({ error: "There's nothing to evaluate here yet" }, { status: 400 })

  const r = readRatings(body.ratings, criteriaFor(subject.type).map(c => c.key))
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })

  const { error } = await db.from("lms_evaluations").upsert({
    enrollment_id: enrollment.id, student_id: student.id, course_id: body.course_id, group_id: enrollment.group_id,
    subject_type: subject.type, subject_id: subject.id, ratings: r.ratings, comment: cleanText(body.comment),
    submitted_at: new Date().toISOString(),
  }, { onConflict: "enrollment_id,subject_type,subject_id" })
  if (error) return NextResponse.json({ error: "Could not save your rating" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
