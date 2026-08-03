// Element effects → CSS. Shared by the server-side slide renderer and the
// client-side canvas editor so an effect looks identical while editing,
// in QA screenshots, and in the exported PDF.

import type { ElementEffects } from "./primitives"
import { resolveToken, type ThemeTokens } from "./tokens"

const SHADOWS: Record<string, string> = {
  none: "none",
  sm: "0 1px 3px rgba(0,0,0,.12)",
  md: "0 6px 18px rgba(0,0,0,.15)",
  lg: "0 16px 40px rgba(0,0,0,.22)",
  glow: "0 0 24px rgba(12,114,198,.55)",
}

const TEXT_SHADOWS: Record<string, string> = {
  none: "none",
  soft: "0 1px 3px rgba(0,0,0,.35)",
  strong: "0 2px 8px rgba(0,0,0,.65)",
}

const MASKS: Record<string, string> = {
  none: "",
  circle: "border-radius:50%;",
  rounded: "border-radius:16px;",
  squircle: "border-radius:28%;",
}

/** CSS for effects that apply to the element box (shape/image/text alike). */
export function effectsCss(e: ElementEffects | undefined, tokens: ThemeTokens, isText = false): string {
  if (!e) return ""
  const out: string[] = []

  if (e.shadow && e.shadow !== "none") {
    // Text uses a glyph shadow; boxes use a drop shadow.
    out.push(isText ? `text-shadow:${SHADOWS[e.shadow]}` : `box-shadow:${SHADOWS[e.shadow]}`)
  }
  if (e.textShadow && e.textShadow !== "none") out.push(`text-shadow:${TEXT_SHADOWS[e.textShadow]}`)
  if (typeof e.opacity === "number") out.push(`opacity:${e.opacity}`)
  if (e.blur) out.push(`backdrop-filter:blur(${e.blur}px);-webkit-backdrop-filter:blur(${e.blur}px)`)

  if (e.textStroke && e.textStroke.width > 0) {
    const c = resolveToken(e.textStroke.color, tokens, "#000")
    out.push(`-webkit-text-stroke:${e.textStroke.width}px ${c}`)
  }

  if (e.gradient) {
    const from = resolveToken(e.gradient.from, tokens, "#0C72C6")
    const to = resolveToken(e.gradient.to, tokens, "#045089")
    const angle = e.gradient.angle ?? 135
    const grad = `linear-gradient(${angle}deg, ${from}, ${to})`
    if (isText) {
      // Gradient-filled text: paint the gradient through the glyphs.
      out.push(`background-image:${grad}`, "-webkit-background-clip:text", "background-clip:text", "color:transparent")
    } else {
      out.push(`background-image:${grad}`)
    }
  }

  const filters: string[] = []
  if (e.grayscale) filters.push("grayscale(1)")
  if (typeof e.brightness === "number" && e.brightness !== 1) filters.push(`brightness(${e.brightness})`)
  if (typeof e.saturate === "number" && e.saturate !== 1) filters.push(`saturate(${e.saturate})`)
  if (filters.length) out.push(`filter:${filters.join(" ")}`)

  if (e.mask && e.mask !== "none") out.push(MASKS[e.mask].replace(/;$/, ""))

  if (e.border && e.border.width > 0) {
    const c = resolveToken(e.border.color, tokens, "#DDE3EA")
    out.push(`border:${e.border.width}px ${e.border.style ?? "solid"} ${c}`)
  }

  return out.length ? out.join(";") + ";" : ""
}
