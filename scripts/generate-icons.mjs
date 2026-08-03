// Generates src/lib/course-gen/icons.ts from @phosphor-icons/core.
//
// Run: node scripts/generate-icons.mjs
//
// Why a generated constant rather than reading SVGs at render time: the slide
// compiler builds HTML strings inside headless Chromium, where a filesystem
// read of node_modules is fragile (Next.js output tracing may not ship the
// assets, and the same code has to work in the editor preview and the PDF
// export). Inlining is the same choice made for fonts, for the same reason.
//
// Curated rather than complete: Phosphor ships ~9,000 icons across six
// weights. The full set as a TS constant is megabytes for no benefit, and an
// unbounded vocabulary is worse for the agents anyway — they can only pick a
// name that exists if we tell them which names exist.

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const WEIGHT = "regular"
const SRC = "node_modules/@phosphor-icons/core/assets/" + WEIGHT
const OUT = "src/lib/course-gen/icons.ts"

/**
 * The vocabulary offered to the content and chat agents, grouped by what an
 * aviation training deck actually needs to depict. Grouping is preserved in
 * the generated file so the prompt can present it the same way — an agent
 * picking from "Safety and risk" chooses better than one scanning 150 flat
 * strings.
 */
const GROUPS = {
  "Aviation and operations": [
    "airplane", "airplane-takeoff", "airplane-landing", "airplane-tilt",
    "airplane-in-flight", "airplane-taxiing", "crane-tower", "path", "compass",
    "globe", "globe-stand", "map-pin", "map-trifold", "navigation-arrow",
    "wind", "cloud", "cloud-sun", "thermometer", "gas-pump", "tire", "truck",
    "package", "shipping-container", "buildings", "factory", "garage",
  ],
  "Safety and risk": [
    "shield", "shield-check", "shield-warning", "shield-slash", "warning",
    "warning-circle", "warning-octagon", "warning-diamond", "fire",
    "fire-extinguisher", "first-aid", "first-aid-kit", "hard-hat", "lifebuoy",
    "prohibit", "prohibit-inset", "siren", "eye", "eye-slash", "bandaids",
    "heartbeat", "pulse", "skull", "biohazard", "radioactive",
  ],
  "Compliance and documents": [
    "file-text", "file-magnifying-glass", "file-plus", "file-x", "files", "folder",
    "folder-open", "clipboard", "clipboard-text", "certificate", "seal-check",
    "seal-warning", "stamp", "scales", "gavel", "book", "book-open",
    "book-bookmark", "bookmark", "note", "note-pencil", "notepad",
    "list-checks", "list-bullets", "list-numbers", "checks", "check",
    "check-circle", "check-square", "x-circle", "signature", "read-cv-logo",
  ],
  "People and roles": [
    "user", "users", "users-three", "user-circle", "user-circle-check",
    "user-focus", "user-gear", "identification-badge", "identification-card",
    "handshake", "chalkboard-teacher", "student", "briefcase", "headset",
    "person", "person-simple-walk", "wheelchair",
  ],
  "Process and workflow": [
    "arrows-clockwise", "arrow-right", "arrow-left", "arrow-up", "arrow-down",
    "arrows-left-right", "arrow-u-up-left", "flow-arrow", "git-branch",
    "tree-structure", "funnel", "gear", "gear-six", "wrench", "toolbox",
    "timer", "clock", "clock-countdown", "calendar", "calendar-check",
    "calendar-x", "hourglass", "play", "pause", "stop", "repeat",
  ],
  "Data and analysis": [
    "chart-bar", "chart-line", "chart-line-up", "chart-pie", "chart-donut",
    "trend-up", "trend-down", "gauge", "target", "crosshair",
    "magnifying-glass", "magnifying-glass-plus", "presentation",
    "presentation-chart", "table", "database", "percent", "calculator",
    "equals", "math-operations",
  ],
  "Communication": [
    "chat-circle", "chat-text", "chats", "megaphone", "bell", "bell-ringing",
    "envelope", "envelope-open", "phone", "phone-call", "broadcast",
    "radio", "wifi-high", "share-network", "link",
  ],
  "Security and access": [
    "lock", "lock-key", "lock-open", "lock-laminated", "key", "fingerprint",
    "scan", "security-camera", "door", "door-open", "password", "shield-star",
  ],
  "Quality and recognition": [
    "star", "star-half", "medal", "trophy", "thumbs-up", "thumbs-down",
    "ranking", "crown", "confetti", "sparkle",
  ],
  "General": [
    "info", "question", "lightbulb", "lightning", "flag", "flag-banner",
    "push-pin", "tag", "plus", "minus", "dots-three", "caret-right",
    "caret-down", "hand-pointing", "strategy", "puzzle-piece", "stack",
    "cube", "squares-four", "circles-three", "dot", "asterisk",
  ],
}

const entries = []
const missing = []

for (const [group, names] of Object.entries(GROUPS)) {
  for (const name of names) {
    const file = join(SRC, name + ".svg")
    if (!existsSync(file)) { missing.push(name); continue }
    const svg = readFileSync(file, "utf8")
    // Everything between the opening <svg …> and closing </svg>: usually one
    // <path>, occasionally several. Kept verbatim so the glyph is exact.
    const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim()
    if (!inner) { missing.push(name); continue }
    entries.push({ name, group, inner })
  }
}

entries.sort((a, b) => a.name.localeCompare(b.name))

const byGroup = {}
for (const e of entries) (byGroup[e.group] ??= []).push(e.name)

const header = `// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/generate-icons.mjs
//
// Phosphor Icons (MIT) inlined as raw SVG bodies. Every glyph shares the
// viewBox "0 0 256 256" and uses fill="currentColor", so size comes from the
// wrapper's width/height and colour from CSS \`color\` — which means a theme
// token drives it exactly like every other coloured thing on a slide.
//
// ${entries.length} icons across ${Object.keys(byGroup).length} groups.

/** Raw SVG body (the children of <svg>), keyed by Phosphor icon name. */
export const ICON_PATHS: Record<string, string> = {
${entries.map(e => `  ${JSON.stringify(e.name)}: ${JSON.stringify(e.inner)},`).join("\n")}
}

/** The vocabulary offered to the agents, grouped so they choose by meaning. */
export const ICON_GROUPS: Record<string, string[]> = {
${Object.entries(byGroup).map(([g, ns]) => `  ${JSON.stringify(g)}: ${JSON.stringify(ns)},`).join("\n")}
}

export const ICON_NAMES: string[] = Object.keys(ICON_PATHS)

/**
 * Renders an icon as an inline SVG string.
 *
 * An unknown name yields \`null\` rather than a broken glyph or a silent gap —
 * callers decide what a miss looks like. Agents are given the name list, so a
 * miss means either a hallucinated name or a stale exemplar, both worth seeing.
 */
export function iconSvg(
  name: string,
  opts: { size?: number | string; color?: string } = {}
): string | null {
  const body = ICON_PATHS[name]
  if (!body) return null
  // A number is pixels; a string passes through, so "100%" fills a
  // positioned box — which is what baked (absolute) elements need.
  const size = typeof opts.size === "number" ? \`\${opts.size}\` : (opts.size ?? "20")
  const color = opts.color ?? "currentColor"
  return \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="\${size}" height="\${size}" fill="currentColor" style="color:\${color};flex-shrink:0;display:block">\${body}</svg>\`
}

/** Prompt-ready listing, grouped, for the agents that choose icons. */
export function iconPromptBlock(): string {
  return Object.entries(ICON_GROUPS)
    .map(([group, names]) => \`  \${group}: \${names.join(", ")}\`)
    .join("\\n")
}
`

writeFileSync(OUT, header, "utf8")

console.log(`wrote ${OUT}`)
console.log(`  ${entries.length} icons, ${Object.keys(byGroup).length} groups`)
console.log(`  approx size: ${(header.length / 1024).toFixed(1)} KB`)
if (missing.length) {
  console.log(`\n  ${missing.length} curated name(s) not in Phosphor ${WEIGHT} — dropped:`)
  console.log("    " + missing.join(", "))
}
