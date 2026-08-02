// Stamping a master → the starter elements a new slide begins with.
//
// A new slide should never be an empty rectangle: the master defines where
// the title, subtitle and content belong, so those boxes are created up
// front, correctly sized, coloured for the background's tone, and typed
// from the theme's scale. They are marked `placeholder` so the editor can
// show them as prompts and clear them on first edit — the same way a
// PowerPoint layout hands you "Click to add title".

import type { CanvasElement } from "./primitives"
import type { Master } from "./theme1"
import type { ThemeTokens } from "./tokens"
import { TYPE_PX } from "./tokens"

const PROMPTS: Record<string, Record<string, string>> = {
  cover:            { title: "Course title", subtitle: "Subtitle or tagline" },
  section_divider:  { title: "Module title" },
  summary_dark:     { title: "Summary and Key Takeaways", content: "Add the key points — or ask the AI assistant to write them." },
  self_assessment:  { title: "Self-Assessment", content: "Add review questions — or ask the AI assistant to generate them." },
  closing_cta:      { title: "Thank you", content: "Closing message" },
}
const DEFAULT_PROMPTS = { title: "Slide title", content: "Add content here — or ask the AI assistant to fill this slide." }

export function stampMaster(
  master: Master,
  tokens: ThemeTokens,
  layoutKind: string
): CanvasElement[] {
  const dark = master.background?.tone === "dark"
  const prompts = { ...DEFAULT_PROMPTS, ...(PROMPTS[layoutKind] ?? {}) }
  const out: CanvasElement[] = []
  let z = 1

  for (const zone of master.zones ?? []) {
    // url / socials / qr are composed artwork slots, not text placeholders.
    if (!["title", "subtitle", "content"].includes(zone.name)) continue
    const text = (prompts as Record<string, string>)[zone.name]
    if (!text) continue

    const isTitle = zone.name === "title"
    const fontSize =
      (tokens.type_scale as any)?.[zone.token ?? ""] ??
      TYPE_PX[zone.token ?? ""] ??
      (isTitle ? 32 : zone.name === "subtitle" ? 18 : 16)

    out.push({
      id: `el-${zone.name}`,
      type: "text",
      x: zone.x, y: zone.y, width: zone.width, height: zone.height,
      zIndex: z++,
      placeholder: true,
      runs: [{ text, bold: isTitle }],
      style: {
        fontSize,
        fontWeight: isTitle ? 800 : 400,
        color: dark ? "token:text-inverse" : isTitle ? "token:navy" : "token:text",
        align: "left",
        lineHeight: isTitle ? 1.2 : 1.5,
      },
    } as CanvasElement)
  }

  return out
}
