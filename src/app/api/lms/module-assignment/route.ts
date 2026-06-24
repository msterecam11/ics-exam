import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { scoreOpenEndedAnswer } from "@/lib/ai-scoring"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// GET — student: own submissions for a module
//       admin: all submissions for a module
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const moduleId = searchParams.get("module_id")
  if (!moduleId) return NextResponse.json({ error: "module_id required" }, { status: 400 })

  const adminSession = await auth()
  if (adminSession && isMgr(adminSession.user.role)) {
    const { data, error } = await db
      .from("lms_module_attempts")
      .select(`
        id, attempt_no, status, score, max_score, passed,
        answers, ai_feedback, submitted_at,
        lms_students(id, name, email)
      `)
      .eq("module_id", moduleId)
      .order("submitted_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await db
    .from("lms_module_attempts")
    .select("id, attempt_no, status, score, max_score, passed, answers, ai_feedback, submitted_at")
    .eq("module_id", moduleId)
    .eq("student_id", student.id)
    .order("attempt_no", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — student submits an assignment
// Body: { module_id, course_id, file_url, file_name, file_size }
export async function POST(req: Request) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { module_id, course_id, file_url, file_name, file_size, text_response } = body

  if (!module_id)  return NextResponse.json({ error: "module_id required" },  { status: 400 })
  if (!course_id)  return NextResponse.json({ error: "course_id required" },  { status: 400 })
  if (!file_url && !text_response?.trim())
    return NextResponse.json({ error: "Provide a file or a written response" }, { status: 400 })

  // Verify module + check max attempts
  const { data: module } = await db
    .from("lms_modules")
    .select("id, title, assignment_max_attempts, assignment_due_date, assignment_rubric")
    .eq("id", module_id)
    .eq("course_id", course_id)
    .single()

  if (!module) return NextResponse.json({ error: "Module not found" }, { status: 404 })

  // Due date check
  if (module.assignment_due_date) {
    if (new Date() > new Date(module.assignment_due_date))
      return NextResponse.json({ error: "Submission deadline has passed" }, { status: 409 })
  }

  // Count existing attempts
  const { count } = await db
    .from("lms_module_attempts")
    .select("*", { count: "exact", head: true })
    .eq("module_id", module_id)
    .eq("student_id", student.id)

  const maxAttempts = module.assignment_max_attempts ?? 99
  if ((count ?? 0) >= maxAttempts)
    return NextResponse.json({ error: `Maximum ${maxAttempts} submission(s) reached` }, { status: 409 })

  // AI grading against rubric (only when student wrote a text response)
  type Criterion = { id: string; criterion: string; description: string; points: number }
  const rubric = (module.assignment_rubric as Criterion[] | null) ?? []
  const maxScore = rubric.reduce((s, c) => s + c.points, 0)

  let aiScore = 0
  const criteriaScores: Array<{ criterion: string; score: number; max: number; comment: string }> = []
  let overallComment = ""
  let passed = false
  let status: "submitted" | "graded" = "submitted"

  if (text_response?.trim() && rubric.length > 0) {
    await Promise.all(rubric.map(async (criterion) => {
      const guide = [criterion.criterion, criterion.description].filter(Boolean).join(" — ")
      const result = await scoreOpenEndedAnswer(module.title ?? "Assignment", guide, text_response, criterion.points)
      criteriaScores.push({ criterion: criterion.criterion, score: result.score, max: criterion.points, comment: result.justification })
    }))
    aiScore       = criteriaScores.reduce((s, c) => s + c.score, 0)
    overallComment = criteriaScores.map(c => `**${c.criterion}** (${c.score}/${c.max}): ${c.comment}`).join("\n\n")
    passed        = maxScore > 0 && (aiScore / maxScore) >= 0.6
    status        = "graded"
  }

  const now       = new Date().toISOString()
  const attemptNo = (count ?? 0) + 1

  const { data: attempt, error } = await db
    .from("lms_module_attempts")
    .insert({
      module_id,
      student_id:   student.id,
      course_id,
      attempt_no:   attemptNo,
      status,
      score:        status === "graded" ? Math.round(aiScore * 100) / 100 : null,
      max_score:    status === "graded" && maxScore > 0 ? maxScore : null,
      passed:       status === "graded" ? passed : false,
      answers:      { file_url: file_url ?? null, file_name: file_name ?? null, file_size: file_size ?? null, text_response: text_response ?? null },
      ai_feedback:  { overall_comment: overallComment, criteria_scores: criteriaScores },
      started_at:   now,
      submitted_at: now,
    })
    .select("id, attempt_no, status, score, max_score, passed, answers, ai_feedback, submitted_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(attempt, { status: 201 })
}

// PATCH — admin grades or releases a submission
// Grade:   { attempt_id, score, max_score, passed, feedback }
// Release: { attempt_id, release: true }
export async function PATCH(req: Request) {
  const adminSession = await auth()
  if (!adminSession || !isMgr(adminSession.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { attempt_id, release, score, max_score, passed, feedback } = body
  if (!attempt_id) return NextResponse.json({ error: "attempt_id required" }, { status: 400 })

  // Release action — make result visible to student
  if (release) {
    const { data, error } = await db
      .from("lms_module_attempts")
      .update({ status: "released" })
      .eq("id", attempt_id)
      .select("id, status")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Grade action
  const { data, error } = await db
    .from("lms_module_attempts")
    .update({
      score:       score     ?? null,
      max_score:   max_score ?? null,
      passed:      passed    ?? false,
      ai_feedback: { overall_comment: feedback ?? "" },
      status:      "graded",
    })
    .eq("id", attempt_id)
    .select("id, score, max_score, passed, status")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
