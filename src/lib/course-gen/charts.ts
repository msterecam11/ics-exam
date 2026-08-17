// Chart rendering — real vector charts drawn from the agent's own numbers.
//
// ONE renderer, emitting an SVG string, used by all three surfaces: the
// blueprint measurement pass, slideHtml (which feeds the QA screenshot AND the
// PDF export), and the editor canvas. That is deliberate. The editor is React
// and slideHtml builds HTML strings, so a React charting library would have
// meant two implementations and guaranteed drift — which is exactly the bug
// icons had, where the editor drew coloured squares while a comment claimed it
// drew glyphs. A plain SVG string renders identically in all three.
//
// Values are plotted, never invented: an image model asked to "draw a bar
// chart of 80/15/5" produces bars that merely look plausible. These are
// computed from the data the Content Agent actually emitted.

import { resolveToken, type ThemeTokens } from "./tokens"

export interface ChartData {
  labels: string[]
  datasets: { label: string; data: number[] }[]
}

export type ChartType = "bar" | "line" | "donut"

/**
 * Beyond this many slices a pie/donut stops communicating: slivers overlap,
 * labels collide, and colours lose distinction. Rather than render something
 * unreadable we fall back to a horizontal bar chart, which carries the same
 * data at that cardinality. Enforced here rather than trusted to the agent.
 *
 * Tightened from 7 to 6: the Material/HIG-derived guidance is to stop using a
 * pie past 5 categories, and 7 was already borderline in the test render.
 */
const DONUT_MAX_SLICES = 6

/** Past this many categories a vertical bar chart squeezes labels illegibly. */
const HORIZONTAL_BAR_THRESHOLD = 8

/** Hard ceiling — beyond this nothing readable fits in a slide-sized box. */
const MAX_CATEGORIES = 24

const MAX_LABEL_CHARS = 22

/**
 * Series palette, in FIXED order — assigned by position, never cycled.
 *
 * Cut from eight brand tokens to five, and the cut is measured rather than
 * chosen. Running the eight through the categorical checks (lightness band,
 * chroma floor, colour-vision separation, contrast) fails three of them:
 *   token:tab-yellow    L 0.83  — above the band, and only 1.6:1 on white
 *   token:primary-dark  L 0.42  — below the band
 *   token:navy          L 0.36, chroma 0.099 — below the band AND reads gray
 * The remaining five pass every check, with the worst adjacent pair still
 * separated by ΔE 11.2 for deuteranopia.
 *
 * Three of the five sit under 3:1 against white (orange 2.6, teal 2.5, green
 * 2.8). That is allowed only where something other than colour also carries
 * the value — which is why single-series charts keep their direct value
 * labels and multi-series charts always draw a legend. Neither is optional.
 */
const SERIES_TOKENS = [
  "token:primary",
  "token:accent-warm",
  "token:primary-light",
  "token:success",
  "token:danger",
]

/**
 * Past this many series, colour stops being an identity channel — a ninth
 * category cannot get a "new" hue without inventing one outside the brand,
 * and cycling silently gives two categories the same colour. Extra series
 * are dropped and reported rather than drawn in a colour that lies.
 */
const MAX_SERIES = SERIES_TOKENS.length

/** Bars never exceed this. A slot's leftover width is air, not more bar. */
const MAX_BAR_PX = 24
/** Surface-coloured gap that separates touching bars. */
const BAR_GAP_PX = 2

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function truncate(s: string, max = MAX_LABEL_CHARS): string {
  const t = String(s ?? "")
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t
}

/** Fixed-order assignment. No modulo: see MAX_SERIES. */
function seriesColor(i: number, tokens: ThemeTokens): string {
  return resolveToken(SERIES_TOKENS[Math.min(i, SERIES_TOKENS.length - 1)], tokens, "#0C72C6")
}

/**
 * A bar with its data-end rounded and its baseline square, drawn as a path
 * because an `rx` on a rect rounds all four corners — which detaches the bar
 * from its own baseline and makes short bars read as floating pills.
 */
function barPath(x: number, y: number, w: number, h: number, dir: "up" | "right"): string {
  const r = Math.min(4, w / 2, h / 2)
  if (h <= 0 || w <= 0) return ""
  return dir === "up"
    // grows upward: round the top, square on the baseline
    ? `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`
    // grows rightward: round the right end, square at the axis
    : `M${x},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} L${x},${y + h} Z`
}

/** "1,240" / "12.5" — keeps value labels readable without a formatting lib. */
function fmtValue(n: number): string {
  if (!Number.isFinite(n)) return "0"
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 })
  return String(Math.round(n * 10) / 10)
}

/** "nice" axis maximum so gridlines land on round numbers. */
function niceMax(v: number): number {
  if (v <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const norm = v / mag
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return step * mag
}

interface Normalized {
  type: ChartType
  horizontal: boolean
  labels: string[]
  datasets: { label: string; data: number[] }[]
  /** Set when the requested type was overridden, for the caller/QA to see. */
  note?: string
}

/**
 * Applies the readability rules BEFORE drawing: caps categories, converts an
 * over-full donut to bars, and flips a wide bar chart to horizontal.
 */
export function normalizeChart(chartType: ChartType, data: ChartData): Normalized {
  const rawLabels = Array.isArray(data?.labels) ? data.labels : []
  const rawSets = Array.isArray(data?.datasets) ? data.datasets : []

  const n = Math.min(rawLabels.length, MAX_CATEGORIES)
  const labels = rawLabels.slice(0, n).map(l => truncate(String(l ?? "")))
  // Capped, never cycled. Past the palette's length a further series could
  // only be drawn in a colour already spoken for, which silently tells the
  // reader two different things are the same thing.
  const datasets = (rawSets.length ? rawSets : [{ label: "", data: [] }])
    .slice(0, MAX_SERIES)
    .map(ds => ({
      label: String(ds?.label ?? ""),
      data: (Array.isArray(ds?.data) ? ds.data : []).slice(0, n).map(v => (Number.isFinite(Number(v)) ? Number(v) : 0)),
    }))

  let type: ChartType = chartType
  let note: string | undefined

  if (rawLabels.length > MAX_CATEGORIES) {
    note = `Showing the first ${MAX_CATEGORIES} of ${rawLabels.length} categories.`
  }
  if (rawSets.length > MAX_SERIES) {
    note = `Showing ${MAX_SERIES} of ${rawSets.length} series — beyond that colour stops identifying anything.`
  }

  // A donut with too many slices carries the data worse than bars do.
  if (type === "donut" && labels.length > DONUT_MAX_SLICES) {
    type = "bar"
    note = `${labels.length} categories is too many for a donut — drawn as a bar chart.`
  }

  const horizontal = type === "bar" && labels.length > HORIZONTAL_BAR_THRESHOLD

  return { type, horizontal, labels, datasets, note }
}

interface RenderOpts {
  chartType: ChartType
  data: ChartData
  tokens: ThemeTokens
  /** Slide-space box the chart fills. SVG scales to it via viewBox. */
  width?: number
  height?: number
  darkContext?: boolean
  /** What the values are measured in — "m", "%", "minutes". */
  unit?: string
  xTitle?: string
  yTitle?: string
}

/** Axis caption. Falls back to the unit alone, which is the part that matters. */
function axisCaption(title: string | undefined, unit: string | undefined): string {
  // The agent sometimes bakes the unit into the title text itself ("Runway
  // Occupancy Time (s)") on top of setting `unit` separately — appending
  // blindly then produced "Runway Occupancy Time (s) (%)" on every chart
  // that did this. A trailing "(...)" on the title is always that same
  // mistake, never a legitimate second parenthetical, so it's dropped before
  // the real unit is appended.
  const t = (title ?? "").trim().replace(/\s*\([^()]*\)\s*$/, "").trim()
  const u = (unit ?? "").trim()
  if (!t || !u) return t || u
  // The agent also states the unit as part of the title itself — a real axis
  // read "Incidents per 1,000 Turnarounds (per 1,000 Turnarounds)" because the
  // title ENDED with the unit rather than carrying it in parentheses, so the
  // strip above had nothing to remove. Appending is skipped when the title
  // already says it. The 3-char floor keeps short units ("s", "m", "%") on the
  // append path, where a bare substring test would false-positive constantly
  // (every title containing an "s" would look like it already had its unit).
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()
  const nt = norm(t), nu = norm(u)
  if (nt === nu || (nu.length >= 3 && nt.endsWith(nu))) return t
  return `${t} (${u})`
}

/** A value-axis caption, rotated up the left edge. */
function yCaption(text: string, x: number, plotTop: number, plotH: number, muted: string): string {
  if (!text) return ""
  const cy = plotTop + plotH / 2
  return `<text x="${x}" y="${cy}" font-size="12" fill="${muted}" text-anchor="middle" transform="rotate(-90 ${x} ${cy})" letter-spacing="0.3">${esc(text)}</text>`
}

function xCaption(text: string, w: number, y: number, muted: string): string {
  if (!text) return ""
  return `<text x="${w / 2}" y="${y}" font-size="12" fill="${muted}" text-anchor="middle" letter-spacing="0.3">${esc(text)}</text>`
}

/**
 * Draws the chart as a self-contained SVG string.
 *
 * viewBox + width/height 100% means it scales to whatever box the compiler
 * baked, so the same markup is correct in the editor at 40% zoom and in the
 * PDF at full print resolution — no rasterisation, no blur.
 */
export function chartSvg(opts: RenderOpts): string {
  // Default viewBox matches a CONTENT ZONE's aspect (~2.6:1), not a slide's
  // 16:9. The SVG scales with preserveAspectRatio "meet", so a 16:9 viewBox
  // inside a wide, short zone fits by height and letterboxes — roughly 40% of
  // the available width went to empty margins on either side of every chart.
  const { chartType, data, tokens, width = 1000, height = 385, darkContext = false, unit, xTitle, yTitle } = opts
  const { type, horizontal, labels, datasets } = normalizeChart(chartType, data)

  const ink = darkContext ? "#FFFFFF" : resolveToken("token:text", tokens, "#333333")
  const muted = darkContext ? "rgba(255,255,255,0.55)" : "#8A97A8"
  const grid = darkContext ? "rgba(255,255,255,0.16)" : resolveToken("token:border-subtle", tokens, "#DDE3EA")

  if (labels.length === 0 || datasets.every(d => d.data.length === 0)) {
    return emptyState(width, height, muted)
  }

  // On a value axis the unit belongs with the caption, not repeated on every
  // tick. Which axis carries the value flips with orientation.
  const valueCaption = axisCaption(horizontal ? xTitle : yTitle, unit)
  const catCaption = axisCaption(horizontal ? yTitle : xTitle, undefined)
  const cap = { valueCaption, catCaption }

  const body =
    type === "donut" ? donut(labels, datasets, tokens, width, height, ink, muted)
    : type === "line" ? line(labels, datasets, tokens, width, height, ink, muted, grid, cap)
    : horizontal ? barsHorizontal(labels, datasets, tokens, width, height, ink, muted, grid, cap)
    : barsVertical(labels, datasets, tokens, width, height, ink, muted, grid, cap)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:visible" font-family="Plus Jakarta Sans, system-ui, sans-serif">${body}</svg>`
}

function emptyState(w: number, h: number, muted: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" style="display:block" font-family="Plus Jakarta Sans, system-ui, sans-serif">` +
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="8" fill="none" stroke="${muted}" stroke-dasharray="4 4" opacity="0.5"/>` +
    `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="middle" font-size="14" fill="${muted}">No chart data</text></svg>`
}

/** Legend row, drawn only for genuinely multi-series charts. */
function legend(datasets: { label: string }[], tokens: ThemeTokens, w: number, y: number, ink: string): string {
  if (datasets.length < 2) return ""
  const items = datasets.map((ds, i) => ({ label: truncate(ds.label || `Series ${i + 1}`, 18), color: seriesColor(i, tokens) }))
  const itemW = Math.min(160, (w - 20) / items.length)
  const startX = (w - itemW * items.length) / 2
  return items.map((it, i) => {
    const x = startX + i * itemW
    return `<rect x="${x}" y="${y - 8}" width="10" height="10" rx="2" fill="${it.color}"/>` +
      `<text x="${x + 15}" y="${y}" font-size="12" fill="${ink}" dominant-baseline="middle">${esc(it.label)}</text>`
  }).join("")
}

function barsVertical(
  labels: string[], datasets: { label: string; data: number[] }[],
  tokens: ThemeTokens, w: number, h: number, ink: string, muted: string, grid: string,
  cap: { valueCaption: string; catCaption: string },
): string {
  const hasLegend = datasets.length > 1
  const padL = 46 + (cap.valueCaption ? 18 : 0), padR = 14, padT = 14
  const padB = 38 + (hasLegend ? 22 : 0) + (cap.catCaption ? 20 : 0)
  const plotW = w - padL - padR
  const plotH = h - padT - padB

  const max = niceMax(Math.max(...datasets.flatMap(d => d.data), 0))
  const groupW = plotW / labels.length
  const barW = Math.max(4, Math.min(MAX_BAR_PX, (groupW * 0.62) / datasets.length))

  const ticks = 4
  const gridLines = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = (max / ticks) * i
    const y = padT + plotH - (v / max) * plotH
    return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="${grid}" stroke-width="1"/>` +
      `<text x="${padL - 8}" y="${y}" font-size="11" fill="${muted}" text-anchor="end" dominant-baseline="middle">${esc(fmtValue(v))}</text>`
  }).join("")

  const bars = labels.map((label, li) => {
    const cx = padL + groupW * li + groupW / 2
    const clusterW = barW * datasets.length
    const inner = datasets.map((ds, di) => {
      const v = ds.data[li] ?? 0
      const bh = max > 0 ? Math.max(0, (v / max) * plotH) : 0
      const x = cx - clusterW / 2 + di * barW
      const y = padT + plotH - bh
      const bw = Math.max(1, barW - BAR_GAP_PX)
      const showValue = labels.length <= 12 && datasets.length === 1
      return `<path d="${barPath(x, y, bw, bh, "up")}" fill="${seriesColor(di, tokens)}"/>` +
        (showValue ? `<text x="${x + bw / 2}" y="${y - 6}" font-size="11" font-weight="700" fill="${ink}" text-anchor="middle">${esc(fmtValue(v))}</text>` : "")
    }).join("")
    // Long labels on a crowded axis tilt rather than overlap.
    const tilt = labels.length > 6
    const ly = padT + plotH + 16
    const labelEl = tilt
      ? `<text x="${cx}" y="${ly}" font-size="11" fill="${muted}" text-anchor="end" transform="rotate(-35 ${cx} ${ly})">${esc(label)}</text>`
      : `<text x="${cx}" y="${ly}" font-size="12" fill="${muted}" text-anchor="middle">${esc(label)}</text>`
    return inner + labelEl
  }).join("")

  return gridLines + bars
    + yCaption(cap.valueCaption, 16, padT, plotH, muted)
    + xCaption(cap.catCaption, w, h - (hasLegend ? 28 : 6), muted)
    + legend(datasets, tokens, w, h - 8, ink)
}

function barsHorizontal(
  labels: string[], datasets: { label: string; data: number[] }[],
  tokens: ThemeTokens, w: number, h: number, ink: string, muted: string, grid: string,
  cap: { valueCaption: string; catCaption: string },
): string {
  const hasLegend = datasets.length > 1
  const padL = 108 + (cap.catCaption ? 18 : 0), padR = 44, padT = 12
  const padB = 24 + (hasLegend ? 22 : 0) + (cap.valueCaption ? 20 : 0)
  const plotW = w - padL - padR
  const plotH = h - padT - padB

  const max = niceMax(Math.max(...datasets.flatMap(d => d.data), 0))
  const rowH = plotH / labels.length
  const barH = Math.max(3, Math.min(MAX_BAR_PX, (rowH * 0.66) / datasets.length))

  const axis = `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="${grid}" stroke-width="1"/>`

  const rows = labels.map((label, li) => {
    const cy = padT + rowH * li + rowH / 2
    const clusterH = barH * datasets.length
    const inner = datasets.map((ds, di) => {
      const v = ds.data[li] ?? 0
      const bw = max > 0 ? Math.max(0, (v / max) * plotW) : 0
      const y = cy - clusterH / 2 + di * barH
      const bh = Math.max(1, barH - BAR_GAP_PX)
      return `<path d="${barPath(padL, y, bw, bh, "right")}" fill="${seriesColor(di, tokens)}"/>` +
        (datasets.length === 1
          ? `<text x="${padL + bw + 6}" y="${y + bh / 2}" font-size="11" font-weight="700" fill="${ink}" dominant-baseline="middle">${esc(fmtValue(v))}</text>`
          : "")
    }).join("")
    return inner +
      `<text x="${padL - 8}" y="${cy}" font-size="11" fill="${muted}" text-anchor="end" dominant-baseline="middle">${esc(label)}</text>`
  }).join("")

  return axis + rows
    // Orientation flips which axis carries the value, so the captions swap too.
    + xCaption(cap.valueCaption, w, h - (hasLegend ? 28 : 6), muted)
    + yCaption(cap.catCaption, 16, padT, plotH, muted)
    + legend(datasets, tokens, w, h - 8, ink)
}

function line(
  labels: string[], datasets: { label: string; data: number[] }[],
  tokens: ThemeTokens, w: number, h: number, ink: string, muted: string, grid: string,
  cap: { valueCaption: string; catCaption: string },
): string {
  const hasLegend = datasets.length > 1
  const padL = 46 + (cap.valueCaption ? 18 : 0), padR = 16, padT = 14
  const padB = 34 + (hasLegend ? 22 : 0) + (cap.catCaption ? 20 : 0)
  const plotW = w - padL - padR
  const plotH = h - padT - padB

  const max = niceMax(Math.max(...datasets.flatMap(d => d.data), 0))
  const stepX = labels.length > 1 ? plotW / (labels.length - 1) : 0
  const px = (i: number) => padL + (labels.length > 1 ? stepX * i : plotW / 2)
  const py = (v: number) => padT + plotH - (max > 0 ? (v / max) * plotH : 0)

  const ticks = 4
  const gridLines = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = (max / ticks) * i
    const y = py(v)
    return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="${grid}" stroke-width="1"/>` +
      `<text x="${padL - 8}" y="${y}" font-size="11" fill="${muted}" text-anchor="end" dominant-baseline="middle">${esc(fmtValue(v))}</text>`
  }).join("")

  const series = datasets.map((ds, di) => {
    const color = seriesColor(di, tokens)
    const pts = ds.data.map((v, i) => `${px(i)},${py(v)}`).join(" ")
    const dots = ds.data.map((v, i) => `<circle cx="${px(i)}" cy="${py(v)}" r="3.5" fill="${color}"/>`).join("")
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${dots}`
  }).join("")

  // Thin out x labels rather than let them collide.
  const every = Math.ceil(labels.length / 8)
  const xLabels = labels.map((label, i) =>
    i % every === 0
      ? `<text x="${px(i)}" y="${padT + plotH + 16}" font-size="11" fill="${muted}" text-anchor="middle">${esc(label)}</text>`
      : ""
  ).join("")

  return gridLines + series + xLabels
    + yCaption(cap.valueCaption, 16, padT, plotH, muted)
    + xCaption(cap.catCaption, w, h - (hasLegend ? 28 : 6), muted)
    + legend(datasets, tokens, w, h - 8, ink)
}

function donut(
  labels: string[], datasets: { label: string; data: number[] }[],
  tokens: ThemeTokens, w: number, h: number, ink: string, muted: string
): string {
  const values = (datasets[0]?.data ?? []).map(v => Math.max(0, v))
  const total = values.reduce((s, v) => s + v, 0)
  if (total <= 0) return emptyStateInner(w, h, muted)

  const legendW = Math.min(210, w * 0.4)
  const cx = (w - legendW) / 2
  const cy = h / 2
  const r = Math.min(cx, cy) * 0.78
  const inner = r * 0.58

  let angle = -Math.PI / 2
  const arcs = values.map((v, i) => {
    const sweep = (v / total) * Math.PI * 2
    const a0 = angle
    const a1 = angle + sweep
    angle = a1
    const large = sweep > Math.PI ? 1 : 0
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
    const ix1 = cx + inner * Math.cos(a1), iy1 = cy + inner * Math.sin(a1)
    const ix0 = cx + inner * Math.cos(a0), iy0 = cy + inner * Math.sin(a0)
    const d = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${large} 0 ${ix0} ${iy0} Z`
    return `<path d="${d}" fill="${seriesColor(i, tokens)}"/>`
  }).join("")

  const centreTotal =
    `<text x="${cx}" y="${cy - 6}" font-size="24" font-weight="800" fill="${ink}" text-anchor="middle">${esc(fmtValue(total))}</text>` +
    `<text x="${cx}" y="${cy + 14}" font-size="11" fill="${muted}" text-anchor="middle" letter-spacing="1">TOTAL</text>`

  const lx = w - legendW + 8
  const rows = labels.map((label, i) => {
    const y = cy - (labels.length - 1) * 11 + i * 22
    const pct = Math.round((values[i] / total) * 100)
    return `<rect x="${lx}" y="${y - 7}" width="10" height="10" rx="2" fill="${seriesColor(i, tokens)}"/>` +
      `<text x="${lx + 16}" y="${y}" font-size="12" fill="${ink}" dominant-baseline="middle">${esc(truncate(label, 16))}</text>` +
      `<text x="${w - 6}" y="${y}" font-size="12" font-weight="700" fill="${muted}" text-anchor="end" dominant-baseline="middle">${pct}%</text>`
  }).join("")

  return arcs + centreTotal + rows
}

function emptyStateInner(w: number, h: number, muted: string): string {
  return `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="middle" font-size="14" fill="${muted}">No chart data</text>`
}
