// Outline job — the Content Agent's first pass. Produces the module +
// slide-by-slide plan for human review; NOTHING else generates until the
// user approves it (the outline-review gate).

import { db } from "@/lib/db"
import { MODELS, claudeJSON } from "../ai"
import { retrieveForCourse, formatSections } from "../retrieval"

const LAYOUT_KINDS = [
  "cover", "section_divider", "content_white", "content_lightblue",
  "summary_dark", "self_assessment", "closing_cta",
] as const

export interface OutlineSlide {
  title: string
  layout_kind: (typeof LAYOUT_KINDS)[number]
  intent: string
  key_points: string[]
  /** Verbatim required-coverage points from the brief that this slide
   *  delivers — this is what makes coverage checkable rather than assumed. */
  covers?: string[]
}
export interface OutlineModule {
  module_number: number
  title: string
  is_module_zero: boolean
  day_number: number | null
  slides: OutlineSlide[]
}
export interface OutlineOutput { modules: OutlineModule[] }

const MAX_REF_CHARS = 24_000 // stay well inside context while grounding

export async function handleOutlineJob(job: any): Promise<OutlineOutput> {
  const courseId = job.course_id
  const adjustments: string | undefined = job.input?.adjustments
  const previousOutline: OutlineOutput | undefined = job.input?.previous_outline

  const { data: course } = await db.from("cg_courses").select("*").eq("id", courseId).single()
  if (!course) throw new Error("Course not found")

  const { data: refs } = await db
    .from("cg_reference_materials")
    .select("file_name, extracted_text")
    .eq("course_id", courseId)

  // Legacy per-course uploads (pre-library) are still honoured, budgeted.
  const readable = (refs ?? []).filter(r => r.extracted_text)
  const perRef = readable.length ? Math.floor(MAX_REF_CHARS / readable.length) : 0
  const legacyBlock = readable
    .map(r => `### ${r.file_name}\n${(r.extracted_text as string).slice(0, perRef)}`)
    .join("\n\n")

  const gi = course.generation_input ?? {}
  const briefModules: { title: string; slide_count: number; coverage?: string }[] = gi.modules ?? []
  const moduleLines = briefModules
    .map((m, i) => {
      const head = `  Module ${i + 1}: "${m.title}" — target ~${m.slide_count} slides`
      if (!m.coverage?.trim()) return head
      // The designer's syllabus is passed through verbatim, structure and
      // reference markers intact, so the agent can echo lines back exactly.
      const body = m.coverage.trim().split(/\r?\n/).map(l => `      ${l.trim()}`).join("\n")
      return `${head}\n    REQUIRED COVERAGE (every point below must appear in this module):\n${body}`
    })
    .join("\n")

  const hasCoverage = briefModules.some(m => m.coverage?.trim())

  // Library retrieval: pull the clauses that actually relate to this course
  // rather than the opening pages of every attached document.
  const retrieved = await retrieveForCourse({
    courseId,
    query: [course.title, course.overview, course.regulatory_framework,
            ...briefModules.map(m => `${m.title} ${m.coverage ?? ""}`)].filter(Boolean).join(" "),
    limit: 14,
    maxChars: MAX_REF_CHARS,
  })
  const refBlock = [formatSections(retrieved), legacyBlock].filter(Boolean).join("\n\n")

  const assessment = course.include_assessment
  const grammar = [
    `- Module 0 ("Front Matter") is auto-generated FIRST: cover slide, then 2-4 content_white slides covering course overview & objectives, agenda (derived from the module breakdown), prerequisites, and how the course is delivered/assessed.`,
    `- EVERY numbered module follows this exact grammar, in order:`,
    `    1. cover  (module cover)`,
    `    2. section_divider  (module number + title)`,
    `    3. content_white / content_lightblue slides  (the substance — vary intents)`,
    `    4. summary_dark  ("Summary and Key Takeaways")`,
    assessment ? `    5. self_assessment  ("Self-Assessment" review questions${briefModules.length > 1 ? " + preview of next module where applicable" : ""})` : null,
    `- ONLY the FINAL module additionally ends with one closing_cta slide (feedback/QR).`,
  ].filter(Boolean).join("\n")

  const prompt = `You are the Content Agent of ICS Aviation's course generator. Draft a slide-by-slide outline for a professional aviation training course. This outline goes to a human instructional designer for review BEFORE any slides are generated — clarity and sensible structure matter more than prose.

## Course brief
Title: ${course.title}
Overview: ${course.overview ?? "—"}
Target audience: ${course.target_audience ?? "—"}
Objectives: ${JSON.stringify(course.objectives ?? [])}
Regulatory framework: ${course.regulatory_framework ?? "none specified"}
Tone: ${course.tone ?? "corporate/formal"}
Duration: ${course.day_count ?? "?"} days
Language: ${course.language}
Prerequisites: ${course.prerequisites ?? "—"}

## Requested module breakdown (from the designer)
${moduleLines || "  (none given — propose a sensible breakdown for the duration)"}

## Module grammar (MANDATORY)
${grammar}

${refBlock ? `## Reference material excerpts (ground the outline in these — use their actual topics, terminology, and regulatory references)\n${refBlock}\n` : ""}
${previousOutline ? `## Previous outline (being revised)\n${JSON.stringify(previousOutline)}\n` : ""}
${adjustments ? `## Designer's requested adjustments (apply these precisely)\n${adjustments}\n` : ""}

${hasCoverage ? `## Required coverage — this is a contract
Some modules list REQUIRED COVERAGE. Every one of those points must be delivered by at least one slide in that module. For each slide, list in "covers" the exact coverage lines (copied verbatim, including any [MR..] reference markers) that the slide delivers. A point may span several slides, and one slide may cover several points — but nothing may be dropped. If a module's coverage needs more slides than its target, exceed the target rather than omitting content, and keep reference markers intact in the slide content later.

` : ""}## Slide intents
For each content slide choose an intent that describes its content shape: "comparison", "numbered-process", "categorized-sections", "definition-list", "bullets-with-figure", "table", "chart", "timeline", "case-study", "regulation-breakdown", or similar. Vary intents — a module of 15 identical bullet slides is a failure.

## Output
Return ONLY valid JSON (no markdown fences):
{
  "modules": [
    {
      "module_number": 0,
      "title": "Front Matter",
      "is_module_zero": true,
      "day_number": null,
      "slides": [
        { "title": "...", "layout_kind": "cover", "intent": "module-cover", "key_points": [] },
        { "title": "...", "layout_kind": "content_white", "intent": "bullets-with-figure", "key_points": ["...", "..."], "covers": ["exact required-coverage line this slide delivers"] }
      ]
    },
    { "module_number": 1, "title": "...", "is_module_zero": false, "day_number": 1, "slides": [ ... ] }
  ]
}
layout_kind must be one of: ${LAYOUT_KINDS.join(", ")}. key_points are 2-5 short phrases naming what the slide will actually cover (used later to write the full slide). "covers" is only for modules that listed required coverage — copy those lines verbatim.`

  const result = await claudeJSON({
    model: MODELS.outline,
    prompt,
    maxTokens: 16_000,
    temperature: 0.4,
  })

  // Validate shape + coerce basics so downstream never sees garbage.
  if (!Array.isArray(result?.modules) || result.modules.length === 0)
    throw new Error("Outline came back without modules")
  for (const m of result.modules) {
    if (!Array.isArray(m.slides) || m.slides.length === 0)
      throw new Error(`Module "${m.title}" has no slides`)
    for (const s of m.slides) {
      if (!LAYOUT_KINDS.includes(s.layout_kind)) s.layout_kind = "content_white"
      if (!Array.isArray(s.key_points)) s.key_points = []
      if (!Array.isArray(s.covers)) s.covers = []
    }
  }

  return result as OutlineOutput
}
