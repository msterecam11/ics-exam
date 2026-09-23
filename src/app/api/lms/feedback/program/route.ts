import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getStudentSession, PREVIEW_READ_ONLY } from "@/lib/lms-auth"
import { auth } from "@/lib/auth"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import { getProgramSurveyState, parseRating, parseRecommend, parseText } from "@/lib/lms-feedback"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/lms/feedback/program — student answers the end-of-program survey (FB-5)
// Body: { program_id, rating_overall*, rating_organisation, rating_instructor,
//         recommend, comment_went_well, comment_improve }
export async function POST(req: NextRequest) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (student.preview) return NextResponse.json(PREVIEW_READ_ONLY, { status: 403 })

  const { allowed, retryAfterSeconds } = await rateLimit(`lms-feedback:${student.id}`, 20, 600)
  if (!allowed) return res429(retryAfterSeconds)

  const body = await req.json().catch(() => ({}))
  const programId = body?.program_id
  if (typeof programId !== "string" || !UUID_RE.test(programId))
    return NextResponse.json({ error: "program_id required" }, { status: 400 })

  const { data: member } = await db.from("lms_program_members").select("id")
    .eq("program_id", programId).eq("student_id", student.id).neq("status", "withdrawn").maybeSingle()
  if (!member) return NextResponse.json({ error: "You're not in this program" }, { status: 403 })

  const state = await getProgramSurveyState((member as any).id)
  if (!state?.enabled) return NextResponse.json({ error: "This program has no survey" }, { status: 403 })
  if (state.submitted)  return NextResponse.json({ error: "Already submitted" }, { status: 409 })
  if (!state.eligible)  return NextResponse.json({ error: "The survey opens when you complete all your courses" }, { status: 403 })

  const ratings: Record<string, number | null> = {}
  for (const [key, label, required] of [
    ["rating_overall", "Overall", true], ["rating_organisation", "Organisation", false], ["rating_instructor", "Instructor", false],
  ] as const) {
    const r = parseRating(body[key], label, required)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    ratings[key] = r.value
  }
  if (!state.askInstructor) ratings.rating_instructor = null
  const recommend = parseRecommend(body.recommend)
  if (!recommend.ok) return NextResponse.json({ error: recommend.error }, { status: 400 })

  const { error } = await db.from("lms_program_feedback").insert({
    program_id: programId, member_id: (member as any).id, student_id: student.id,
    ...ratings,
    recommend: recommend.value,
    comment_went_well: parseText(body.comment_went_well),
    comment_improve: parseText(body.comment_improve),
    is_anonymous: state.anonymous,
  })
  if (error) {
    if ((error as any).code === "23505") return NextResponse.json({ error: "Already submitted" }, { status: 409 })
    return NextResponse.json({ error: "Could not save your answers" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// GET /api/lms/feedback/program?program_id=X — staff read a program's survey.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const programId = new URL(req.url).searchParams.get("program_id")
  if (!programId || !UUID_RE.test(programId)) return NextResponse.json({ error: "program_id required" }, { status: 400 })

  const { data: program } = await db.from("lms_programs").select("id, name, feedback_enabled, feedback_anonymous").eq("id", programId).maybeSingle()
  if (!program) return NextResponse.json({ error: "Program not found" }, { status: 404 })

  const [{ data: rows, error }, { count: members }] = await Promise.all([
    db.from("lms_program_feedback")
      .select("id, rating_overall, rating_organisation, rating_instructor, recommend, comment_went_well, comment_improve, is_anonymous, submitted_at, lms_students(id, name, email)")
      .eq("program_id", programId).order("submitted_at", { ascending: false }),
    db.from("lms_program_members").select("*", { count: "exact", head: true }).eq("program_id", programId).neq("status", "withdrawn"),
  ])
  if (error) return NextResponse.json({ error: "Could not load the survey" }, { status: 500 })

  const safe = ((rows ?? []) as any[]).map(r => {
    const anonymous = r.is_anonymous || (program as any).feedback_anonymous === true
    return {
      id: r.id,
      ratings: { overall: r.rating_overall, organisation: r.rating_organisation, instructor: r.rating_instructor },
      recommend: r.recommend,
      comments: { wentWell: r.comment_went_well, improve: r.comment_improve },
      is_anonymous: anonymous,
      submitted_at: r.submitted_at,
      student: anonymous ? null : r.lms_students,
    }
  })
  return NextResponse.json({ program, rows: safe, members: members ?? 0 })
}
