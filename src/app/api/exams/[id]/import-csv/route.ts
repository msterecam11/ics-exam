import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { parseCSV } from "@/lib/csv-parser"
import { parseBody, res400, res413, BodyTooLargeError, IMPORT_BODY_BYTES } from "@/lib/apiUtils"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: examId } = await params

  let body: any
  try { body = await parseBody(req, IMPORT_BODY_BYTES) } catch (e) {
    return e instanceof BodyTooLargeError ? res413() : res400("Invalid request body")
  }
  const { csv_text, start_index = 0 } = body

  if (!csv_text?.trim()) return NextResponse.json({ error: "No CSV content provided" }, { status: 400 })

  const { questions, errors } = parseCSV(csv_text)

  if (questions.length === 0) {
    return NextResponse.json(
      { error: "No valid questions found", errors },
      { status: 400 }
    )
  }

  // Resolve each row's `section` title to a section_id, creating the
  // section on first use — importing a CSV with a `section` column is
  // enough to both create the sections and populate them in one action.
  // Existing sections' titles reused so re-importing a corrected CSV
  // doesn't create duplicates.
  const { data: existingSections } = await db.from("exam_sections").select("id, title").eq("exam_id", examId)
  const sectionIdByTitle = new Map<string, string>((existingSections ?? []).map((s) => [s.title, s.id]))
  let nextSectionOrder = existingSections?.length ?? 0

  async function resolveSectionId(title: string | undefined): Promise<string | null> {
    if (!title) return null
    const existing = sectionIdByTitle.get(title)
    if (existing) return existing
    const { data, error } = await db
      .from("exam_sections")
      .insert({ exam_id: examId, title, order_index: nextSectionOrder++ })
      .select("id")
      .single()
    if (error || !data) return null
    sectionIdByTitle.set(title, data.id)
    return data.id
  }

  let orderIndex = start_index
  let created = 0

  for (const q of questions) {
    const section_id = await resolveSectionId(q.section)

    const { data: question, error } = await db
      .from("questions")
      .insert({
        exam_id: examId,
        type: q.type,
        text: q.text,
        score: q.score,
        order_index: orderIndex++,
        ai_scoring_guide: q.ai_guide ?? null,
        image_url: q.image_url ?? null,
        section_id,
      })
      .select("id")
      .single()

    if (error || !question) continue

    if ((q.type === "mcq_single" || q.type === "mcq_multi") && q.choices?.length) {
      await db.from("choices").insert(
        q.choices.map((c, i) => ({
          question_id: question.id,
          text: c.text,
          is_correct: c.is_correct,
          score: c.score,
          order_index: i,
        }))
      )
    }

    if (q.type === "ordering" && q.ordering_items?.length) {
      await db.from("ordering_items").insert(
        q.ordering_items.map((item, i) => ({
          question_id: question.id,
          text: item.text,
          correct_position: item.correct_position,
          order_index: i,
        }))
      )
    }

    if (q.type === "matching" && q.matching_pairs?.length) {
      await db.from("matching_pairs").insert(
        q.matching_pairs.map((p, i) => ({
          question_id: question.id,
          left_item: p.left_item,
          right_item: p.right_item,
          order_index: i,
        }))
      )
    }

    created++
  }

  return NextResponse.json({ created, total: questions.length, errors })
}
