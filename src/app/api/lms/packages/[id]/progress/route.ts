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

  // Merge item scores — clamp every score into [0, its own max] so a
  // forged item_score can't exceed what that one item was worth.
  const prevScores: Record<string, any> = existing?.item_scores ?? {}
  const clampedItemScore = item_score
    ? {
        ...item_score,
        score: Math.max(0, Math.min(Number(item_score.score) || 0, Number(item_score.max) || Number(item_score.score) || 0)),
      }
    : item_score
  const newScores = completed_item_id && clampedItemScore
    ? { ...prevScores, [completed_item_id]: clampedItemScore }
    : prevScores

  // Accumulate time
  const newTime = (existing?.time_spent ?? 0) + (time_spent ?? 0)

  const requestedTerminal = status === "passed" || status === "failed"

  // Never trust the client's own "passed"/overall_score claim: recompute the
  // aggregate from the (now-clamped) stored item scores and check it against
  // the package's real pass_mark before honoring a terminal status — this is
  // what stops a POST of {status:"passed", overall_score:100} from
  // self-certifying a package (and, via checkCourseCompletion below, an
  // entire course) with no items actually completed correctly.
  let finalStatus = status
  let finalScore: number | undefined = overall_score
  if (requestedTerminal) {
    const scores = Object.values(newScores) as { score?: number; max?: number }[]
    const totalScore = scores.reduce((s, v) => s + (Number(v.score) || 0), 0)
    const totalMax   = scores.reduce((s, v) => s + (Number(v.max)   || 0), 0)
    const recomputedPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0

    const { data: pkg } = await db.from("lms_packages").select("pass_mark").eq("id", id).single()
    const passMark = (pkg as any)?.pass_mark ?? 70

    finalScore  = recomputedPct
    finalStatus = recomputedPct >= passMark ? "passed" : "failed"
  }
  const isTerminal = finalStatus === "passed" || finalStatus === "failed"

  const upsertRow = {
    student_id:      student.id,
    package_id:      id,
    ...(module_id  && { module_id }),
    ...(course_id  && { course_id }),
    ...(current_item_index !== undefined && { current_item_index }),
    completed_items: newCompleted,
    item_scores:     newScores,
    time_spent:      newTime,
    ...(finalStatus && { status: finalStatus }),
    ...(finalScore !== undefined && { score: finalScore }),
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
  if (isTerminal && course_id && finalStatus === "passed") {
    await checkCourseCompletion(student.id, course_id)
  }

  return NextResponse.json(data)
}
