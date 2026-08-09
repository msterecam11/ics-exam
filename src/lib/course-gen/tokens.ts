// Token resolution — turns "token:accent-warm" references into concrete CSS
// values from a theme's tokens. The compiler and the editor's renderer both
// use this, so a theme swap repaints identically everywhere.

export interface ThemeTokens {
  colors: Record<string, string>
  type_scale: Record<string, number>
  font: string
  spacing: Record<string, number>
  radius: Record<string, number>
  icon_style?: string
}

export function resolveToken(ref: string | undefined, tokens: ThemeTokens, fallback: string): string {
  if (!ref) return fallback
  if (ref.startsWith("token:")) {
    const key = ref.slice(6)
    return tokens.colors[key] ?? fallback
  }
  return ref // literal value (editor-set)
}

// Slide reference size is 1280×720. The guideline's pt scale is authored for
// print/full-res; these are the on-canvas px equivalents used consistently by
// the compiler, the editor renderer, and the QA screenshots.
export const SLIDE_W = 1280
export const SLIDE_H = 720

/**
 * Fallback type scale, for a theme that omits one. THE THEME IS THE SOURCE
 * OF TRUTH — use `typeScale(tokens)`, not this, wherever tokens are in hand.
 *
 * These numbers used to be the only scale the primitives ever saw, and they
 * disagreed with the theme's own: ICS Theme 1 defines body at 20px and this
 * said 16, h5 at 25 against 20, h3 at 40 against 32. Only the slide TITLE
 * read the theme (via titleZoneElements), so every body of every slide
 * rendered about 20% smaller than the brand specifies — which is what "the
 * text is always small" was describing — and re-theming changed titles while
 * leaving all body text untouched.
 *
 * Now aligned to ICS Theme 1 so the fallback is not itself a second opinion.
 */
export const TYPE_PX: Record<string, number> = {
  h1: 60, h2: 50, h3: 40, h4: 30, h5: 25,
  body: 20, small: 17, caption: 14, print: 10,
}

/** The theme's scale, with the fallback filling any gaps. */
export function typeScale(tokens: ThemeTokens | undefined): Record<string, number> {
  return { ...TYPE_PX, ...((tokens?.type_scale as Record<string, number>) ?? {}) }
}

export function spacingPx(step: string | undefined, tokens: ThemeTokens): number {
  const map = tokens.spacing ?? { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 }
  return map[step ?? "md"] ?? 16
}
