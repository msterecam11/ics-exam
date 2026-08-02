// Reference document analysis — extraction, text-layer detection, and
// clause-boundary splitting. Deliberately ALL pure code, no model.
//
// Regulatory documents are the most rigidly numbered text there is, so a
// parser beats an LLM here on every axis: it's free, instant, deterministic,
// and — critically — it transcribes clause identifiers exactly. A model
// asked to copy "139.15(b)" will occasionally produce "139.16(b)", and a
// wrong citation in compliance training is a serious defect. The model's job
// starts only after this, adding meaning on top of text it cannot corrupt.

export interface PageText { page: number; text: string }

export interface DocSection {
  order_index: number
  clause: string | null
  heading: string | null
  page_from: number
  page_to: number
  content: string
  char_count: number
}

export type TextStatus = "text_layer" | "needs_ocr" | "partial"

/** A page with almost no extractable text is an image of a page. */
const MIN_CHARS_PER_PAGE = 100

/**
 * `thinPages` lists the 1-based pages that need OCR, so a mostly-digital
 * document with a few scanned annexes pays for those pages only.
 */
export function detectTextStatus(
  pages: PageText[]
): { status: TextStatus; ocrPages: number; thinPages: number[] } {
  if (pages.length === 0) return { status: "needs_ocr", ocrPages: 0, thinPages: [] }
  const thin = pages.filter(p => p.text.replace(/\s+/g, "").length < MIN_CHARS_PER_PAGE)
  const thinPages = thin.map(p => p.page)
  if (thin.length === 0) return { status: "text_layer", ocrPages: 0, thinPages: [] }
  if (thin.length === pages.length) return { status: "needs_ocr", ocrPages: pages.length, thinPages }
  return { status: "partial", ocrPages: thin.length, thinPages }
}

// ── Clause heading patterns, most specific first ────────────────────────────
// Each captures (clause identifier, heading text).
const HEADING_PATTERNS: { re: RegExp; kind: string }[] = [
  // GACAR / FAR / CFR: "139.15 Aerodrome manual"  ·  "§ 139.15(b) Records"
  { re: /^(?:§\s*)?(\d{1,3}\.\d{1,3}(?:\([a-z0-9]{1,3}\))*)\s+(.{2,120})$/i, kind: "clause" },
  // ICAO annex numbering: "3.1.9 Runway strips"  ·  "1.2 Definitions"
  { re: /^(\d{1,2}(?:\.\d{1,3}){1,4})\s+(.{2,120})$/, kind: "clause" },
  // "CHAPTER 4 — AERODROME DATA" / "Chapter 4. Aerodrome data"
  { re: /^(CHAPTER\s+[0-9IVXLC]+)\s*[.–—:-]?\s*(.{0,120})$/i, kind: "chapter" },
  // "PART 139 — CERTIFICATION"
  { re: /^(PART\s+[0-9A-Z]+)\s*[.–—:-]?\s*(.{0,120})$/i, kind: "part" },
  // "SECTION 5 Responsibilities" / "Appendix B — Forms"
  { re: /^((?:SECTION|APPENDIX|ANNEX|ATTACHMENT)\s+[0-9A-Z]+)\s*[.–—:-]?\s*(.{0,120})$/i, kind: "section" },
]

function matchHeading(line: string): { clause: string; heading: string } | null {
  const t = line.trim()
  if (t.length < 3 || t.length > 160) return null
  // A line ending in a sentence is prose, not a heading.
  if (/[.;,]$/.test(t) && !/^(CHAPTER|PART|SECTION|APPENDIX|ANNEX)/i.test(t)) return null
  for (const { re } of HEADING_PATTERNS) {
    const m = re.exec(t)
    if (m) {
      const clause = m[1].replace(/\s+/g, " ").trim()
      const heading = (m[2] ?? "").trim()
      // A "clause" that is really a decimal inside a sentence, e.g. "2.5 metres"
      if (/^(metres?|m|ft|feet|km|kg|per cent|%)\b/i.test(heading)) return null
      return { clause, heading }
    }
  }
  return null
}

/** Very large sections are split so no single row dwarfs the rest. */
const MAX_SECTION_CHARS = 6000

export function splitIntoSections(pages: PageText[]): DocSection[] {
  type Cursor = { clause: string | null; heading: string | null; page: number; lines: string[] }
  const out: DocSection[] = []
  let cur: Cursor = { clause: null, heading: null, page: pages[0]?.page ?? 1, lines: [] }
  let lastPage = cur.page

  function flush() {
    const content = cur.lines.join("\n").trim()
    if (content.length < 40 && !cur.clause) { cur.lines = []; return }
    if (!content) { cur.lines = []; return }

    // Oversized sections are chunked on paragraph boundaries, keeping the
    // same clause id so citations still resolve.
    const chunks: string[] = []
    if (content.length <= MAX_SECTION_CHARS) chunks.push(content)
    else {
      let buf = ""
      for (const para of content.split(/\n\s*\n/)) {
        if ((buf + para).length > MAX_SECTION_CHARS && buf) { chunks.push(buf.trim()); buf = "" }
        buf += para + "\n\n"
      }
      if (buf.trim()) chunks.push(buf.trim())
    }

    for (const c of chunks) {
      out.push({
        order_index: out.length,
        clause: cur.clause,
        heading: cur.heading,
        page_from: cur.page,
        page_to: lastPage,
        content: c,
        char_count: c.length,
      })
    }
    cur.lines = []
  }

  for (const p of pages) {
    lastPage = p.page
    for (const rawLine of p.text.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+$/, "")
      const h = matchHeading(line)
      if (h) {
        flush()
        cur = { clause: h.clause, heading: h.heading || null, page: p.page, lines: [] }
        if (h.heading) cur.lines.push(h.heading)
      } else if (line.trim()) {
        cur.lines.push(line)
      } else {
        cur.lines.push("")
      }
    }
  }
  flush()

  // A document with no recognisable numbering (a guidance note, say) still
  // needs to be usable, so fall back to fixed-size chunks rather than one
  // giant blob.
  if (out.length <= 1 && pages.length > 1) {
    return chunkByLength(pages)
  }
  return out.map((s, i) => ({ ...s, order_index: i }))
}

function chunkByLength(pages: PageText[]): DocSection[] {
  const out: DocSection[] = []
  let buf = ""
  let from = pages[0]?.page ?? 1
  let last = from
  for (const p of pages) {
    last = p.page
    buf += p.text + "\n"
    if (buf.length >= MAX_SECTION_CHARS) {
      out.push({
        order_index: out.length, clause: null, heading: null,
        page_from: from, page_to: last,
        content: buf.trim(), char_count: buf.trim().length,
      })
      buf = ""
      from = p.page + 1
    }
  }
  if (buf.trim()) {
    out.push({
      order_index: out.length, clause: null, heading: null,
      page_from: from, page_to: last,
      content: buf.trim(), char_count: buf.trim().length,
    })
  }
  return out
}

/** Extract per-page text from a PDF buffer. */
export async function extractPdfPages(buffer: Buffer): Promise<PageText[]> {
  // @ts-expect-error — pdf-parse ships no type declarations
  const pdfParse = (await import("pdf-parse")).default as (
    b: Buffer,
    opts?: Record<string, unknown>
  ) => Promise<{ text: string; numpages: number }>

  const pages: PageText[] = []
  let n = 0
  await pdfParse(buffer, {
    // Per-page render hook so page numbers survive — needed for citations
    // like "GACAR 139.15(b), p.42".
    pagerender: async (pageData: any) => {
      const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
      let lastY: number | undefined
      let text = ""
      for (const item of content.items as any[]) {
        // Re-introduce line breaks from vertical position, otherwise the
        // whole page arrives as one line and no heading can be detected.
        if (lastY !== undefined && Math.abs(lastY - item.transform[5]) > 2) text += "\n"
        text += item.str
        lastY = item.transform[5]
      }
      pages.push({ page: ++n, text })
      return text
    },
  })
  return pages.sort((a, b) => a.page - b.page)
}
