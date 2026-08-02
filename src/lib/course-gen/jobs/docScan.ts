// Reference Agent — reads a document once, thoroughly, and leaves behind an
// index every other agent can query.
//
// Two deliberate design choices:
//
// 1. Sections are labelled INDEPENDENTLY, not by carrying a running summary
//    forward. A rolling summary compounds its own errors (a mistake on page
//    20 poisons every later chunk), forces strictly sequential work, and by
//    page 200 has compressed away exactly the detail worth citing. We're
//    building an index, not a narrative, and index entries don't need each
//    other.
//
// 2. It runs on a cheap model. The scan is one-time and nobody is waiting,
//    so rate limits and slowness cost nothing — while structure and clause
//    identifiers come from code, which no model can corrupt.

import Groq from "groq-sdk"
import { db } from "@/lib/db"
import { extractPdfPages, detectTextStatus, splitIntoSections } from "../referenceScan"
import { isOcrConfigured, ocrPdfPages } from "../ocr"

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY_COURSEGEN || process.env.GROQ_API_KEY || "placeholder",
})
const LABEL_MODEL = process.env.CG_MODEL_REFERENCE ?? "llama-3.3-70b-versatile"

/** Sections labelled per tick — keeps each job step short and resumable. */
const BATCH = 12
/** Pages OCR'd per tick, for the same reason. */
const OCR_PAGES_PER_TICK = 25

export interface ScanTick { done: boolean; progress: number; step: string }

export async function handleDocScanTick(job: any): Promise<ScanTick> {
  const documentId = job.document_id ?? job.input?.document_id
  if (!documentId) throw new Error("Scan job has no document")

  const { data: doc } = await db.from("cg_documents").select("*").eq("id", documentId).single()
  if (!doc) throw new Error("Document not found")

  // ── Phase 1: extract + split (once) ───────────────────────────────────────
  if (doc.section_count === 0 && !doc.extracted_text) {
    await step(documentId, "Reading the file…", 5)

    const res = await fetch(doc.file_url)
    if (!res.ok) throw new Error(`Could not download the file (${res.status})`)
    const buffer = Buffer.from(await res.arrayBuffer())

    let pages = await extractPdfPages(buffer)
    const { status, ocrPages, thinPages } = detectTextStatus(pages)

    if (thinPages.length > 0 && isOcrConfigured()) {
      // OCR is metered per page and slow, so it runs a bounded batch per tick
      // and banks the result — a 400-page scan survives a restart and never
      // holds the worker hostage. (The file is re-read each tick; that costs
      // one download per ~25 pages, which is cheaper than keeping it around.)
      const cache: Record<string, string> = (doc.ocr_cache as any) ?? {}
      const pending = thinPages.filter(p => !(String(p) in cache))

      if (pending.length > 0) {
        const slice = pending.slice(0, OCR_PAGES_PER_TICK)
        const read = await ocrPdfPages(doc.file_url, slice)
        for (const r of read) cache[String(r.page)] = r.text

        const doneCount = thinPages.length - pending.length + slice.length
        const pct = 5 + Math.round((doneCount / thinPages.length) * 10)
        await db.from("cg_documents").update({
          ocr_cache: cache,
          text_status: status,
          ocr_pages: thinPages.length,
          page_count: pages.length,
          scan_step: `Reading scanned pages — ${doneCount} of ${thinPages.length}`,
          scan_progress: pct,
          updated_at: new Date().toISOString(),
        }).eq("id", documentId)

        return { done: false, progress: pct, step: `OCR ${doneCount}/${thinPages.length} pages` }
      }

      pages = pages.map(p => (cache[String(p.page)] ? { ...p, text: cache[String(p.page)] } : p))
    }

    // Recheck: OCR may have been unavailable, or may have come back empty.
    const after = detectTextStatus(pages)
    if (after.status === "needs_ocr") {
      // Honest stop rather than indexing hundreds of empty sections.
      await db.from("cg_documents").update({
        text_status: status, ocr_pages: ocrPages, page_count: pages.length,
        scan_status: "failed",
        scan_error: isOcrConfigured()
          ? "OCR ran but recovered no readable text from this file. It may be a poor-quality scan, or password-protected."
          : "This PDF has no text layer — every page is an image. Set MISTRAL_API_KEY to enable OCR, then rescan.",
        updated_at: new Date().toISOString(),
      }).eq("id", documentId)
      return { done: true, progress: 100, step: "Needs OCR" }
    }

    await step(documentId, `Splitting ${pages.length} pages into sections…`, 15)
    const sections = splitIntoSections(pages)

    // Insert in batches — a 300-page regulation can yield 400+ sections.
    for (let i = 0; i < sections.length; i += 200) {
      const slice = sections.slice(i, i + 200).map(s => ({ ...s, document_id: documentId }))
      const { error } = await db.from("cg_document_sections").insert(slice)
      if (error) throw new Error(`Could not store sections: ${error.message}`)
    }

    await db.from("cg_documents").update({
      page_count: pages.length,
      text_status: status,
      ocr_pages: ocrPages,
      section_count: sections.length,
      extracted_text: pages.map(p => p.text).join("\n").slice(0, 2_000_000),
      ocr_cache: null,   // banked into the sections now — no need to keep it
      scan_step: `${sections.length} sections found`,
      scan_progress: 20,
      updated_at: new Date().toISOString(),
    }).eq("id", documentId)

    return { done: false, progress: 20, step: `${sections.length} sections found — reading them` }
  }

  // ── Phase 2: label a batch (independent, resumable) ───────────────────────
  const { data: batch } = await db
    .from("cg_document_sections")
    .select("id, clause, heading, content")
    .eq("document_id", documentId)
    .eq("labelled", false)
    .order("order_index")
    .limit(BATCH)

  if (batch && batch.length > 0) {
    const { count: remaining } = await db
      .from("cg_document_sections")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId).eq("labelled", false)

    const total = doc.section_count || 1
    const doneCount = total - (remaining ?? 0)
    const progress = Math.min(95, 20 + Math.round((doneCount / total) * 75))

    await step(documentId, `Understanding section ${doneCount + 1} of ${total}…`, progress)

    // Independent per section — a failure affects only that section.
    await Promise.all(batch.map(s => labelSection(s, doc)))

    return {
      done: false,
      progress,
      step: `Understanding ${doneCount + batch.length} of ${total} sections`,
    }
  }

  // ── Phase 3: document-level roll-up ──────────────────────────────────────
  await step(documentId, "Summarising the document…", 96)
  const summary = await rollUp(documentId, doc)

  await db.from("cg_documents").update({
    scan_status: "ready",
    scan_progress: 100,
    scan_step: null,
    scan_error: null,
    summary,
    updated_at: new Date().toISOString(),
  }).eq("id", documentId)

  return { done: true, progress: 100, step: "Ready" }
}

async function labelSection(s: any, doc: any) {
  const text = String(s.content ?? "").slice(0, 6000)
  const prompt = `You are indexing a civil-aviation regulatory document so a course-writing system can find the right clause later. Read this ONE section and describe it factually. Do not interpret, judge, or add anything not present.

Document: ${doc.doc_reference || doc.title}${doc.authority ? ` (${doc.authority})` : ""}
${s.clause ? `Clause: ${s.clause}` : ""}
${s.heading ? `Heading: ${s.heading}` : ""}

--- SECTION TEXT ---
${text}
--- END ---

Return ONLY JSON:
{
  "summary": "one sentence describing what this section covers",
  "topics": ["3-6 short topic keywords someone would search for"],
  "entities": ["standards, roles, systems or documents named here, e.g. SMS, GACA, Annex 14"],
  "requirement": true or false
}
"requirement" is true only if the section states an obligation (must, shall, is required to).`

  try {
    const completion = await groq.chat.completions.create({
      model: LABEL_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: "json_object" },
    })
    const raw = completion.choices[0]?.message?.content ?? "{}"
    const parsed = JSON.parse(raw)

    await db.from("cg_document_sections").update({
      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 500) : null,
      topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 8).map(String) : [],
      entities: Array.isArray(parsed.entities) ? parsed.entities.slice(0, 8).map(String) : [],
      requirement: parsed.requirement === true,
      labelled: true,
    }).eq("id", s.id)
  } catch (err) {
    // A section that can't be labelled is still retrievable by its text, so
    // mark it done rather than blocking the whole document forever.
    console.error("[course-gen] section labelling failed:", err)
    await db.from("cg_document_sections").update({ labelled: true }).eq("id", s.id)
  }
}

async function rollUp(documentId: string, doc: any) {
  const { data: sections } = await db
    .from("cg_document_sections")
    .select("clause, heading, summary, topics, requirement")
    .eq("document_id", documentId)
    .order("order_index")
    .limit(400)

  const list = (sections ?? [])
  const topicCounts = new Map<string, number>()
  for (const s of list) for (const t of (s.topics ?? [])) {
    topicCounts.set(t.toLowerCase(), (topicCounts.get(t.toLowerCase()) ?? 0) + 1)
  }
  const topTopics = [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([t]) => t)

  // Built from the labels, not the raw text — cheap and doesn't re-read the
  // document.
  const toc = list.filter(s => s.clause).slice(0, 120)
    .map(s => `${s.clause}${s.heading ? ` — ${s.heading}` : ""}`)

  let overview: string | null = null
  try {
    const completion = await groq.chat.completions.create({
      model: LABEL_MODEL,
      messages: [{
        role: "user",
        content: `These are the section headings and topics of "${doc.doc_reference || doc.title}". In 2-3 sentences, describe what this document covers and who it applies to. Factual only.\n\n${toc.slice(0, 80).join("\n")}\n\nTopics: ${topTopics.join(", ")}`,
      }],
      temperature: 0.2,
      max_tokens: 300,
    })
    overview = completion.choices[0]?.message?.content?.trim() ?? null
  } catch { /* overview is a nicety, not a requirement */ }

  return {
    overview,
    top_topics: topTopics,
    table_of_contents: toc,
    requirement_count: list.filter(s => s.requirement).length,
  }
}

async function step(documentId: string, text: string, progress: number) {
  await db.from("cg_documents")
    .update({ scan_status: "scanning", scan_step: text, scan_progress: progress })
    .eq("id", documentId)
}
