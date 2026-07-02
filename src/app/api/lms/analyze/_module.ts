import { db } from "@/lib/db"
import Groq from "groq-sdk"

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY_LMS ?? process.env.GROQ_API_KEY ?? "placeholder",
})

interface ModuleAnalysis {
  module_title: string
  module_type: string
  summary: string
  topics: string[]
  key_concepts: string[]
  skills_assessed: string[]
  content_breakdown: Record<string, number>
}

async function analyzePackage(mod: any): Promise<ModuleAnalysis> {
  const { data: pkg } = await db
    .from("lms_packages")
    .select("id, title, lms_package_items(type, title, config, order_index)")
    .eq("module_id", mod.id)
    .single()

  const items: any[] = pkg?.lms_package_items ?? []
  items.sort((a, b) => a.order_index - b.order_index)

  const breakdown: Record<string, number> = {}
  for (const item of items) {
    breakdown[item.type] = (breakdown[item.type] ?? 0) + 1
  }

  const itemSummary = items
    .slice(0, 30)
    .map(it => {
      const base = `[${it.type}] "${it.title}"`
      if (it.type === "quiz" || it.type === "exam") {
        const qs = (it.config?.questions ?? []) as any[]
        const sample = qs.slice(0, 3).map((q: any) => q.text?.slice(0, 80)).filter(Boolean)
        return sample.length ? `${base} — questions: ${sample.join("; ")}` : base
      }
      if (it.type === "text") {
        const text = (it.config?.html ?? "").replace(/<[^>]+>/g, " ").slice(0, 150)
        return text ? `${base} — ${text}` : base
      }
      if (it.type === "activity") {
        const c  = it.config?.content ?? {}
        const at = it.config?.activity_type ?? "activity"
        const cards = Array.isArray(c.cards)     ? c.cards.map((x: any) => x.front).filter(Boolean).join(", ")        : ""
        const rapid = Array.isArray(c.questions) ? c.questions.map((x: any) => x.q ?? x.question).filter(Boolean).join("; ") : ""
        const gist  = [c.question, c.statement, c.situation, c.paragraph, c.sentence, c.text, c.acronym, c.word, cards, rapid]
          .find((v: any) => typeof v === "string" && v.trim().length > 0)
        return gist
          ? `${base} (${at}) — ${String(gist).replace(/<[^>]+>/g, " ").slice(0, 140)}`
          : `${base} (${at})`
      }
      return base
    })
    .join("\n")

  const prompt = `You are an aviation training curriculum analyst. Below is a list of content items from a training package module titled "${mod.title}".

Content items:
${itemSummary || "(no items)"}

Based on these items, produce a structured analysis of this module. Respond ONLY with a JSON object — no markdown, no explanation:

{
  "summary": "2-3 sentence description of what this module teaches",
  "topics": ["topic 1", "topic 2", ...],
  "key_concepts": ["concept 1", "concept 2", ...],
  "skills_assessed": ["skill 1", ...]
}

- topics: 3-8 specific subject areas covered (e.g. "Ramp Safety", "Aircraft Pushback Procedures")
- key_concepts: 4-12 specific terms, regulations, or procedures a student learns
- skills_assessed: knowledge or skills tested by the quizzes or interactive activities in this package (empty array if none)`

  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 600,
    })
    const raw = res.choices[0]?.message?.content?.trim() ?? "{}"
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : {}
    return {
      module_title: mod.title,
      module_type: "package",
      summary: parsed.summary ?? `Training package covering ${mod.title}`,
      topics: parsed.topics ?? [],
      key_concepts: parsed.key_concepts ?? [],
      skills_assessed: parsed.skills_assessed ?? [],
      content_breakdown: breakdown,
    }
  } catch {
    return {
      module_title: mod.title,
      module_type: "package",
      summary: `Training package: ${mod.title}`,
      topics: [mod.title],
      key_concepts: [],
      skills_assessed: [],
      content_breakdown: breakdown,
    }
  }
}

async function analyzeAssignment(mod: any): Promise<ModuleAnalysis> {
  const brief = (mod.assignment_brief_html ?? "").replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 800)
  const rubric = mod.assignment_rubric
  const rubricText = rubric ? JSON.stringify(rubric).slice(0, 400) : ""

  const prompt = `You are an aviation training curriculum analyst. Below is an assignment module from a course.

Title: "${mod.title}"
${mod.description ? `Description: ${mod.description.slice(0, 200)}` : ""}
${brief ? `Brief: ${brief}` : ""}
${rubricText ? `Rubric: ${rubricText}` : ""}

Produce a structured analysis of this assignment. Respond ONLY with a JSON object:

{
  "summary": "2-3 sentence description of what this assignment requires and what it tests",
  "topics": ["topic 1", "topic 2", ...],
  "key_concepts": ["concept 1", ...],
  "skills_assessed": ["skill 1", ...]
}`

  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 400,
    })
    const raw = res.choices[0]?.message?.content?.trim() ?? "{}"
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : {}
    return {
      module_title: mod.title,
      module_type: "assignment",
      summary: parsed.summary ?? `Assignment: ${mod.title}`,
      topics: parsed.topics ?? [],
      key_concepts: parsed.key_concepts ?? [],
      skills_assessed: parsed.skills_assessed ?? [],
      content_breakdown: { assignment: 1 },
    }
  } catch {
    return {
      module_title: mod.title,
      module_type: "assignment",
      summary: `Assignment: ${mod.title}`,
      topics: [mod.title],
      key_concepts: [],
      skills_assessed: [],
      content_breakdown: { assignment: 1 },
    }
  }
}

async function analyzeLiveSession(mod: any): Promise<ModuleAnalysis> {
  const { data: sessions } = await db
    .from("lms_sessions")
    .select("title, agenda, topics_covered, instructor_notes, session_date, duration_minutes, closed_at")
    .eq("module_id", mod.id)
    .order("session_date", { ascending: true })

  const sessionList = (sessions ?? []) as any[]

  if (!sessionList.length) {
    return {
      module_title: mod.title,
      module_type: "live_session",
      summary: `Live session module: ${mod.title}. No sessions scheduled yet.`,
      topics: [mod.title],
      key_concepts: [],
      skills_assessed: [],
      content_breakdown: { sessions: 0, completed: 0 },
    }
  }

  const totalSessions = sessionList.length
  const completed = sessionList.filter(s => s.closed_at !== null).length
  const hasContent = sessionList.some(s => s.agenda || s.topics_covered)

  const sessionDetails = sessionList.map((s, i) => {
    const parts = [`Session ${i + 1}: "${s.title}"`]
    if (s.agenda)           parts.push(`  Agenda: ${s.agenda.slice(0, 200)}`)
    if (s.topics_covered)   parts.push(`  Topics covered: ${s.topics_covered.slice(0, 300)}`)
    if (s.instructor_notes) parts.push(`  Instructor notes: ${s.instructor_notes.slice(0, 200)}`)
    return parts.join("\n")
  }).join("\n\n")

  const prompt = `You are an aviation training curriculum analyst. Below is a live instruction module titled "${mod.title}" with ${totalSessions} session(s) (${completed} completed).

${sessionDetails}

Produce a structured analysis. Respond ONLY with a JSON object:

{
  "summary": "2-3 sentence description of what this live module teaches",
  "topics": ["topic 1", ...],
  "key_concepts": ["concept 1", ...],
  "skills_assessed": []
}
${!hasContent ? "Note: sessions have no content logged yet — infer from session titles and module name only." : ""}`

  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 400,
    })
    const raw = res.choices[0]?.message?.content?.trim() ?? "{}"
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : {}
    return {
      module_title: mod.title,
      module_type: "live_session",
      summary: parsed.summary ?? `Live session module: ${mod.title}`,
      topics: parsed.topics ?? [],
      key_concepts: parsed.key_concepts ?? [],
      skills_assessed: [],
      content_breakdown: { sessions: totalSessions, completed },
    }
  } catch {
    return {
      module_title: mod.title,
      module_type: "live_session",
      summary: `Live session module: ${mod.title} — ${totalSessions} session(s)`,
      topics: [mod.title],
      key_concepts: [],
      skills_assessed: [],
      content_breakdown: { sessions: totalSessions, completed },
    }
  }
}

// ── Public: run analysis for a non-exam module and upsert result ──
export async function runModuleAnalysis(module_id: string): Promise<{ ok: boolean; error?: string }> {
  const { data: mod, error: modErr } = await db
    .from("lms_modules")
    .select("id, title, description, module_type, course_id, assignment_brief_html, assignment_rubric")
    .eq("id", module_id)
    .single()

  if (modErr || !mod) return { ok: false, error: "Module not found" }
  if (mod.module_type === "final_exam") return { ok: false, error: "Use runExamAnalysis for exam modules" }

  let analysis: ModuleAnalysis
  switch (mod.module_type) {
    case "package":      analysis = await analyzePackage(mod);    break
    case "assignment":   analysis = await analyzeAssignment(mod); break
    case "live_session": analysis = await analyzeLiveSession(mod); break
    default:
      analysis = {
        module_title: mod.title,
        module_type: mod.module_type ?? "unknown",
        summary: mod.description ?? `Module: ${mod.title}`,
        topics: [mod.title],
        key_concepts: [],
        skills_assessed: [],
        content_breakdown: {},
      }
  }

  const { error: upsertErr } = await db
    .from("lms_module_analysis")
    .upsert(
      {
        course_id:   mod.course_id,
        module_id:   mod.id,
        module_type: mod.module_type ?? "unknown",
        analysis,
        analyzed_at: new Date().toISOString(),
      },
      { onConflict: "module_id" }
    )

  if (upsertErr) return { ok: false, error: upsertErr.message }
  return { ok: true }
}
