// Course-level consistency pass — runs ONCE, after every slide has been
// generated, and looks ACROSS the whole course. Per-slide QA (vision + fact
// check) cannot see this class of defect by construction: a slide judged in
// isolation has no way to know that Module 2 already defined the same term
// differently, or that Module 7 states a different retention period for the
// same requirement Module 2 covered, or that two modules generated an almost
// identical slide because their outline topics overlapped.
//
// Deliberately a report, not an auto-fix loop. Per-slide QA can safely
// regenerate one slide against isolated feedback; resolving a cross-module
// contradiction means picking which of two modules is wrong, which is a
// judgment call — this surfaces it for a human reviewer instead of guessing.

import { db } from "@/lib/db"
import { MODELS, claudeJSON } from "../ai"
import { collectSlideText } from "./factCheck"
import type { CanvasElement } from "../primitives"

export interface ConsistencyIssue {
  kind: "contradiction" | "terminology" | "duplication"
  severity: "minor" | "major"
  slides: { module: number; slide: number }[]
  detail: string
}

export interface ConsistencyReport {
  checked: boolean
  slide_count: number
  truncated: boolean
  issues: ConsistencyIssue[]
  checked_at: string
}

/** Keeps the prompt inside a comfortable context window for very large courses. */
const MAX_PROMPT_CHARS = 70_000
/** Per-slide text budget — enough to carry a claim, not a transcript. */
const CHARS_PER_SLIDE = 220

export async function handleConsistencyJob(job: any): Promise<ConsistencyReport> {
  const courseId = job.course_id
  const now = new Date().toISOString()

  const { data: modules } = await db
    .from("cg_modules").select("id, order_index, title").eq("course_id", courseId).order("order_index")
  if (!modules || modules.length === 0) {
    return { checked: false, slide_count: 0, truncated: false, issues: [], checked_at: now }
  }

  const moduleIds = modules.map(m => m.id)
  const { data: pages } = await db
    .from("cg_pages")
    .select("module_id, order_index, source_content, elements")
    .in("module_id", moduleIds)
    .order("order_index")

  if (!pages || pages.length < 2) {
    return { checked: true, slide_count: pages?.length ?? 0, truncated: false, issues: [], checked_at: now }
  }

  const moduleIndex = new Map(modules.map((m, i) => [m.id, i + 1]))
  const moduleTitle = new Map(modules.map(m => [m.id, m.title]))

  type Row = { module: number; moduleTitle: string; slide: number; title: string; text: string }
  const rows: Row[] = pages.map(p => {
    const title = (p.source_content as any)?.title ?? "(untitled)"
    const text = collectSlideText((p.elements as CanvasElement[]) ?? []).join(" ").slice(0, CHARS_PER_SLIDE)
    return {
      module: moduleIndex.get(p.module_id) ?? 0,
      moduleTitle: moduleTitle.get(p.module_id) ?? "",
      slide: p.order_index + 1,
      title,
      text,
    }
  })

  // Build the listing under a hard character budget — for a genuinely huge
  // course this covers the earlier modules only, which is disclosed via
  // `truncated` rather than silently dropped.
  let truncated = false
  const lines: string[] = []
  let used = 0
  for (const r of rows) {
    const line = `M${r.module}.S${r.slide} [${r.moduleTitle}] "${r.title}": ${r.text}`
    if (used + line.length > MAX_PROMPT_CHARS) { truncated = true; break }
    lines.push(line)
    used += line.length
  }

  const result = await claudeJSON({
    model: MODELS.qa_fact,
    maxTokens: 3000,
    temperature: 0,
    prompt: `You are the consistency reviewer for a multi-module ICS Aviation training course. Below is every slide's title and a short excerpt of its text, one line per slide, tagged "M<module>.S<slide>".

${lines.join("\n")}

Find problems that only show up when comparing slides ACROSS the course — not issues visible on a single slide in isolation:

1. contradiction — two or more slides state a DIFFERENT specific fact about the same requirement, threshold, duration, frequency, or responsible party (e.g. one module says records are kept 5 years, another says 3, for what reads as the same requirement). This is the serious one.
2. terminology — the same concept is named or abbreviated inconsistently across modules in a way that would confuse a learner (not a single synonym used once — a pattern).
3. duplication — two slides in DIFFERENT modules cover essentially the same content, suggesting redundant generation rather than deliberate reinforcement/recap.

Ignore: deliberate recap/review slides that restate an earlier point (normal in training), stylistic differences, and single-word phrasing variety.

Return ONLY:
{
  "issues": [{ "kind": "contradiction|terminology|duplication", "severity": "minor|major", "slides": [{"module": 2, "slide": 5}, {"module": 7, "slide": 3}], "detail": "what's inconsistent and what each side says" }]
}
Only report what the excerpts actually show — do not speculate about content you cannot see.`,
  })

  const issues: ConsistencyIssue[] = Array.isArray(result?.issues) ? result.issues : []

  const report: ConsistencyReport = {
    checked: true,
    slide_count: pages.length,
    truncated,
    issues,
    checked_at: now,
  }

  await db.from("cg_courses").update({
    consistency_report: report,
    consistency_checked_at: now,
  }).eq("id", courseId)

  return report
}
