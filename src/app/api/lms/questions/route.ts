import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

const VALID_TYPES = ["mcq_single", "mcq_multi", "ordering", "matching", "open_ended"]

// A multiple-choice question needs choices and a correct answer. Nothing on the
// server checked this, so a bank question with no correct choice could be saved
// — and, imported into a package activity, became a question nobody can answer.
function choicesError(type: string, choices: unknown): string | null {
  if (type !== "mcq_single" && type !== "mcq_multi") return null
  if (!Array.isArray(choices) || choices.length < 2) return "A multiple-choice question needs at least 2 choices"
  if (choices.some((c: any) => typeof c?.text_en !== "string" || !c.text_en.trim())) return "All choices need text"
  const correct = choices.filter((c: any) => c?.is_correct === true).length
  if (correct === 0) return "Mark at least one correct choice"
  if (type === "mcq_single" && correct !== 1) return "A single-answer question needs exactly one correct choice"
  return null
}

function choiceRows(questionId: string, choices: any[]) {
  return choices.map((c: any, i: number) => ({
    question_id: questionId,
    text_en:     c.text_en?.trim() ?? "",
    text_ar:     c.text_ar?.trim() || null,
    is_correct:  c.is_correct === true,
    order_index: c.order_index ?? i,
  }))
}

// GET /api/lms/questions?search=&type=&tags=&page=1
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search") ?? ""
  const type   = searchParams.get("type")   ?? ""
  const setId  = searchParams.get("set_id") ?? ""
  const page   = parseInt(searchParams.get("page")  ?? "1")
  const limit  = parseInt(searchParams.get("limit") ?? "50")
  const offset = (page - 1) * limit

  let query = db
    .from("lms_questions")
    .select(`
      id, text_en, text_ar, type, difficulty, tags, score, set_id,
      explanation_en, ordering_items, matching_pairs, created_at,
      lms_question_choices(id, text_en, text_ar, is_correct, order_index)
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) query = query.ilike("text_en", `%${search}%`)
  if (type)   query = query.eq("type", type)
  if (setId)  query = query.eq("set_id", setId)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ questions: data ?? [], total: count ?? 0, page, limit })
}

// POST — create question with choices
// Body: { text_en, text_ar?, type, difficulty, tags, score, explanation_en?, choices? }
// choices: [{ text_en, text_ar?, is_correct, order_index }]  (for MCQ types)
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const {
    text_en, text_ar, type, difficulty, tags, score,
    explanation_en, choices, ordering_items, matching_pairs, set_id,
  } = body

  if (!text_en?.trim()) return NextResponse.json({ error: "text_en required" }, { status: 400 })
  if (!type)            return NextResponse.json({ error: "type required" },    { status: 400 })

  if (!VALID_TYPES.includes(type))
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400 })
  const choiceErr = choicesError(type, choices)
  if (choiceErr) return NextResponse.json({ error: choiceErr }, { status: 400 })
  if (score !== undefined && (!Number.isFinite(Number(score)) || Number(score) < 0))
    return NextResponse.json({ error: "score must be a non-negative number" }, { status: 400 })

  const { data: question, error } = await db
    .from("lms_questions")
    .insert({
      text_en:        text_en.trim(),
      text_ar:        text_ar?.trim()        || null,
      type,
      difficulty:     difficulty             ?? "medium",
      tags:           Array.isArray(tags)    ? tags : [],
      score:          score                  ?? 1,
      explanation_en: explanation_en?.trim() || null,
      ordering_items: type === "ordering" ? (ordering_items ?? []) : [],
      matching_pairs: type === "matching" ? (matching_pairs ?? []) : [],
      set_id:         set_id                 || null,
      created_by:     session.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: "Could not create question" }, { status: 500 })

  // Insert choices if MCQ. The result used to be ignored, so a failed insert
  // left an MCQ with no choices while the admin was told it saved. Remove the
  // half-created question instead.
  if (["mcq_single","mcq_multi"].includes(type)) {
    const { error: chErr } = await db.from("lms_question_choices").insert(choiceRows(question.id, choices))
    if (chErr) {
      await db.from("lms_questions").delete().eq("id", question.id)
      return NextResponse.json({ error: "Could not save the question's choices" }, { status: 500 })
    }
  }

  return NextResponse.json(question, { status: 201 })
}

// PATCH — update question
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { id, choices, ...fields } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  if (fields.type !== undefined && !VALID_TYPES.includes(fields.type))
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400 })
  if (fields.score !== undefined && (!Number.isFinite(Number(fields.score)) || Number(fields.score) < 0))
    return NextResponse.json({ error: "score must be a non-negative number" }, { status: 400 })

  if (Array.isArray(choices)) {
    const { data: cur } = await db.from("lms_questions").select("type").eq("id", id).maybeSingle()
    if (!cur) return NextResponse.json({ error: "Question not found" }, { status: 404 })
    const choiceErr = choicesError(fields.type ?? cur.type, choices)
    if (choiceErr) return NextResponse.json({ error: choiceErr }, { status: 400 })
  }

  const allowed = ["text_en","text_ar","type","difficulty","tags","score","explanation_en","ordering_items","matching_pairs"]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in fields) updates[key] = fields[key]
  }

  const { data, error } = await db
    .from("lms_questions")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: "Could not update question" }, { status: 500 })

  // Replace choices if provided.
  //
  // This deleted every choice and then inserted the new list without checking
  // the result — if the insert failed, the question was left with NO choices,
  // i.e. no answer key, and the admin was told it saved. Now the new choices
  // are written first and the old ones removed only once that succeeded.
  if (Array.isArray(choices)) {
    const { data: oldRows } = await db.from("lms_question_choices").select("id").eq("question_id", id)
    const oldIds = (oldRows ?? []).map((r: any) => r.id)

    if (choices.length) {
      const { error: insErr } = await db.from("lms_question_choices").insert(choiceRows(id, choices))
      if (insErr) return NextResponse.json({ error: "Could not save the question's choices; the previous choices were kept" }, { status: 500 })
    }
    if (oldIds.length) {
      const { error: delErr } = await db.from("lms_question_choices").delete().in("id", oldIds)
      if (delErr) return NextResponse.json({ error: "Could not remove the previous choices" }, { status: 500 })
    }
  }

  return NextResponse.json(data)
}

// DELETE
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Deleting a question cascades out of lms_quiz_questions, silently removing it
  // from every quiz that uses it (and from the answer set behind past attempts).
  // Refuse while it is in a quiz. Package activities copy questions, so they are
  // unaffected.
  const { count: inQuizzes, error: cErr } = await db
    .from("lms_quiz_questions").select("*", { count: "exact", head: true }).eq("question_id", id)
  if (cErr) return NextResponse.json({ error: "Could not verify this question is safe to delete" }, { status: 500 })
  if ((inQuizzes ?? 0) > 0)
    return NextResponse.json({ error: `Cannot delete — this question is used in ${inQuizzes} quiz${inQuizzes === 1 ? "" : "zes"}. Remove it from them first.` }, { status: 409 })

  const { error } = await db.from("lms_questions").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
