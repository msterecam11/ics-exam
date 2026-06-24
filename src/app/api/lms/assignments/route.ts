import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// GET — admin: list submissions for a content item
//       student: get own submission
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const contentItemId = searchParams.get("content_item_id")

  // Try admin session first
  const adminSession = await auth()
  if (adminSession && isMgr(adminSession.user.role)) {
    if (!contentItemId)
      return NextResponse.json({ error: "content_item_id required" }, { status: 400 })

    const { data, error } = await db
      .from("lms_assignment_submissions")
      .select(`
        id, student_id, text_response, file_url, file_name, file_size,
        status, score, max_score, feedback, graded_at, submitted_at,
        lms_students(id, name, email)
      `)
      .eq("content_item_id", contentItemId)
      .order("submitted_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  // Student session
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!contentItemId)
    return NextResponse.json({ error: "content_item_id required" }, { status: 400 })

  const { data } = await db
    .from("lms_assignment_submissions")
    .select("id, text_response, file_url, file_name, status, score, max_score, feedback, graded_at, submitted_at")
    .eq("content_item_id", contentItemId)
    .eq("student_id", student.id)
    .maybeSingle()

  return NextResponse.json(data ?? null)
}

// POST — student submits assignment
export async function POST(req: Request) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { content_item_id, course_id, text_response, file_url, file_name, file_size } = body

  if (!content_item_id) return NextResponse.json({ error: "content_item_id required" }, { status: 400 })
  if (!course_id)       return NextResponse.json({ error: "course_id required" }, { status: 400 })
  if (!text_response?.trim() && !file_url)
    return NextResponse.json({ error: "Provide a text response or file" }, { status: 400 })

  // Upsert — allow resubmission (replaces old)
  const { data, error } = await db
    .from("lms_assignment_submissions")
    .upsert({
      content_item_id,
      student_id:    student.id,
      course_id,
      text_response: text_response?.trim() || null,
      file_url:      file_url || null,
      file_name:     file_name || null,
      file_size:     file_size || null,
      status:        "submitted",
      score:         null,
      feedback:      null,
      graded_by:     null,
      graded_at:     null,
      submitted_at:  new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    }, { onConflict: "content_item_id,student_id" })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mark progress as completed
  await db.from("lms_progress").upsert({
    student_id:      student.id,
    content_item_id,
    course_id,
    status:          "completed",
    position:        {},
    updated_at:      new Date().toISOString(),
  }, { onConflict: "student_id,content_item_id" })

  return NextResponse.json(data, { status: 201 })
}

// PATCH — admin grades a submission
export async function PATCH(req: Request) {
  const adminSession = await auth()
  if (!adminSession || !isMgr(adminSession.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { id, score, feedback, status } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    graded_by:  adminSession.user.id,
    graded_at:  new Date().toISOString(),
  }
  if (score      !== undefined) updates.score    = score
  if (feedback   !== undefined) updates.feedback = feedback
  if (status     !== undefined) updates.status   = status

  const { data, error } = await db
    .from("lms_assignment_submissions")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
