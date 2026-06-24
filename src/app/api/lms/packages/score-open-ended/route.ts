import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getStudentSession } from "@/lib/lms-auth"
import { scoreOpenEndedAnswer } from "@/lib/ai-scoring"

export async function POST(req: Request) {
  const adminSession   = await auth()
  const studentSession = adminSession ? null : await getStudentSession()
  if (!adminSession && !studentSession)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { question_text, model_answer, student_answer, max_score } = await req.json()

  if (!question_text || !student_answer?.trim())
    return NextResponse.json({ score: 0, justification: "No answer provided." })

  const result = await scoreOpenEndedAnswer(
    question_text,
    model_answer?.trim() || "Evaluate the answer for accuracy, completeness, and relevance to the question.",
    student_answer,
    max_score ?? 1
  )

  return NextResponse.json(result)
}
