// OCR provider — recovers text from PDF pages that carry no text layer.
//
// This sits BELOW the Reference Agent, not beside it: OCR produces raw
// characters and nothing else. Everything that makes a section retrievable
// (summary, topics, requirement flag) still comes from the labelling model
// afterwards. A scanned document therefore costs both; a normal one costs
// neither, because detectTextStatus() never routes it here.
//
// Provider: Mistral OCR (`/v1/ocr`, model "mistral-ocr-latest"). Chosen over
// Google Vision / Azure Document Intelligence for two reasons: it has a real
// free tier with no separate billing-account signup (Vision needs a
// billing-enabled GCP project even to use its free tier; Azure Document
// Intelligence needs its own Azure subscription — neither is unlocked by an
// existing Microsoft 365 seat), and it's a document-OCR model rather than a
// general vision model, which reads dense structured text like GACAR/ICAO
// clause numbering more reliably.
//
// Mistral takes the document by URL and reads it server-side — our library
// storage is a public bucket already, so no re-upload or base64 encoding is
// needed, unlike Vision's inline-bytes approach.
//
// Everything is behind isOcrConfigured() — with no key set, the caller keeps
// its existing honest "needs OCR" failure rather than pretending.

import type { PageText } from "./referenceScan"

const ENDPOINT = "https://api.mistral.ai/v1/ocr"
const MODEL = "mistral-ocr-latest"

/** Pages requested per call — bounds how much one failed request loses. */
const PAGES_PER_REQUEST = 12
/** Requests in flight at once. */
const CONCURRENCY = 3

export function isOcrConfigured(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY)
}

export class OcrError extends Error {}

interface MistralOcrPage {
  index: number
  markdown?: string
}

/**
 * OCR specific pages of a PDF that's reachable at `fileUrl`.
 *
 * @param fileUrl     publicly-fetchable URL of the whole document
 * @param pageNumbers 1-based page numbers to read (need not be contiguous)
 * @returns one entry per requested page, in the order requested. A page
 *          Mistral could not read comes back with empty text rather than
 *          throwing, so one bad page cannot lose the rest of the document.
 */
export async function ocrPdfPages(fileUrl: string, pageNumbers: number[]): Promise<PageText[]> {
  if (!isOcrConfigured()) throw new OcrError("MISTRAL_API_KEY is not set")
  if (pageNumbers.length === 0) return []

  const batches: number[][] = []
  for (let i = 0; i < pageNumbers.length; i += PAGES_PER_REQUEST) {
    batches.push(pageNumbers.slice(i, i + PAGES_PER_REQUEST))
  }

  const results = new Map<number, string>()

  let cursor = 0
  async function drain(): Promise<void> {
    for (;;) {
      const index = cursor++
      if (index >= batches.length) return
      const pages = batches[index]
      try {
        const texts = await annotateBatch(fileUrl, pages)
        pages.forEach((p, i) => results.set(p, texts[i] ?? ""))
      } catch (e: any) {
        pages.forEach(p => results.set(p, ""))
        console.error(`[ocr] pages ${pages[0]}-${pages[pages.length - 1]} failed:`, e?.message ?? e)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, drain))

  return pageNumbers.map(page => ({ page, text: results.get(page) ?? "" }))
}

/**
 * Mistral's `pages` field is 0-indexed while our page numbers are 1-indexed
 * (matching pdf-parse / the rest of this pipeline) — converted at the edge.
 */
async function annotateBatch(fileUrl: string, pages: number[]): Promise<string[]> {
  const body = {
    model: MODEL,
    document: { type: "document_url", document_url: fileUrl },
    pages: pages.map(p => p - 1),
    include_image_base64: false,
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new OcrError(`Mistral OCR returned ${res.status}: ${detail.slice(0, 300)}`)
  }

  const json = await res.json()
  const returned: MistralOcrPage[] = Array.isArray(json?.pages) ? json.pages : []
  const byIndex = new Map(returned.map((p: MistralOcrPage) => [p.index, p.markdown ?? ""]))

  // Mistral echoes back the same 0-based indices we sent, in whatever order
  // it returns them — reassemble in request order rather than assuming order.
  return pages.map((_, i) => byIndex.get(pages[i] - 1) ?? "")
}

/**
 * Cost signal for the UI. Mistral OCR's published free-tier volume is
 * generous relative to Vision/Textract/Document Intelligence and needs no
 * separate billing-account signup — kept here as an approximate figure since
 * providers revise pricing without notice; verify at mistral.ai/pricing
 * before quoting an exact number to a client.
 */
export const OCR_PROVIDER_NAME = "Mistral OCR"
