// OCR provider — recovers text from PDF pages that carry no text layer.
//
// This sits BELOW the Reference Agent, not beside it: OCR produces raw
// characters and nothing else. Everything that makes a section retrievable
// (summary, topics, requirement flag) still comes from the labelling model
// afterwards. A scanned document therefore costs both; a normal one costs
// neither, because detectTextStatus() never routes it here.
//
// Google Cloud Vision, via the REST `files:annotate` endpoint with the PDF
// bytes sent INLINE. The alternative (`files:asyncBatchAnnotate`) is more
// scalable but requires a GCS bucket for both input and output plus polling,
// which is a lot of infrastructure for the rare scanned document. Inline is
// capped at 5 pages per request, so we slice the PDF with pdf-lib.
//
// Everything is behind isOcrConfigured() — with no key set, the caller keeps
// its existing honest "needs OCR" failure rather than pretending.

import { PDFDocument } from "pdf-lib"
import type { PageText } from "./referenceScan"

const ENDPOINT = "https://vision.googleapis.com/v1/files:annotate"

/** Vision's inline limit for synchronous file annotation. */
const PAGES_PER_REQUEST = 5
/** Requests in flight at once — Vision's default quota is 1800/min. */
const CONCURRENCY = 3
/** Vision rejects oversized payloads; base64 inflates bytes by ~4/3. */
const MAX_SLICE_BYTES = 6 * 1024 * 1024

export function isOcrConfigured(): boolean {
  return Boolean(process.env.GOOGLE_VISION_API_KEY)
}

export class OcrError extends Error {}

interface VisionPageResponse {
  fullTextAnnotation?: { text?: string }
  error?: { message?: string }
  context?: { pageNumber?: number }
}

/**
 * OCR a contiguous run of pages.
 *
 * @param pdf         the whole document's bytes
 * @param pageNumbers 1-based page numbers to read (need not be contiguous)
 * @returns one entry per requested page, in the order requested. A page Vision
 *          could not read comes back with empty text rather than throwing, so
 *          one bad page cannot lose the other 199.
 */
export async function ocrPdfPages(pdf: Buffer, pageNumbers: number[]): Promise<PageText[]> {
  if (!isOcrConfigured()) throw new OcrError("GOOGLE_VISION_API_KEY is not set")
  if (pageNumbers.length === 0) return []

  const source = await PDFDocument.load(pdf, { ignoreEncryption: true })
  const total = source.getPageCount()

  const wanted = pageNumbers.filter(n => n >= 1 && n <= total)
  const slices: number[][] = []
  for (let i = 0; i < wanted.length; i += PAGES_PER_REQUEST) {
    slices.push(wanted.slice(i, i + PAGES_PER_REQUEST))
  }

  const results = new Map<number, string>()

  // Bounded concurrency: a shared cursor, CONCURRENCY workers draining it.
  let cursor = 0
  async function drain(): Promise<void> {
    for (;;) {
      const index = cursor++
      if (index >= slices.length) return
      const pages = slices[index]
      try {
        const texts = await annotateSlice(source, pages)
        pages.forEach((p, i) => results.set(p, texts[i] ?? ""))
      } catch (e: any) {
        // Record the failure per page and carry on — partial text beats none.
        pages.forEach(p => results.set(p, ""))
        console.error(`[ocr] pages ${pages[0]}-${pages[pages.length - 1]} failed:`, e?.message ?? e)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, slices.length) }, drain))

  return wanted.map(page => ({ page, text: results.get(page) ?? "" }))
}

/** Extract the given pages into a small PDF and send it to Vision. */
async function annotateSlice(source: PDFDocument, pages: number[]): Promise<string[]> {
  const slice = await PDFDocument.create()
  const copied = await slice.copyPages(source, pages.map(p => p - 1))
  copied.forEach(p => slice.addPage(p))
  const bytes = await slice.save()

  if (bytes.byteLength > MAX_SLICE_BYTES) {
    // Too heavy as a group — retry these pages one at a time.
    if (pages.length === 1) throw new OcrError(`Page ${pages[0]} is too large to OCR inline`)
    const out: string[] = []
    for (const p of pages) out.push((await annotateSlice(source, [p]))[0] ?? "")
    return out
  }

  const body = {
    requests: [{
      inputConfig: {
        mimeType: "application/pdf",
        content: Buffer.from(bytes).toString("base64"),
      },
      features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
    }],
  }

  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(process.env.GOOGLE_VISION_API_KEY!)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new OcrError(`Vision returned ${res.status}: ${detail.slice(0, 300)}`)
  }

  const json = await res.json()
  const err = json?.responses?.[0]?.error?.message
  if (err) throw new OcrError(`Vision: ${err}`)

  const perPage: VisionPageResponse[] = json?.responses?.[0]?.responses ?? []
  return pages.map((_, i) => perPage[i]?.fullTextAnnotation?.text ?? "")
}

/**
 * Cost signal for the UI — Vision bills per page, with the first 1,000 pages
 * each month free. Kept here so the number lives next to the provider it
 * describes rather than being hardcoded in a component.
 */
export const OCR_FREE_PAGES_PER_MONTH = 1000
export const OCR_USD_PER_1000_PAGES = 1.5
