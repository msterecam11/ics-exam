// Slide decoration — the layer behind the content.
//
// Everything here is deliberately meaningless: a faint numeral, a watermark
// glyph, a hairline edge. If every mark in this file vanished, the slide
// would lose nothing a reader needs. That is the point — it is what lets a
// slide feel composed rather than typed, without risking the content.
//
// It renders as ordinary absolutely-positioned nodes carrying data-bake, so
// the compiler measures and bakes them exactly like any other element and
// they stay individually editable afterwards.

import { resolveToken, type ThemeTokens } from "./tokens"
import { iconSvg } from "./icons"
import type { DecorSpec } from "./primitives"

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
/**
 * Every decoration bake is flagged `decor`, and the compiler excludes flagged
 * nodes from the underfill measurement. Without that a huge ghost numeral —
 * which bakes as a text node — would count as ink and make a nearly empty
 * slide measure as comfortably full, reintroducing exactly the blind spot
 * the ink-based check was written to close.
 */
function bake(kind: string, props: Record<string, unknown>): string {
  return `data-bake="${esc(JSON.stringify({ kind, props: { ...props, decor: true } }))}"`
}

/** Repeating textures, as pure CSS so they cost nothing to render or export. */
export function patternCss(kind: string, colour: string): string {
  switch (kind) {
    case "dots":
      return `background-image:radial-gradient(${colour} 1.5px,transparent 1.5px);background-size:18px 18px;`
    case "grid":
      return `background-image:linear-gradient(${colour} 1px,transparent 1px),linear-gradient(90deg,${colour} 1px,transparent 1px);background-size:28px 28px;`
    case "diagonal":
      return `background-image:repeating-linear-gradient(45deg,${colour} 0 1px,transparent 1px 12px);`
    default:
      return ""
  }
}

/**
 * Builds the decoration layer for one slide's content zone.
 *
 * Sizes are in PIXELS relative to the zone box, because the caller renders
 * this inside the zone element the compiler measures.
 */
export function decorHtml(opts: {
  decor: DecorSpec | undefined
  tokens: ThemeTokens
  zoneW: number
  zoneH: number
  dark: boolean
}): string {
  const { decor, tokens, zoneW, zoneH, dark } = opts
  if (!decor) return ""

  const accentToken = decor.accent ?? "token:primary"
  const accent = resolveToken(accentToken, tokens, "#0C72C6")
  // Decoration must never compete with text. On a dark ground the same ink
  // needs more presence to register at all, hence the two strengths.
  const faint = dark ? 0.13 : 0.07
  const parts: string[] = []

  if (decor.pattern) {
    const css = patternCss(decor.pattern, accent)
    if (css) {
      parts.push(
        `<div ${bake("shape", { shape: "rect", fill: accentToken, pattern: decor.pattern, effects: { opacity: faint } })} ` +
        `style="position:absolute;inset:0;${css}opacity:${faint}"></div>`
      )
    }
  }

  if (decor.numeral !== undefined && decor.numeral !== null && `${decor.numeral}`.trim()) {
    const text = `${decor.numeral}`
    // Sized off the zone so it stays proportionate on any master.
    const size = Math.round(Math.min(zoneH * 0.86, zoneW * 0.34))
    parts.push(
      `<div ${bake("text", { runs: [{ text, bold: true }], fontSize: size, lineHeight: 1, color: accentToken, fontWeight: 800, align: "left", effects: { opacity: faint } })} ` +
      `style="position:absolute;left:-2%;top:2%;font-size:${size}px;font-weight:800;line-height:1;color:${accent};opacity:${faint};white-space:nowrap">${esc(text)}</div>`
    )
  }

  if (decor.icon) {
    const size = Math.round(Math.min(zoneH * 0.72, zoneW * 0.28))
    const glyph = iconSvg(decor.icon, { size, color: accent })
    if (glyph) {
      parts.push(
        `<div ${bake("icon", { name: decor.icon, color: accentToken, effects: { opacity: faint } })} ` +
        `style="position:absolute;right:1%;bottom:4%;width:${size}px;height:${size}px;opacity:${faint}">${glyph}</div>`
      )
    }
  }

  // The rail sits in the MARGIN, not on top of the text. At left:0 it shared
  // its x with the content column — every heading, table and eyebrow started
  // at the same coordinate, so the bar struck through the first characters of
  // whatever led the slide (seen on three separate slides of the GSE deck).
  // The content zone has a ~70px gutter to the slide edge, so pulling the rail
  // out of the column is free and matches how the reference decks draw it.
  const RAIL_GUTTER = 14
  if (decor.edge === "left") {
    parts.push(
      `<div ${bake("shape", { shape: "rect", fill: accentToken, radius: 2 })} ` +
      `style="position:absolute;left:-${RAIL_GUTTER}px;top:0;width:4px;height:100%;background:${accent};border-radius:2px"></div>`
    )
  } else if (decor.edge === "top") {
    parts.push(
      `<div ${bake("shape", { shape: "rect", fill: accentToken, radius: 2 })} ` +
      `style="position:absolute;left:0;top:-${RAIL_GUTTER}px;width:100%;height:4px;background:${accent};border-radius:2px"></div>`
    )
  }

  if (decor.corners) {
    const L = 34, W = 3, o = 0.5
    const arm = (style: string) =>
      `<div ${bake("shape", { shape: "rect", fill: accentToken, radius: 0 })} style="position:absolute;background:${accent};opacity:${o};${style}"></div>`
    parts.push(
      arm(`left:0;top:0;width:${L}px;height:${W}px`),
      arm(`left:0;top:0;width:${W}px;height:${L}px`),
      arm(`right:0;bottom:0;width:${L}px;height:${W}px`),
      arm(`right:0;bottom:0;width:${W}px;height:${L}px`),
    )
  }

  if (!parts.length) return ""
  // pointer-events:none is belt-and-braces for the editor; the layer sits
  // behind everything and is never the thing a user means to click first.
  return `<div class="decor" style="position:absolute;inset:0;pointer-events:none;overflow:hidden">${parts.join("")}</div>`
}
