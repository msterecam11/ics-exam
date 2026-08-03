// Retrieval over the scanned reference library.
//
// This replaces the old approach of pasting the first ~24,000 characters of
// every document into the prompt, which meant a 300-page regulation was
// effectively truncated to its first few pages. Now the whole document is
// indexed and we fetch the sections that actually relate to what the slide
// or module is about.
//
// Deliberately Postgres full-text + topic overlap rather than embeddings:
// no new infrastructure, no per-query model cost, and regulatory language is
// keyword-dense enough that lexical matching does well. The callers here
// wouldn't change if we later swap in pgvector.

import { db } from "@/lib/db"

export interface RetrievedSection {
  document: string
  clause: string | null
  heading: string | null
  page_from: number
  content: string
  requirement: boolean
}

/** Words too generic to be worth searching on in an aviation corpus. */
const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "their", "your",
  "introduction", "overview", "fundamentals", "management", "systems", "system",
  "procedures", "measures", "aviation", "operations", "training", "module",
])

function keywords(text: string): string[] {
  const words = text.toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")           // bracketed client reference codes
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP.has(w))
  return [...new Set(words)]
}

/** Clause references written in the brief, e.g. "139.15" or "3.1.9". */
function clauseRefs(text: string): string[] {
  return [...new Set((text.match(/\b\d{1,3}(?:\.\d{1,3}){1,3}\b/g) ?? []))]
}

export async function retrieveForCourse(opts: {
  courseId: string
  /** What we're looking for — module coverage, slide title, key points. */
  query: string
  limit?: number
  maxChars?: number
}): Promise<RetrievedSection[]> {
  const limit = opts.limit ?? 12
  const maxChars = opts.maxChars ?? 14_000

  const { data: links } = await db
    .from("cg_course_documents")
    .select("document_id, cg_documents(id, title, doc_reference, scan_status)")
    .eq("course_id", opts.courseId)

  const docs = (links ?? [])
    .map((l: any) => l.cg_documents)
    .filter((d: any) => d && d.scan_status === "ready")
  if (docs.length === 0) return []

  const docIds = docs.map((d: any) => d.id)
  const nameById = new Map(docs.map((d: any) => [d.id, d.doc_reference || d.title]))

  const terms = keywords(opts.query)
  const refs = clauseRefs(opts.query)
  const scored = new Map<string, { row: any; score: number }>()

  // 1. Exact clause hits — if the brief names 139.15, that clause wins.
  if (refs.length) {
    const { data } = await db
      .from("cg_document_sections")
      .select("document_id, clause, heading, page_from, content, requirement, summary, topics")
      .in("document_id", docIds)
      .in("clause", refs)
      .limit(limit)
    for (const r of data ?? []) scored.set(rowKey(r), { row: r, score: 1000 })
  }

  // 2. Topic-array overlap — cheap, uses the GIN index on labels.
  if (terms.length) {
    const { data } = await db
      .from("cg_document_sections")
      .select("document_id, clause, heading, page_from, content, requirement, summary, topics")
      .in("document_id", docIds)
      .overlaps("topics", terms.slice(0, 20))
      .limit(limit * 3)
    for (const r of data ?? []) {
      const overlap = (r.topics ?? []).filter((t: string) => terms.includes(t.toLowerCase())).length
      bump(scored, r, 100 + overlap * 10 + (r.requirement ? 5 : 0))
    }
  }

  // 3. Full-text over the actual clause text, for wording the labels missed.
  if (terms.length) {
    const q = terms.slice(0, 8).join(" | ")
    const { data } = await db
      .from("cg_document_sections")
      .select("document_id, clause, heading, page_from, content, requirement, summary, topics")
      .in("document_id", docIds)
      .textSearch("content", q, { type: "websearch", config: "english" })
      .limit(limit * 2)
    for (const r of data ?? []) bump(scored, r, 40 + (r.requirement ? 5 : 0))
  }

  const ranked = [...scored.values()].sort((a, b) => b.score - a.score)

  const out: RetrievedSection[] = []
  let used = 0
  for (const { row } of ranked) {
    const content = String(row.content ?? "")
    if (used + content.length > maxChars) {
      if (out.length >= 3) break            // enough material already
      // Keep a truncated slice rather than dropping a highly-ranked clause.
      out.push(toSection(row, nameById, content.slice(0, Math.max(0, maxChars - used))))
      break
    }
    out.push(toSection(row, nameById, content))
    used += content.length
    if (out.length >= limit) break
  }
  return out
}

function rowKey(r: any): string {
  return `${r.document_id}:${r.clause ?? ""}:${r.page_from}:${String(r.content).slice(0, 40)}`
}
function bump(map: Map<string, { row: any; score: number }>, row: any, score: number) {
  const k = rowKey(row)
  const cur = map.get(k)
  if (cur) cur.score += score
  else map.set(k, { row, score })
}
function toSection(row: any, names: Map<string, string>, content: string): RetrievedSection {
  return {
    document: names.get(row.document_id) ?? "Reference",
    clause: row.clause ?? null,
    heading: row.heading ?? null,
    page_from: row.page_from ?? 0,
    content,
    requirement: !!row.requirement,
  }
}

/** Prompt-ready block, citable down to the clause. */
export function formatSections(sections: RetrievedSection[]): string {
  if (sections.length === 0) return ""
  return sections.map(s => {
    const cite = [s.document, s.clause, s.page_from ? `p.${s.page_from}` : null]
      .filter(Boolean).join(" · ")
    return `### ${cite}${s.heading ? ` — ${s.heading}` : ""}${s.requirement ? "  [REQUIREMENT]" : ""}\n${s.content}`
  }).join("\n\n")
}
