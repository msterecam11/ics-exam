import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import Groq from "groq-sdk"

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY_LMS ?? process.env.GROQ_API_KEY ?? "placeholder",
})

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// ── POST /api/lms/analyze/exam ────────────────────────────────────
// Receives the final_exam module_id.
// Reads: lms_modules.questions (the exam questions)
//        lms_module_analysis for the same course (Phase 3 output)
// Produces: sections mapped to REAL course modules (not AI-invented categories)
// Upserts: lms_module_analysis for the exam module

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { module_id } = body
  if (!module_id) return NextResponse.json({ error: "module_id required" }, { status: 400 })

  // ── 1. Fetch the exam module ──────────────────────────────────
  const { data: mod, error: modErr } = await db
    .from("lms_modules")
    .select("id, title, description, module_type, course_id, questions")
    .eq("id", module_id)
    .single()

  if (modErr || !mod)
    return NextResponse.json({ error: "Module not found" }, { status: 404 })

  if (mod.module_type !== "final_exam")
    return NextResponse.json({ error: "Module is not a final_exam" }, { status: 400 })

  const questions: any[] = mod.questions ?? []
  if (!questions.length)
    return NextResponse.json({ error: "No questions found in this exam module" }, { status: 400 })

  // ── 2. Load Phase 3 module analyses for this course ──────────
  const { data: moduleAnalyses } = await db
    .from("lms_module_analysis")
    .select("module_id, module_type, analysis")
    .eq("course_id", mod.course_id)
    .neq("module_id", module_id) // exclude the exam itself

  const analyses = (moduleAnalyses ?? []) as any[]

  // ── 3. Build the AI context ───────────────────────────────────
  const totalQ = questions.length

  // Map Q-number → question id
  const qIndexMap: Record<string, string> = {}
  questions.forEach((q, i) => { qIndexMap[`Q${i + 1}`] = q.id })

  const questionList = questions
    .map((q, i) => {
      const text = (q.text ?? "").slice(0, 120)
      return `Q${i + 1}: ${text}`
    })
    .join("\n")

  let prompt: string

  if (analyses.length === 0) {
    // No Phase 3 data — fall back to generic grouping (same as existing route)
    prompt = `You are an expert exam analyst for an aviation training course. Group the following ${totalQ} questions into sections.

EXAM QUESTIONS:
${questionList}

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
- Use only the section numbers you defined above`
  } else {
    // Phase 3 data available — use real module titles as sections
    const moduleContext = analyses
      .map((a, i) => {
        const analysis = a.analysis as any
        const topics = (analysis.topics ?? []).slice(0, 6).join(", ")
        return `Module ${i + 1}: "${analysis.module_title}" — topics: ${topics || "general"}`
      })
      .join("\n")

    // Catch-all for questions that don't fit any module
    const catchAllNum = analyses.length + 1

    prompt = `You are an expert exam analyst for an aviation training course. Map each exam question to the most relevant course module below.

COURSE MODULES:
${moduleContext}
Module ${catchAllNum}: "General Knowledge" — topics: general aviation knowledge (use this for questions that don't fit any specific module)

EXAM QUESTIONS (${totalQ} total):
${questionList}

Respond in exactly two blocks with no extra text:

SECTIONS:
${analyses.map((a, i) => `${i + 1}. ${(a.analysis as any).module_title}`).join("\n")}
${catchAllNum}. General Knowledge

ASSIGNMENTS:
Q1: [module number]
Q2: [module number]
...
Q${totalQ}: [module number]

Rules:
- Every question from Q1 to Q${totalQ} must appear in ASSIGNMENTS
- Use only the module numbers listed in SECTIONS above
- Pick the module whose topics most closely match the question's subject matter`
  }

  // ── 4. Call Groq ──────────────────────────────────────────────
  let raw = ""
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 2000,
    })
    raw = completion.choices[0]?.message?.content?.trim() ?? ""
  } catch (err: any) {
    const isQuota = err?.status === 429 || err?.status === 413
    return NextResponse.json(
      { error: isQuota ? "AI quota reached — try again shortly" : "AI service unavailable" },
      { status: isQuota ? 429 : 503 }
    )
  }

  // ── 5. Parse the response ─────────────────────────────────────
  const sectionTitles: Record<number, string> = {}
  const sectionsBlock = raw.match(/SECTIONS:\s*([\s\S]*?)(?=ASSIGNMENTS:|$)/i)?.[1] ?? ""
  for (const line of sectionsBlock.split("\n")) {
    const m = line.match(/^(\d+)[.)]\s*(.+)$/)
    if (m) sectionTitles[parseInt(m[1])] = m[2].trim()
  }

  const assignMap: Record<number, number> = {}
  const assignBlock = raw.match(/ASSIGNMENTS:\s*([\s\S]*?)$/i)?.[1] ?? ""
  for (const line of assignBlock.split("\n")) {
    const m = line.match(/^Q(\d+):\s*(\d+)/i)
    if (m) assignMap[parseInt(m[1])] = parseInt(m[2])
  }

  if (Object.keys(sectionTitles).length === 0)
    return NextResponse.json({ error: "AI returned invalid response" }, { status: 500 })

  // Group question IDs by section number
  const sectionGroups: Record<number, string[]> = {}
  const lastSecNum = Math.max(...Object.keys(sectionTitles).map(Number))

  for (let i = 1; i <= totalQ; i++) {
    const sec = assignMap[i] ?? lastSecNum
    const effectiveSec = sectionTitles[sec] ? sec : lastSecNum
    if (!sectionGroups[effectiveSec]) sectionGroups[effectiveSec] = []
    sectionGroups[effectiveSec].push(qIndexMap[`Q${i}`])
  }

  // Build sections — attach module_id when available
  const moduleIdByIndex = new Map(analyses.map((a, i) => [i + 1, a.module_id]))

  const sections = Object.keys(sectionTitles)
    .map(Number)
    .sort((a, b) => a - b)
    .filter(num => (sectionGroups[num]?.length ?? 0) > 0)
    .map((num, idx) => {
      const questionIds = sectionGroups[num] ?? []
      return {
        section_index:  idx,
        title:          sectionTitles[num],
        module_id:      moduleIdByIndex.get(num) ?? null,
        question_ids:   questionIds,
        question_count: questionIds.length,
        percentage:     Math.round((questionIds.length / totalQ) * 100),
      }
    })

  // ── 6. Build and upsert the full analysis ─────────────────────
  const allTopics = analyses.flatMap((a: any) => a.analysis?.topics ?? [])
  const uniqueTopics = [...new Set(allTopics)].slice(0, 12)

  const examAnalysis = {
    module_title: mod.title,
    module_type: "final_exam",
    summary: `Final exam for this course covering ${sections.length} topic area(s) across ${totalQ} question(s). ${analyses.length > 0 ? "Questions are mapped to course modules based on their subject matter." : ""}`.trim(),
    topics: uniqueTopics,
    key_concepts: [],
    skills_assessed: [],
    content_breakdown: { questions: totalQ, sections: sections.length },
    sections,
  }

  const { data: upserted, error: upsertErr } = await db
    .from("lms_module_analysis")
    .upsert(
      {
        course_id:   mod.course_id,
        module_id:   mod.id,
        module_type: "final_exam",
        analysis:    examAnalysis,
        analyzed_at: new Date().toISOString(),
      },
      { onConflict: "module_id" }
    )
    .select()
    .single()

  if (upsertErr)
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json(upserted, { status: 200 })
}
