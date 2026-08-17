// Design linter — a pure-code critic over baked slide geometry.
//
// Why this exists: the compiler already measures precise x/y/w/h for every
// element on every slide, and then reduced all of it to two booleans. Most of
// what gets reported as a design problem — content pinned to one end, no
// visual hierarchy, text on a background it cannot be read against, boxes
// sitting on top of each other — is arithmetic over that discarded table.
//
// Compared with asking a vision model:
//   - free, and runs in under a millisecond
//   - deterministic, so it can be unit-tested and cannot "have an off day"
//   - specific: it can say "3 text sizes, largest 20px of an available 60"
//     where a reviewer says "the hierarchy feels flat"
//
// It does NOT replace the vision check. It catches what geometry can prove;
// taste, meaning and imagery still need eyes.
//
// ── On thresholds ──────────────────────────────────────────────────────────
// The check this replaces fired on 18 of 22 harness fixtures. A gate that
// rejects almost everything is not a strict gate, it is a broken one: every
// slide burns its retries and ships anyway, at three times the cost. So the
// rules are split deliberately:
//
//   GATING    unambiguous defects. Overlap, unreadable contrast, content
//             shoved to one end of its zone. A human would call each of
//             these a bug, not a preference.
//   ADVISORY  judgement calls. Thin content, flat type hierarchy. Reported
//             to the design agent as guidance, never used to fail a slide,
//             because "sparse" is sometimes the right answer.

import { resolveToken, SLIDE_W, SLIDE_H, type ThemeTokens } from "./tokens"
import type { CanvasElement } from "./primitives"
import type { Master } from "./theme1"

export interface LintFinding {
  rule: "balance" | "overlap" | "contrast" | "density" | "hierarchy"
  gating: boolean
  /** Written to be read by the design agent, so it names the fix. */
  message: string
}

export interface LintMetrics {
  topGapPct: number
  bottomGapPct: number
  occupancy: number
  inkCount: number
  fontSizes: number[]
  largestFont: number
}

export interface LintResult {
  /** True when no GATING rule fired. Advisory findings do not fail a slide. */
  pass: boolean
  findings: LintFinding[]
  metrics: LintMetrics
  /** Gating findings folded into one instruction, or "" when clean. */
  feedback: string
}

const INK_TYPES = new Set(["text", "icon", "image", "chart", "table"])

/** Horizontal bands the content zone is sliced into for the occupancy measure. */
const BANDS = 24

/**
 * Content is "shoved to one end" when one margin is this many points of the
 * zone's height larger than the other. Set from the harness: after the
 * relationship-primitive fix every fixture sits within ~5 points, while the
 * broken ones were 40-87.
 */
const BALANCE_TOLERANCE_PCT = 22

/** Genuinely near-empty: little ink AND spread over little of the zone. */
const SPARSE_OCCUPANCY = 0.3
const SPARSE_INK_COUNT = 8

/**
 * Two thresholds, because one produced a gate the agent could not satisfy.
 *
 * At a single 3.0 cutoff the harness failed five fixtures and every failure
 * was the ICS palette used exactly as the brand intends: white on the teal
 * (#21B0D4, 2.6:1), the orange heading on white (#E8833A, 2.7:1), white on
 * the escalation green (#27AE60, 2.9:1). The design agent is *instructed* to
 * use those accents, so bouncing the slide would only make it choose the
 * same colour again with the retry spent — the same failure mode as the
 * underfill check, wearing different clothes.
 *
 * So: UNREADABLE is where foreground and background are genuinely
 * indistinguishable — navy text on the dark master, the bug that motivated
 * this rule, sits near 1.0. That gates. Everything between is marginal, is
 * usually the brand, and is reported without failing anything.
 *
 * Note for the record: ICS orange on white really is 2.7:1, below the WCAG
 * AA large-text bar of 3.0. That is a palette question for a human, not
 * something a slide generator should quietly rewrite.
 */
const UNREADABLE_CONTRAST = 2.0
const MARGINAL_CONTRAST = 3.0

interface Box { top: number; bottom: number; left: number; right: number }

function boxOf(e: CanvasElement): Box {
  return {
    top: (e.y / 100) * SLIDE_H,
    bottom: ((e.y + (e.height ?? 0)) / 100) * SLIDE_H,
    left: (e.x / 100) * SLIDE_W,
    right: ((e.x + (e.width ?? 0)) / 100) * SLIDE_W,
  }
}

// ── Contrast ───────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split("").map(c => c + c).join("")
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio, 1..21. */
export function contrastRatio(fg: string, bg: string): number | null {
  const a = hexToRgb(fg), b = hexToRgb(bg)
  if (!a || !b) return null
  const la = relativeLuminance(a), lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

function contains(outer: Box, inner: Box): boolean {
  return outer.left <= inner.left + 2 && outer.right >= inner.right - 2
    && outer.top <= inner.top + 2 && outer.bottom >= inner.bottom - 2
}

/**
 * What sits behind a text element: the topmost shape that fully contains it
 * and paints below it, else the master's own background.
 *
 * Returns null when the backdrop cannot be established confidently — a
 * gradient or glass fill has no single colour, and a false "unreadable"
 * verdict is worse than a miss, because it would send a correct slide back
 * for a redesign it does not need.
 */
function backdropFor(el: CanvasElement, all: CanvasElement[], master: Master, tokens: ThemeTokens,
  /** Filled in with a description of whichever shape supplied the colour. */
  via?: { from?: string },
): string | null {
  const box = boxOf(el)
  const z = el.zIndex ?? 0
  const behind = all
    .filter(o => o.type === "shape" && (o.zIndex ?? 0) < z && contains(boxOf(o), box))
    .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))

  const top = behind[0] as any
  if (top) {
    const fs = top.style?.fillStyle
    if (fs === "gradient" || fs === "glass") return null
    // A tinted / outline surface paints the accent at low alpha over the
    // slide background, so the effective backdrop is the slide, not the token.
    if (fs === "tinted" || fs === "outline" || fs === "plain") {
      return master.background.tone === "dark" ? "#0A3D6E" : "#FFFFFF"
    }
    const fill = top.style?.fill
    if (!fill) return null
    if (via) via.from = `${top.type}/${String(fill)}${fs ? `/${fs}` : "/no-fillStyle"}`
    // A shape that never declared HOW it paints cannot be trusted as an opaque
    // backdrop. Several primitives bake a decorative accent rule or stripe as a
    // plain rect with no `fillStyle`, and the geometry alone cannot tell that
    // apart from a solid filled card. Treating those as opaque produced a
    // GATING "text is invisible" verdict on an accent heading that renders
    // perfectly legibly (#E8833A on #E8833A, real slide, orange-on-light-blue
    // in the PNG) — and a false gate is expensive twice over: the slide burns
    // every retry, and the agent is told to change a colour that was correct.
    //
    // This is the behaviour the docstring above already asks for: when the
    // backdrop cannot be established confidently, miss rather than misfire. The
    // case that motivated the contrast rule — navy text on the dark master —
    // comes from the master branch below, not from a shape, so it still gates.
    if (!fs) return null
    const resolved = resolveToken(String(fill), tokens, "")
    return resolved && resolved.startsWith("#") ? resolved : null
  }
  return master.background.tone === "dark" ? "#0A3D6E" : "#FFFFFF"
}

// ── The linter ─────────────────────────────────────────────────────────────

export function lintSlide(
  elements: CanvasElement[],
  master: Master,
  tokens: ThemeTokens,
): LintResult {
  const findings: LintFinding[] = []
  const zone = master.zones.find(z => z.name === "content")

  const zoneTop = ((zone?.y ?? 0) / 100) * SLIDE_H
  const zoneH = ((zone?.height ?? 100) / 100) * SLIDE_H
  const zoneBottom = zoneTop + zoneH

  // Only what the agent composed. Title and subtitle live in their own master
  // zones; counting them would mask a body that is genuinely empty.
  const inZone = elements.filter(e => boxOf(e).top >= zoneTop - 2 && !e.decor)
  const ink = inZone.filter(e => INK_TYPES.has(e.type))

  const metrics: LintMetrics = {
    topGapPct: 0, bottomGapPct: 0, occupancy: 0,
    inkCount: ink.length, fontSizes: [], largestFont: 0,
  }

  if (ink.length === 0) {
    return {
      pass: false, metrics,
      findings: [{ rule: "density", gating: true, message: "The content area is empty — nothing was composed inside it." }],
      feedback: "The content area came out empty. Compose the slide's material inside it.",
    }
  }

  const inkTop = Math.min(...ink.map(e => boxOf(e).top))
  const inkBottom = Math.max(...ink.map(e => boxOf(e).bottom))
  metrics.topGapPct = round1(((inkTop - zoneTop) / zoneH) * 100)
  metrics.bottomGapPct = round1(((zoneBottom - inkBottom) / zoneH) * 100)

  const bandH = zoneH / BANDS
  let filled = 0
  for (let i = 0; i < BANDS; i++) {
    const bTop = zoneTop + i * bandH, bBottom = bTop + bandH
    if (ink.some(e => { const b = boxOf(e); return b.bottom > bTop && b.top < bBottom })) filled++
  }
  metrics.occupancy = round2(filled / BANDS)

  metrics.fontSizes = Array.from(new Set(
    inZone.filter(e => e.type === "text")
      .map(e => Math.round((e as any).style?.fontSize ?? 0))
      .filter(n => n > 0)
  )).sort((a, b) => a - b)
  metrics.largestFont = metrics.fontSizes[metrics.fontSizes.length - 1] ?? 0

  // ── GATING: balance ──────────────────────────────────────────────────────
  // Measures WHERE the content sits, not how tall it is. The check this
  // replaces divided the ink's span by the zone height, which says nothing
  // about placement: content jammed into the bottom two-thirds scored the
  // same as content distributed evenly, and passed.
  const skew = metrics.topGapPct - metrics.bottomGapPct
  if (Math.abs(skew) > BALANCE_TOLERANCE_PCT) {
    const end = skew > 0 ? "bottom" : "top"
    const empty = Math.max(metrics.topGapPct, metrics.bottomGapPct)
    findings.push({
      rule: "balance", gating: true,
      message: `The composition is pushed to the ${end} of its area — ${empty}% of the height is empty at the other end. Balance it, or use a shape that occupies the area evenly.`,
    })
  }

  // ── GATING: overlap ──────────────────────────────────────────────────────
  const collisions: string[] = []
  for (let i = 0; i < ink.length; i++) {
    for (let j = i + 1; j < ink.length; j++) {
      const a = boxOf(ink[i]), b = boxOf(ink[j])
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2
        && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) {
        collisions.push(`${ink[i].id}+${ink[j].id}`)
      }
    }
  }
  if (collisions.length) {
    findings.push({
      rule: "overlap", gating: true,
      message: `${collisions.length} pair(s) of elements physically overlap. Reduce the amount of material or choose a simpler structure so each item has its own space.`,
    })
  }

  // ── GATING: chart boxed too small to read ──────────────────────────────────
  // chartSvg draws one SVG with a FIXED viewBox (1000×385) and fixed font
  // sizes in viewBox units, scaled uniformly to whatever box it's given —
  // that's how SVG viewBox scaling works, nothing here can special-case just
  // the text. A chart placed in, say, a half-width column next to a table
  // renders its 11px axis labels at roughly half that in real pixels:
  // unreadable. There's no way to fix this by drawing differently; the box
  // itself has to be wide enough. 420px is ~34% of the 1233px content zone —
  // below that, real courses showed axis text shrunk past legibility.
  const MIN_CHART_WIDTH_PX = 420
  const undersizedCharts = inZone.filter(el => el.type === "chart" && boxOf(el).right - boxOf(el).left < MIN_CHART_WIDTH_PX)
  if (undersizedCharts.length) {
    findings.push({
      rule: "balance", gating: true,
      message: `A chart is boxed too narrow to read (under ${MIN_CHART_WIDTH_PX}px of a ${Math.round(SLIDE_W * 0.89)}px content zone) — its axis labels render illegibly small. Give the chart most of the row's width, or stack it above/below its neighbour instead of splitting the row evenly.`,
    })
  }

  // ── contrast: gating when unreadable, advisory when merely marginal ───────
  const unreadable: string[] = []
  const marginal: string[] = []
  for (const el of inZone) {
    if (el.type !== "text") continue
    const color = (el as any).style?.color
    if (!color) continue
    const fg = resolveToken(String(color), tokens, "")
    if (!fg || !fg.startsWith("#")) continue
    const via: { from?: string } = {}
    const bg = backdropFor(el, elements, master, tokens, via)
    if (!bg) continue
    const ratio = contrastRatio(fg, bg)
    if (ratio === null) continue
    // Name the offending text, not just the colour pair. "#E8833A on #E8833A"
    // identifies a collision but not WHICH element caused it, so neither a
    // human debugging the slide nor the design agent receiving this as retry
    // feedback can act on it — the agent is being told to fix something it
    // cannot locate. A few words of the actual run makes it findable.
    const runs = (el as any).runs as { text?: string }[] | undefined
    const excerpt = (runs ?? []).map(r => r?.text ?? "").join("").trim().slice(0, 40)
    const pair = `${fg} on ${bg} (${ratio.toFixed(1)}:1)${excerpt ? ` — "${excerpt}"` : ""}${via.from ? ` [behind: ${via.from}]` : ""}`
    if (ratio < UNREADABLE_CONTRAST) unreadable.push(pair)
    else if (ratio < MARGINAL_CONTRAST) marginal.push(pair)
  }
  if (unreadable.length) {
    findings.push({
      rule: "contrast", gating: true,
      message: `Text is effectively invisible against what sits behind it: ${dedupe(unreadable).slice(0, 3).join("; ")}. On this slide's background, pick colours from the opposite end of the palette.`,
    })
  }
  if (marginal.length) {
    findings.push({
      rule: "contrast", gating: false,
      message: `Low contrast (below ${MARGINAL_CONTRAST}:1) on: ${dedupe(marginal).slice(0, 3).join("; ")}. Readable at large bold sizes; avoid these pairings for small or long-form text.`,
    })
  }

  // ── ADVISORY: density ────────────────────────────────────────────────────
  if (metrics.occupancy < SPARSE_OCCUPANCY && ink.length < SPARSE_INK_COUNT) {
    findings.push({
      rule: "density", gating: false,
      message: `Thin: ${ink.length} visible items covering ${Math.round(metrics.occupancy * 100)}% of the area. If the gathered material supports another point, a supporting stat or a second example, add it.`,
    })
  }

  // ── ADVISORY: hierarchy ──────────────────────────────────────────────────
  if (metrics.fontSizes.length > 0 && metrics.fontSizes.length <= 2 && ink.length >= 4) {
    findings.push({
      rule: "hierarchy", gating: false,
      message: `Flat hierarchy: everything renders at ${metrics.fontSizes.join("/")}px. Nothing is visually dominant — decide which single element should be read first and let it be larger.`,
    })
  }

  const gating = findings.filter(f => f.gating)
  return {
    pass: gating.length === 0,
    findings,
    metrics,
    feedback: gating.map(f => f.message).join(" "),
  }
}

/** A repeated colour pairing is one problem, not six — listing the same pair
 *  once per element buries the other findings in the feedback string. */
function dedupe(xs: string[]): string[] { return Array.from(new Set(xs)) }

function round1(n: number): number { return Math.round(n * 10) / 10 }
function round2(n: number): number { return Math.round(n * 100) / 100 }
