// QA job — renders the COMPOSED slide (background + chrome + elements) and
// has a vision model look at it, exactly as a reviewer would.
//
// This runs AFTER designLint.ts, which has already gated on everything
// geometry can prove (balance, overlap, unreadable contrast). What is left
// is what only eyes can judge: whether the composition reads as deliberate,
// whether the imagery is apt, whether it looks like a professional deck.
//
// ── Two things this deliberately does NOT do ───────────────────────────────
//
// It does not ask the model for a verdict. It asks for SCORES and computes
// the verdict here. A model asked "did this pass?" answers a social question
// and is agreeable; a model asked "rate the hierarchy 1-5" answers an
// observational one. The threshold then lives in code, where it can be
// changed deliberately and reviewed.
//
// It does not fail open. The previous version returned `verdict?.pass !==
// false`, so a malformed response, a missing field, or a truncated JSON body
// all counted as a pass — and a thrown error was caught upstream and the
// slide accepted with a console.error. Three separate paths by which an
// unreviewed slide became an approved one.

import { getBrowser } from "@/lib/browser"
import { MODELS, claudeVisionJSON } from "../ai"
import { renderSlideHtml } from "../slideHtml"
import { SLIDE_W, SLIDE_H, type ThemeTokens } from "../tokens"
import type { CanvasElement } from "../primitives"
import type { Master } from "../theme1"

/** Axes the reviewer scores. Imagery is skipped when the slide has none. */
export const QA_AXES = ["composition", "hierarchy", "alignment", "readability", "brand", "imagery"] as const
export type QaAxis = (typeof QA_AXES)[number]

/**
 * Fail when any axis is BROKEN (1), or when several are simultaneously weak.
 *
 * Not an average: averaging hides the failure that matters most — a slide
 * that is beautiful, on-brand, well-spaced and completely unreadable
 * averages fine.
 *
 * The numbers come from running this rubric over the harness fixtures rather
 * than from taste. Haiku grades conservatively and clusters at 2-3, so an
 * "any axis <= 2 fails" rule rejected 6 of 7 slides, including ones verified
 * by eye as correct. That is the same over-firing that made the old underfill
 * check worthless: a gate that rejects nearly everything just triples the
 * cost and ships anyway.
 *
 * A single 2 is therefore treated as "could be better" (which is what the
 * model means by it) and only a 1, or a cluster of weak axes, fails.
 * Geometry defects do not depend on this bar at all — designLint.ts has
 * already gated on balance, overlap and unreadable contrast before QA runs.
 */
const BROKEN_SCORE = 1
const WEAK_SCORE = 2
const MAX_WEAK_AXES = 2

export interface QaVerdict {
  /** False when the reviewer could not run. Not the same as "passed". */
  checked: boolean
  /** Computed here from `scores` — never read from the model's own output. */
  pass: boolean
  scores: Partial<Record<QaAxis, number>>
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

const RUBRIC = `Score each axis 1-5. Use the whole scale — most competent slides sit at 3-4.

  5  exemplary; you would put it in a portfolio
  4  good; nothing you would change before sending it
  3  acceptable; a client would not remark on it
  2  a client WOULD remark on it — visibly off, not merely improvable
  1  broken; would embarrass whoever presented it

Axes:
- composition   Is the content deliberately placed and balanced in its area, rather than drifting to one side or floating in space?
- hierarchy     Is there ONE clear focal element, with everything else visibly deferring to it? Six things shouting equally scores 2.
- alignment     Are edges, gaps and repeated element sizes consistent? Ragged, near-but-not-quite alignment scores 2.
- readability   Is every piece of text legible against what sits behind it, unclipped and not cramped?
- brand         Does this read as a professional corporate aviation deck — not a generated template with the words swapped?
- imagery       Photos, charts, icons placed ON the slide: apt to the message, correctly fitted, not stretched or decorative filler.

The faint aircraft graphic and the coloured wash behind the content are the
theme's own background, fixed for every slide in the deck. So is the ICS
logo, the client logo, the footer rule and the page number. None of them are
the slide's imagery and none can be changed — do not score or comment on
them.`

/**
 * The verdict, plus the render it was formed from.
 *
 * `screenshotPng` is deliberately OUTSIDE QaVerdict: the verdict is persisted
 * to cg_pages.qa_check, and a base64 PNG on every row would bloat the table
 * for no gain. Returning it as a sibling means the caller must destructure it
 * off before storing, which is the point — it cannot be persisted by accident.
 */
export type QaResult = QaVerdict & { screenshotPng: string }

export async function handleQaJob(job: any): Promise<QaResult> {
  const { elements, master, tokens, slide_title, page_number, module_number,
          partner_logo_light, partner_logo_dark, is_custom } = job.input as any

  const shot = await screenshotSlide({
    elements, master, tokens,
    pageNumber: page_number,
    moduleNumber: module_number,
    partnerLogoLight: partner_logo_light,
    partnerLogoDark: partner_logo_dark,
  })

  // Whether the slide HAS imagery is a fact about the elements, so it is
  // decided here rather than left to the reviewer to notice. Asked to score
  // imagery on a slide that has none, the model scored the theme's own
  // background watermark — 1s and 2s on six of seven fixtures, none of which
  // the design agent could have acted on.
  // Photos and charts only. Icons were counted here at first and it put the
  // axis back on nearly every slide: `flow` draws arrow-right connectors
  // between its steps, `tiers` draws arrow-down between bands, `comparison`
  // puts a glyph beside each heading. Those are structural marks, not the
  // slide's imagery, and asking a reviewer to grade "the imagery" on a slide
  // whose only picture is a 16px connector arrow produced 1s and 2s that no
  // redesign could have answered.
  const hasImagery = (elements as CanvasElement[]).some(
    e => (e.type === "image" || e.type === "chart") && !e.decor
  )

  const customNote = is_custom
    ? `\nThis slide uses a CUSTOM (freeform) composition rather than a standard primitive, so its alignment and spacing were decided element by element. Look at those two axes especially carefully.`
    : ""

  const raw = await claudeVisionJSON({
    model: MODELS.qa_vision,
    imagesBase64Png: [shot],
    maxTokens: 1200,
    label: `Visual QA of "${slide_title}"`,
    prompt: `You are the quality reviewer for ICS Aviation's generated training slides. Inspect this rendered slide (1280x720) and score it as a professional presentation designer would.

Slide title: "${slide_title}"${customNote}

${RUBRIC}

${hasImagery
  ? "This slide DOES contain its own imagery — score the imagery axis."
  : "This slide contains NO imagery of its own. OMIT the imagery axis entirely; the only pictures visible are the theme's fixed background."}

Geometry has already been checked automatically — overlap, balance and unreadable colour combinations are handled elsewhere. Judge what only a viewer can: whether this looks composed and deliberate.

Ignore: subjective wording choices, and the deliberate brand style (blue palette, orange accents, rounded cards). The ICS orange and teal accents are the client's own brand and are not defects.

Return ONLY:
{
  "scores": { "composition": 1-5, "hierarchy": 1-5, "alignment": 1-5, "readability": 1-5, "brand": 1-5, "imagery": 1-5 },
  "issues": [{ "kind": "short_slug", "severity": "minor|major", "detail": "what and where" }],
  "fix_layer": "content|blueprint|style|media|none",
  "feedback": "one specific instruction to whoever regenerates this slide"
}`,
  })

  // Keep only real numeric scores on known axes. A missing axis is not a
  // zero — "imagery" is legitimately absent on a text slide — but a response
  // carrying no usable scores at all cannot be treated as a review.
  const scores: Partial<Record<QaAxis, number>> = {}
  for (const axis of QA_AXES) {
    // Discarded rather than trusted when the slide has no imagery: told to
    // omit the axis, the model scores the background anyway.
    if (axis === "imagery" && !hasImagery) continue
    const v = Number((raw as any)?.scores?.[axis])
    if (Number.isFinite(v) && v >= 1 && v <= 5) scores[axis] = v
  }

  const values = Object.values(scores)
  if (values.length === 0) {
    // Fail CLOSED. The old code's `pass: verdict?.pass !== false` turned this
    // exact case — a malformed or truncated response — into an approval.
    return {
      checked: false, pass: false, scores: {},
      issues: [{ kind: "qa_unparseable", severity: "major", detail: "The reviewer returned no usable scores." }],
      fix_layer: "none",
      feedback: "The quality review could not be read. Recompose the slide more simply.",
      screenshotPng: shot,
    }
  }

  const entries = Object.entries(scores) as [QaAxis, number][]
  const broken = entries.filter(([, v]) => v <= BROKEN_SCORE)
  const weak = entries.filter(([, v]) => v <= WEAK_SCORE)
  const failing = broken.length > 0 || weak.length > MAX_WEAK_AXES ? weak : []
  const modelFeedback = typeof (raw as any)?.feedback === "string" ? (raw as any).feedback : ""

  return {
    screenshotPng: shot,
    checked: true,
    pass: failing.length === 0,
    scores,
    issues: Array.isArray((raw as any)?.issues) ? (raw as any).issues : [],
    fix_layer: (raw as any)?.fix_layer ?? "none",
    feedback: failing.length
      ? `${failing.map(([a, v]) => `${a} scored ${v}/5`).join(", ")}. ${modelFeedback}`.trim()
      : modelFeedback,
  }
}
