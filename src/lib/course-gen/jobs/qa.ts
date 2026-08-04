// QA job — renders the COMPOSED slide (background + chrome + elements) and
// has a vision model look at it, exactly as a reviewer would. This is a
// standard pass, not a safety net: dynamic layout earns its quality here.
//
// Failures are routed to the layer that can actually fix them:
//   text_overflow / too_much_content -> content layer (rewrite shorter)
//   structure / crowding             -> blueprint layer (simpler shape)
//   contrast / image_fit             -> style or media layer
// Tier-3 (custom) slides additionally face a "does this look professionally
// designed and on-brand?" rubric, because freeform is where variance lives.

import { getBrowser } from "@/lib/browser"
import { MODELS, claudeVisionJSON } from "../ai"
import { renderSlideHtml } from "../slideHtml"
import { SLIDE_W, SLIDE_H, type ThemeTokens } from "../tokens"
import type { CanvasElement } from "../primitives"
import type { Master } from "../theme1"

export interface QaVerdict {
  pass: boolean
  issues: { kind: string; severity: "minor" | "major"; detail: string }[]
  fix_layer: "content" | "blueprint" | "style" | "media" | "none"
  feedback: string
}

export async function screenshotSlide(opts: {
  elements: CanvasElement[]
  master: Master
  tokens: ThemeTokens
  pageNumber?: number
  moduleNumber?: number
  partnerLogoLight?: string | null
  partnerLogoDark?: string | null
}): Promise<string> {
  const port = process.env.PORT ?? "3000"
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${port}`
  const html = renderSlideHtml({ ...opts, origin })

  const browser = await getBrowser()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: SLIDE_W, height: SLIDE_H, deviceScaleFactor: 1 })
    // "load" (not networkidle0): fonts are inlined so the only network work
    // is the theme's background/logo images, and "load" settles once those
    // finish either way. networkidle0 waits for a quiet period that a dev
    // server's keep-alive connections can prevent, hanging the render.
    await page.setContent(html, { waitUntil: "load", timeout: 60_000 })
    await page.evaluate(() => (document as any).fonts?.ready)
    const buf = await page.screenshot({ type: "png" })
    await page.close()
    return Buffer.from(buf).toString("base64")
  } finally {
    await browser.close()
  }
}

export async function handleQaJob(job: any): Promise<QaVerdict> {
  const { elements, master, tokens, slide_title, page_number, module_number,
          partner_logo_light, partner_logo_dark, is_custom } = job.input as any

  const shot = await screenshotSlide({
    elements, master, tokens,
    pageNumber: page_number,
    moduleNumber: module_number,
    partnerLogoLight: partner_logo_light,
    partnerLogoDark: partner_logo_dark,
  })

  const customRubric = is_custom
    ? `\nThis slide uses a CUSTOM composition. Hold it to a higher bar: does it read as professionally designed, deliberately aligned, and on-brand for a corporate aviation deck — not like an ad-hoc arrangement of boxes?`
    : ""

  const verdict = await claudeVisionJSON({
    model: MODELS.qa_vision,
    imagesBase64Png: [shot],
    maxTokens: 1200,
    label: `Visual QA of "${slide_title}"`,
    prompt: `You are the quality reviewer for ICS Aviation's generated training slides. Inspect this rendered slide (1280x720) and report problems a professional designer would reject.

Slide title: "${slide_title}"

Check for:
1. text_overflow — text clipped, running past its container, or off the slide
2. crowding — elements touching/overlapping, no breathing room, unbalanced density
3. contrast — text unreadable against its background (especially over photos)
4. alignment — visibly misaligned edges, ragged columns, inconsistent spacing
5. chrome_conflict — content colliding with the logo, footer rule, or page number
6. image_fit — imagery that is stretched, empty, or unrelated to the message
7. underfill — the content area reads as mostly empty white space relative to what a finished slide should look like — not a deliberately spacious composition, genuinely sparse${customRubric}

Ignore: subjective wording choices, and the deliberate brand style (blue palette, orange accents, rounded cards).

Return ONLY:
{
  "pass": true|false,
  "issues": [{ "kind": "text_overflow|crowding|contrast|alignment|chrome_conflict|image_fit|underfill|design_quality", "severity": "minor|major", "detail": "what and where" }],
  "fix_layer": "content|blueprint|style|media|none",
  "feedback": "one instruction to whoever regenerates this slide"
}
Set pass=false only for MAJOR issues that a client would notice. Minor imperfections pass.`,
  })

  return {
    pass: verdict?.pass !== false,
    issues: Array.isArray(verdict?.issues) ? verdict.issues : [],
    fix_layer: verdict?.fix_layer ?? "none",
    feedback: verdict?.feedback ?? "",
  }
}
