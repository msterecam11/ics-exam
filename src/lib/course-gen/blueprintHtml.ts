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

interface Bake {
  kind: "text" | "shape" | "icon" | "image" | "table" | "chart" | "line"
  props: Record<string, unknown>
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
        return `<div style="display:flex;flex-direction:row;gap:${gap(n.gap)};align-items:stretch;min-height:0">${
          n.children.map((c, i) => `<div style="flex:${weights[i] ?? 1} 1 0;min-width:0;display:flex;flex-direction:column">${render(c)}</div>`).join("")
        }</div>`
      }
      case "col":
      case "stack":
        return `<div style="display:flex;flex-direction:column;gap:${gap(n.gap)}">${n.children.map(render).join("")}</div>`

      case "heading": {
        const size = TYPE_PX[`h${n.level ?? 4}`] ?? TYPE_PX.h4
        const color = resolveToken(n.color, tokens, darkContext ? T("text-inverse") : T("navy"))
        const bar = n.accentBar
          ? `<span ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: n.color ?? "token:accent-warm", radius: 2 } })} style="display:inline-block;width:4px;align-self:stretch;background:${color};border-radius:2px;margin-right:10px"></span>`
          : ""
        const icon = n.icon
          ? `<span ${bakeAttr({ kind: "icon", props: { name: n.icon, color: n.color ?? "token:accent-warm" } })} style="display:inline-block;width:${size}px;height:${size}px;background:${color};opacity:.85;border-radius:4px;margin-right:8px;flex-shrink:0"></span>`
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
        return `<div style="display:flex;align-items:center;gap:10px"><span ${bakeAttr({ kind: "icon", props: { name: n.icon, color: n.accent ?? "token:primary-light" } })} style="width:20px;height:20px;background:${accent};border-radius:4px;flex-shrink:0"></span><span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.text }], fontSize: TYPE_PX.body, color: darkContext ? "token:text-inverse" : "token:text" } })} style="font-size:${TYPE_PX.body}px;color:${textColor}">${esc(n.text)}</span></div>`
      }

      case "alternating-list":
        return `<div style="display:flex;flex-direction:column;gap:8px">${n.items.map(it =>
          `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: "token:surface-alt", radius: 4, accentTab: true } })} style="background:${T("surface-alt")};border-left:4px solid ${T("tab-yellow")};border-radius:4px;padding:10px 14px;display:flex;align-items:center;gap:10px">${
            it.icon ? `<span ${bakeAttr({ kind: "icon", props: { name: it.icon, color: "token:tab-yellow" } })} style="width:16px;height:16px;background:${T("tab-yellow")};border-radius:3px;flex-shrink:0"></span>` : ""
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
        return `<div ${bakeAttr({ kind: "chart", props: { chartType: n.chartType, data: n.data } })} style="flex:1;min-height:180px;background:${T("surface-alt")};border:1px dashed ${T("border-subtle")};border-radius:8px;display:flex;align-items:center;justify-content:center;color:${T("primary")};font-size:12px">${esc(n.chartType)} chart</div>`

      case "comparison":
        return `<div style="display:flex;gap:${gap("lg")}">${n.columns.map(col => {
          const accent = resolveToken(col.accent, tokens, T("accent-warm"))
          return `<div style="flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:${gap("sm")}"><div style="display:flex;align-items:center;gap:8px;border-left:3px solid ${accent};padding-left:10px">${
            col.icon ? `<span ${bakeAttr({ kind: "icon", props: { name: col.icon, color: col.accent ?? "token:accent-warm" } })} style="width:20px;height:20px;background:${accent};border-radius:4px"></span>` : ""
          }<span ${bakeAttr({ kind: "text", props: { runs: [{ text: col.heading, bold: true }], fontSize: TYPE_PX.h5, color: col.accent ?? "token:accent-warm", fontWeight: 800 } })} style="font-size:${TYPE_PX.h5}px;font-weight:800;color:${accent};letter-spacing:0.5px">${esc(col.heading)}</span></div>${col.children.map(c => blueprintToHtml(c, tokens, darkContext)).join("")}</div>`
        }).join("")}</div>`

      case "custom": {
        // Tier 3: children carry their own small-scale relative coordinates.
        return `<div style="position:relative;flex:1;min-height:200px">${n.children.map(ch => {
          const st = `position:absolute;left:${ch.x}%;top:${ch.y}%;width:${ch.width}%;height:${ch.height}%;`
          if (ch.kind === "text")
            return `<div ${bakeAttr({ kind: "text", props: { runs: [{ text: String(ch.props.text ?? "") }], fontSize: Number(ch.props.fontSize ?? TYPE_PX.body), color: String(ch.props.color ?? "token:text") } })} style="${st}font-size:${ch.props.fontSize ?? TYPE_PX.body}px;color:${resolveToken(String(ch.props.color ?? ""), tokens, T("text"))}">${esc(String(ch.props.text ?? ""))}</div>`
          if (ch.kind === "line")
            return `<div ${bakeAttr({ kind: "line", props: ch.props })} style="${st}background:${resolveToken(String(ch.props.stroke ?? ""), tokens, T("primary"))}"></div>`
          if (ch.kind === "icon")
            return `<div ${bakeAttr({ kind: "icon", props: ch.props })} style="${st}background:${resolveToken(String(ch.props.color ?? ""), tokens, T("primary"))};border-radius:4px"></div>`
          return `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", ...ch.props } })} style="${st}background:${resolveToken(String(ch.props.fill ?? ""), tokens, T("surface-alt"))};border-radius:${ch.props.radius ?? 6}px"></div>`
        }).join("")}</div>`
      }

      default:
        return ""
    }
  }

  return render(node)
}
