// Connector lines — a rule with a real arrowhead.
//
// Until this existed the only "line" available was a plain rectangle, so the
// design agent could draw a rule but never a connector, and the prompt had to
// say outright that there was no arrow prop. That is why a timeline, a process
// chain or any diagram whose meaning lives in the DIRECTION between two things
// could not be built: the agent could place the boxes and had no way to say
// which one leads to which.
//
// ONE renderer, emitting an SVG string, used by the measurement pass, the PDF
// / QA screenshot path and the editor canvas — the same discipline charts and
// icons already follow. A connector drawn three slightly different ways is the
// drift that has repeatedly caused bugs here.

export type ArrowEnds = "none" | "end" | "start" | "both"

/** Arrowhead size, and the line's own thickness. Fixed, like the mark specs. */
const HEAD = 9
const STROKE = 2

/**
 * A line spanning its baked box, with optional arrowheads.
 *
 * Orientation is inferred from the box the compiler measured rather than
 * carried as a separate field — a wider-than-tall box is a horizontal
 * connector — so the value cannot disagree with the geometry it is drawn in.
 * That covers orthogonal connectors, which is what process chains and
 * timelines are made of; a diagonal run belongs in a Tier-3 custom node where
 * the agent is placing endpoints itself.
 */
export function connectorSvg(opts: {
  width: number
  height: number
  color: string
  arrow?: ArrowEnds
  dashed?: boolean
}): string {
  const { width: w, height: h, color, arrow = "end", dashed = false } = opts
  if (w <= 0 || h <= 0) return ""

  const horizontal = w >= h
  const arrowStart = arrow === "start" || arrow === "both"
  const arrowEnd = arrow === "end" || arrow === "both"

  // The shaft stops short of each head, so the stroke never pokes through the
  // triangle's tip and thickens it.
  const inset = HEAD * 0.9
  const dash = dashed ? ` stroke-dasharray="7 6"` : ""

  const cx = w / 2
  const cy = h / 2

  const shaft = horizontal
    ? `<line x1="${arrowStart ? inset : 0}" y1="${cy}" x2="${w - (arrowEnd ? inset : 0)}" y2="${cy}" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round"${dash}/>`
    : `<line x1="${cx}" y1="${arrowStart ? inset : 0}" x2="${cx}" y2="${h - (arrowEnd ? inset : 0)}" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round"${dash}/>`

  // Heads are drawn as explicit triangles rather than SVG <marker> elements:
  // markers live in <defs> and need document-unique ids, and this same string
  // is inlined three times on one page (measure, export, editor). Two slides
  // with colliding marker ids silently paint each other's arrowheads.
  const head = (tipX: number, tipY: number, dir: "right" | "left" | "down" | "up") => {
    const p = dir === "right" ? `${tipX},${tipY} ${tipX - HEAD},${tipY - HEAD * 0.55} ${tipX - HEAD},${tipY + HEAD * 0.55}`
      : dir === "left" ? `${tipX},${tipY} ${tipX + HEAD},${tipY - HEAD * 0.55} ${tipX + HEAD},${tipY + HEAD * 0.55}`
      : dir === "down" ? `${tipX},${tipY} ${tipX - HEAD * 0.55},${tipY - HEAD} ${tipX + HEAD * 0.55},${tipY - HEAD}`
      : `${tipX},${tipY} ${tipX - HEAD * 0.55},${tipY + HEAD} ${tipX + HEAD * 0.55},${tipY + HEAD}`
    return `<polygon points="${p}" fill="${color}"/>`
  }

  const heads = horizontal
    ? `${arrowEnd ? head(w, cy, "right") : ""}${arrowStart ? head(0, cy, "left") : ""}`
    : `${arrowEnd ? head(cx, h, "down") : ""}${arrowStart ? head(cx, 0, "up") : ""}`

  return `<svg width="100%" height="100%" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible">${shaft}${heads}</svg>`
}
