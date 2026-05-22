import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { parseGIFT } from "@/lib/gift-parser"
import { parseBody, res400, res413, BodyTooLargeError } from "@/lib/apiUtils"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: examId } = await params

  let body: any
  try { body = await parseBody(req) } catch (e) {
    return e instanceof BodyTooLargeError ? res413() : res400("Invalid request body")
  }
  const { gift_text, start_index = 0 } = body

  if (!gift_text?.trim()) return NextResponse.json({ error: "No GIFT text provided" }, { status: 400 })

  const parsed = parseGIFT(gift_text)
  if (parsed.length === 0) return NextResponse.json({ error: "No valid questions found in GIFT text" }, { status: 400 })

  let orderIndex = start_index
  let created = 0

  for (const q of parsed) {
    // Insert question
    const { data: question, error } = await db
      .from("questions")
      .insert({
        exam_id: examId,
        type: q.type,
        text: q.text,
        score: q.score,
        order_index: orderIndex++,
        ai_scoring_guide: q.type === "open_ended" && q.correctAnswer
          ? `Expected answer: ${q.correctAnswer}`
          : null,
      })
      .select("id")
      .single()

    if (error || !question) continue

    // Insert choices for MCQ
    if ((q.type === "mcq_single" || q.type === "mcq_multi") && q.choices?.length) {
      await db.from("choices").insert(
        q.choices.map((c, i) => {
          // Convert percentage weight to actual points
          let choiceScore = 0
          if (c.weight !== undefined) {
            // GIFT %weight% → actual points (e.g. %50% on a 10pt question = 5pts)
            choiceScore = Math.max(0, (c.weight / 100) * q.score)
          } else if (c.isCorrect) {
            choiceScore = q.type === "mcq_multi" ? 1 : q.score
          }
          return {
            question_id: question.id,
            text: c.text,
            is_correct: c.isCorrect,
            score: Math.round(choiceScore * 100) / 100,
            order_index: i,
          }
        })
      )
    }

    // Insert matching pairs
    if (q.type === "matching" && q.matchingPairs?.length) {
      await db.from("matching_pairs").insert(
        q.matchingPairs.map((p, i) => ({
          question_id: question.id,
          left_item: p.left,
          right_item: p.right,
          order_index: i,
        }))
      )
    }

    created++
  }

  return NextResponse.json({ created, total: parsed.length })
}
