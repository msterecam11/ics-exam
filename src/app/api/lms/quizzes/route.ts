import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// GET /api/lms/quizzes              — list all quizzes (admin)
// GET /api/lms/quizzes?quiz_id=xxx  — fetch one quiz with questions + choices
// GET /api/lms/quizzes?content_item_id=xxx — resolve quiz from content item
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  let quizId        = searchParams.get("quiz_id")
  const contentItemId = searchParams.get("content_item_id")

  // Allow both admin and student access
  const adminSession   = await auth()
  const studentSession = adminSession ? null : await getStudentSession()
  if (!adminSession && !studentSession)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // ── List mode (admin only, no quiz_id or content_item_id) ─────────────────
  if (!quizId && !contentItemId && adminSession && isMgr(adminSession.user.role)) {
    const search = searchParams.get("search")?.trim() ?? ""
    let q = db
      .from("lms_quizzes")
      .select(`
        id, title, description, pass_score, time_limit_minutes,
        max_attempts, shuffle_questions, show_answers_after, created_at,
        course_id, content_item_id,
        lms_quiz_questions(id)
      `)
      .order("created_at", { ascending: false })
    if (search) q = q.ilike("title", `%${search}%`)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Flatten question count
    const result = (data ?? []).map((quiz: any) => ({
      ...quiz,
      question_count: (quiz.lms_quiz_questions ?? []).length,
      lms_quiz_questions: undefined,
    }))
    return NextResponse.json(result)
  }

  // Resolve quiz_id from content_item if needed
  if (!quizId && contentItemId) {
    const { data: ci } = await db
      .from("lms_content_items")
      .select("content")
      .eq("id", contentItemId)
      .single()
    quizId = ci?.content?.quiz_id ?? null
  }

  if (!quizId)
    return NextResponse.json({ error: "quiz_id or content_item_id required" }, { status: 400 })

  const { data: quiz, error } = await db
    .from("lms_quizzes")
    .select(`
      id, title, description, type, pass_score, time_limit_minutes,
      max_attempts, shuffle_questions, show_answers_after, created_at,
      lms_quiz_questions(
        id, question_id, order_index,
        lms_questions(
          id, text_en, text_ar, type, difficulty, score, explanation_en,
          lms_question_choices(id, text_en, text_ar, is_correct, order_index)
        )
      )
    `)
    .eq("id", quizId)
    .single()

  if (error || !quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 })

  // Sort quiz questions by order_index
  const sorted = {
    ...quiz,
    lms_quiz_questions: (quiz.lms_quiz_questions ?? [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((qq: any) => ({
        ...qq,
        lms_questions: {
          ...qq.lms_questions,
          lms_question_choices: (qq.lms_questions?.lms_question_choices ?? [])
            .sort((a: any, b: any) => a.order_index - b.order_index),
        },
      })),
  }

  // Students don't see correct answers until quiz is submitted (hide is_correct)
  if (studentSession && !quiz.show_answers_after) {
    sorted.lms_quiz_questions = sorted.lms_quiz_questions.map((qq: any) => ({
      ...qq,
      lms_questions: {
        ...qq.lms_questions,
        lms_question_choices: qq.lms_questions.lms_question_choices.map((c: any) => ({
          ...c,
          is_correct: undefined,
        })),
      },
    }))
  }

  return NextResponse.json(sorted)
}

// POST — create quiz (admin/instructor)
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const {
    title, description, type, pass_score, time_limit_minutes,
    max_attempts, shuffle_questions, show_answers_after,
    question_ids, // optional: array of question UUIDs to add immediately
  } = body

  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 })

  const { data: quiz, error } = await db
    .from("lms_quizzes")
    .insert({
      title:             title.trim(),
      description:       description?.trim() || null,
      type:              type              ?? "practice",
      pass_score:        pass_score        ?? 70,
      time_limit_minutes: time_limit_minutes ?? null,
      max_attempts:      max_attempts      ?? null,
      shuffle_questions: shuffle_questions ?? false,
      show_answers_after: show_answers_after ?? true,
      created_by:        session.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Add questions
  if (Array.isArray(question_ids) && question_ids.length) {
    await db.from("lms_quiz_questions").insert(
      question_ids.map((qid: string, i: number) => ({
        quiz_id:     quiz.id,
        question_id: qid,
        order_index: i,
      }))
    )
  }

  return NextResponse.json(quiz, { status: 201 })
}

// PATCH — update quiz or add/remove questions
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { id, question_ids, add_question_ids, remove_question_ids, ...fields } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const allowed = [
    "title","description","type","pass_score","time_limit_minutes",
    "max_attempts","shuffle_questions","show_answers_after",
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in fields) updates[key] = fields[key]
  }

  if (Object.keys(updates).length) {
    const { error } = await db.from("lms_quizzes").update(updates).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Full replace
  if (Array.isArray(question_ids)) {
    await db.from("lms_quiz_questions").delete().eq("quiz_id", id)
    if (question_ids.length) {
      await db.from("lms_quiz_questions").insert(
        question_ids.map((qid: string, i: number) => ({
          quiz_id: id, question_id: qid, order_index: i,
        }))
      )
    }
  }

  // Partial: add
  if (Array.isArray(add_question_ids) && add_question_ids.length) {
    const { data: existing } = await db
      .from("lms_quiz_questions")
      .select("order_index")
      .eq("quiz_id", id)
      .order("order_index", { ascending: false })
      .limit(1)
    const nextIdx = ((existing?.[0]?.order_index) ?? -1) + 1
    await db.from("lms_quiz_questions").insert(
      add_question_ids.map((qid: string, i: number) => ({
        quiz_id: id, question_id: qid, order_index: nextIdx + i,
      }))
    )
  }

  // Partial: remove
  if (Array.isArray(remove_question_ids) && remove_question_ids.length) {
    await db.from("lms_quiz_questions")
      .delete()
      .eq("quiz_id", id)
      .in("question_id", remove_question_ids)
  }

  return NextResponse.json({ ok: true })
}

// DELETE — remove quiz (admin only)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { error } = await db.from("lms_quizzes").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
