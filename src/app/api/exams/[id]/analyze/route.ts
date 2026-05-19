import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import Groq from "groq-sdk"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "placeholder" })

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const { data } = await db
    .from("exam_analyses")
    .select("*")
    .eq("exam_id", id)
    .single()

  return NextResponse.json(data ?? null)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { allowed, retryAfterSeconds } = await rateLimit(`ai:${session.user.id}`, 10, 3600)
  if (!allowed) {
    const { res429 } = await import("@/lib/apiUtils")
    return res429(retryAfterSeconds)
  }

  const { id } = await params

  // Fetch all questions with their content
  const { data: questions } = await db
    .from("questions")
    .select("id, text, type, score, choices(*), matching_pairs(*), ordering_items(*)")
    .eq("exam_id", id)
    .order("order_index", { ascending: true })

  if (!questions?.length) {
    return NextResponse.json({ error: "No questions found for this exam" }, { status: 400 })
  }

  // Build a readable summary of each question for the AI
  const questionsSummary = questions.map((q, i) => {
    let detail = ""
    if (q.type === "mcq_single" || q.type === "mcq_multi") {
      const choices = (q.choices as any[])?.map((c: any) => `  - ${c.text}${c.is_correct ? " [correct]" : ""}`).join("\n") ?? ""
      detail = choices ? `\nChoices:\n${choices}` : ""
    } else if (q.type === "matching") {
      const pairs = (q.matching_pairs as any[])?.map((p: any) => `  - ${p.left_item} → ${p.right_item}`).join("\n") ?? ""
      detail = pairs ? `\nPairs:\n${pairs}` : ""
    } else if (q.type === "ordering") {
      const items = (q.ordering_items as any[])
        ?.sort((a: any, b: any) => a.correct_position - b.correct_position)
        .map((item: any) => `  ${item.correct_position + 1}. ${item.text}`).join("\n") ?? ""
      detail = items ? `\nCorrect order:\n${items}` : ""
    }
    return `Q${i + 1} [ID: ${q.id}] [Type: ${q.type}] [${q.score}pts]\n${q.text}${detail}`
  }).join("\n\n")

  const prompt = `You are an expert exam analyst. Analyze the following exam questions and group them into logical sections based on their topic and subject matter.

EXAM QUESTIONS:
${questionsSummary}

Instructions:
- Create between 2 and 6 sections depending on how many distinct topics you identify
- Each section must have a clear, professional title
- Each section must have a short description (1 sentence) of what it covers
- Assign every question to exactly one section
- Keep related topics together
- Order sections logically (general → specific, or foundational → advanced)

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "sections": [
    {
      "title": "Section title",
      "description": "One sentence describing what this section covers",
      "question_ids": ["uuid1", "uuid2", ...],
      "order_index": 0
    }
  ]
}`

  let completion: Awaited<ReturnType<typeof groq.chat.completions.create>>
  try {
    completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 2000,
    })
  } catch (err: any) {
    const isQuota = err?.status === 429 || err?.message?.includes("rate") || err?.message?.includes("quota")
    if (isQuota) {
      return NextResponse.json(
        { error: "AI quota reached. Please wait a few minutes and try again." },
        { status: 429 }
      )
    }
    return NextResponse.json({ error: "AI service unavailable. Please try again." }, { status: 503 })
  }

  const raw = completion.choices[0]?.message?.content?.trim() ?? ""
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()

  let sections: any[]
  try {
    const parsed = JSON.parse(cleaned)
    sections = parsed.sections
    if (!Array.isArray(sections)) throw new Error("Invalid format")
  } catch {
    // Fallback regex extraction
    const match = cleaned.match(/"sections"\s*:\s*(\[[\s\S]*\])/)
    if (!match) return NextResponse.json({ error: "AI returned invalid response" }, { status: 500 })
    try {
      sections = JSON.parse(match[1])
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 })
    }
  }

  // Upsert — replace existing analysis if re-run
  const { data, error } = await db
    .from("exam_analyses")
    .upsert(
      { exam_id: id, sections, generated_at: new Date().toISOString() },
      { onConflict: "exam_id" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
