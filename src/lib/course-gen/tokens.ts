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

export const TYPE_PX: Record<string, number> = {
  h1: 52, h2: 40, h3: 32, h4: 24, h5: 20,
  body: 16, small: 14, caption: 12, print: 10,
}

export function spacingPx(step: string | undefined, tokens: ThemeTokens): number {
  const map = tokens.spacing ?? { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 }
  return map[step ?? "md"] ?? 16
}
