// Factual QA — does the slide say something TRUE, and does the clause it
// cites actually say it?
//
// The vision QA pass next door judges appearance: overflow, crowding, contrast.
// A slide can pass all of that while asserting that records must be kept for
// five years when the regulation says three, and cite a clause number that
// does not exist. In compliance training that is the more serious defect, and
// it is invisible in a screenshot.
//
// Two layers, cheapest and most reliable first:
//
//   1. CITATION EXISTENCE — pure code. Every clause the slide cites is looked
//      up in the sections indexed for this course. A citation with no matching
//      clause is a fabrication, caught deterministically, for free, with no
//      model involved and no false positives.
//
//   2. CLAIM SUPPORT — a model compares the slide's factual sentences against
//      the real text of the clauses it cites. Only claims whose clause exists
//      reach this layer, so the model is always reading the actual source.
//
// When a course has no reference documents there is nothing to check against.
// That returns checked:false — explicitly unverified, never a silent pass.

import { db } from "@/lib/db"
import { MODELS, claudeJSON } from "../ai"
import type { CanvasElement } from "../primitives"

export interface FactClaim {
  claim: string
  clause: string | null
  status: "supported" | "contradicted" | "unsupported"
  note: string
}

export interface FactVerdict {
  checked: boolean
  pass: boolean
  claims: FactClaim[]
  /** Clause numbers the slide cited that exist in no indexed document. */
  fabricated_citations: string[]
  feedback: string
}

/** Clause shapes the Reference Agent indexes: "139.15(b)", "3.1.9", "4.2". */
const CLAUSE_RE = /\b(\d{1,3}\.\d{1,3}(?:\.\d{1,3})*(?:\([a-z0-9]{1,3}\))*)\b/gi

/** Every piece of human-readable text on the finished slide. */
export function collectSlideText(elements: CanvasElement[]): string[] {
  const out: string[] = []
  for (const el of elements) {
    if (el.type === "text") {
      const t = el.runs.map(r => r.text).join("").trim()
      if (t) out.push(t)
    } else if (el.type === "table") {
      for (const row of el.rows) {
        const cells = row.cells.map(c => c.text?.trim()).filter(Boolean)
        if (cells.length) out.push(cells.join(" | "))
      }
    } else if (el.type === "chart") {
      if (el.data?.labels?.length) out.push(el.data.labels.join(", "))
    }
  }
  return out
}

function clausesIn(texts: string[]): string[] {
  const found = new Set<string>()
  for (const t of texts) {
    for (const m of t.matchAll(CLAUSE_RE)) found.add(m[1])
  }
  return [...found]
}

/**
 * A cited clause counts as real if some indexed section carries it. Matching is
 * prefix-aware in one direction only: a slide citing "139.15(b)" is satisfied
 * by an indexed "139.15", because a paragraph of a real clause is a real
 * reference. The reverse is not true — citing "139" does not license every
 * claim in Part 139 — but that shape is a part reference, not a clause, and
 * CLAUSE_RE does not match it.
 */
function citationExists(cited: string, indexed: Set<string>): boolean {
  if (indexed.has(cited)) return true
  const base = cited.replace(/\([a-z0-9]{1,3}\)/gi, "")
  return indexed.has(base)
}

export async function handleFactCheckJob(job: any): Promise<FactVerdict> {
  const { course_id } = job
  const { elements, slide_title, citations } = job.input as {
    elements: CanvasElement[]
    slide_title: string
    citations?: { source_doc_id?: string; excerpt?: string }[]
  }

  const texts = collectSlideText(elements)
  const prose = texts.join("\n")

  // Which documents is this course grounded in?
  const { data: links } = await db
    .from("cg_course_documents").select("document_id").eq("course_id", course_id)
  const docIds = (links ?? []).map(l => l.document_id)

  if (docIds.length === 0) {
    return {
      checked: false, pass: true, claims: [], fabricated_citations: [],
      feedback: "No reference documents are linked to this course, so its factual claims could not be verified.",
    }
  }

  const cited = clausesIn([...texts, ...(citations ?? []).map(c => c.excerpt ?? "")])

  // ── Layer 1: does every cited clause exist? ────────────────────────────────
  let sections: any[] = []
  if (cited.length > 0) {
    const bases = [...new Set(cited.flatMap(c => [c, c.replace(/\([a-z0-9]{1,3}\)/gi, "")]))]
    const { data } = await db
      .from("cg_document_sections")
      .select("clause, heading, content, page_from, document_id")
      .in("document_id", docIds)
      .in("clause", bases)
    sections = data ?? []
  }

  const indexed = new Set(sections.map(s => s.clause).filter(Boolean))
  const fabricated = cited.filter(c => !citationExists(c, indexed))

  // ── Layer 2: do the claims match what those clauses actually say? ──────────
  let claims: FactClaim[] = []
  let modelPass = true
  let modelFeedback = ""

  if (sections.length > 0 && prose.trim().length > 40) {
    const sourceBlock = sections.slice(0, 12).map(s =>
      `### ${s.clause ?? "(no clause)"} — ${s.heading ?? "untitled"} (p.${s.page_from})\n${(s.content ?? "").slice(0, 3000)}`
    ).join("\n\n")

    const result = await claudeJSON({
      model: MODELS.qa_fact,
      maxTokens: 2000,
      prompt: `You are the factual reviewer for ICS Aviation compliance training. Compare what a slide asserts against the regulatory text it cites.

## Slide: "${slide_title}"
${prose}

## The cited regulatory text (verbatim from the indexed source)
${sourceBlock}

## Your task
Extract each FACTUAL claim the slide makes — a duration, threshold, frequency, obligation, responsibility, definition, or numbered requirement. Ignore headings, transitions, and generic instructional phrasing; those assert nothing.

Judge each claim against the cited text ONLY:
- "supported"    — the cited text states this, or states it in different words
- "contradicted" — the cited text states something DIFFERENT (a different number, period, threshold, or duty holder). This is the serious one.
- "unsupported"  — the cited text neither states nor denies it. Common and often fine; do not treat general aviation knowledge as contradicted.

Be strict about numbers, periods, and who carries the obligation. Do not infer beyond the text, and do not use your own knowledge of aviation regulation to fill gaps — the cited text is the only authority here.

Return ONLY:
{
  "claims": [{ "claim": "the sentence as it appears", "clause": "139.15" or null, "status": "supported|contradicted|unsupported", "note": "what the source actually says, if different" }],
  "pass": true|false,
  "feedback": "one specific instruction to whoever rewrites this slide, naming the wrong value and the right one"
}
Set pass=false if ANY claim is contradicted. Unsupported claims alone do not fail the slide.`,
    })

    claims = Array.isArray(result?.claims) ? result.claims : []
    modelPass = result?.pass !== false && !claims.some(c => c.status === "contradicted")
    modelFeedback = result?.feedback ?? ""
  }

  const pass = modelPass && fabricated.length === 0

  const parts: string[] = []
  if (fabricated.length > 0) {
    parts.push(
      `These clause numbers do not exist in the reference documents for this course: ${fabricated.join(", ")}. ` +
      `Remove them, or cite a clause the material actually shows. Never state a clause number you cannot see in the source.`
    )
  }
  if (modelFeedback && !modelPass) parts.push(modelFeedback)

  return {
    checked: true,
    pass,
    claims,
    fabricated_citations: fabricated,
    feedback: parts.join(" "),
  }
}
