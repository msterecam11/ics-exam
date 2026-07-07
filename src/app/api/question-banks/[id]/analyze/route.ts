import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import Groq from "groq-sdk"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "placeholder" })

// GET — fetch the stored bank analysis (topic breakdown), if any
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const { data } = await db
    .from("exam_analyses")
    .select("*")
    .eq("question_bank_id", id)
    .single()

  return NextResponse.json(data ?? null)
}

// POST — analyze every question in the bank, group into named topics, and
// write the topic directly onto each question row (so downstream lookups —
// candidate reports, cohort heatmap, draw-config UI — are a single column
// read, not a join through a sections list). Adapted from the exam-system's
// own analyzer (exams/[id]/analyze/route.ts) — same two-block prompt shape,
// scaled for a much larger question count.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { allowed, retryAfterSeconds } = await rateLimit(`ai:${session.user.id}`, 10, 3600)
  if (!allowed) {
    const { res429 } = await import("@/lib/apiUtils")
    return res429(retryAfterSeconds)
  }

  const { id } = await params

  const { data: questions } = await db
    .from("questions")
    .select("id, text, type, score")
    .eq("question_bank_id", id)
    .order("order_index", { ascending: true })

  if (!questions?.length) {
    return NextResponse.json({ error: "No questions found in this bank" }, { status: 400 })
  }

  const qIndexMap: Record<string, string> = {}
  questions.forEach((q, i) => { qIndexMap[`Q${i + 1}`] = q.id })

  const totalQ = questions.length
  const questionsSummary = questions.map((q, i) => {
    const text = q.text.length > 120 ? q.text.slice(0, 120) + "…" : q.text
    return `Q${i + 1}: ${text}`
  }).join("\n")

  const prompt = `You are an expert exam analyst. Group the following ${totalQ} questions from a question bank into topics.

QUESTIONS:
${questionsSummary}

Respond in exactly two blocks with no extra text:

TOPICS:
1. [topic title]
2. [topic title]
(as many topics as the content naturally supports — for a large bank this can be more than 10, short professional titles, 3-6 words each)

ASSIGNMENTS:
Q1: [topic number]
Q2: [topic number]
...
Q${totalQ}: [topic number]

Rules:
- Every question from Q1 to Q${totalQ} must appear in ASSIGNMENTS
- Use only the topic numbers you defined above
- Group related subject matter together`

  let completion: Awaited<ReturnType<typeof groq.chat.completions.create>>
  try {
    completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      // Scales with question count — a 400-question bank's ASSIGNMENTS block
      // alone can run to thousands of tokens; capped for cost/model limits.
      max_tokens: Math.min(8000, 2000 + totalQ * 15),
    })
  } catch (err: any) {
    console.error("[Bank Analyze] Groq error — status:", err?.status, "| message:", err?.message)
    const isQuota = err?.status === 429 || err?.status === 413 || err?.message?.includes("rate") || err?.message?.includes("quota") || err?.message?.includes("too large")
    if (isQuota) {
      return NextResponse.json({ error: "AI quota reached. Please wait a few minutes and try again." }, { status: 429 })
    }
    return NextResponse.json({ error: "AI service unavailable. Please try again." }, { status: 503 })
  }

  const raw = completion.choices[0]?.message?.content?.trim() ?? ""

  const topicTitles: Record<number, string> = {}
  const topicsBlock = raw.match(/TOPICS:\s*([\s\S]*?)(?=ASSIGNMENTS:|$)/i)?.[1] ?? ""
  for (const line of topicsBlock.split("\n")) {
    const m = line.match(/^(\d+)[.)]\s*(.+)$/)
    if (m) topicTitles[parseInt(m[1])] = m[2].trim()
  }

  const assignMap: Record<number, number> = {}
  const assignBlock = raw.match(/ASSIGNMENTS:\s*([\s\S]*?)$/i)?.[1] ?? ""
  for (const line of assignBlock.split("\n")) {
    const m = line.match(/^Q(\d+):\s*(\d+)/i)
    if (m) assignMap[parseInt(m[1])] = parseInt(m[2])
  }

  if (Object.keys(topicTitles).length === 0) {
    return NextResponse.json({ error: "AI returned invalid response" }, { status: 500 })
  }

  const topicGroups: Record<number, string[]> = {}
  for (let i = 1; i <= totalQ; i++) {
    const topicNum = assignMap[i]
    if (!topicNum || !topicTitles[topicNum]) continue
    if (!topicGroups[topicNum]) topicGroups[topicNum] = []
    topicGroups[topicNum].push(qIndexMap[`Q${i}`])
  }

  // Any questions the AI missed → last topic as fallback (never left untagged)
  const lastTopicNum = Math.max(...Object.keys(topicTitles).map(Number))
  for (let i = 1; i <= totalQ; i++) {
    const topicNum = assignMap[i]
    if (!topicNum || !topicTitles[topicNum]) {
      if (!topicGroups[lastTopicNum]) topicGroups[lastTopicNum] = []
      topicGroups[lastTopicNum].push(qIndexMap[`Q${i}`])
    }
  }

  const sections = Object.keys(topicTitles)
    .map(Number)
    .sort((a, b) => a - b)
    .filter(num => (topicGroups[num]?.length ?? 0) > 0)
    .map((num, idx) => ({
      title: topicTitles[num],
      description: "",
      order_index: idx,
      question_ids: topicGroups[num],
    }))

  // Write the topic directly onto each question — the single source every
  // downstream consumer (draw-config UI, candidate reports, cohort heatmap)
  // reads from.
  await Promise.all(
    sections.map(s =>
      db.from("questions").update({ topic: s.title }).in("id", s.question_ids)
    )
  )

  // Upsert the summary (question_bank_id set, exam_id left null) — reuses the
  // same exam_analyses table/shape the exam-system's analyzer already uses.
  const { data, error } = await db
    .from("exam_analyses")
    .upsert(
      { question_bank_id: id, sections, generated_at: new Date().toISOString() },
      { onConflict: "question_bank_id" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
