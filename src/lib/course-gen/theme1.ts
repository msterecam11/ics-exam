// ICS Theme 1 — the main theme, transcribed from ICS's real course deck
// (Module 2 "Aerodrome Authorization and Design Establishment", 25 slides)
// and the official brand guideline. This object is the seed for the
// cg_themes row and the single source of truth the compiler/editor read.
//
// Masters own the FIXED chrome: title zone position, ICS logo, client
// (partner) logo, footer rule, page number, ghost numeral. Agents design
// only inside the content zone. Logo variants resolve PER SLOT from the
// background tone at that slot's own position (the real divider slide uses
// the white ICS logo because its top-right corner is dark even though the
// slide's left side is light).
//
// All x/y/width/height are percentages of the 1280×720 slide.
//
// v1 note: the cover background still has its title panel baked into the
// photo (asset-prep separation deferred) — the cover master's zones are
// aligned over the baked panel, which renders identically; separating the
// panel into a theme-drawn shape is a later asset task.

export type SlotTone = "dark" | "light"

export interface ChromeSlot {
  role: "ics_logo" | "partner_logo" | "footer_rule" | "page_number" | "ghost_numeral"
  x: number; y: number; width: number; height: number
  /** Background tone AT THIS SLOT — resolves logo variant (dark bg → white logo). */
  tone: SlotTone
  /** ics_logo only: which mark to use. */
  mark?: "full" | "icon"
}

export interface MasterZone {
  name: "title" | "subtitle" | "content" | "qr" | "url" | "socials"
  x: number; y: number; width: number; height: number
  /** Default text token for text zones. */
  token?: string
}

export interface Master {
  background: { asset: string; tone: SlotTone; css?: string }
  chrome: ChromeSlot[]
  zones: MasterZone[]
}

const A = "/course-gen/theme-1/backgrounds"

export const ICS_THEME_1 = {
  name: "ICS Theme 1",
  is_main: true,
  tokens: {
    colors: {
      // Corrected authoritative brand palette
      "primary": "#0C72C6",
      "primary-dark": "#045089",
      "primary-light": "#21B0D4",
      "text": "#333333",
      "text-inverse": "#FFFFFF",
      "navy": "#0A3D6E", // deep heading navy seen across the real deck
      // Semantic accents observed throughout the real deck (not in the
      // guideline table, but load-bearing in every content slide):
      "accent-warm": "#E8833A",  // orange headings/badges/accent bars
      "danger": "#C0392B",       // requirement/warning callout headings
      "success": "#27AE60",      // lifecycle/positive accents
      "tab-yellow": "#F2C14E",   // list-row accent tabs, badge borders
      "surface": "#FFFFFF",
      "surface-alt": "#F1F3F6",  // alternating list rows
      "surface-cream": "#FBF3E8",// requirement callout card fill
      "glass": "rgba(255,255,255,0.14)", // dark-summary translucent cards
      "border-subtle": "#DDE3EA",
    },
    type_scale: { h1: 60, h2: 50, h3: 40, h4: 30, h5: 25, body: 20, small: 17, caption: 14, print: 10 },
    font: "Plus Jakarta Sans",
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 },
    radius: { sm: 6, md: 12, lg: 20 },
    icon_style: "phosphor-regular",
  },

  layout_templates: {
    cover: {
      background: { asset: `${A}/cover.png`, tone: "dark" },
      chrome: [
        // Logos sit inside the baked panel's darker footer band.
        { role: "ics_logo", x: 10, y: 63, width: 16, height: 7, tone: "dark", mark: "full" },
        { role: "partner_logo", x: 28, y: 63, width: 12, height: 7, tone: "dark" },
      ],
      zones: [
        { name: "title", x: 10, y: 14, width: 33, height: 32, token: "h2" },
        { name: "subtitle", x: 10, y: 50, width: 31, height: 7, token: "small" },
      ],
    },
    section_divider: {
      background: { asset: `${A}/section.png`, tone: "light" },
      chrome: [
        // Top-right corner of this bg is dark → white logo, even though
        // the title area below is light. Per-slot tone in action.
        { role: "ics_logo", x: 75, y: 4, width: 21, height: 9, tone: "dark", mark: "full" },
        { role: "ghost_numeral", x: 7, y: 13, width: 20, height: 30, tone: "light" },
        { role: "partner_logo", x: 3.5, y: 89, width: 11, height: 7, tone: "light" },
        { role: "footer_rule", x: 16, y: 92.5, width: 76, height: 0.3, tone: "light" },
        { role: "page_number", x: 94, y: 90, width: 4, height: 5, tone: "light" },
      ],
      zones: [
        { name: "title", x: 7, y: 48, width: 56, height: 34, token: "h2" },
      ],
    },
    content_white: {
      background: { asset: `${A}/content-white.png`, tone: "light" },
      chrome: [
        { role: "ics_logo", x: 75, y: 4.5, width: 21, height: 9, tone: "light", mark: "full" },
        { role: "partner_logo", x: 3.5, y: 89, width: 11, height: 7, tone: "light" },
        { role: "footer_rule", x: 16, y: 92.5, width: 76, height: 0.3, tone: "light" },
        { role: "page_number", x: 94, y: 90, width: 4, height: 5, tone: "light" },
      ],
      zones: [
        { name: "title", x: 5.5, y: 5.5, width: 62, height: 17, token: "h3" },
        { name: "content", x: 5.5, y: 25, width: 89, height: 61 },
      ],
    },
    content_lightblue: {
      background: { asset: `${A}/content-lightblue.png`, tone: "light" },
      chrome: [
        { role: "ics_logo", x: 75, y: 4.5, width: 21, height: 9, tone: "light", mark: "full" },
        { role: "partner_logo", x: 3.5, y: 89, width: 11, height: 7, tone: "light" },
        { role: "footer_rule", x: 16, y: 92.5, width: 76, height: 0.3, tone: "light" },
        { role: "page_number", x: 94, y: 90, width: 4, height: 5, tone: "light" },
      ],
      zones: [
        { name: "title", x: 5.5, y: 5.5, width: 62, height: 17, token: "h3" },
        { name: "content", x: 5.5, y: 25, width: 89, height: 61 },
      ],
    },
    summary_dark: {
      background: { asset: `${A}/blue-radial2.png`, tone: "dark" },
      chrome: [
        { role: "ics_logo", x: 75, y: 4.5, width: 21, height: 9, tone: "dark", mark: "full" },
        { role: "partner_logo", x: 3.5, y: 89, width: 11, height: 7, tone: "dark" },
        { role: "footer_rule", x: 16, y: 92.5, width: 76, height: 0.3, tone: "dark" },
        { role: "page_number", x: 94, y: 90, width: 4, height: 5, tone: "dark" },
      ],
      zones: [
        { name: "title", x: 5.5, y: 5.5, width: 62, height: 17, token: "h3" },
        { name: "content", x: 5.5, y: 24, width: 89, height: 62 },
      ],
    },
    self_assessment: {
      background: { asset: `${A}/content-lightblue.png`, tone: "light" },
      chrome: [
        { role: "ics_logo", x: 75, y: 4.5, width: 21, height: 9, tone: "light", mark: "full" },
        { role: "partner_logo", x: 3.5, y: 89, width: 11, height: 7, tone: "light" },
        { role: "footer_rule", x: 16, y: 92.5, width: 76, height: 0.3, tone: "light" },
        { role: "page_number", x: 94, y: 90, width: 4, height: 5, tone: "light" },
      ],
      zones: [
        { name: "title", x: 5.5, y: 5.5, width: 62, height: 17, token: "h3" },
        { name: "content", x: 5.5, y: 25, width: 89, height: 61 },
      ],
    },
    closing_cta: {
      background: { asset: `${A}/person.png`, tone: "dark" },
      chrome: [
        { role: "ics_logo", x: 17, y: 8, width: 21, height: 9, tone: "dark", mark: "full" },
        { role: "partner_logo", x: 40, y: 8, width: 13, height: 9, tone: "dark" },
      ],
      zones: [
        { name: "title", x: 7, y: 29, width: 50, height: 15, token: "h3" },
        { name: "content", x: 8, y: 49, width: 44, height: 13, token: "body" },
        { name: "url", x: 8, y: 63, width: 42, height: 10 },
        { name: "socials", x: 12, y: 81, width: 40, height: 9 },
        // Phone screen in the background photo — QR image is placed here.
        { name: "qr", x: 66.5, y: 47, width: 12, height: 28 },
      ],
    },
  } satisfies Record<string, Master>,
}

// Module grammar (locked): every module = Cover → Section divider →
// Content ×N → Summary (dark) → Self-Assessment. The FINAL module of the
// course additionally ends with Closing/CTA (QR). Module 0 (front matter)
// uses Cover + Content masters only.
export const MODULE_GRAMMAR = {
  every_module: ["cover", "section_divider", "content_*", "summary_dark", "self_assessment"],
  final_module_appends: ["closing_cta"],
  module_zero: ["cover", "content_white"],
} as const

export function logoVariantFor(tone: SlotTone): string {
  return tone === "dark"
    ? "/course-gen/theme-1/logos/ics-full-white.png"
    : "/course-gen/theme-1/logos/ics-full-color.png"
}
