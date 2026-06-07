import { NextResponse } from "next/server"
import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"

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

  // Auto-complete enrollment if all mandatory items done
  if (status === "completed") {
    await checkCourseCompletion(student.id, course_id)
  }

  return NextResponse.json(data)
}

// ── Check if student has completed all mandatory content ──────
async function checkCourseCompletion(studentId: string, courseId: string) {
  try {
    // Count mandatory content items in course
    const { data: items } = await db
      .from("lms_content_items")
      .select("id, lms_modules!inner(course_id)")
      .eq("lms_modules.course_id", courseId)
      .eq("is_mandatory", true)

    const mandatoryIds = (items ?? []).map((i: any) => i.id)
    if (!mandatoryIds.length) return

    // Count completed ones
    const { count: doneCount } = await db
      .from("lms_progress")
      .select("*", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("course_id", courseId)
      .eq("status", "completed")
      .in("content_item_id", mandatoryIds)

    if ((doneCount ?? 0) >= mandatoryIds.length) {
      // Mark enrollment as completed
      await db
        .from("lms_enrollments")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("student_id", studentId)
        .eq("course_id", courseId)
        .eq("status", "active")
    }
  } catch (_) {
    // Non-critical — don't fail the progress save
  }
}
