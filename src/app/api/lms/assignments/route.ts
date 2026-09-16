import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

const BUCKET = "lms-submissions"
const SIGNED_URL_SECONDS = 60 * 60

// Submissions store a storage PATH, not a public URL (see the file_path
// migration). Turn it into a time-limited signed URL at read time, for callers
// who have already passed this route's authorisation checks. Returned as
// `file_url` so existing consumers keep working unchanged.
async function withSignedUrls<T extends { file_path?: string | null; file_url?: string | null }>(
  rows: T[]
): Promise<T[]> {
  const paths = rows.map(r => r.file_path).filter((p): p is string => !!p)
  if (paths.length === 0) return rows

  const { data: signed } = await db.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS)
  const byPath = new Map((signed ?? []).map(s => [s.path, s.signedUrl]))

  return rows.map(r => (r.file_path ? { ...r, file_url: byPath.get(r.file_path) ?? null } : r))
}

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
        id, student_id, text_response, file_url, file_path, file_name, file_size,
        status, score, max_score, feedback, graded_at, submitted_at,
        lms_students(id, name, email)
      `)
      .eq("content_item_id", contentItemId)
      .order("submitted_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(await withSignedUrls((data ?? []) as any[]))
  }

  // Student session
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!contentItemId)
    return NextResponse.json({ error: "content_item_id required" }, { status: 400 })

  const { data } = await db
    .from("lms_assignment_submissions")
    .select("id, text_response, file_url, file_path, file_name, status, score, max_score, feedback, graded_at, submitted_at")
    .eq("content_item_id", contentItemId)
    .eq("student_id", student.id)
    .maybeSingle()

  if (!data) return NextResponse.json(null)
  return NextResponse.json((await withSignedUrls([data as any]))[0])
}

// POST — student submits assignment
export async function POST(req: Request) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { content_item_id, course_id, text_response, file_path, file_name, file_size } = body

  if (!content_item_id) return NextResponse.json({ error: "content_item_id required" }, { status: 400 })
  if (!course_id)       return NextResponse.json({ error: "course_id required" }, { status: 400 })
  if (!text_response?.trim() && !file_path)
    return NextResponse.json({ error: "Provide a text response or file" }, { status: 400 })

  // The submitted file is identified by its storage path, and that path must be
  // one THIS student uploaded. Previously the client passed a file_url which was
  // stored verbatim — so a student could have submitted any URL as their work,
  // including another student's submission or an arbitrary external link.
  // /api/lms/student-upload writes to submissions/<studentId>/..., so requiring
  // that prefix ties the submission to the uploader.
  if (file_path && !String(file_path).startsWith(`submissions/${student.id}/`))
    return NextResponse.json({ error: "Invalid file reference" }, { status: 400 })

  // Upsert — allow resubmission (replaces old)
  const { data, error } = await db
    .from("lms_assignment_submissions")
    .upsert({
      content_item_id,
      student_id:    student.id,
      course_id,
      text_response: text_response?.trim() || null,
      file_path:     file_path || null,
      file_url:      null,   // superseded by file_path; signed at read time
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
