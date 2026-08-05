// Surface fill resolution — shared by ALL THREE render paths.
//
// blueprintHtml draws a surface at measurement time, the compiler bakes it,
// and slideHtml (PDF/QA) plus SlideCanvas (editor) draw it again from the
// baked element. If those paths disagree the slide is measured as one thing
// and shipped as another — exactly the failure that made bulleted lists
// collapse into a paragraph. A gradient or glass card baked as a flat colour
// would be the same bug wearing different clothes, so the mapping lives here
// once and every path calls it.

export type FillStyleName = "plain" | "filled" | "tinted" | "outline" | "glass" | "gradient"

/** Two-digit hex alpha suffix — safe on any hex colour, unlike color-mix. */
export function alphaHex(a: number): string {
  return Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0")
}

export interface SurfacePaint {
  /** CSS `background` (or background-image for gradients). */
  background: string
  /** CSS `border` shorthand, or "" for none. */
  border: string
  /** Backdrop blur px, 0 for none. */
  blur: number
}

/**
 * @param fill        the chosen fill style
 * @param accent      RESOLVED accent colour (hex)
 * @param accentDeep  resolved deeper sibling, for gradients
 * @param surfaceHex  resolved neutral surface colour
 * @param borderHex   resolved subtle border colour
 * @param dark        whether the slide background is dark
 * @param intensity   0-1, steps `filled`/`tinted` strength for ramps
 */
export function surfacePaint(opts: {
  fill: FillStyleName
  accent: string
  accentDeep: string
  surfaceHex: string
  borderHex: string
  dark: boolean
  intensity?: number
}): SurfacePaint {
  const { fill, accent, accentDeep, surfaceHex, borderHex, dark } = opts
  const i = opts.intensity ?? 1

  switch (fill) {
    case "filled":
      return { background: i < 1 ? `${accent}${alphaHex(0.45 + 0.55 * i)}` : accent, border: "", blur: 0 }
    case "gradient":
      return { background: `linear-gradient(135deg,${accent},${accentDeep})`, border: "", blur: 0 }
    case "tinted":
      return {
        background: `${accent}${alphaHex(0.10 + 0.10 * i)}`,
        border: `1px solid ${accent}${alphaHex(0.28)}`,
        blur: 0,
      }
    case "outline":
      return { background: "transparent", border: `1.5px solid ${accent}${alphaHex(0.55)}`, blur: 0 }
    case "glass":
      return {
        background: "rgba(255,255,255,0.14)",
        border: "1px solid rgba(255,255,255,0.32)",
        blur: 10,
      }
    default:
      return {
        background: dark ? "rgba(255,255,255,0.10)" : surfaceHex,
        border: `1px solid ${dark ? "rgba(255,255,255,0.22)" : borderHex}`,
        blur: 0,
      }
  }
}

/** Text on `filled`, `gradient` and `glass` must invert to stay readable. */
export function fillCarriesInverseText(fill: FillStyleName): boolean {
  return fill === "filled" || fill === "gradient" || fill === "glass"
}
