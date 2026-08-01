// Inlined webfonts for headless rendering.
//
// Fonts loaded by URL fail inside Puppeteer's setContent(): the document sits
// on a blank origin, so the font request is cross-origin, and unlike images
// fonts are CORS-restricted — they silently fall back to a system face and
// every text measurement is wrong for the real font. Inlining as data URIs
// removes origin, CORS, and network flakiness in one move, and behaves the
// same locally, on Render, and during PDF export.

import { readFileSync } from "fs"
import { join } from "path"

const FILES = [
  { file: "PlusJakartaSans-Light.ttf", weight: 300 },
  { file: "PlusJakartaSans-Regular.ttf", weight: 400 },
  { file: "PlusJakartaSans-Bold.ttf", weight: 700 },
]

let cached: string | null = null

/** @font-face block with Plus Jakarta Sans embedded as base64. */
export function inlineFontFaces(): string {
  if (cached) return cached
  const dir = join(process.cwd(), "public", "fonts")
  const faces: string[] = []
  for (const { file, weight } of FILES) {
    try {
      const b64 = readFileSync(join(dir, file)).toString("base64")
      faces.push(
        `@font-face{font-family:'Jakarta';src:url(data:font/ttf;base64,${b64}) format('truetype');font-weight:${weight};font-style:normal;font-display:block}`
      )
    } catch (err) {
      console.error(`[course-gen] could not inline font ${file}:`, err)
    }
  }
  // Only ships 300/400/700 — the brand's heavier weights are synthesized by
  // the browser, matching how the rest of the app renders Plus Jakarta Sans.
  cached = faces.join("\n")
  return cached
}
