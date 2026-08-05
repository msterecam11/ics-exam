// The Compiler — pure code, no LLM. Takes the Content Agent's structural
// blueprint, renders it with a real CSS engine inside the master's content
// zone, measures every visual atom, and bakes the result into absolutely
// positioned elements (percent of slide) that the canvas editor operates on.
//
// This is the step that guarantees the LLM never does coordinate math while
// the output still ends up as ordinary, fully editable elements.

import { getBrowser } from "@/lib/browser"
import type { BlueprintNode, CanvasElement, DecorSpec } from "./primitives"
import { blueprintToHtml } from "./blueprintHtml"
import { decorHtml } from "./decor"
import { SLIDE_W, SLIDE_H, type ThemeTokens } from "./tokens"
import { inlineFontFaces } from "./fonts"
import { fitTitleFontSize } from "./typefit"
import type { Master } from "./theme1"

export interface CompileInput {
  blueprint: BlueprintNode
  master: Master
  tokens: ThemeTokens
  /** Optional title text placed into the master's title zone. */
  title?: string
  subtitle?: string
  /** What sits behind the composition — see decor.ts. */
  decor?: DecorSpec
}

interface MeasuredNode {
  bake: { kind: string; props: Record<string, unknown> }
  x: number; y: number; w: number; h: number // px within the slide
}

// Rendered once per compile — a bare page sized to the slide, with the
// content zone as an absolutely-positioned box. Fonts are the self-hosted
// Plus Jakarta Sans the rest of the app uses.
function buildPage(
  html: string,
  zone: { x: number; y: number; width: number; height: number },
  decor = "",
): string {
  const zx = (zone.x / 100) * SLIDE_W
  const zy = (zone.y / 100) * SLIDE_H
  const zw = (zone.width / 100) * SLIDE_W
  const zh = (zone.height / 100) * SLIDE_H
  // The decoration layer is absolutely positioned, so it is out of flow and
  // unaffected by `#zone > * {flex:1}`; being first in the DOM it also bakes
  // with the lowest z-index and therefore sits behind every real element.
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  ${inlineFontFaces()}
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:${SLIDE_W}px;height:${SLIDE_H}px;font-family:'Jakarta',sans-serif;position:relative;overflow:hidden;background:#fff}
  #zone{position:absolute;left:${zx}px;top:${zy}px;width:${zw}px;height:${zh}px;display:flex;flex-direction:column;overflow:visible}
  #zone > *{flex:1;min-height:0}
  #zone > .decor{flex:0 0 auto}
</style></head><body><div id="zone">${decor}${html}</div></body></html>`
}

/**
 * Below this fraction of the content zone's height covered by INK, a slide
 * reads as unfinished rather than composed.
 *
 * "Ink" means text, icons, images, charts and tables — never `shape`. That
 * distinction is the whole point: cards carry `flex:1`, so an almost-empty
 * card STRETCHES to fill its zone. Measuring box extents therefore reported
 * a half-empty self-assessment slide as 100% full, which is precisely why
 * the first version of this check never fired on the slides that needed it.
 */
const UNDERFILL_THRESHOLD = 0.62
const INK_KINDS = new Set(["text", "icon", "image", "chart", "table"])

export async function compileBlueprint(input: CompileInput): Promise<{
  elements: CanvasElement[]
  overflow: boolean
  underfill: boolean
}> {
  // A master with no "content" zone (cover, section_divider) has deliberately
  // no place for agent content — those slides are chrome + title, full stop.
  // This used to fall back to a fabricated default box, which meant a
  // blueprint the agent shouldn't have produced would still render somewhere
  // instead of being rejected. Refusing here is the actual guarantee; the
  // prompt instruction alone was not.
  const zone = input.master.zones.find(z => z.name === "content")
  if (!zone) return { elements: titleZoneElements(input), overflow: false, underfill: false }

  const darkContext = input.master.background.tone === "dark"
  const html = blueprintToHtml(input.blueprint, input.tokens, darkContext)

  const browser = await getBrowser()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: SLIDE_W, height: SLIDE_H, deviceScaleFactor: 1 })
    // "load", not networkidle0. The comment that used to sit here said
    // networkidle0 was needed so the webfont requests could finish — that was
    // true before the fonts were inlined, and stale ever since. This page now
    // issues NO network requests at all: the fonts are base64 data URIs and
    // nothing else here loads (image elements have no URL until the media step
    // runs, after this one). networkidle0 therefore waits for an idle signal
    // on a page that never talks to the network, and with Puppeteer's default
    // 30s navigation budget that surfaced as "Navigation timeout of 30000 ms
    // exceeded" on a slow instance. The identical fix was already applied in
    // qa.ts; this file was missed.
    //
    // The real guarantee that measurement uses the correct font is the
    // fonts.ready await below, not the navigation predicate.
    const decor = decorHtml({
      decor: input.decor,
      tokens: input.tokens,
      zoneW: (zone.width / 100) * SLIDE_W,
      zoneH: (zone.height / 100) * SLIDE_H,
      dark: darkContext,
    })
    await page.setContent(buildPage(html, zone, decor), { waitUntil: "load", timeout: 60_000 })
    await page.evaluate(async () => { await (document as any).fonts?.ready })

    const measured: MeasuredNode[] = await page.evaluate(() => {
      const out: any[] = []
      document.querySelectorAll("[data-bake]").forEach(el => {
        const r = (el as HTMLElement).getBoundingClientRect()
        if (r.width < 1 || r.height < 1) return
        try {
          out.push({
            bake: JSON.parse((el as HTMLElement).dataset.bake as string),
            x: r.left, y: r.top, w: r.width, h: r.height,
          })
        } catch { /* skip malformed */ }
      })
      return out
    })

    // Did the composition exceed its zone? (QA also checks visually, but
    // catching it here lets the pipeline fix it without a vision call.)
    const zoneTop = (zone.y / 100) * SLIDE_H
    const zoneBottom = ((zone.y + zone.height) / 100) * SLIDE_H
    const zoneRight = ((zone.x + zone.width) / 100) * SLIDE_W
    const overflow = measured.some(m => m.y + m.h > zoneBottom + 2 || m.x + m.w > zoneRight + 2)

    // The opposite failure: a slide that is mostly empty white space. Only
    // ink counts (see INK_KINDS) — a stretched empty card is not content.
    // Decoration is explicitly not ink — see the note in decor.ts.
    const ink = measured.filter(m => INK_KINDS.has(m.bake.kind) && !(m.bake.props as any)?.decor)
    const inkTop = ink.length ? Math.min(...ink.map(m => m.y)) : zoneTop
    const inkBottom = ink.length ? Math.max(...ink.map(m => m.y + m.h)) : zoneTop
    const filledRatio = (inkBottom - inkTop) / Math.max(1, zoneBottom - zoneTop)
    const underfill = filledRatio < UNDERFILL_THRESHOLD

    await page.close()

    const elements: CanvasElement[] = titleZoneElements(input)
    let z = elements.length + 1

    // Bake measured nodes → absolute elements, in DOM order so painting
    // order (and therefore z-index) matches what the browser rendered.
    measured.forEach((m, i) => {
      // Text boxes get a ~2px cushion: percentages are rounded to 2dp, and a
      // box even a fraction of a pixel narrower than measured re-wraps its
      // last word onto a new line at render time, colliding with whatever
      // sits below. Non-text boxes are exact.
      const cushion = m.bake.kind === "text" ? 2 : 0
      const p = m.bake.props as any
      // Rotation rides through from the Tier-3 child's own props (see the
      // comment in blueprintHtml.ts's "custom" case) rather than ever being
      // applied as a CSS transform before this measurement — a rotated
      // element's getBoundingClientRect is its rotated envelope, not its
      // design size, and baking against that would corrupt x/y/w/h.
      const rotate = Number(p.rotate)
      // Nothing may ever bake ABOVE its zone: everything above the content
      // zone belongs to the master (title, logo), and an element landing
      // there renders on top of the title and hides it. `safe center` in
      // blueprintHtml is what stops this happening in the first place; this
      // is the guarantee that no future layout change can reintroduce it.
      const clampedY = Math.max(m.y, zoneTop)
      const base = {
        id: `el-${i}`,
        x: round2((m.x / SLIDE_W) * 100),
        y: round2((clampedY / SLIDE_H) * 100),
        width: round2(((m.w + cushion) / SLIDE_W) * 100),
        height: round2((m.h / SLIDE_H) * 100),
        zIndex: z++,
        ...(Number.isFinite(rotate) && rotate !== 0 ? { rotation: rotate } : {}),
        // Carried from the blueprint node. Until this existed the agent's
        // effects were applied to the measured HTML and then thrown away,
        // so shadow/opacity/gradient never reached a finished slide.
        ...(p.effects && typeof p.effects === "object" ? { effects: p.effects } : {}),
      }
      switch (m.bake.kind) {
        case "text": {
          // Text that occupied a single line at measure time is pinned to one
          // line at render time. Without this, a box sized to the exact text
          // width re-wraps its last word on any sub-pixel difference and
          // collides with the element below it.
          const fs = p.fontSize ?? 16
          const lh = p.lineHeight ?? 1.45
          const singleLine = m.h <= fs * lh * 1.35
          elements.push({ ...base, type: "text", runs: p.runs ?? [{ text: "" }],
            style: { fontSize: fs, fontWeight: p.fontWeight, color: p.color, align: p.align ?? "left", lineHeight: lh, noWrap: singleLine } } as CanvasElement)
          break
        }
        case "shape":
          elements.push({ ...base, type: "shape", shape: "rect",
            style: {
              fill: p.fill, stroke: p.stroke, strokeWidth: p.strokeWidth,
              radius: p.radius ?? 8, opacity: 1, shadow: !!p.shadow, dashed: !!p.dashed,
              // "corner" (notched/circle/pill/...) takes precedence over the
              // plain numeric radius when a primitive went through the
              // shared surface() resolver; badge-number and Tier-3 custom
              // shapes still bake a plain radius and never set this.
              corner: p.corner,
              // Carried through so the PDF and editor repaint the SAME
              // surface — a gradient card baked as a flat colour would be
              // the bullets bug all over again.
              fillStyle: p.fillStyle, intensity: p.intensity, elevation: p.elevation,
              pattern: p.pattern,
            } } as CanvasElement)
          break
        case "line":
          elements.push({ ...base, type: "shape", shape: "line",
            style: { fill: p.stroke, radius: 0, dashed: !!p.dashed } } as CanvasElement)
          break
        case "icon":
          elements.push({ ...base, type: "icon", name: String(p.name ?? "circle"), color: p.color } as CanvasElement)
          break
        case "image":
          elements.push({ ...base, type: "image", url: "", fit: "cover",
            // media request travels with the element until the Media Agent resolves it
            source_ref: JSON.stringify(p.media ?? {}) } as CanvasElement)
          break
        case "table":
          elements.push({ ...base, type: "table",
            rows: (p.rows ?? []).map((r: any) => ({ cells: r.cells })),
            colWidths: Array.from({ length: p.cols ?? 1 }, () => round2(100 / (p.cols ?? 1))),
            tableStyle: { headerRow: !!p.headerRow, altRowFill: "token:surface-alt", borders: "token:border-subtle" } } as CanvasElement)
          break
        case "chart":
          elements.push({ ...base, type: "chart", chartType: p.chartType ?? "bar", data: p.data ?? { labels: [], datasets: [] } } as CanvasElement)
          break
      }
    })

    return { elements, overflow, underfill }
  } finally {
    await browser.close()
  }
}

/**
 * Title / subtitle come from the master's own zones, never the blueprint.
 * A zone with a fixed `text` (the cover's standing tagline) always renders
 * that text — brand chrome, not per-course content — regardless of anything
 * the agent produced; only a zone with no fixed text falls back to the
 * agent-authored title/subtitle.
 */
function titleZoneElements(input: CompileInput): CanvasElement[] {
  const darkContext = input.master.background.tone === "dark"
  const elements: CanvasElement[] = []
  let z = 1

  const titleZone = input.master.zones.find(zn => zn.name === "title")
  const titleText = titleZone?.text ?? input.title
  if (titleText && titleZone) {
    const baseSize = (input.tokens.type_scale as any)?.[titleZone.token ?? "h3"] ?? 32
    elements.push({
      id: `el-title`,
      type: "text",
      x: titleZone.x, y: titleZone.y, width: titleZone.width, height: titleZone.height,
      zIndex: z++,
      runs: [{ text: titleText, bold: true }],
      style: {
        fontSize: fitTitleFontSize({
          text: titleText,
          widthPx: (titleZone.width / 100) * SLIDE_W,
          heightPx: (titleZone.height / 100) * SLIDE_H,
          baseSize,
        }),
        fontWeight: 800,
        color: darkContext ? "token:text-inverse" : "token:navy",
        align: "left",
        lineHeight: 1.2,
      },
    } as CanvasElement)
  }
  const subZone = input.master.zones.find(zn => zn.name === "subtitle")
  const subText = subZone?.text ?? input.subtitle
  if (subText && subZone) {
    elements.push({
      id: `el-subtitle`,
      type: "text",
      x: subZone.x, y: subZone.y, width: subZone.width, height: subZone.height,
      zIndex: z++,
      runs: [{ text: subText }],
      style: {
        fontSize: 16,
        color: darkContext ? "token:text-inverse" : "token:text",
        align: "left",
      },
    } as CanvasElement)
  }
  return elements
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
