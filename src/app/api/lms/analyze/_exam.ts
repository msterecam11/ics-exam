import { db } from "@/lib/db"
import Groq from "groq-sdk"

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY_LMS ?? process.env.GROQ_API_KEY ?? "placeholder",
})

// ── Public: run analysis for a final_exam module and upsert result ─
export async function runExamAnalysis(module_id: string): Promise<{ ok: boolean; error?: string }> {
  const { data: mod, error: modErr } = await db
    .from("lms_modules")
    .select("id, title, description, module_type, course_id, questions")
    .eq("id", module_id)
    .single()

  if (modErr || !mod) return { ok: false, error: "Module not found" }
  if (mod.module_type !== "final_exam") return { ok: false, error: "Module is not a final_exam" }

  const questions: any[] = mod.questions ?? []
  if (!questions.length) return { ok: false, error: "No questions in exam module" }

  // Load Phase 3 analyses for this course (excluding this exam)
  const { data: moduleAnalyses } = await db
    .from("lms_module_analysis")
    .select("module_id, module_type, analysis")
    .eq("course_id", mod.course_id)
    .neq("module_id", module_id)

  const analyses = (moduleAnalyses ?? []) as any[]
  const totalQ = questions.length

  const qIndexMap: Record<string, string> = {}
  questions.forEach((q, i) => { qIndexMap[`Q${i + 1}`] = q.id })

  const questionList = questions
    .map((q, i) => `Q${i + 1}: ${(q.text ?? "").slice(0, 120)}`)
    .join("\n")

  let prompt: string
  if (analyses.length === 0) {
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
    const moduleContext = analyses
      .map((a, i) => {
        const analysis = a.analysis as any
        const topics = (analysis.topics ?? []).slice(0, 6).join(", ")
        return `Module ${i + 1}: "${analysis.module_title}" — topics: ${topics || "general"}`
      })
      .join("\n")

    const catchAllNum = analyses.length + 1

    // Section titles are already known from Phase 3 — only ask for the Q→module mapping.
    // Asking for SECTIONS in the response caused the model to skip the header and mix blocks.
    prompt = `You are an expert exam analyst for an aviation training course.
Map each exam question to the number of the most relevant course module.

COURSE MODULES:
${moduleContext}
Module ${catchAllNum}: "General Knowledge" — use for questions that don't fit any specific module

EXAM QUESTIONS (${totalQ} total):
${questionList}

Respond with ONLY the question assignments — no headers, no explanations, nothing else:
Q1: [module number]
Q2: [module number]
...
Q${totalQ}: [module number]

Rules:
- Every question from Q1 to Q${totalQ} must appear exactly once
- Use only module numbers 1–${catchAllNum}
- Pick the module whose topics best match the question`
  }

  let raw = ""
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 2000,
    })
    raw = completion.choices[0]?.message?.content?.trim() ?? ""
    console.log("[exam-analysis] Groq raw (first 300):", raw.slice(0, 300))
  } catch (err: any) {
    console.error("[exam-analysis] Groq error:", err?.message, "status:", err?.status)
    return { ok: false, error: err?.message ?? "Groq error" }
  }

  // Build sectionTitles: from Phase 3 analyses when available, else parse from Groq output
  const sectionTitles: Record<number, string> = {}

  if (analyses.length > 0) {
    // Section titles are already known — fill from Phase 3 data
    analyses.forEach((a, i) => {
      sectionTitles[i + 1] = (a.analysis as any).module_title ?? `Module ${i + 1}`
    })
    sectionTitles[analyses.length + 1] = "General Knowledge"
  } else {
    // No Phase 3 data — parse sections from Groq's SECTIONS block
    const sectionsBlock = raw.match(/SECTIONS:\s*([\s\S]*?)(?=ASSIGNMENTS:|$)/i)?.[1] ?? ""
    for (const line of sectionsBlock.split("\n")) {
      const m = line.match(/^(\d+)[.)]\s*(.+)$/)
      if (m) sectionTitles[parseInt(m[1])] = m[2].trim()
    }
  }

  console.log("[exam-analysis] sectionTitles count:", Object.keys(sectionTitles).length)
  if (Object.keys(sectionTitles).length === 0) return { ok: false, error: `AI invalid response — raw: ${raw.slice(0, 200)}` }

  // Parse Q→module assignments (works for both prompt formats)
  const assignMap: Record<number, number> = {}
  for (const line of raw.split("\n")) {
    const m = line.match(/^Q(\d+):\s*(\d+)/i)
    if (m) assignMap[parseInt(m[1])] = parseInt(m[2])
  }

  const sectionGroups: Record<number, string[]> = {}
  const lastSecNum = Math.max(...Object.keys(sectionTitles).map(Number))

  for (let i = 1; i <= totalQ; i++) {
    const sec = assignMap[i] ?? lastSecNum
    const effectiveSec = sectionTitles[sec] ? sec : lastSecNum
    if (!sectionGroups[effectiveSec]) sectionGroups[effectiveSec] = []
    sectionGroups[effectiveSec].push(qIndexMap[`Q${i}`])
  }

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

  // ── Phase 5: map each question to a TOPIC within its module (for the report's ──
  //    topic heatmap). Additive + best-effort: any failure just leaves a question
  //    untagged, and the whole analysis still succeeds. General for any course —
  //    it reads each module's own AI-derived topic list, however many there are.
  const qTextById = new Map<string, string>(questions.map((q: any) => [q.id, String(q.text ?? "")]))
  const topicsByModuleId = new Map<string, string[]>(
    analyses.map((a: any) => [a.module_id, Array.isArray(a.analysis?.topics) ? a.analysis.topics : []])
  )
  const questionTopics: Record<string, string> = {}

  for (const sec of sections) {
    const topics = sec.module_id ? (topicsByModuleId.get(sec.module_id) ?? []) : []
    if (topics.length === 0 || sec.question_ids.length === 0) continue

    // Single topic → every question in this section belongs to it (no AI needed).
    if (topics.length === 1) {
      for (const qid of sec.question_ids) questionTopics[qid] = topics[0]
      continue
    }

    const topicList = topics.map((t, i) => `${i + 1}. ${t}`).join("\n")
    const qList = sec.question_ids
      .map((qid: string, i: number) => `Q${i + 1}: ${(qTextById.get(qid) ?? "").replace(/\s+/g, " ").slice(0, 130)}`)
      .join("\n")

    const topicPrompt = `You are mapping exam questions to the sub-topic they test, within one course module.

TOPICS (of this module):
${topicList}

QUESTIONS:
${qList}

Respond with ONLY the assignments — one line per question, nothing else:
Q1: [topic number]
Q2: [topic number]
...
Rules:
- Every question from Q1 to Q${sec.question_ids.length} must appear exactly once
- Use only topic numbers 1–${topics.length}
- Pick the single topic each question best tests`

    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: topicPrompt }],
        temperature: 0.1,
        max_tokens: 800,
      })
      const raw = completion.choices[0]?.message?.content ?? ""
      for (const line of raw.split("\n")) {
        const m = line.match(/^Q(\d+):\s*(\d+)/i)
        if (!m) continue
        const localIdx = parseInt(m[1]) - 1
        const topic = topics[parseInt(m[2]) - 1]
        const qid = sec.question_ids[localIdx]
        if (qid && topic) questionTopics[qid] = topic
      }
    } catch (err: any) {
      console.error("[exam-analysis] topic mapping failed for section:", sec.title, err?.message)
      // leave this section's questions untagged — report falls back to module level
    }
  }

  const allTopics = analyses.flatMap((a: any) => a.analysis?.topics ?? [])
  const uniqueTopics = [...new Set(allTopics)].slice(0, 12)

  const examAnalysis = {
    module_title: mod.title,
    module_type: "final_exam",
    summary: `Final exam covering ${sections.length} topic area(s) across ${totalQ} question(s).${analyses.length > 0 ? " Questions mapped to course modules." : ""}`,
    topics: uniqueTopics,
    key_concepts: [],
    skills_assessed: [],
    content_breakdown: { questions: totalQ, sections: sections.length },
    sections,
    question_topics: questionTopics,
  }

  const { error: upsertErr } = await db
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

  if (upsertErr) return { ok: false, error: upsertErr.message }
  return { ok: true }
}
