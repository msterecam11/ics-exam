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

  // Fetch questions — text only, no choices/pairs/items (not needed for topic grouping)
  const { data: questions } = await db
    .from("questions")
    .select("id, text, type, score")
    .eq("exam_id", id)
    .order("order_index", { ascending: true })

  if (!questions?.length) {
    return NextResponse.json({ error: "No questions found for this exam" }, { status: 400 })
  }

  // Build Q-number → real UUID map (used after parsing)
  const qIndexMap: Record<string, string> = {}
  questions.forEach((q, i) => { qIndexMap[`Q${i + 1}`] = q.id })

  const totalQ = questions.length
  const questionsSummary = questions.map((q, i) => {
    const text = q.text.length > 120 ? q.text.slice(0, 120) + "…" : q.text
    return `Q${i + 1}: ${text}`
  }).join("\n")

  // Two-part format: AI commits to 4-10 section names first, then classifies
  // each question by number. Prevents model from inventing a new section per question.
  const prompt = `You are an expert exam analyst. Group the following ${totalQ} questions into sections.

EXAM QUESTIONS:
${questionsSummary}

Respond in exactly two blocks with no extra text:

SECTIONS:
1. [section title]
2. [section title]
(between 4 and 10 sections total, short professional titles, 3-6 words each)

ASSIGNMENTS:
Q1: [section number]
Q2: [section number]
...
Q${totalQ}: [section number]

Rules:
- Every question from Q1 to Q${totalQ} must appear in ASSIGNMENTS
- Use only the section numbers you defined above
- Group related topics together`

  let completion: Awaited<ReturnType<typeof groq.chat.completions.create>>
  try {
    completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 2000,
    })
  } catch (err: any) {
    console.error("[Analyze] Groq error — status:", err?.status, "| message:", err?.message)
    const isQuota = err?.status === 429 || err?.status === 413 || err?.message?.includes("rate") || err?.message?.includes("quota") || err?.message?.includes("too large")
    if (isQuota) {
      return NextResponse.json(
        { error: "AI quota reached. Please wait a few minutes and try again." },
        { status: 429 }
      )
    }
    return NextResponse.json({ error: "AI service unavailable. Please try again." }, { status: 503 })
  }

  const raw = completion.choices[0]?.message?.content?.trim() ?? ""

  // Parse SECTIONS block: "1. Title"
  const sectionTitles: Record<number, string> = {}
  const sectionsBlock = raw.match(/SECTIONS:\s*([\s\S]*?)(?=ASSIGNMENTS:|$)/i)?.[1] ?? ""
  for (const line of sectionsBlock.split("\n")) {
    const m = line.match(/^(\d+)[.)]\s*(.+)$/)
    if (m) sectionTitles[parseInt(m[1])] = m[2].trim()
  }

  // Parse ASSIGNMENTS block: "Q1: 3"
  const assignMap: Record<number, number> = {}
  const assignBlock = raw.match(/ASSIGNMENTS:\s*([\s\S]*?)$/i)?.[1] ?? ""
  for (const line of assignBlock.split("\n")) {
    const m = line.match(/^Q(\d+):\s*(\d+)/i)
    if (m) assignMap[parseInt(m[1])] = parseInt(m[2])
  }

  if (Object.keys(sectionTitles).length === 0) {
    return NextResponse.json({ error: "AI returned invalid response" }, { status: 500 })
  }

  // Group question UUIDs by section number
  const sectionGroups: Record<number, string[]> = {}
  for (let i = 1; i <= totalQ; i++) {
    const secNum = assignMap[i]
    if (!secNum || !sectionTitles[secNum]) continue
    if (!sectionGroups[secNum]) sectionGroups[secNum] = []
    sectionGroups[secNum].push(qIndexMap[`Q${i}`])
  }

  // Any questions the AI missed → last section as fallback
  const lastSecNum = Math.max(...Object.keys(sectionTitles).map(Number))
  for (let i = 1; i <= totalQ; i++) {
    const secNum = assignMap[i]
    if (!secNum || !sectionTitles[secNum]) {
      if (!sectionGroups[lastSecNum]) sectionGroups[lastSecNum] = []
      sectionGroups[lastSecNum].push(qIndexMap[`Q${i}`])
    }
  }

  const sections = Object.keys(sectionTitles)
    .map(Number)
    .sort((a, b) => a - b)
    .filter(num => (sectionGroups[num]?.length ?? 0) > 0)
    .map((num, idx) => ({
      title: sectionTitles[num],
      description: "",
      order_index: idx,
      question_ids: sectionGroups[num],
    }))

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
