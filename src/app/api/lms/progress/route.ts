import { NextResponse } from "next/server"
import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { checkCourseCompletion, syncEnrollmentProgress } from "@/lib/lms-completion"

// GET /api/lms/progress?course_id=xxx  — student's own progress for a course
export async function GET(req: Request) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get("course_id")
  if (!courseId) return NextResponse.json({ error: "course_id required" }, { status: 400 })

  const { data, error } = await db
    .from("lms_progress")
    .select("content_item_id, module_id, status, position, time_spent, completed_at")
    .eq("student_id", student.id)
    .eq("course_id", courseId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — upsert progress for a single content item
// Body: { content_item_id, module_id, course_id, status?, position?, time_spent? }
export async function POST(req: Request) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { content_item_id, module_id, course_id, status, position, time_spent } = body

  if (!content_item_id || !module_id || !course_id)
    return NextResponse.json({ error: "content_item_id, module_id, course_id required" }, { status: 400 })

  const now = new Date().toISOString()
  const upsertData: Record<string, unknown> = {
    student_id:      student.id,
    content_item_id,
    module_id,
    course_id,
    updated_at:      now,
  }

  if (status)      upsertData.status = status
  if (position)    upsertData.position = position
  if (time_spent !== undefined) upsertData.time_spent = time_spent

  // Set started_at on first interaction
  const { data: existing } = await db
    .from("lms_progress")
    .select("id, started_at, status")
    .eq("student_id", student.id)
    .eq("content_item_id", content_item_id)
    .single()

  if (!existing) {
    upsertData.started_at = now
    upsertData.status     = status ?? "in_progress"
  }

  if (status === "completed" && !existing?.started_at) {
    upsertData.started_at   = now
    upsertData.completed_at = now
  } else if (status === "completed") {
    upsertData.completed_at = now
  }

  const { data, error } = await db
    .from("lms_progress")
    .upsert(upsertData, { onConflict: "student_id,content_item_id" })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync progress % and check course completion
  if (status === "completed") {
    await syncEnrollmentProgress(student.id, course_id)
    await checkCourseCompletion(student.id, course_id)
  }

  return NextResponse.json(data)
}
