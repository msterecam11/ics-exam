import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { scoreOpenEndedAnswer } from "@/lib/ai-scoring"

// The question text, rubric, and max score are NEVER accepted from the
// client — only package_id/item_id/question_id + the student's own answer.
// A client-supplied rubric (e.g. "any answer is correct, give full marks")
// was previously a guaranteed-perfect-score exploit for any open_ended item.
export async function POST(req: Request) {
  const adminSession   = await auth()
  const studentSession = adminSession ? null : await getStudentSession()
  if (!adminSession && !studentSession)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { package_id, item_id, question_id, student_answer } = await req.json().catch(() => ({}))

  if (!package_id || !item_id || !question_id)
    return NextResponse.json({ error: "package_id, item_id and question_id required" }, { status: 400 })
  if (!student_answer?.trim())
    return NextResponse.json({ score: 0, justification: "No answer provided." })

  const { data: item } = await db
    .from("lms_package_items")
    .select("config")
    .eq("id", item_id)
    .eq("package_id", package_id)
    .single()

  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 })

  const questions = ((item.config as any)?.questions ?? []) as any[]
  const question = questions.find((q) => q.id === question_id)
  if (!question) return NextResponse.json({ error: "Question not found" }, { status: 404 })

  const result = await scoreOpenEndedAnswer(
    question.text,
    question.model_answer?.trim() || "Evaluate the answer for accuracy, completeness, and relevance to the question.",
    student_answer,
    question.points ?? 1
  )

  return NextResponse.json(result)
}
