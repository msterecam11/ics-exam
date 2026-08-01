// The Compiler — pure code, no LLM. Takes the Content Agent's structural
// blueprint, renders it with a real CSS engine inside the master's content
// zone, measures every visual atom, and bakes the result into absolutely
// positioned elements (percent of slide) that the canvas editor operates on.
//
// This is the step that guarantees the LLM never does coordinate math while
// the output still ends up as ordinary, fully editable elements.

import { getBrowser } from "@/lib/browser"
import type { BlueprintNode, CanvasElement } from "./primitives"
import { blueprintToHtml } from "./blueprintHtml"
import { SLIDE_W, SLIDE_H, type ThemeTokens } from "./tokens"
import type { Master } from "./theme1"

export interface CompileInput {
  blueprint: BlueprintNode
  master: Master
  tokens: ThemeTokens
  /** Optional title text placed into the master's title zone. */
  title?: string
  subtitle?: string
}

interface MeasuredNode {
  bake: { kind: string; props: Record<string, unknown> }
  x: number; y: number; w: number; h: number // px within the slide
}

// Rendered once per compile — a bare page sized to the slide, with the
// content zone as an absolutely-positioned box. Fonts are the self-hosted
// Plus Jakarta Sans the rest of the app uses.
function buildPage(html: string, zone: { x: number; y: number; width: number; height: number }, origin: string): string {
  const zx = (zone.x / 100) * SLIDE_W
  const zy = (zone.y / 100) * SLIDE_H
  const zw = (zone.width / 100) * SLIDE_W
  const zh = (zone.height / 100) * SLIDE_H
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  @font-face{font-family:'Jakarta';src:url('${origin}/fonts/PlusJakartaSans-Regular.ttf') format('truetype');font-weight:400}
  @font-face{font-family:'Jakarta';src:url('${origin}/fonts/PlusJakartaSans-Bold.ttf') format('truetype');font-weight:700}
  @font-face{font-family:'Jakarta';src:url('${origin}/fonts/PlusJakartaSans-Light.ttf') format('truetype');font-weight:300}
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:${SLIDE_W}px;height:${SLIDE_H}px;font-family:'Jakarta',sans-serif;position:relative;overflow:hidden;background:#fff}
  #zone{position:absolute;left:${zx}px;top:${zy}px;width:${zw}px;height:${zh}px;display:flex;flex-direction:column;overflow:visible}
  #zone > *{flex:1;min-height:0}
</style></head><body><div id="zone">${html}</div></body></html>`
}

export async function compileBlueprint(input: CompileInput): Promise<{
  elements: CanvasElement[]
  overflow: boolean
}> {
  const zone = input.master.zones.find(z => z.name === "content")
    ?? { name: "content" as const, x: 6, y: 25, width: 88, height: 61 }
  const darkContext = input.master.background.tone === "dark"
  const html = blueprintToHtml(input.blueprint, input.tokens, darkContext)

  const port = process.env.PORT ?? "3000"
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${port}`

  const browser = await getBrowser()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: SLIDE_W, height: SLIDE_H, deviceScaleFactor: 1 })
    // networkidle0 (not "load") so the webfont requests actually finish —
    // measuring with a fallback font produces boxes that are wrong for the
    // real font, and every text box then re-wraps at render time.
    await page.setContent(buildPage(html, zone, origin), { waitUntil: "networkidle0" })
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
    const zoneBottom = ((zone.y + zone.height) / 100) * SLIDE_H
    const zoneRight = ((zone.x + zone.width) / 100) * SLIDE_W
    const overflow = measured.some(m => m.y + m.h > zoneBottom + 2 || m.x + m.w > zoneRight + 2)

    await page.close()

    const elements: CanvasElement[] = []
    let z = 1

    // Title / subtitle come from the master's own zones, not the blueprint.
    const titleZone = input.master.zones.find(zn => zn.name === "title")
    if (input.title && titleZone) {
      elements.push({
        id: `el-title`,
        type: "text",
        x: titleZone.x, y: titleZone.y, width: titleZone.width, height: titleZone.height,
        zIndex: z++,
        runs: [{ text: input.title, bold: true }],
        style: {
          fontSize: (input.tokens.type_scale as any)?.[titleZone.token ?? "h3"] ?? 32,
          fontWeight: 800,
          color: darkContext ? "token:text-inverse" : "token:navy",
          align: "left",
          lineHeight: 1.2,
        },
      } as CanvasElement)
    }
    const subZone = input.master.zones.find(zn => zn.name === "subtitle")
    if (input.subtitle && subZone) {
      elements.push({
        id: `el-subtitle`,
        type: "text",
        x: subZone.x, y: subZone.y, width: subZone.width, height: subZone.height,
        zIndex: z++,
        runs: [{ text: input.subtitle }],
        style: {
          fontSize: 16,
          color: darkContext ? "token:text-inverse" : "token:text",
          align: "left",
        },
      } as CanvasElement)
    }

    // Bake measured nodes → absolute elements, in DOM order so painting
    // order (and therefore z-index) matches what the browser rendered.
    measured.forEach((m, i) => {
      // Text boxes get a ~2px cushion: percentages are rounded to 2dp, and a
      // box even a fraction of a pixel narrower than measured re-wraps its
      // last word onto a new line at render time, colliding with whatever
      // sits below. Non-text boxes are exact.
      const cushion = m.bake.kind === "text" ? 2 : 0
      const base = {
        id: `el-${i}`,
        x: round2((m.x / SLIDE_W) * 100),
        y: round2((m.y / SLIDE_H) * 100),
        width: round2(((m.w + cushion) / SLIDE_W) * 100),
        height: round2((m.h / SLIDE_H) * 100),
        zIndex: z++,
      }
      const p = m.bake.props as any
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
            style: { fontSize: fs, fontWeight: p.fontWeight, color: p.color, align: "left", lineHeight: lh, noWrap: singleLine } } as CanvasElement)
          break
        }
        case "shape":
          elements.push({ ...base, type: "shape", shape: "rect",
            style: { fill: p.fill, stroke: p.stroke, strokeWidth: p.strokeWidth, radius: p.radius ?? 8, opacity: 1, shadow: !!p.shadow } } as CanvasElement)
          break
        case "line":
          elements.push({ ...base, type: "shape", shape: "line",
            style: { fill: p.stroke, radius: 0 } } as CanvasElement)
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

    return { elements, overflow }
  } finally {
    await browser.close()
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
