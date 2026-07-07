import { NextResponse } from "next/server"
import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { checkCourseCompletion, syncEnrollmentProgress } from "@/lib/lms-completion"

// GET /api/lms/packages/[id]/progress
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const { data, error } = await db
    .from("lms_package_progress")
    .select(`
      id, student_id, package_id, module_id, course_id,
      current_item_index, completed_items, item_scores,
      status, score, time_spent, started_at, completed_at, updated_at
    `)
    .eq("student_id", student.id)
    .eq("package_id", id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? null)
}

// POST /api/lms/packages/[id]/progress
// Body: {
//   module_id?, course_id?,
//   current_item_index?,      — exact position in the timeline
//   completed_item_id?,       — id of item just completed (quiz/exam/video)
//   item_score?,              — { score, max, pct, passed } for that item
//   time_spent?,              — seconds to add to total
//   status?,                  — 'in_progress' | 'passed' | 'failed'
//   overall_score?            — final rolled-up score pct
// }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const {
    module_id, course_id,
    current_item_index,
    completed_item_id,
    item_score,
    time_spent,
    status,
    overall_score,
  } = body

  const { data: existing } = await db
    .from("lms_package_progress")
    .select("id, completed_items, item_scores, time_spent")
    .eq("student_id", student.id)
    .eq("package_id", id)
    .maybeSingle()

  // Merge completed items
  const prevCompleted: string[] = existing?.completed_items ?? []
  const newCompleted = completed_item_id
    ? Array.from(new Set([...prevCompleted, completed_item_id]))
    : prevCompleted

  // Merge item scores
  const prevScores: Record<string, unknown> = existing?.item_scores ?? {}
  const newScores = completed_item_id && item_score
    ? { ...prevScores, [completed_item_id]: item_score }
    : prevScores

  // Accumulate time
  const newTime = (existing?.time_spent ?? 0) + (time_spent ?? 0)

  const isTerminal = status === "passed" || status === "failed"

  const upsertRow = {
    student_id:      student.id,
    package_id:      id,
    ...(module_id  && { module_id }),
    ...(course_id  && { course_id }),
    ...(current_item_index !== undefined && { current_item_index }),
    completed_items: newCompleted,
    item_scores:     newScores,
    time_spent:      newTime,
    ...(status && { status }),
    ...(overall_score !== undefined && { score: overall_score }),
    ...(isTerminal    && { completed_at: new Date().toISOString() }),
    updated_at:      new Date().toISOString(),
  }

  const { data, error } = await db
    .from("lms_package_progress")
    .upsert(upsertRow, { onConflict: "student_id,package_id" })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Keep the stored course progress current: refresh on every item
  // completion (so the admin roster/dashboard climb live as the student
  // works), and on package terminal.
  if (course_id && (isTerminal || completed_item_id)) {
    await syncEnrollmentProgress(student.id, course_id)
  } else if (course_id && (time_spent ?? 0) > 0) {
    // Time-only beacon — refresh just the enrollment time (recomputed from
    // source) so the dashboard/roster stay live without the full progress calc.
    const [pkgT, attT] = await Promise.all([
      db.from("lms_package_progress").select("time_spent").eq("student_id", student.id).eq("course_id", course_id),
      db.from("lms_module_attempts").select("time_spent_s").eq("student_id", student.id).eq("course_id", course_id),
    ])
    const total = (pkgT.data ?? []).reduce((s: number, p: any) => s + (p.time_spent ?? 0), 0)
                + (attT.data ?? []).reduce((s: number, a: any) => s + (a.time_spent_s ?? 0), 0)
    await db.from("lms_enrollments").update({ time_spent_s: total }).eq("student_id", student.id).eq("course_id", course_id)
  }
  if (isTerminal && course_id && status === "passed") {
    await checkCourseCompletion(student.id, course_id)
  }

  return NextResponse.json(data)
}
