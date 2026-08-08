// Geometry probe — a read-only preview of the design linter.
//
// It reports on the BAKED elements the compiler already produces, using only
// arithmetic. Nothing here calls a model, and nothing here can change what
// ships: it is a measuring instrument, not a gate. The gate comes later, when
// these rules have been checked against enough real slides to trust them.
//
// The point it exists to make: almost everything reported below was already
// visible in data the pipeline computes on every slide and then discards. The
// compiler reduces a full geometry table to two booleans.

import { SLIDE_W, SLIDE_H } from "../tokens"
import type { CanvasElement } from "../primitives"
import type { Master } from "../theme1"

export interface Probe {
  /** % of the content zone's height that is empty ABOVE the first ink. */
  topGapPct: number
  /** % empty BELOW the last ink. */
  bottomGapPct: number
  /** Fraction of the zone's horizontal bands that contain any ink. */
  occupancy: number
  /** What the CURRENT check computes, for comparison. */
  legacySpanRatio: number
  /** Distinct rendered font sizes, ascending. */
  fontSizes: number[]
  /** Largest rendered size vs. the theme's largest available. */
  largestFont: number
  /** Distinct left edges after snapping to 2px — many values = ragged. */
  leftEdges: number[]
  /** Element pairs whose boxes overlap by more than 2px. */
  overlaps: [string, string][]
  inkCount: number
  notes: string[]
}

const INK_TYPES = new Set(["text", "icon", "image", "chart", "table"])

/** Horizontal bands the zone is divided into when measuring occupancy. */
const BANDS = 24

export function probeGeometry(elements: CanvasElement[], master: Master): Probe {
  const zone = master.zones.find(z => z.name === "content")
  const notes: string[] = []

  const zoneTop = ((zone?.y ?? 0) / 100) * SLIDE_H
  const zoneH = ((zone?.height ?? 100) / 100) * SLIDE_H
  const zoneBottom = zoneTop + zoneH

  // Only elements INSIDE the content zone count. The title/subtitle live in
  // their own master zones and would otherwise mask a genuinely empty body.
  const px = (e: CanvasElement) => ({
    top: (e.y / 100) * SLIDE_H,
    bottom: ((e.y + (e.height ?? 0)) / 100) * SLIDE_H,
    left: (e.x / 100) * SLIDE_W,
    right: ((e.x + (e.width ?? 0)) / 100) * SLIDE_W,
  })

  const inZone = elements.filter(e => px(e).top >= zoneTop - 2)
  const ink = inZone.filter(e => INK_TYPES.has(e.type))

  if (ink.length === 0) {
    notes.push("No ink inside the content zone at all.")
    return {
      topGapPct: 100, bottomGapPct: 0, occupancy: 0, legacySpanRatio: 0,
      fontSizes: [], largestFont: 0, leftEdges: [], overlaps: [], inkCount: 0, notes,
    }
  }

  const inkTop = Math.min(...ink.map(e => px(e).top))
  const inkBottom = Math.max(...ink.map(e => px(e).bottom))

  const topGapPct = round1(((inkTop - zoneTop) / zoneH) * 100)
  const bottomGapPct = round1(((zoneBottom - inkBottom) / zoneH) * 100)
  const legacySpanRatio = round2((inkBottom - inkTop) / zoneH)

  // Occupancy: slice the zone into bands and ask which contain ink. This is
  // the measure the current check should have been using — a span says
  // nothing about a hole in the middle, or about content bunched at one end.
  const bandH = zoneH / BANDS
  let filled = 0
  for (let i = 0; i < BANDS; i++) {
    const bTop = zoneTop + i * bandH
    const bBottom = bTop + bandH
    if (ink.some(e => { const p = px(e); return p.bottom > bTop && p.top < bBottom })) filled++
  }
  const occupancy = round2(filled / BANDS)

  // Typography: how many distinct sizes actually made it to the page?
  const fontSizes = Array.from(new Set(
    inZone.filter(e => e.type === "text")
      .map(e => Math.round((e as any).style?.fontSize ?? 0))
      .filter(n => n > 0)
  )).sort((a, b) => a - b)
  const largestFont = fontSizes.length ? fontSizes[fontSizes.length - 1] : 0

  // Alignment: distinct left edges, snapped to 2px. A well-aligned slide has
  // few; a ragged one has one per element.
  const leftEdges = Array.from(new Set(
    inZone.map(e => Math.round(px(e).left / 2) * 2)
  )).sort((a, b) => a - b)

  // Overlap between ink boxes — never intentional for text.
  const overlaps: [string, string][] = []
  for (let i = 0; i < ink.length; i++) {
    for (let j = i + 1; j < ink.length; j++) {
      const a = px(ink[i]), b = px(ink[j])
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (ox > 2 && oy > 2) overlaps.push([ink[i].id, ink[j].id])
    }
  }

  if (topGapPct > 12) notes.push(`Dead band: ${topGapPct}% of the zone is empty above the first ink.`)
  if (occupancy < 0.7) notes.push(`Sparse: only ${Math.round(occupancy * 100)}% of the zone's bands contain ink.`)
  if (fontSizes.length <= 2) notes.push(`Flat hierarchy: ${fontSizes.length} distinct text size(s) — ${fontSizes.join("/")}px.`)
  if (largestFont > 0 && largestFont < 30) notes.push(`Nothing is large: biggest text is ${largestFont}px of an available 60px scale.`)
  if (leftEdges.length > 6) notes.push(`Ragged: ${leftEdges.length} distinct left edges.`)
  if (overlaps.length) notes.push(`${overlaps.length} overlapping ink pair(s).`)
  if (legacySpanRatio >= 0.62 && (topGapPct > 12 || occupancy < 0.7)) {
    notes.push("NOTE: the current underfill check PASSES this slide — span-based measure misses it.")
  }

  return {
    topGapPct, bottomGapPct, occupancy, legacySpanRatio,
    fontSizes, largestFont, leftEdges, overlaps, inkCount: ink.length, notes,
  }
}

function round1(n: number): number { return Math.round(n * 10) / 10 }
function round2(n: number): number { return Math.round(n * 100) / 100 }
