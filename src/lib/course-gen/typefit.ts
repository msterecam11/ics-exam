// Title auto-fit — picks a font size that keeps a title inside its zone.
//
// Master zones carry a FIXED type token (h2, h3…), so a long course title
// rendered at that fixed size simply overflowed its box: on the cover it ran
// straight through the logo/tagline band underneath. Shrinking to fit is what
// a designer does by reflex, and it is the only way one master can serve both
// "Apron Safety" and "Aerodrome Certification: Executive Accountability Under
// ICAO Annex 14 and GACAR Part 139".
//
// Deliberately a metric estimate rather than a browser measurement: this runs
// on the title-only path (cover, divider, closing) where no browser is open,
// and it must agree with the compiler's own path so a title never changes
// size depending on which code drew it. The estimate is tuned to run slightly
// conservative — shrinking one step early is invisible, overflowing is not.

/** Mean glyph advance as a fraction of font size, Plus Jakarta Sans 700-800. */
const GLYPH_RATIO = 0.53

/** Never shrink below this — past it the title stops reading as a title. */
const MIN_RATIO = 0.55

export function fitTitleFontSize(opts: {
  text: string
  /** Zone box in pixels. */
  widthPx: number
  heightPx: number
  /** The master's intended size — the ceiling, never exceeded. */
  baseSize: number
  lineHeight?: number
}): number {
  const { text, widthPx, heightPx, baseSize } = opts
  const lineHeight = opts.lineHeight ?? 1.2
  const chars = text.trim().length
  if (!chars || widthPx <= 0 || heightPx <= 0) return baseSize

  const floor = Math.max(12, Math.round(baseSize * MIN_RATIO))

  for (let size = baseSize; size > floor; size -= 1) {
    const charsPerLine = Math.max(1, Math.floor(widthPx / (size * GLYPH_RATIO)))
    // Word wrapping breaks earlier than a pure character count implies, so
    // the line estimate is nudged up rather than trusted exactly.
    const lines = Math.ceil(chars / charsPerLine)
    if (lines * size * lineHeight <= heightPx) return size
  }
  return floor
}

/**
 * "Module 3: Aerodrome Manual Governance" -> "Aerodrome Manual Governance".
 *
 * The divider master already shows the module number as a large ghost
 * numeral, so repeating "Module 3:" in the title says the same thing twice
 * and steals width from the part that carries meaning.
 */
export function stripModulePrefix(title: string): string {
  return title.replace(/^\s*module\s+\d+\s*[:–—-]\s*/i, "").trim() || title
}
