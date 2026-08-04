// Blueprint → HTML. The structural tree the Content Agent emits is rendered
// with real CSS (flex) so the BROWSER's layout engine does all geometry —
// the LLM never positions anything. Every visual atom carries a data-bake
// attribute; after layout the compiler measures those nodes and bakes them
// into absolutely-positioned editable elements.
//
// Styling here is deliberately faithful to the real ICS deck patterns
// (accent bars, navy badges, cream callouts, glass cards…) and only ever
// token-driven — no freestyle colors.

import type { BlueprintNode, TextRun } from "./primitives"
import { resolveToken, spacingPx, TYPE_PX, type ThemeTokens } from "./tokens"
import { iconSvg } from "./icons"
import { chartSvg } from "./charts"

interface Bake {
  kind: "text" | "shape" | "icon" | "image" | "table" | "chart" | "line"
  props: Record<string, unknown>
}

/**
 * An icon, as a real Phosphor glyph.
 *
 * The bake attribute always carries the icon's NAME, never its geometry, so a
 * re-theme or an icon-set swap repaints it the same way a colour token does.
 *
 * An unknown name falls back to the tinted block this used to draw for every
 * icon. That keeps a hallucinated or stale name visible in review rather than
 * silently leaving a hole in the layout — and, because the block occupies the
 * same box, it cannot shift anything around it.
 */
function iconHtml(opts: {
  name: string
  token: string       // token string, for the bake attribute
  resolved: string    // resolved colour, for rendering
  size: number
  extraStyle?: string
}): string {
  const { name, token, resolved, size, extraStyle = "" } = opts
  const bake = bakeAttr({ kind: "icon", props: { name, color: token } })
  const glyph = iconSvg(name, { size, color: resolved })
  return glyph
    ? `<span ${bake} style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;flex-shrink:0;${extraStyle}">${glyph}</span>`
    : `<span ${bake} style="display:inline-block;width:${size}px;height:${size}px;background:${resolved};opacity:.85;border-radius:4px;flex-shrink:0;${extraStyle}"></span>`
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function bakeAttr(b: Bake): string {
  return `data-bake="${esc(JSON.stringify(b))}"`
}

function runsHtml(text: string | TextRun[] | { text: string; bold?: boolean; color?: string }[]): { html: string; runs: TextRun[] } {
  if (typeof text === "string") return { html: esc(text), runs: [{ text }] }
  const runs = text as TextRun[]
  const html = runs.map(r => {
    let t = esc(r.text)
    if (r.bold) t = `<b>${t}</b>`
    if (r.color) t = `<span style="color:inherit">${t}</span>`
    return t
  }).join("")
  return { html, runs }
}

export function blueprintToHtml(node: BlueprintNode, tokens: ThemeTokens, darkContext = false): string {
  const T = (k: string) => tokens.colors[k] ?? "#333"
  const textColor = darkContext ? T("text-inverse") : T("text")
  const gap = (g?: string) => `${spacingPx(g, tokens)}px`

  function render(n: BlueprintNode): string {
    switch (n.type) {
      case "row": {
        const weights = n.weights ?? n.children.map(() => 1)
        // justify-content:center on each column: content shorter than the
        // row's height used to top-align, dumping all the slack at the
        // bottom of the shorter column and reading as unfinished rather than
        // composed. Centering it is what a human laying this out by hand
        // would do by default. A child that itself wants to fill the box
        // (a figure, a growing flex item) is unaffected — flex-grow content
        // still consumes the space before any is left to center.
        return `<div style="display:flex;flex-direction:row;gap:${gap(n.gap)};align-items:stretch;min-height:0">${
          n.children.map((c, i) => `<div style="flex:${weights[i] ?? 1} 1 0;min-width:0;display:flex;flex-direction:column;justify-content:center">${render(c)}</div>`).join("")
        }</div>`
      }
      case "col":
      case "stack":
        // Same reasoning as the row case above — a stack shorter than the
        // box it's given centers instead of clinging to the top.
        return `<div style="display:flex;flex-direction:column;gap:${gap(n.gap)};justify-content:center">${n.children.map(render).join("")}</div>`

      case "heading": {
        const size = TYPE_PX[`h${n.level ?? 4}`] ?? TYPE_PX.h4
        const color = resolveToken(n.color, tokens, darkContext ? T("text-inverse") : T("navy"))
        const bar = n.accentBar
          ? `<span ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: n.color ?? "token:accent-warm", radius: 2 } })} style="display:inline-block;width:4px;align-self:stretch;background:${color};border-radius:2px;margin-right:10px"></span>`
          : ""
        const icon = n.icon
          ? iconHtml({ name: n.icon, token: n.color ?? "token:accent-warm", resolved: color, size, extraStyle: "margin-right:8px" })
          : ""
        return `<div style="display:flex;align-items:center">${bar}${icon}<span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.text, bold: true }], fontSize: size, lineHeight: 1.25, color: n.color ?? (darkContext ? "token:text-inverse" : "token:navy"), fontWeight: 700 } })} style="font-size:${size}px;font-weight:700;color:${color};line-height:1.25">${esc(n.text)}</span></div>`
      }

      case "body": {
        const { html, runs } = runsHtml(n.text as any)
        // lineHeight is baked so the renderer reproduces the EXACT metrics
        // this measurement was taken with — otherwise wrapped text reflows
        // into a box sized for different metrics and clips.
        return `<div ${bakeAttr({ kind: "text", props: { runs, fontSize: TYPE_PX.body, lineHeight: 1.55, color: darkContext ? "token:text-inverse" : "token:text" } })} style="font-size:${TYPE_PX.body}px;color:${textColor};line-height:1.55">${html}</div>`
      }

      case "bullets": {
        const items = n.items.map(it => (typeof it === "string" ? { text: it } : it))
        const runs: TextRun[] = items.map(it => ({ text: `•  ${it.text}\n` }))
        return `<div ${bakeAttr({ kind: "text", props: { runs, fontSize: TYPE_PX.body, lineHeight: 1.8, color: darkContext ? "token:text-inverse" : "token:text" } })} style="font-size:${TYPE_PX.body}px;color:${textColor};line-height:1.8">${
          items.map(it => `<div style="display:flex;gap:8px"><span style="color:${T("primary-light")}">•</span><span>${esc(it.text)}</span></div>`).join("")
        }</div>`
      }

      case "card": {
        const fill = n.tone === "cream" ? T("surface-cream")
          : n.tone === "glass" ? T("glass")
          : n.tone === "accent" ? `${T("primary")}14`
          : T("surface")
        const border = n.tone === "glass" ? "rgba(255,255,255,0.35)" : T("border-subtle")
        const topBorder = n.tone === "glass" ? `border-top:2px solid rgba(255,255,255,0.7);` : ""
        const accent = n.accent ? `border-left:4px solid ${resolveToken(n.accent, tokens, T("accent-warm"))};` : ""
        return `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: n.tone === "glass" ? "token:glass" : n.tone === "cream" ? "token:surface-cream" : "token:surface", radius: tokens.radius?.md ?? 12, tone: n.tone ?? "plain" } })} style="background:${fill};border:1px solid ${border};${topBorder}${accent}border-radius:${tokens.radius?.md ?? 12}px;padding:${gap("md")};display:flex;flex-direction:column;gap:${gap("sm")};flex:1">${
          n.children.map(c => blueprintToHtml(c, tokens, n.tone === "glass" ? true : darkContext)).join("")
        }</div>`
      }

      case "badge-number": {
        if (n.variant === "band-warm" || n.variant === "band-blue") {
          const bg = n.variant === "band-warm" ? T("accent-warm") : T("primary")
          return `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: n.variant === "band-warm" ? "token:accent-warm" : "token:primary", radius: 4 } })} style="background:${bg};border-radius:4px;padding:10px 16px;display:flex;align-items:center;gap:14px"><span ${bakeAttr({ kind: "text", props: { runs: [{ text: String(n.n), bold: true }], fontSize: TYPE_PX.h3, color: "token:text-inverse", fontWeight: 800 } })} style="font-size:${TYPE_PX.h3}px;font-weight:800;color:#fff">${esc(String(n.n))}</span><span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.heading ?? "", bold: true }], fontSize: TYPE_PX.h5, color: "token:text-inverse", fontWeight: 700 } })} style="font-size:${TYPE_PX.h5}px;font-weight:700;color:#fff">${esc(n.heading ?? "")}</span></div>`
        }
        // The badge box and its numeral bake as two elements (box behind,
        // number on top) — baking the box alone would silently drop the
        // number, since a shape carries no text.
        return `<div style="display:flex;align-items:center;gap:10px"><span ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: "token:navy", stroke: "token:tab-yellow", strokeWidth: 2, radius: 4 } })} style="background:${T("navy")};border:2px solid ${T("tab-yellow")};border-radius:4px;padding:2px 10px;display:inline-flex;align-items:center;justify-content:center"><span ${bakeAttr({ kind: "text", props: { runs: [{ text: String(n.n), bold: true }], fontSize: TYPE_PX.h5, lineHeight: 1.25, color: "token:text-inverse", fontWeight: 800 } })} style="color:#fff;font-weight:800;font-size:${TYPE_PX.h5}px;line-height:1.25">${esc(String(n.n))}</span></span><span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.heading ?? "", bold: true }], fontSize: TYPE_PX.h5, lineHeight: 1.25, color: "token:accent-warm", fontWeight: 700 } })} style="font-size:${TYPE_PX.h5}px;font-weight:700;color:${T("accent-warm")};line-height:1.25">${esc(n.heading ?? "")}</span></div>`
      }

      case "callout": {
        const toneColor = n.tone === "requirement" ? T("danger") : n.tone === "impact" ? T("primary") : T("navy")
        const fill = n.tone === "requirement" ? T("surface-cream") : "transparent"
        const border = n.tone === "requirement"
          ? `border:1px solid ${T("border-subtle")};border-radius:8px;padding:${gap("md")};`
          : `border-left:4px solid ${toneColor};padding:4px 0 4px ${gap("md")};`
        return `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: n.tone === "requirement" ? "token:surface-cream" : "transparent", tone: n.tone } })} style="background:${fill};${border}display:flex;flex-direction:column;gap:6px">${
          n.label ? `<span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.label, bold: true }], fontSize: TYPE_PX.body, color: n.tone === "requirement" ? "token:danger" : "token:navy", fontWeight: 700 } })} style="font-weight:700;color:${toneColor};font-size:${TYPE_PX.body}px">${esc(n.label)}</span>` : ""
        }<span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.text }], fontSize: TYPE_PX.body, lineHeight: 1.5, color: darkContext ? "token:text-inverse" : "token:text" } })} style="font-size:${TYPE_PX.body}px;color:${textColor};line-height:1.5">${esc(n.text)}</span></div>`
      }

      case "icon-row": {
        const accent = resolveToken(n.accent, tokens, T("primary-light"))
        return `<div style="display:flex;align-items:center;gap:10px">${iconHtml({ name: n.icon, token: n.accent ?? "token:primary-light", resolved: accent, size: 20 })}<span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.text }], fontSize: TYPE_PX.body, color: darkContext ? "token:text-inverse" : "token:text" } })} style="font-size:${TYPE_PX.body}px;color:${textColor}">${esc(n.text)}</span></div>`
      }

      case "alternating-list":
        return `<div style="display:flex;flex-direction:column;gap:8px">${n.items.map(it =>
          `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: "token:surface-alt", radius: 4, accentTab: true } })} style="background:${T("surface-alt")};border-left:4px solid ${T("tab-yellow")};border-radius:4px;padding:10px 14px;display:flex;align-items:center;gap:10px">${
            it.icon ? iconHtml({ name: it.icon, token: "token:tab-yellow", resolved: T("tab-yellow"), size: 16 }) : ""
          }<span ${bakeAttr({ kind: "text", props: { runs: [{ text: it.text }], fontSize: TYPE_PX.body, color: "token:text" } })} style="font-size:${TYPE_PX.body}px;color:${T("text")}">${esc(it.text)}</span></div>`
        ).join("")}</div>`

      case "question-rows":
        return `<div style="display:flex;flex-direction:column;gap:14px">${n.questions.map(q =>
          `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: "rgba(255,255,255,0.55)", radius: 6 } })} style="background:rgba(255,255,255,0.55);border-left:4px solid ${T("primary-light")};border-radius:6px;padding:16px;display:flex;align-items:center;gap:12px"><span ${bakeAttr({ kind: "text", props: { runs: [{ text: "?", bold: true }], fontSize: TYPE_PX.h4, color: "token:primary", fontWeight: 800 } })} style="font-size:${TYPE_PX.h4}px;font-weight:800;color:${T("primary")}">?</span><span ${bakeAttr({ kind: "text", props: { runs: [{ text: q }], fontSize: TYPE_PX.body, color: "token:text" } })} style="font-size:${TYPE_PX.body}px;color:${T("text")}">${esc(q)}</span></div>`
        ).join("")}</div>`

      case "stat":
        return `<div style="display:flex;flex-direction:column;gap:2px"><span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.value, bold: true }], fontSize: TYPE_PX.h2, color: "token:primary", fontWeight: 800 } })} style="font-size:${TYPE_PX.h2}px;font-weight:800;color:${T("primary")}">${esc(n.value)}</span><span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.label }], fontSize: TYPE_PX.small, color: darkContext ? "token:text-inverse" : "token:text" } })} style="font-size:${TYPE_PX.small}px;color:${textColor}">${esc(n.label)}</span></div>`

      case "figure": {
        const cap = n.caption
          ? `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: "token:primary-dark", caption: true } })} style="background:${T("primary-dark")};padding:8px 12px"><span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.caption }], fontSize: TYPE_PX.small, color: "token:text-inverse", fontWeight: 600 } })} style="color:#fff;font-size:${TYPE_PX.small}px;font-weight:600">${esc(n.caption)}</span></div>`
          : ""
        return `<div style="display:flex;flex-direction:column;flex:1;${n.shadow ? "box-shadow:0 8px 24px rgba(0,0,0,0.12);" : ""}border-radius:8px;overflow:hidden;border:1px solid ${T("border-subtle")}"><div ${bakeAttr({ kind: "image", props: { media: n.media } })} style="flex:1;min-height:140px;background:linear-gradient(135deg,${T("surface-alt")},#e6edf5);display:flex;align-items:center;justify-content:center;color:${T("border-subtle")};font-size:12px">image</div>${cap}</div>`
      }

      case "table": {
        const cols = Math.max(...n.rows.map(r => r.cells.reduce((s, c) => s + (c.colSpan ?? 1), 0)))
        return `<table ${bakeAttr({ kind: "table", props: { rows: n.rows, headerRow: n.headerRow, cols } })} style="border-collapse:collapse;width:100%;font-size:${TYPE_PX.small}px;color:${T("text")}">${
          n.rows.map((r, ri) => `<tr>${r.cells.map(c =>
            `<${n.headerRow && ri === 0 ? "th" : "td"} colspan="${c.colSpan ?? 1}" rowspan="${c.rowSpan ?? 1}" style="border:1px solid ${T("border-subtle")};padding:8px 10px;text-align:left;${n.headerRow && ri === 0 ? `background:${T("primary")};color:#fff;font-weight:700;` : ri % 2 === 0 ? "" : `background:${T("surface-alt")};`}">${esc(c.text)}</${n.headerRow && ri === 0 ? "th" : "td"}>`
          ).join("")}</tr>`).join("")
        }</table>`
      }

      case "chart":
        // Drawn for real during measurement too, so the compiler bakes a box
        // sized to an actual chart rather than to a placeholder.
        return `<div ${bakeAttr({ kind: "chart", props: { chartType: n.chartType, data: n.data } })} style="flex:1;min-height:180px;display:flex;align-items:stretch;justify-content:stretch">${
          chartSvg({ chartType: n.chartType, data: n.data, tokens, darkContext })
        }</div>`

      case "comparison":
        return `<div style="display:flex;gap:${gap("lg")}">${n.columns.map(col => {
          const accent = resolveToken(col.accent, tokens, T("accent-warm"))
          return `<div style="flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:${gap("sm")}"><div style="display:flex;align-items:center;gap:8px;border-left:3px solid ${accent};padding-left:10px">${
            col.icon ? iconHtml({ name: col.icon, token: col.accent ?? "token:accent-warm", resolved: accent, size: 20 }) : ""
          }<span ${bakeAttr({ kind: "text", props: { runs: [{ text: col.heading, bold: true }], fontSize: TYPE_PX.h5, color: col.accent ?? "token:accent-warm", fontWeight: 800 } })} style="font-size:${TYPE_PX.h5}px;font-weight:800;color:${accent};letter-spacing:0.5px">${esc(col.heading)}</span></div>${col.children.map(c => blueprintToHtml(c, tokens, darkContext)).join("")}</div>`
        }).join("")}</div>`

      case "flow": {
        const horizontal = (n.direction ?? "horizontal") === "horizontal"
        // Green → amber → warm → red, sampled evenly across the step count so
        // position in the sequence reads as severity without needing the
        // agent to pick colours itself.
        const ramp = ["success", "tab-yellow", "accent-warm", "danger"]
        const rampIdx = (i: number) => n.steps.length <= 1 ? 0 : Math.round((i / (n.steps.length - 1)) * (ramp.length - 1))
        const rampColor = (i: number) => T(ramp[rampIdx(i)])
        const rampToken = (i: number) => `token:${ramp[rampIdx(i)]}`
        const connector = horizontal
          ? iconHtml({ name: "arrow-right", token: "token:border-subtle", resolved: T("border-subtle"), size: 18, extraStyle: "flex-shrink:0;align-self:center" })
          : `<div ${bakeAttr({ kind: "line", props: { stroke: "token:border-subtle" } })} style="width:2px;height:16px;background:${T("border-subtle")};margin-left:18px"></div>`
        const cells = n.steps.map((s, i) => {
          const accent = n.escalate ? rampColor(i) : T("primary")
          const card = `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: n.escalate ? rampToken(i) : "token:surface", stroke: accent } })} style="flex:1;background:${n.escalate ? accent : T("surface")};border:1px solid ${T("border-subtle")};border-radius:${tokens.radius?.md ?? 12}px;padding:${gap("md")};display:flex;flex-direction:column;gap:6px;align-items:${horizontal ? "center" : "flex-start"};text-align:${horizontal ? "center" : "left"}">${
            s.n !== undefined
              ? `<span ${bakeAttr({ kind: "text", props: { runs: [{ text: String(s.n), bold: true }], fontSize: TYPE_PX.h3, color: n.escalate ? "token:text-inverse" : "token:navy", fontWeight: 800 } })} style="font-size:${TYPE_PX.h3}px;font-weight:800;color:${n.escalate ? "#fff" : T("navy")}">${esc(String(s.n))}</span>`
              : s.icon ? iconHtml({ name: s.icon, token: "token:navy", resolved: n.escalate ? "#fff" : T("navy"), size: 24 }) : ""
            }<span ${bakeAttr({ kind: "text", props: { runs: [{ text: s.heading, bold: true }], fontSize: TYPE_PX.h5, color: n.escalate ? "token:text-inverse" : "token:navy", fontWeight: 700 } })} style="font-size:${TYPE_PX.h5}px;font-weight:700;color:${n.escalate ? "#fff" : T("navy")}">${esc(s.heading)}</span>${
              s.body ? `<span ${bakeAttr({ kind: "text", props: { runs: [{ text: s.body }], fontSize: TYPE_PX.small, color: n.escalate ? "token:text-inverse" : "token:text" } })} style="font-size:${TYPE_PX.small}px;color:${n.escalate ? "rgba(255,255,255,0.9)" : T("text")}">${esc(s.body)}</span>` : ""
            }</div>`
          return i === n.steps.length - 1 ? card : `${card}${connector}`
        })
        return `<div style="display:flex;flex-direction:${horizontal ? "row" : "column"};align-items:${horizontal ? "stretch" : "flex-start"};gap:${gap("sm")}">${cells.join("")}</div>`
      }

      case "radial": {
        const hubIcon = n.hub.icon ? iconHtml({ name: n.hub.icon, token: "token:text-inverse", resolved: "#fff", size: 22, extraStyle: "margin-right:8px" }) : ""
        const hub = `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: "token:navy", radius: tokens.radius?.md ?? 12 } })} style="background:${T("navy")};border-radius:${tokens.radius?.md ?? 12}px;padding:${gap("md")};display:flex;align-items:center;justify-content:center;align-self:center">${hubIcon}<span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.hub.heading, bold: true }], fontSize: TYPE_PX.h5, color: "token:text-inverse", fontWeight: 800 } })} style="font-size:${TYPE_PX.h5}px;font-weight:800;color:#fff">${esc(n.hub.heading)}</span></div>`
        const stem = `<div ${bakeAttr({ kind: "line", props: { stroke: "token:border-subtle" } })} style="width:2px;height:14px;background:${T("border-subtle")};align-self:center"></div>`
        const spokes = `<div style="display:flex;gap:${gap("md")};align-items:stretch">${n.spokes.map(sp => {
          const accent = T("accent-warm")
          return `<div style="flex:1 1 0;display:flex;flex-direction:column;align-items:center;gap:4px"><div ${bakeAttr({ kind: "line", props: { stroke: "token:border-subtle" } })} style="width:100%;height:2px;background:${T("border-subtle")}"></div><div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: "token:surface", stroke: "token:border-subtle" } })} style="width:100%;background:${T("surface")};border:1px solid ${T("border-subtle")};border-top:3px solid ${accent};border-radius:8px;padding:${gap("sm")};display:flex;flex-direction:column;gap:4px;align-items:center;text-align:center">${
            sp.icon ? iconHtml({ name: sp.icon, token: "token:accent-warm", resolved: accent, size: 20 }) : ""
          }<span ${bakeAttr({ kind: "text", props: { runs: [{ text: sp.heading, bold: true }], fontSize: TYPE_PX.small, color: "token:navy", fontWeight: 700 } })} style="font-size:${TYPE_PX.small}px;font-weight:700;color:${T("navy")}">${esc(sp.heading)}</span>${
            sp.body ? `<span ${bakeAttr({ kind: "text", props: { runs: [{ text: sp.body }], fontSize: 12, color: "token:text" } })} style="font-size:12px;color:${T("text")}">${esc(sp.body)}</span>` : ""
          }</div></div>`
        }).join("")}</div>`
        return `<div style="display:flex;flex-direction:column;gap:${gap("sm")};flex:1">${hub}${stem}${spokes}</div>`
      }

      case "tiers": {
        const bands = n.bands.map((b, i) => {
          const fill = resolveToken(b.tone, tokens, i === 0 ? T("navy") : i === n.bands.length - 1 ? T("surface-alt") : T("primary"))
          const dark = i < n.bands.length - 1 || b.tone === "token:navy" || (!b.tone && i === 0)
          const textCol = dark ? "#fff" : T("text")
          const band = `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: b.tone ?? "token:navy", radius: 6 } })} style="background:${fill};border-radius:6px;padding:${gap("sm")} ${gap("md")};display:flex;flex-direction:column;gap:6px"><span ${bakeAttr({ kind: "text", props: { runs: [{ text: b.heading, bold: true }], fontSize: TYPE_PX.h5, color: dark ? "token:text-inverse" : "token:text", fontWeight: 800 } })} style="font-size:${TYPE_PX.h5}px;font-weight:800;color:${textCol};text-align:center">${esc(b.heading)}</span>${
            b.items?.length ? `<div style="display:flex;gap:${gap("sm")};justify-content:center;flex-wrap:wrap">${b.items.map(it => `<span ${bakeAttr({ kind: "text", props: { runs: [{ text: it }], fontSize: TYPE_PX.small, color: dark ? "token:text-inverse" : "token:text" } })} style="font-size:${TYPE_PX.small}px;color:${dark ? "rgba(255,255,255,0.9)" : T("text")};background:${dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.05)"};padding:4px 10px;border-radius:6px">${esc(it)}</span>`).join("")}</div>` : ""
          }</div>`
          const arrow = i < n.bands.length - 1 ? `<div style="display:flex;justify-content:center">${iconHtml({ name: "arrow-down", token: "token:border-subtle", resolved: T("border-subtle"), size: 16 })}</div>` : ""
          return band + arrow
        })
        return `<div style="display:flex;flex-direction:column;gap:2px;flex:1;justify-content:center">${bands.join("")}</div>`
      }

      case "quote-banner": {
        const bg = T("navy")
        return `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: "token:navy", radius: tokens.radius?.md ?? 12 } })} style="background:${bg};border-radius:${tokens.radius?.md ?? 12}px;padding:${gap("lg")};display:flex;flex-direction:column;gap:8px;align-self:center;justify-content:center;flex:1"><span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.text, bold: true }], fontSize: TYPE_PX.h2, lineHeight: 1.25, color: "token:text-inverse", fontWeight: 800 } })} style="font-size:${TYPE_PX.h2}px;font-weight:800;line-height:1.25;color:#fff;text-align:center">${esc(n.text)}</span>${
          n.attribution ? `<span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.attribution }], fontSize: TYPE_PX.small, color: "token:text-inverse" } })} style="font-size:${TYPE_PX.small}px;color:rgba(255,255,255,0.75);text-align:center">${esc(n.attribution)}</span>` : ""
        }</div>`
      }

      case "stat-equation": {
        const box = (label: string, sub: string | undefined, emphasise: boolean) =>
          `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: emphasise ? "token:primary" : "token:surface-alt", radius: 8 } })} style="flex:1;background:${emphasise ? T("primary") : T("surface-alt")};border-radius:8px;padding:${gap("sm")} ${gap("md")};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-align:center"><span ${bakeAttr({ kind: "text", props: { runs: [{ text: label, bold: true }], fontSize: TYPE_PX.body, color: emphasise ? "token:text-inverse" : "token:navy", fontWeight: 700 } })} style="font-size:${TYPE_PX.body}px;font-weight:700;color:${emphasise ? "#fff" : T("navy")}">${esc(label)}</span>${
            sub ? `<span ${bakeAttr({ kind: "text", props: { runs: [{ text: sub }], fontSize: 12, color: emphasise ? "token:text-inverse" : "token:text" } })} style="font-size:12px;color:${emphasise ? "rgba(255,255,255,0.85)" : T("text")}">${esc(sub)}</span>` : ""
          }</div>`
        const op = (sym: string) => `<span ${bakeAttr({ kind: "text", props: { runs: [{ text: sym, bold: true }], fontSize: TYPE_PX.h4, color: "token:text", fontWeight: 800 } })} style="font-size:${TYPE_PX.h4}px;font-weight:800;color:${T("text")};align-self:center">${sym}</span>`
        return `<div style="display:flex;align-items:stretch;gap:${gap("sm")}">${
          n.terms.map((t, i) => (i > 0 ? op("+") : "") + box(t.label, t.sublabel, false)).join("")
        }${op("=")}${box(n.result.label, n.result.sublabel, true)}</div>`
      }

      case "tag-list": {
        const toneColor = (t?: string) => t === "success" ? T("success") : t === "warning" ? T("tab-yellow") : t === "danger" ? T("danger") : T("primary")
        return `<div style="display:flex;flex-direction:column;gap:8px">${n.items.map(it => {
          const c = toneColor(it.tone)
          // Box and label bake as two elements (box behind, text on top) —
          // baking one node as both "shape" and the text carrier would drop
          // the label, since a shape element carries no text (see badge-number).
          const pill = `<span ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: it.tone ?? "token:primary", radius: 4 } })} style="background:${c}22;border:1px solid ${c}55;border-radius:4px;padding:2px 10px;display:inline-flex"><span ${bakeAttr({ kind: "text", props: { runs: [{ text: it.tag, bold: true }], fontSize: TYPE_PX.small, color: it.tone ?? "token:primary", fontWeight: 700 } })} style="font-size:${TYPE_PX.small}px;font-weight:700;color:${c}">${esc(it.tag)}</span></span>`
          return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid ${T("border-subtle")}"><span ${bakeAttr({ kind: "text", props: { runs: [{ text: it.label }], fontSize: TYPE_PX.body, color: "token:text" } })} style="font-size:${TYPE_PX.body}px;color:${T("text")}">${esc(it.label)}</span>${pill}</div>`
        }).join("")}</div>`
      }

      case "custom": {
        // Tier 3: children carry their own small-scale relative coordinates.
        return `<div style="position:relative;flex:1;min-height:200px">${n.children.map(ch => {
          const st = `position:absolute;left:${ch.x}%;top:${ch.y}%;width:${ch.width}%;height:${ch.height}%;`
          if (ch.kind === "text")
            return `<div ${bakeAttr({ kind: "text", props: { runs: [{ text: String(ch.props.text ?? "") }], fontSize: Number(ch.props.fontSize ?? TYPE_PX.body), color: String(ch.props.color ?? "token:text") } })} style="${st}font-size:${ch.props.fontSize ?? TYPE_PX.body}px;color:${resolveToken(String(ch.props.color ?? ""), tokens, T("text"))}">${esc(String(ch.props.text ?? ""))}</div>`
          if (ch.kind === "line")
            return `<div ${bakeAttr({ kind: "line", props: ch.props })} style="${st}background:${resolveToken(String(ch.props.stroke ?? ""), tokens, T("primary"))}"></div>`
          if (ch.kind === "icon") {
            // Absolutely positioned: the glyph fills its own box, so the SVG
            // is stretched to 100% rather than given a pixel size.
            const name = String(ch.props.name ?? "")
            const col = resolveToken(String(ch.props.color ?? ""), tokens, T("primary"))
            const glyph = iconSvg(name, { size: 0, color: col })
            const inner = glyph
              ? glyph.replace(/width="0" height="0"/, 'width="100%" height="100%"')
              : ""
            return `<div ${bakeAttr({ kind: "icon", props: ch.props })} style="${st}${inner ? "" : `background:${col};border-radius:4px`}">${inner}</div>`
          }
          return `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", ...ch.props } })} style="${st}background:${resolveToken(String(ch.props.fill ?? ""), tokens, T("surface-alt"))};border-radius:${ch.props.radius ?? 6}px"></div>`
        }).join("")}</div>`
      }

      default:
        return ""
    }
  }

  return render(node)
}
