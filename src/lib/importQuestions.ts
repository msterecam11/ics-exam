import { db } from "@/lib/db"
import type { CSVParsedQuestion } from "@/lib/csv-parser"

type Owner = { exam_id: string } | { question_bank_id: string }

// Shared by the plain-CSV and zip-bundle import routes (both exam- and
// bank-owned) — one insertion loop so the two paths can't drift apart.
// Section resolution only applies to exam-owned imports (see
// exam_sections.sql for why bank questions never get a section).
export async function insertParsedQuestions(
  owner: Owner,
  questions: CSVParsedQuestion[],
  startIndex: number
): Promise<number> {
  let resolveSectionId: (title?: string) => Promise<string | null> = async () => null

  if ("exam_id" in owner) {
    const examId = owner.exam_id
    const { data: existingSections } = await db.from("exam_sections").select("id, title").eq("exam_id", examId)
    const sectionIdByTitle = new Map<string, string>((existingSections ?? []).map((s) => [s.title, s.id]))
    let nextSectionOrder = existingSections?.length ?? 0

    resolveSectionId = async (title) => {
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
  }

  let orderIndex = startIndex
  let created = 0

  for (const q of questions) {
    const section_id = "exam_id" in owner ? await resolveSectionId(q.section) : null

    const { data: question, error } = await db
      .from("questions")
      .insert({
        ...owner,
        type: q.type,
        text: q.text,
        score: q.score,
        order_index: orderIndex++,
        ai_scoring_guide: q.ai_guide ?? null,
        image_url: q.image_url ?? null,
        ...("exam_id" in owner ? { section_id } : {}),
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

  return created
}
