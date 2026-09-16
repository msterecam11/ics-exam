import { NextResponse } from "next/server"
import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { checkCourseCompletion, syncEnrollmentProgress } from "@/lib/lms-completion"
import { COURSE_ACCESS_STATUSES, hasCourseAccess } from "@/lib/lms-enrollment"

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

  // The three ids arrive from the client and used to be written straight through:
  // nothing checked that the student was enrolled, that the content item existed,
  // or that it actually belonged to the module and course it was filed under. So
  // a single fetch() could mark mandatory content complete without opening it —
  // which matters because module gating (lock_until_previous) reads exactly these
  // rows, meaning required training could be skipped on the way to the exam — and
  // progress could be written against courses the student was never enrolled in,
  // or filed under the wrong course, corrupting every percentage derived from it.
  //
  // Certificates were never forgeable this way: checkCourseCompletion gates on
  // passedFinalExam. This closes the completion record, not the credential.
  const { data: item } = await db
    .from("lms_content_items")
    .select("id, module_id, lms_modules!inner(id, course_id)")
    .eq("id", content_item_id)
    .single()

  const itemCourseId = (item as any)?.lms_modules?.course_id
  if (!item || item.module_id !== module_id || itemCourseId !== course_id)
    return NextResponse.json({ error: "Content item does not belong to that module/course" }, { status: 400 })

  const { data: enrollment } = await db
    .from("lms_enrollments")
    .select("id")
    .eq("student_id", student.id)
    .eq("course_id", course_id)
    .in("status", [...COURSE_ACCESS_STATUSES])   // an unenrolled (dropped) student has no access
    .maybeSingle()

  if (!enrollment)
    return NextResponse.json({ error: "Not enrolled in this course" }, { status: 403 })

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
  // time_spent is reported by the browser in seconds and rolls up into the
  // "Learning time" figure on the dashboard, the course page and the reports.
  // Client-supplied, so bound it: a negative or absurd value would otherwise be
  // summed into those totals verbatim. 24h per single content item is far beyond
  // any legitimate session while still never truncating a real one.
  if (time_spent !== undefined) {
    const t = Number(time_spent)
    upsertData.time_spent = Number.isFinite(t) ? Math.min(Math.max(Math.round(t), 0), 86400) : 0
  }

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
