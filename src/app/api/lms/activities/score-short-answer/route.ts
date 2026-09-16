import { NextResponse } from "next/server"
import Groq from "groq-sdk"
import { getStudentSession } from "@/lib/lms-auth"
import { auth } from "@/lib/auth"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY_LMS ?? process.env.GROQ_API_KEY ?? "placeholder",
})

export async function POST(req: Request) {
  // Require a logged-in student (real usage) or admin/instructor (preview).
  // Prevents anonymous abuse of this AI endpoint (cost / prompt-injection).
  const student = await getStudentSession()
  let callerId = student?.id ?? null
  if (!student) {
    const session = await auth().catch(() => null)
    // Preview is a manager feature; viewer/assessor accounts have no reason to
    // spend AI calls here.
    if (!session || (session.user.role !== "admin" && session.user.role !== "instructor"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    callerId = `staff:${session.user.id}`
  }

  // Every call is a paid LLM request against a shared quota — the same quota
  // whose exhaustion (429) broke report regeneration. Without a limit a single
  // account could drain it in a loop.
  const { allowed, retryAfterSeconds } = await rateLimit(`lms-ai-short-answer:${callerId}`, 30, 600)
  if (!allowed) return res429(retryAfterSeconds)

  const { question, rubric, answer } = await req.json().catch(() => ({}))

  if (!question || !answer)
    return NextResponse.json({ error: "question and answer required" }, { status: 400 })

  const prompt = `You are an aviation training instructor scoring a student's short-answer response.

QUESTION: ${question}
${rubric ? `MODEL ANSWER / RUBRIC: ${rubric}` : ""}
STUDENT'S ANSWER: ${answer}

Score the answer from 0 to 10 based on:
- Accuracy of aviation facts (most important)
- Completeness — does it cover the key points?
- Clarity — is the reasoning clear?

Respond ONLY with valid JSON (no markdown, no explanation):
{"score": 8, "comment": "Your feedback to the student in 1-2 sentences explaining what was correct and what was missing."}`

  try {
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      reasoning_effort: "low",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 200,
    })
    const raw = completion.choices[0]?.message?.content?.trim() ?? ""
    const start = raw.indexOf("{")
    const end   = raw.lastIndexOf("}")
    if (start === -1 || end === -1) throw new Error("No JSON")
    const result = JSON.parse(raw.slice(start, end + 1))
    return NextResponse.json({
      score:   Math.max(0, Math.min(10, Math.round(result.score ?? 0))),
      comment: result.comment ?? "",
    })
  } catch {
    return NextResponse.json({ score: 5, comment: "Could not automatically score this answer. Please check with your instructor." })
  }
}
