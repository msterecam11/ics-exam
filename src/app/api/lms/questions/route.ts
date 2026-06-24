import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
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

  const validTypes = ["mcq_single","mcq_multi","ordering","matching","open_ended"]
  if (!validTypes.includes(type))
    return NextResponse.json({ error: `type must be one of: ${validTypes.join(", ")}` }, { status: 400 })

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Insert choices if MCQ
  if (["mcq_single","mcq_multi"].includes(type) && Array.isArray(choices) && choices.length) {
    const choiceRows = choices.map((c: any, i: number) => ({
      question_id: question.id,
      text_en:     c.text_en?.trim() ?? "",
      text_ar:     c.text_ar?.trim() || null,
      is_correct:  c.is_correct      ?? false,
      order_index: c.order_index     ?? i,
    }))
    await db.from("lms_question_choices").insert(choiceRows)
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

  const { ordering_items: patchOrdering, matching_pairs: patchMatching } = body as any

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Replace choices if provided
  if (Array.isArray(choices)) {
    await db.from("lms_question_choices").delete().eq("question_id", id)
    if (choices.length) {
      await db.from("lms_question_choices").insert(
        choices.map((c: any, i: number) => ({
          question_id: id,
          text_en:     c.text_en?.trim() ?? "",
          text_ar:     c.text_ar?.trim() || null,
          is_correct:  c.is_correct ?? false,
          order_index: c.order_index ?? i,
        }))
      )
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

  const { error } = await db.from("lms_questions").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
