import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import Groq from "groq-sdk"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "placeholder" })

// A topic built from fewer than this many questions isn't a meaningful
// reporting/draw-config unit (its percentage is just 0% or 100% with no
// signal in between) — see MIN_TOPIC_SIZE enforcement below.
const MIN_TOPIC_SIZE = 4

interface BankQuestion { id: string; text: string; type: string; score: number }
interface Section { title: string; description: string; order_index: number; question_ids: string[] }

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

// Runs one Groq completion. Returns the raw text, or null on any failure
// (rate limit, quota, malformed response) — callers degrade gracefully
// instead of failing the whole analyze operation on a secondary pass.
async function runGroqPrompt(prompt: string, maxTokens: number): Promise<string | null> {
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: maxTokens,
    })
    return completion.choices[0]?.message?.content?.trim() ?? null
  } catch (err: any) {
    console.error("[Bank Analyze] Groq error — status:", err?.status, "| message:", err?.message)
    return null
  }
}

// Parses a TOPICS:/ASSIGNMENTS: response into { title, question_ids }[]
// against the given question list (Q1..Qn relative to that list's order).
// Any question the AI's response doesn't cover falls to the last topic —
// so within whatever pool this is called on, nothing is left untagged.
function parseTopicsResponse(raw: string, questions: BankQuestion[]): Section[] {
  const topicTitles: Record<number, string> = {}
  const topicsBlock = raw.match(/TOPICS:\s*([\s\S]*?)(?=ASSIGNMENTS:|$)/i)?.[1] ?? ""
  for (const line of topicsBlock.split("\n")) {
    const m = line.match(/^(\d+)[.)]\s*(.+)$/)
    if (m) topicTitles[parseInt(m[1])] = m[2].trim()
  }

  if (Object.keys(topicTitles).length === 0) return []

  const assignMap: Record<number, number> = {}
  const assignBlock = raw.match(/ASSIGNMENTS:\s*([\s\S]*?)$/i)?.[1] ?? ""
  for (const line of assignBlock.split("\n")) {
    const m = line.match(/^Q(\d+):\s*(\d+)/i)
    if (m) assignMap[parseInt(m[1])] = parseInt(m[2])
  }

  const topicGroups: Record<number, string[]> = {}
  const totalQ = questions.length
  for (let i = 1; i <= totalQ; i++) {
    const topicNum = assignMap[i]
    if (!topicNum || !topicTitles[topicNum]) continue
    if (!topicGroups[topicNum]) topicGroups[topicNum] = []
    topicGroups[topicNum].push(questions[i - 1].id)
  }

  const lastTopicNum = Math.max(...Object.keys(topicTitles).map(Number))
  for (let i = 1; i <= totalQ; i++) {
    const topicNum = assignMap[i]
    if (!topicNum || !topicTitles[topicNum]) {
      if (!topicGroups[lastTopicNum]) topicGroups[lastTopicNum] = []
      topicGroups[lastTopicNum].push(questions[i - 1].id)
    }
  }

  return Object.keys(topicTitles)
    .map(Number)
    .sort((a, b) => a - b)
    .filter(num => (topicGroups[num]?.length ?? 0) > 0)
    .map((num, idx) => ({
      title: topicTitles[num],
      description: "",
      order_index: idx,
      question_ids: topicGroups[num],
    }))
}

function questionsSummaryBlock(questions: BankQuestion[]): string {
  return questions.map((q, i) => {
    const text = q.text.length > 120 ? q.text.slice(0, 120) + "…" : q.text
    return `Q${i + 1}: ${text}`
  }).join("\n")
}

// Re-clusters a pool of leftover (under-threshold) questions on its own,
// biased toward fewer/larger groups so it doesn't just recreate the same
// fragmentation one level down. Returns null on AI failure — caller falls
// through to reassignment against the original topics instead.
async function reclusterOrphans(orphanQuestions: BankQuestion[]): Promise<Section[] | null> {
  const totalQ = orphanQuestions.length
  const prompt = `You are an expert exam analyst. The following ${totalQ} questions were left over after an initial topic pass because their original groupings were too small to be useful topics on their own. Re-group ONLY these questions into new topic(s).

QUESTIONS:
${questionsSummaryBlock(orphanQuestions)}

Respond in exactly two blocks with no extra text:

TOPICS:
1. [topic title]
(as many as the content naturally supports, but STRONGLY prefer fewer, larger topics — only create more than one topic if this content clearly splits into distinct, unrelated subjects. If it's all one coherent theme, output a single topic covering all ${totalQ} questions.)

ASSIGNMENTS:
Q1: [topic number]
...
Q${totalQ}: [topic number]

Rules:
- Every question from Q1 to Q${totalQ} must appear in ASSIGNMENTS
- Use only the topic numbers you defined above`

  const raw = await runGroqPrompt(prompt, Math.min(3000, 500 + totalQ * 15))
  if (!raw) return null
  const sections = parseTopicsResponse(raw, orphanQuestions)
  return sections.length > 0 ? sections : null
}

// Last resort for any question that still doesn't belong to a ≥MIN_TOPIC_SIZE
// topic after re-clustering: ask the AI which existing topic it fits best,
// rather than inventing a generic catch-all. Mutates and returns `keepers`
// with orphan question_ids merged in; returns null on AI failure so the
// caller can fall back to a deterministic merge (largest topic).
async function reassignToExisting(orphanQuestions: BankQuestion[], keepers: Section[]): Promise<Section[] | null> {
  const topicList = keepers.map((s, i) => `${i + 1}. ${s.title}`).join("\n")
  const totalQ = orphanQuestions.length
  const prompt = `You are an expert exam analyst. Assign each of the following ${totalQ} leftover questions to whichever EXISTING topic below it fits best — do not invent new topics.

EXISTING TOPICS:
${topicList}

QUESTIONS:
${questionsSummaryBlock(orphanQuestions)}

Respond with exactly:
ASSIGNMENTS:
Q1: [existing topic number]
...
Q${totalQ}: [existing topic number]`

  const raw = await runGroqPrompt(prompt, Math.min(2000, 300 + totalQ * 10))
  if (!raw) return null

  const assignMap: Record<number, number> = {}
  const assignBlock = raw.match(/ASSIGNMENTS:\s*([\s\S]*?)$/i)?.[1] ?? raw
  for (const line of assignBlock.split("\n")) {
    const m = line.match(/^Q(\d+):\s*(\d+)/i)
    if (m) assignMap[parseInt(m[1])] = parseInt(m[2])
  }

  if (Object.keys(assignMap).length === 0) return null

  const updated = keepers.map(s => ({ ...s, question_ids: [...s.question_ids] }))
  const largestIdx = updated.reduce((best, s, i) => s.question_ids.length > updated[best].question_ids.length ? i : best, 0)

  orphanQuestions.forEach((q, i) => {
    const topicNum = assignMap[i + 1]
    const idx = topicNum && keepers[topicNum - 1] ? topicNum - 1 : largestIdx
    updated[idx].question_ids.push(q.id)
  })

  return updated
}

// Merges sections that share a title (case-insensitive) and re-indexes
// order_index — a safety net in case a re-clustering/reassignment pass
// independently lands on a name already used by an earlier pass.
function dedupeSections(sections: Section[]): Section[] {
  const byTitle = new Map<string, Section>()
  for (const s of sections) {
    const key = s.title.trim().toLowerCase()
    const existing = byTitle.get(key)
    if (existing) existing.question_ids.push(...s.question_ids)
    else byTitle.set(key, { ...s, question_ids: [...s.question_ids] })
  }
  return [...byTitle.values()].map((s, idx) => ({ ...s, order_index: idx }))
}

// POST — analyze every question in the bank, group into named topics
// (enforcing a minimum of MIN_TOPIC_SIZE questions per topic — see the
// helpers above for how undersized topics get re-clustered or reassigned
// rather than dumped into a generic catch-all), and write the topic
// directly onto each question row.
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

  const totalQ = questions.length
  const prompt = `You are an expert exam analyst. Group the following ${totalQ} questions from a question bank into topics.

QUESTIONS:
${questionsSummaryBlock(questions)}

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

  const raw = await runGroqPrompt(prompt, Math.min(8000, 2000 + totalQ * 15))
  if (!raw) {
    return NextResponse.json({ error: "AI service unavailable. Please try again." }, { status: 503 })
  }

  let keepers = parseTopicsResponse(raw, questions)
  if (keepers.length === 0) {
    return NextResponse.json({ error: "AI returned invalid response" }, { status: 500 })
  }

  let orphanIds = keepers.filter(s => s.question_ids.length < MIN_TOPIC_SIZE).flatMap(s => s.question_ids)
  keepers = keepers.filter(s => s.question_ids.length >= MIN_TOPIC_SIZE)

  // Pass 2 — only worth attempting if the orphan pool could plausibly form
  // its own valid topic. Below MIN_TOPIC_SIZE total, skip straight to
  // reassignment against the surviving topics.
  if (orphanIds.length >= MIN_TOPIC_SIZE) {
    const orphanQuestions = questions.filter(q => orphanIds.includes(q.id))
    const pass2 = await reclusterOrphans(orphanQuestions)
    if (pass2) {
      const keepers2 = pass2.filter(s => s.question_ids.length >= MIN_TOPIC_SIZE)
      orphanIds = pass2.filter(s => s.question_ids.length < MIN_TOPIC_SIZE).flatMap(s => s.question_ids)
      keepers = [...keepers, ...keepers2]
    }
    // pass2 null (AI failure) — orphanIds/keepers unchanged, falls through
    // to reassignment against the original pass-1 topics below.
  }

  if (orphanIds.length > 0) {
    const orphanQuestions = questions.filter(q => orphanIds.includes(q.id))
    if (keepers.length > 0) {
      const reassigned = await reassignToExisting(orphanQuestions, keepers)
      if (reassigned) {
        keepers = reassigned
      } else {
        // AI reassignment failed — deterministic fallback: fold into the
        // single largest surviving topic rather than failing the request.
        const largest = keepers.reduce((a, b) => (b.question_ids.length > a.question_ids.length ? b : a))
        largest.question_ids.push(...orphanIds)
      }
    } else {
      // Whole bank never produced a single ≥MIN_TOPIC_SIZE topic (only
      // possible for a very small bank) — nothing to merge into, so the
      // minimum-size rule can't be meaningfully enforced. Keep as-is.
      keepers = [{ title: "General", description: "", order_index: 0, question_ids: orphanIds }]
    }
  }

  const sections = dedupeSections(keepers)

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
