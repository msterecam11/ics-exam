// Full-slide HTML renderer — background + master chrome + baked elements.
// One renderer, three consumers: QA vision screenshots, PDF export, and
// (client-side, via the same element shapes) the canvas editor. Chrome is
// always drawn FROM THE THEME at render time, never stored on the page —
// which is why swapping the theme or the client logo repaints every slide.

import type { CanvasElement } from "./primitives"
import { resolveToken, SLIDE_W, SLIDE_H, type ThemeTokens } from "./tokens"
import type { Master, ChromeSlot } from "./theme1"
import { inlineFontFaces } from "./fonts"
import { effectsCss } from "./effects"
import { iconSvg } from "./icons"

export interface RenderSlideInput {
  elements: CanvasElement[]
  master: Master
  tokens: ThemeTokens
  origin: string
  pageNumber?: number
  moduleNumber?: number
  partnerLogoLight?: string | null
  partnerLogoDark?: string | null
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function pct(v: number, axis: "x" | "y"): string {
  return `${(v / 100) * (axis === "x" ? SLIDE_W : SLIDE_H)}px`
}

function icsLogoFor(tone: string, origin: string): string {
  return tone === "dark"
    ? `${origin}/course-gen/theme-1/logos/ics-full-white.png`
    : `${origin}/course-gen/theme-1/logos/ics-full-color.png`
}

function chromeHtml(input: RenderSlideInput): string {
  const { master, tokens, origin } = input
  return master.chrome.map((slot: ChromeSlot) => {
    const box = `position:absolute;left:${pct(slot.x, "x")};top:${pct(slot.y, "y")};width:${pct(slot.width, "x")};height:${pct(slot.height, "y")};`
    switch (slot.role) {
      case "ics_logo":
        return `<img src="${icsLogoFor(slot.tone, origin)}" style="${box}object-fit:contain;object-position:left center" />`
      case "partner_logo": {
        // Per-slot tone picks the client's own variant; when only one was
        // supplied we recolor it rather than dropping the co-brand.
        const wantLight = slot.tone === "dark"
        const url = wantLight
          ? (input.partnerLogoLight ?? input.partnerLogoDark)
          : (input.partnerLogoDark ?? input.partnerLogoLight)
        if (!url) return ""
        const needsRecolor = wantLight ? !input.partnerLogoLight : false
        return `<img src="${esc(url)}" style="${box}object-fit:contain;object-position:left center;${needsRecolor ? "filter:brightness(0) invert(1);" : ""}" />`
      }
      case "footer_rule":
        return `<div style="${box}background:${slot.tone === "dark" ? "rgba(255,255,255,.45)" : resolveToken("token:primary-dark", tokens, "#045089")};opacity:.6"></div>`
      case "page_number":
        return `<div style="${box}display:flex;align-items:center;justify-content:flex-end;font-size:14px;color:${slot.tone === "dark" ? "rgba(255,255,255,.8)" : resolveToken("token:primary-dark", tokens, "#045089")}">${input.pageNumber ?? ""}</div>`
      case "ghost_numeral":
        return `<div style="${box}display:flex;align-items:center;font-size:140px;font-weight:800;color:${resolveToken("token:primary", tokens, "#0C72C6")};opacity:.28;line-height:1">${String(input.moduleNumber ?? "").padStart(2, "0")}</div>`
      default:
        return ""
    }
  }).join("")
}

function elementHtml(el: CanvasElement, tokens: ThemeTokens): string {
  // Unfilled master placeholders are editing prompts, never real content —
  // they must not appear in exports, QA screenshots, or presentations.
  if (el.placeholder) return ""

  const box = `position:absolute;left:${pct(el.x, "x")};top:${pct(el.y, "y")};width:${pct(el.width, "x")};height:${pct(el.height, "y")};z-index:${el.zIndex};${el.rotation ? `transform:rotate(${el.rotation}deg);` : ""}`

  switch (el.type) {
    case "text": {
      const s = el.style
      const color = resolveToken(s.color, tokens, "#333333")
      const html = el.runs.map(r => (r.bold ? `<b>${esc(r.text)}</b>` : esc(r.text))).join("")
      // MUST be a plain block, never a flex container: in a flex column each
      // run (e.g. a <b>) becomes its own flex item and lands on its own line,
      // which reflows text the compiler measured as one flowing paragraph.
      // Overflow stays visible so sub-pixel differences never clip text.
      return `<div style="${box}font-size:${s.fontSize}px;font-weight:${s.fontWeight ?? 400};color:${color};text-align:${s.align ?? "left"};line-height:${s.lineHeight ?? 1.45};display:block;overflow:visible;${s.noWrap ? "white-space:nowrap;" : ""}${effectsCss(el.effects, tokens, true)}">${html}</div>`
    }
    case "shape": {
      const s = el.style
      if (el.shape === "line")
        return `<div style="${box}background:${resolveToken(s.fill, tokens, "#0C72C6")}"></div>`
      return `<div style="${box}background:${resolveToken(s.fill, tokens, "transparent")};${s.stroke ? `border:${s.strokeWidth ?? 1}px solid ${resolveToken(s.stroke, tokens, "#DDE3EA")};` : ""}border-radius:${s.radius ?? 8}px;opacity:${s.opacity ?? 1};${s.shadow ? "box-shadow:0 8px 24px rgba(0,0,0,.12);" : ""}${effectsCss(el.effects, tokens)}"></div>`
    }
    case "icon": {
      // The real Phosphor glyph, filling its baked box. This path feeds both
      // the QA screenshot and the PDF export, so what the vision reviewer
      // judges is exactly what the client receives.
      const iconColor = resolveToken(el.color, tokens, "#0C72C6")
      const glyph = iconSvg(el.name, { size: "100%", color: iconColor })
      return glyph
        ? `<div style="${box}">${glyph}</div>`
        : `<div style="${box}background:${iconColor};border-radius:4px;opacity:.9"></div>`
    }
    case "image":
      return el.url
        ? `<img src="${esc(el.url)}" style="${box}object-fit:${el.fit ?? "cover"};border-radius:6px;${effectsCss(el.effects, tokens)}" />`
        : `<div style="${box}background:linear-gradient(135deg,#eef2f7,#e2e9f2);border:1px dashed #cbd5e1;border-radius:6px"></div>`
    case "table": {
      const border = resolveToken(el.tableStyle.borders, tokens, "#DDE3EA")
      const alt = resolveToken(el.tableStyle.altRowFill, tokens, "#F1F3F6")
      const head = resolveToken("token:primary", tokens, "#0C72C6")
      return `<table style="${box}border-collapse:collapse;font-size:14px;color:#333">${
        el.rows.map((r, ri) => `<tr>${r.cells.map(c =>
          `<td colspan="${c.colSpan ?? 1}" rowspan="${c.rowSpan ?? 1}" style="border:1px solid ${border};padding:8px 10px;${el.tableStyle.headerRow && ri === 0 ? `background:${head};color:#fff;font-weight:700;` : ri % 2 ? `background:${alt};` : ""}">${esc(c.text)}</td>`
        ).join("")}</tr>`).join("")
      }</table>`
    }
    case "chart":
      return `<div style="${box}display:flex;align-items:center;justify-content:center;background:#F1F3F6;border-radius:8px;color:#0C72C6;font-size:13px" data-chart='${esc(JSON.stringify({ chartType: el.chartType, data: el.data }))}'>${esc(el.chartType)} chart</div>`
    default:
      return ""
  }
}

export function renderSlideHtml(input: RenderSlideInput): string {
  const { master, origin } = input
  const bg = master.background.asset.startsWith("/")
    ? `${origin}${master.background.asset}`
    : master.background.asset

  const body = `
<div id="slide">
  <img src="${bg}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />
  ${chromeHtml(input)}
  ${input.elements.slice().sort((a, b) => a.zIndex - b.zIndex).map(el => elementHtml(el, input.tokens)).join("")}
</div>`

  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  ${inlineFontFaces()}
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:${SLIDE_W}px;height:${SLIDE_H}px;font-family:'Jakarta',sans-serif;overflow:hidden}
  #slide{position:relative;width:${SLIDE_W}px;height:${SLIDE_H}px;overflow:hidden;background:#fff}
</style></head><body>${body}</body></html>`
}
