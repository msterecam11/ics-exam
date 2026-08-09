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
import { resolveToken, spacingPx, typeScale, type ThemeTokens } from "./tokens"
import { iconSvg } from "./icons"
import { chartSvg } from "./charts"
import { surfacePaint, fillCarriesInverseText, cornerCss, type FillStyleName, type CornerName } from "./surface"
import { effectsCss } from "./effects"

interface Bake {
  kind: "text" | "shape" | "icon" | "image" | "table" | "chart" | "line"
  props: Record<string, unknown>
}

/**
 * Several primitives centre their text at compose time (flow steps, radial
 * spokes, quote banners, stat equations, tier bands) but every text node used
 * to bake with align "left" regardless. The box was measured around centred
 * text and then re-rendered left-aligned inside it, which is a large part of
 * why finished slides read as subtly misaligned. Anything that centres when
 * it is drawn must say so when it is baked.
 */
function centred(props: Record<string, unknown>): Record<string, unknown> {
  return { ...props, align: "center" }
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

function runsHtml(text: string | TextRun[], tokens: ThemeTokens): { html: string; runs: TextRun[] } {
  if (typeof text === "string") return { html: esc(text), runs: [{ text }] }
  const runs = text as TextRun[]
  const html = runs.map(r => {
    let t = esc(r.text)
    if (r.bold) t = `<b>${t}</b>`
    // Highlight is drawn here at compose time so the measured box includes
    // its padding; the same wash is reproduced from the baked run's own
    // `highlight` field at export/edit time (see slideHtml, SlideCanvas).
    if (r.highlight) {
      const bg = resolveToken(r.highlight, tokens, "#F2C14E")
      t = `<span style="background:${bg}44;padding:0 3px;border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone">${t}</span>`
    }
    if (r.color) t = `<span style="color:inherit">${t}</span>`
    return t
  }).join("")
  return { html, runs }
}

const DENSITY_STEP: Record<string, string> = { tight: "sm", normal: "md", airy: "lg" }
const ELEVATION_CSS: Record<string, string> = {
  flat: "",
  raised: "box-shadow:0 2px 6px rgba(11,43,69,.10);",
  lifted: "box-shadow:0 12px 30px rgba(11,43,69,.16);",
  inset: "box-shadow:inset 0 2px 8px rgba(11,43,69,.13);",
  ring: "box-shadow:0 0 0 4px rgba(12,114,198,.16);",
}

export function blueprintToHtml(node: BlueprintNode, tokens: ThemeTokens, darkContext = false): string {
  const T = (k: string) => tokens.colors[k] ?? "#333"
  const textColor = darkContext ? T("text-inverse") : T("text")
  const gap = (g?: string) => `${spacingPx(g, tokens)}px`
  // Deliberately shadows the imported fallback, so every `TYPE_PX.body` below
  // reads THIS theme's scale rather than a hardcoded second opinion. Shadowing
  // rather than renaming ~40 call sites is the point: a rename would silently
  // miss one, and a single primitive left on the old constant is exactly the
  // kind of drift that has already caused several bugs here.
  const TYPE_PX = typeScale(tokens)

  /**
   * Resolves a primitive's StyleParams into concrete CSS plus the bake props
   * that reproduce it. This is what replaced the hardcoded padding/radius/fill
   * that made every instance of a primitive identical.
   *
   * `intensity` (0-1) steps the fill's strength for ramped multi-item
   * primitives, so a sequence reads as a progression rather than N copies of
   * one colour.
   */
  function surface(style: any, opts: {
    defaultFill?: string
    defaultCorner?: string
    defaultElevation?: string
    defaultDensity?: string
    accent?: string           // token ref
    intensity?: number
  }) {
    const s = style ?? {}
    const fill = s.fill ?? opts.defaultFill ?? "plain"
    const corner = s.corner ?? opts.defaultCorner ?? "soft"
    const elevation = s.elevation ?? opts.defaultElevation ?? "flat"
    const density = s.density ?? opts.defaultDensity ?? "normal"
    const accentToken = s.accent ?? opts.accent ?? "token:primary"
    const accent = resolveToken(accentToken, tokens, T("primary"))
    const i = opts.intensity ?? 1

    const pad = gap(DENSITY_STEP[density] ?? "md")
    const corners = cornerCss(corner as CornerName, 8)

    // Painted through the SHARED resolver so the PDF and the editor reproduce
    // exactly this surface from the baked element (see surface.ts).
    const paint = surfacePaint({
      fill: fill as FillStyleName,
      accent,
      accentDeep: resolveToken("token:primary-dark", tokens, "#045089"),
      surfaceHex: T("surface"),
      borderHex: T("border-subtle"),
      dark: darkContext,
      intensity: i,
    })

    return {
      css: `background:${paint.background};${paint.border ? `border:${paint.border};` : ""}`
        + `${paint.blur ? `backdrop-filter:blur(${paint.blur}px);` : ""}`
        + `border-radius:${corners.borderRadius};${corners.clipPath ? `clip-path:${corners.clipPath};` : ""}`
        + `padding:${pad};${ELEVATION_CSS[elevation] ?? ""}`,
      pad,
      radius: corners.borderRadius,
      onFill: fillCarriesInverseText(fill as FillStyleName),
      accent,
      accentToken,
      bake: {
        shape: "rect",
        fill: fill === "plain" ? "token:surface" : accentToken,
        fillStyle: fill,
        intensity: i,
        elevation,
        corner,
        shadow: elevation === "raised" || elevation === "lifted",
      },
    }
  }

  /**
   * A step number in a solid circle rather than bare bold text — box and
   * numeral bake as two elements (box behind, number on top), the same
   * pattern badge-number already uses, because a shape element carries no
   * text of its own.
   */
  function numeralBadge(value: string, accentToken: string): string {
    const resolved = resolveToken(accentToken, tokens, T("primary"))
    const size = 40
    return `<span ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: accentToken, corner: "circle" } })} style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${resolved};flex-shrink:0"><span ${bakeAttr({ kind: "text", props: centred({ runs: [{ text: value, bold: true }], fontSize: TYPE_PX.h5, color: "token:text-inverse", fontWeight: 800 }) })} style="font-size:${TYPE_PX.h5}px;font-weight:800;color:#fff">${esc(value)}</span></span>`
  }

  /**
   * Applies a node's `effects` — and this is a bug fix, not a feature.
   *
   * The prompt has advertised shadow / gradient / blur / opacity /
   * textShadow on any node for several revisions, and NOTHING here ever read
   * them: they were parsed out of the model's JSON and silently dropped. The
   * final renderer could always draw them; nothing ever put them on an
   * element to draw. That is why generated decks have never had any depth.
   *
   * Injecting into the first `style="` and the first `data-bake="` is safe
   * because every case below returns one outer element and both attributes
   * belong to it — the visual is applied at measurement time AND carried
   * into the bake, so the PDF and editor reproduce it.
   */
  function withEffects(html: string, effects: any): string {
    if (!effects || typeof effects !== "object") return html
    let out = html

    const css = effectsCss(effects, tokens)
    if (css) {
      const at = out.indexOf('style="')
      if (at >= 0) out = `${out.slice(0, at + 7)}${css};${out.slice(at + 7)}`
    }

    const bakeAt = out.indexOf('data-bake="')
    if (bakeAt >= 0) {
      const end = out.indexOf('"', bakeAt + 11)
      const raw = out.slice(bakeAt + 11, end)
      try {
        const parsed = JSON.parse(
          raw.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
        )
        parsed.props = { ...parsed.props, effects }
        out = out.slice(0, bakeAt) + bakeAttr(parsed) + out.slice(end + 1)
      } catch { /* malformed bake — leave the visual, skip the carry */ }
    }
    return out
  }

  function render(n: BlueprintNode): string {
    return withEffects(renderNode(n), (n as any).effects)
  }

  function renderNode(n: BlueprintNode): string {
    switch (n.type) {
      case "row": {
        const weights = n.weights ?? n.children.map(() => 1)
        // "safe center", not plain "center". Centering content shorter than
        // its box is what a human would do — but plain `center` on content
        // TALLER than its box overflows equally in BOTH directions, so the
        // excess pushes up into the title zone and renders behind it. That
        // is exactly how the closing slide's quote box ended up covering its
        // own title. `safe` keeps the centering when it fits and falls back
        // to flex-start when it doesn't, so overflow only ever goes down,
        // where the compiler's overflow check can see and retry it.
        return `<div style="display:flex;flex-direction:row;gap:${gap(n.gap)};align-items:stretch;min-height:0">${
          n.children.map((c, i) => `<div style="flex:${weights[i] ?? 1} 1 0;min-width:0;display:flex;flex-direction:column;justify-content:safe center">${render(c)}</div>`).join("")
        }</div>`
      }
      case "col":
      case "stack":
        // Same reasoning as the row case above.
        return `<div style="display:flex;flex-direction:column;gap:${gap(n.gap)};justify-content:safe center">${n.children.map(render).join("")}</div>`

      case "heading": {
        const size = TYPE_PX[`h${n.level ?? 4}`] ?? TYPE_PX.h4
        const color = resolveToken(n.color, tokens, darkContext ? T("text-inverse") : T("navy"))
        const bar = n.accentBar
          ? `<span ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: n.color ?? "token:accent-warm", radius: 2 } })} style="display:inline-block;width:4px;align-self:stretch;background:${color};border-radius:2px;margin-right:10px"></span>`
          : ""
        const icon = n.icon
          ? iconHtml({ name: n.icon, token: n.color ?? "token:accent-warm", resolved: color, size, extraStyle: "margin-right:8px" })
          : ""
        const headingLine = `<div style="display:flex;align-items:center">${bar}${icon}<span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.text, bold: true }], fontSize: size, lineHeight: 1.25, color: n.color ?? (darkContext ? "token:text-inverse" : "token:navy"), fontWeight: 700 } })} style="font-size:${size}px;font-weight:700;color:${color};line-height:1.25">${esc(n.text)}</span></div>`
        if (!n.eyebrow) return headingLine
        // Baked as its own element, above the heading line — a genuinely
        // separate small caps label, not a styled span inside the heading's
        // own text run (which would drag its metrics into the heading size).
        const eyebrowLine = `<div ${bakeAttr({ kind: "text", props: { runs: [{ text: n.eyebrow.toUpperCase() }], fontSize: TYPE_PX.small, color: n.color ?? "token:accent-warm" } })} style="font-size:${TYPE_PX.small}px;font-weight:700;letter-spacing:1.5px;color:${color};margin-bottom:2px">${esc(n.eyebrow.toUpperCase())}</div>`
        return `<div style="display:flex;flex-direction:column">${eyebrowLine}${headingLine}</div>`
      }

      case "body": {
        const { html, runs } = runsHtml(n.text as any, tokens)
        // A standfirst leads at h4 and rides a looser line; a caption drops to
        // the small step. Longer measures want tighter leading, which is why
        // the line height moves with the size rather than staying at 1.55.
        const bodySize = n.size === "lead" ? TYPE_PX.h4 : n.size === "caption" ? TYPE_PX.small : TYPE_PX.body
        const bodyLh = n.size === "lead" ? 1.35 : 1.55
        // lineHeight is baked so the renderer reproduces the EXACT metrics
        // this measurement was taken with — otherwise wrapped text reflows
        // into a box sized for different metrics and clips.
        return `<div ${bakeAttr({ kind: "text", props: { runs, fontSize: bodySize, lineHeight: bodyLh, color: darkContext ? "token:text-inverse" : "token:text" } })} style="font-size:${bodySize}px;color:${textColor};line-height:${bodyLh}">${html}</div>`
      }

      case "bullets": {
        // Each item bakes as its OWN element, not one text block joined by
        // "\n". A baked text element renders as a single flowing block
        // (slideHtml.ts has no reason to special-case bullet runs), and a
        // literal newline inside normal HTML text collapses to a space — so
        // a merged multi-line blob rendered as one run-on paragraph with no
        // visible line breaks at all. Separate elements is what "body"/
        // "icon-row" already do correctly; bullets gets the same treatment.
        return `<div style="display:flex;flex-direction:column;gap:${gap("sm")}">${n.items.map(text => {
          const bulleted = `•  ${text}`
          return `<div ${bakeAttr({ kind: "text", props: { runs: [{ text: bulleted }], fontSize: TYPE_PX.body, lineHeight: 1.5, color: darkContext ? "token:text-inverse" : "token:text" } })} style="font-size:${TYPE_PX.body}px;color:${textColor};line-height:1.5">${esc(bulleted)}</div>`
        }).join("")}</div>`
      }

      case "card": {
        // `tone` still works and now simply picks the DEFAULT fill; an
        // explicit `style` overrides it. That keeps every existing blueprint
        // and exemplar rendering as before while giving the agent real
        // control over how any individual card looks.
        const toneFill = n.tone === "cream" ? "tinted"
          : n.tone === "glass" ? "glass"
          : n.tone === "accent" ? "tinted"
          : "plain"
        const toneAccent = n.tone === "cream" ? "token:accent-warm" : "token:primary"
        const sf = surface(n.style, {
          defaultFill: toneFill,
          defaultCorner: "soft",
          defaultDensity: "normal",
          accent: n.accent ?? toneAccent,
        })
        const leftBar = n.accent && !n.style?.fill
          ? `border-left:4px solid ${resolveToken(n.accent, tokens, T("accent-warm"))};`
          : ""
        // Deliberately NOT flex:1. A card that stretched to fill its column
        // turned sparse content into a large empty box — and, because the
        // box measured "full", hid the problem from the underfill check.
        // Sized to its content, a short card reads as compact rather than
        // unfinished; equal heights across a row still come from the row's
        // own align-items:stretch.
        const glassy = sf.onFill || n.tone === "glass"
        return `<div ${bakeAttr({ kind: "shape", props: { ...sf.bake, tone: n.tone ?? "plain" } })} style="${sf.css}${leftBar}display:flex;flex-direction:column;gap:${gap("sm")}">${
          n.children.map(c => blueprintToHtml(c, tokens, glassy ? true : darkContext)).join("")
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

      case "stat": {
        // "hero" is the number-as-graphic device: the figure fills roughly
        // the height a title would, so it reads before anything else on the
        // slide — the point of reaching for a stat at all, rather than a
        // number the same size as its own label.
        const valueSize = n.size === "hero" ? TYPE_PX.h1 * 1.6 : TYPE_PX.h2
        return `<div style="display:flex;flex-direction:column;gap:2px"><span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.value, bold: true }], fontSize: valueSize, color: "token:primary", fontWeight: 800 } })} style="font-size:${valueSize}px;font-weight:800;line-height:1;color:${T("primary")}">${esc(n.value)}</span><span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.label }], fontSize: TYPE_PX.small, color: darkContext ? "token:text-inverse" : "token:text" } })} style="font-size:${TYPE_PX.small}px;color:${textColor}">${esc(n.label)}</span></div>`
      }

      case "figure": {
        const cap = n.caption
          ? `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: "token:primary-dark", caption: true } })} style="background:${T("primary-dark")};padding:8px 12px"><span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.caption }], fontSize: TYPE_PX.small, color: "token:text-inverse", fontWeight: 600 } })} style="color:#fff;font-size:${TYPE_PX.small}px;font-weight:600">${esc(n.caption)}</span></div>`
          : ""
        // A mask crops the photo itself, so it rides on the image element's
        // own effects (where the renderer already knows how to apply it) —
        // not on the surrounding card, which still needs square corners to
        // sit its caption bar flush against.
        const maskEffects = n.mask && n.mask !== "none" ? { mask: n.mask } : undefined
        return `<div style="display:flex;flex-direction:column;flex:1;${n.shadow ? "box-shadow:0 8px 24px rgba(0,0,0,0.12);" : ""}border-radius:8px;overflow:hidden;border:1px solid ${T("border-subtle")}"><div ${bakeAttr({ kind: "image", props: { media: n.media, effects: maskEffects } })} style="flex:1;min-height:140px;${maskEffects ? effectsCss({ mask: n.mask }, tokens) : ""}background:linear-gradient(135deg,${T("surface-alt")},#e6edf5);display:flex;align-items:center;justify-content:center;color:${T("border-subtle")};font-size:12px">image</div>${cap}</div>`
      }

      case "meter": {
        return `<div style="display:flex;flex-direction:column;gap:${gap("md")};flex:1;justify-content:safe center">${n.items.map(it => {
          const accentToken = it.accent ?? n.style?.accent ?? "token:primary"
          const accent = resolveToken(accentToken, tokens, T("primary"))
          const max = it.max && it.max > 0 ? it.max : 100
          const pctFilled = Math.max(0, Math.min(100, (it.value / max) * 100))
          const readout = it.caption ?? (it.max ? `${it.value} / ${it.max}` : `${it.value}%`)
          // Track and fill bake as two shapes (track behind, fill over it) —
          // the fill's measured width IS the proportion, so the baked element
          // carries the value geometrically and needs no re-computation.
          const bar = `<span ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: "token:surface-alt", corner: "pill" } })} style="display:block;width:100%;height:10px;border-radius:999px;background:${darkContext ? "rgba(255,255,255,0.18)" : T("surface-alt")};position:relative"><span ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: accentToken, fillStyle: "filled", corner: "pill" } })} style="position:absolute;left:0;top:0;height:10px;width:${pctFilled}%;border-radius:999px;background:${accent}"></span></span>`
          return `<div style="display:flex;flex-direction:column;gap:6px"><div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px"><span ${bakeAttr({ kind: "text", props: { runs: [{ text: it.label, bold: true }], fontSize: TYPE_PX.body, color: darkContext ? "token:text-inverse" : "token:navy", fontWeight: 700 } })} style="font-size:${TYPE_PX.body}px;font-weight:700;color:${darkContext ? T("text-inverse") : T("navy")}">${esc(it.label)}</span><span ${bakeAttr({ kind: "text", props: { runs: [{ text: readout, bold: true }], fontSize: TYPE_PX.small, color: accentToken, fontWeight: 700 } })} style="font-size:${TYPE_PX.small}px;font-weight:700;color:${accent}">${esc(readout)}</span></div>${bar}</div>`
        }).join("")}</div>`
      }

      case "icon-tile": {
        const accentToken = n.accent ?? "token:primary"
        const accent = resolveToken(accentToken, tokens, T("primary"))
        const sq = 52
        // Tile square and its glyph bake as two elements (square behind,
        // glyph on top) — the same pattern badge-number and the circular
        // flow marker use, because a shape element carries no glyph of its own.
        const tile = `<span ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: accentToken, fillStyle: "filled", corner: n.style?.corner ?? "soft" } })} style="width:${sq}px;height:${sq}px;border-radius:${n.style?.corner === "pill" ? "50%" : "12px"};background:${accent};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${
          iconHtml({ name: n.icon, token: "token:text-inverse", resolved: "#fff", size: 26 })
        }</span>`
        return `<div style="display:flex;flex-direction:column;gap:${gap("sm")};align-items:flex-start">${tile}<span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.heading, bold: true }], fontSize: TYPE_PX.h5, color: darkContext ? "token:text-inverse" : "token:navy", fontWeight: 700 } })} style="font-size:${TYPE_PX.h5}px;font-weight:700;color:${darkContext ? T("text-inverse") : T("navy")}">${esc(n.heading)}</span>${
          n.body ? `<span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.body }], fontSize: TYPE_PX.small, lineHeight: 1.5, color: darkContext ? "token:text-inverse" : "token:text" } })} style="font-size:${TYPE_PX.small}px;line-height:1.5;color:${textColor}">${esc(n.body)}</span>` : ""
        }</div>`
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
        return `<div ${bakeAttr({ kind: "chart", props: { chartType: n.chartType, data: n.data, unit: n.unit, xTitle: n.xTitle, yTitle: n.yTitle } })} style="flex:1;min-height:180px;display:flex;align-items:stretch;justify-content:stretch">${
          chartSvg({ chartType: n.chartType, data: n.data, tokens, darkContext, unit: n.unit, xTitle: n.xTitle, yTitle: n.yTitle })
        }</div>`

      // Same two-box reasoning as `flow`: the columns stretch to each other,
      // then the pair is centred in the zone — rather than each column being
      // as tall as the slide with its text floating in the middle.
      case "comparison":
        return `<div style="flex:1;display:flex;flex-direction:column;justify-content:safe center"><div style="display:flex;gap:${gap("lg")};align-items:stretch">${n.columns.map(col => {
          const accent = resolveToken(col.accent, tokens, T("accent-warm"))
          return `<div style="flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:${gap("sm")};justify-content:safe center"><div style="display:flex;align-items:center;gap:8px;border-left:3px solid ${accent};padding-left:10px">${
            col.icon ? iconHtml({ name: col.icon, token: col.accent ?? "token:accent-warm", resolved: accent, size: 20 }) : ""
          }<span ${bakeAttr({ kind: "text", props: { runs: [{ text: col.heading, bold: true }], fontSize: TYPE_PX.h5, color: col.accent ?? "token:accent-warm", fontWeight: 800 } })} style="font-size:${TYPE_PX.h5}px;font-weight:800;color:${accent};letter-spacing:0.5px">${esc(col.heading)}</span></div>${col.children.map(c => blueprintToHtml(c, tokens, darkContext)).join("")}</div>`
        }).join("")}</div></div>`

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
        // A horizontal flow centres its step text; a vertical one reads as a
        // left-aligned list. The bake has to follow whichever was drawn.
        const fit = horizontal ? centred : (p: Record<string, unknown>) => p
        const cells = n.steps.map((s, i) => {
          const accent = n.escalate ? rampColor(i) : T("primary")
          // Escalation keeps its semantic green→red ramp. Otherwise the step
          // takes the agent's chosen style, optionally stepping intensity
          // across the sequence so progression reads without inventing a
          // meaning-bearing colour that isn't there.
          const stepIntensity = n.style?.intensityRamp && n.steps.length > 1
            ? 0.35 + 0.65 * (i / (n.steps.length - 1))
            : 1
          const sf = n.escalate
            ? surface({ ...n.style, fill: "filled", accent: rampToken(i) }, { defaultCorner: "soft" })
            : surface(n.style, { defaultFill: "plain", defaultCorner: "soft", accent: "token:primary", intensity: stepIntensity })
          // `justify-content: safe center` on the card, not just the row.
          // A horizontal flow's cards stretch to the full content zone via
          // align-items:stretch, but their contents stacked from the TOP —
          // so a three-step flow drew three full-height cards each with half
          // its box empty below the text. That empty space is inside the
          // card, which is why "add more content" retries never closed it.
          const card = `<div ${bakeAttr({ kind: "shape", props: { ...sf.bake, stroke: accent } })} style="flex:1;${sf.css}display:flex;flex-direction:column;gap:6px;justify-content:safe center;align-items:${horizontal ? "center" : "flex-start"};text-align:${horizontal ? "center" : "left"}">${
            s.n !== undefined
              ? (n.marker === "circle" ? numeralBadge(String(s.n), n.escalate ? rampToken(i) : "token:primary") : `<span ${bakeAttr({ kind: "text", props: fit({ runs: [{ text: String(s.n), bold: true }], fontSize: TYPE_PX.h3, color: n.escalate ? "token:text-inverse" : "token:navy", fontWeight: 800 }) })} style="font-size:${TYPE_PX.h3}px;font-weight:800;color:${n.escalate ? "#fff" : T("navy")}">${esc(String(s.n))}</span>`)
              : s.icon ? iconHtml({ name: s.icon, token: "token:navy", resolved: n.escalate ? "#fff" : T("navy"), size: 24 }) : ""
            }<span ${bakeAttr({ kind: "text", props: fit({ runs: [{ text: s.heading, bold: true }], fontSize: TYPE_PX.h5, color: n.escalate ? "token:text-inverse" : "token:navy", fontWeight: 700 }) })} style="font-size:${TYPE_PX.h5}px;font-weight:700;color:${n.escalate ? "#fff" : T("navy")}">${esc(s.heading)}</span>${
              s.body ? `<span ${bakeAttr({ kind: "text", props: fit({ runs: [{ text: s.body }], fontSize: TYPE_PX.small, color: n.escalate ? "token:text-inverse" : "token:text" }) })} style="font-size:${TYPE_PX.small}px;color:${n.escalate ? "rgba(255,255,255,0.9)" : T("text")}">${esc(s.body)}</span>` : ""
            }</div>`
          return i === n.steps.length - 1 ? card : `${card}${connector}`
        })
        // Two nested boxes, not one, and the nesting is the point.
        //
        // The inner row is AUTO height, so its cards stretch only to the
        // tallest card's own content — equal heights, sized to what is
        // actually in them. The outer box takes the full content zone and
        // centres that row within it.
        //
        // One box cannot do both: a single full-height row with
        // align-items:stretch gives equal cards that are also as tall as the
        // zone, which is how three steps of one line each ended up drawn as
        // three 440px boxes of mostly air. `tiers` already reads well because
        // it happens to have this shape; this gives `flow` the same one.
        const inner = `<div style="display:flex;flex-direction:${horizontal ? "row" : "column"};align-items:${horizontal ? "stretch" : "flex-start"};gap:${gap("sm")}">${cells.join("")}</div>`
        return horizontal
          ? `<div style="flex:1;display:flex;flex-direction:column;justify-content:safe center">${inner}</div>`
          : inner
      }

      case "radial": {
        const hubIcon = n.hub.icon ? iconHtml({ name: n.hub.icon, token: "token:text-inverse", resolved: "#fff", size: 22, extraStyle: "margin-right:8px" }) : ""
        const hub = `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: "token:navy", radius: tokens.radius?.md ?? 12 } })} style="background:${T("navy")};border-radius:${tokens.radius?.md ?? 12}px;padding:${gap("md")};display:flex;align-items:center;justify-content:center;align-self:center">${hubIcon}<span ${bakeAttr({ kind: "text", props: { runs: [{ text: n.hub.heading, bold: true }], fontSize: TYPE_PX.h5, color: "token:text-inverse", fontWeight: 800 } })} style="font-size:${TYPE_PX.h5}px;font-weight:800;color:#fff">${esc(n.hub.heading)}</span></div>`
        const stem = `<div ${bakeAttr({ kind: "line", props: { stroke: "token:border-subtle" } })} style="width:2px;height:14px;background:${T("border-subtle")};align-self:center"></div>`
        const spokes = `<div style="display:flex;gap:${gap("md")};align-items:stretch">${n.spokes.map(sp => {
          const accent = T("accent-warm")
          return `<div style="flex:1 1 0;display:flex;flex-direction:column;align-items:center;gap:4px"><div ${bakeAttr({ kind: "line", props: { stroke: "token:border-subtle" } })} style="width:100%;height:2px;background:${T("border-subtle")}"></div><div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: "token:surface", stroke: "token:border-subtle" } })} style="width:100%;background:${T("surface")};border:1px solid ${T("border-subtle")};border-top:3px solid ${accent};border-radius:8px;padding:${gap("sm")};display:flex;flex-direction:column;gap:4px;align-items:center;text-align:center">${
            sp.icon ? iconHtml({ name: sp.icon, token: "token:accent-warm", resolved: accent, size: 20 }) : ""
          }<span ${bakeAttr({ kind: "text", props: centred({ runs: [{ text: sp.heading, bold: true }], fontSize: TYPE_PX.small, color: "token:navy", fontWeight: 700 }) })} style="font-size:${TYPE_PX.small}px;font-weight:700;color:${T("navy")}">${esc(sp.heading)}</span>${
            sp.body ? `<span ${bakeAttr({ kind: "text", props: centred({ runs: [{ text: sp.body }], fontSize: 12, color: "token:text" }) })} style="font-size:12px;color:${T("text")}">${esc(sp.body)}</span>` : ""
          }</div></div>`
        }).join("")}</div>`
        return `<div style="display:flex;flex-direction:column;gap:${gap("sm")};flex:1;justify-content:safe center">${hub}${stem}${spokes}</div>`
      }

      case "tiers": {
        const bands = n.bands.map((b, i) => {
          const fill = resolveToken(b.tone, tokens, i === 0 ? T("navy") : i === n.bands.length - 1 ? T("surface-alt") : T("primary"))
          const dark = i < n.bands.length - 1 || b.tone === "token:navy" || (!b.tone && i === 0)
          const textCol = dark ? "#fff" : T("text")
          const band = `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: b.tone ?? "token:navy", radius: 6 } })} style="background:${fill};border-radius:6px;padding:${gap("sm")} ${gap("md")};display:flex;flex-direction:column;gap:6px"><span ${bakeAttr({ kind: "text", props: centred({ runs: [{ text: b.heading, bold: true }], fontSize: TYPE_PX.h5, color: dark ? "token:text-inverse" : "token:text", fontWeight: 800 }) })} style="font-size:${TYPE_PX.h5}px;font-weight:800;color:${textCol};text-align:center">${esc(b.heading)}</span>${
            b.items?.length ? `<div style="display:flex;gap:${gap("sm")};justify-content:center;flex-wrap:wrap">${b.items.map(it => `<span ${bakeAttr({ kind: "text", props: { runs: [{ text: it }], fontSize: TYPE_PX.small, color: dark ? "token:text-inverse" : "token:text" } })} style="font-size:${TYPE_PX.small}px;color:${dark ? "rgba(255,255,255,0.9)" : T("text")};background:${dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.05)"};padding:4px 10px;border-radius:6px">${esc(it)}</span>`).join("")}</div>` : ""
          }</div>`
          const arrow = i < n.bands.length - 1 ? `<div style="display:flex;justify-content:center">${iconHtml({ name: "arrow-down", token: "token:border-subtle", resolved: T("border-subtle"), size: 16 })}</div>` : ""
          return band + arrow
        })
        return `<div style="display:flex;flex-direction:column;gap:2px;flex:1;justify-content:center">${bands.join("")}</div>`
      }

      case "quote-banner": {
        const sf = surface(n.style, {
          defaultFill: "filled", defaultCorner: "soft",
          defaultDensity: "airy", accent: "token:navy",
        })
        return `<div ${bakeAttr({ kind: "shape", props: sf.bake })} style="${sf.css}display:flex;flex-direction:column;gap:8px;align-self:center;justify-content:center;flex:1"><span ${bakeAttr({ kind: "text", props: centred({ runs: [{ text: n.text, bold: true }], fontSize: TYPE_PX.h2, lineHeight: 1.25, color: "token:text-inverse", fontWeight: 800 }) })} style="font-size:${TYPE_PX.h2}px;font-weight:800;line-height:1.25;color:#fff;text-align:center">${esc(n.text)}</span>${
          n.attribution ? `<span ${bakeAttr({ kind: "text", props: centred({ runs: [{ text: n.attribution }], fontSize: TYPE_PX.small, color: "token:text-inverse" }) })} style="font-size:${TYPE_PX.small}px;color:rgba(255,255,255,0.75);text-align:center">${esc(n.attribution)}</span>` : ""
        }</div>`
      }

      case "band": {
        // Full-bleed: no side padding on the wrapper itself, so it reads as
        // breaking out to the content zone's own edges rather than as one
        // more inset card. Deliberately a single line — this is a takeaway,
        // not a place for a paragraph.
        const sf = surface(n.style, {
          defaultFill: "filled", defaultCorner: "sharp",
          defaultDensity: "normal", accent: "token:primary",
        })
        const inverse = sf.onFill
        const icon = n.icon
          ? iconHtml({ name: n.icon, token: inverse ? "token:text-inverse" : "token:navy", resolved: inverse ? "#fff" : T("navy"), size: 22, extraStyle: "margin-right:10px" })
          : ""
        return `<div ${bakeAttr({ kind: "shape", props: sf.bake })} style="${sf.css}display:flex;align-items:center;justify-content:center;width:100%">${icon}<span ${bakeAttr({ kind: "text", props: centred({ runs: [{ text: n.text, bold: true }], fontSize: TYPE_PX.h5, color: inverse ? "token:text-inverse" : "token:navy", fontWeight: 700 }) })} style="font-size:${TYPE_PX.h5}px;font-weight:700;color:${inverse ? "#fff" : T("navy")};text-align:center">${esc(n.text)}</span></div>`
      }

      case "stat-equation": {
        const box = (label: string, sub: string | undefined, emphasise: boolean) =>
          `<div ${bakeAttr({ kind: "shape", props: { shape: "rect", fill: emphasise ? "token:primary" : "token:surface-alt", radius: 8 } })} style="flex:1;background:${emphasise ? T("primary") : T("surface-alt")};border-radius:8px;padding:${gap("sm")} ${gap("md")};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-align:center"><span ${bakeAttr({ kind: "text", props: centred({ runs: [{ text: label, bold: true }], fontSize: TYPE_PX.body, color: emphasise ? "token:text-inverse" : "token:navy", fontWeight: 700 }) })} style="font-size:${TYPE_PX.body}px;font-weight:700;color:${emphasise ? "#fff" : T("navy")}">${esc(label)}</span>${
            sub ? `<span ${bakeAttr({ kind: "text", props: centred({ runs: [{ text: sub }], fontSize: 12, color: emphasise ? "token:text-inverse" : "token:text" }) })} style="font-size:12px;color:${emphasise ? "rgba(255,255,255,0.85)" : T("text")}">${esc(sub)}</span>` : ""
          }</div>`
        const op = (sym: string) => `<span ${bakeAttr({ kind: "text", props: centred({ runs: [{ text: sym, bold: true }], fontSize: TYPE_PX.h4, color: "token:text", fontWeight: 800 }) })} style="font-size:${TYPE_PX.h4}px;font-weight:800;color:${T("text")};align-self:center">${sym}</span>`
        return `<div style="display:flex;align-items:stretch;gap:${gap("sm")}">${
          n.terms.map((t, i) => (i > 0 ? op("+") : "") + box(t.label, t.sublabel, false)).join("")
        }${op("=")}${box(n.result.label, n.result.sublabel, true)}</div>`
      }

      case "tag-list": {
        const toneColor = (t?: string) => t === "success" ? T("success") : t === "warning" ? T("tab-yellow") : t === "danger" ? T("danger") : T("primary")
        return `<div style="display:flex;flex-direction:column;gap:8px;flex:1;justify-content:safe center">${n.items.map(it => {
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
        //
        // "rotate" is intentionally NOT applied as a CSS transform here. This
        // div's box is what the compiler measures via getBoundingClientRect,
        // and a rotated element's bounding rect is its rotated envelope, not
        // its design size — baking against that would corrupt x/y/w/h the
        // same way the old "bullets" bug corrupted text layout. Instead the
        // rotate value rides through in the bake props untouched, and the
        // compiler carries it onto the baked element's own `rotation` field,
        // which the renderer already applies at PAINT time, after layout is
        // decided. Same reasoning doesn't apply to "align" or "dashed" —
        // neither changes the box's own measured dimensions, so both are
        // safe to render directly here.
        return `<div style="position:relative;flex:1;min-height:200px">${n.children.map(ch => {
          const st = `position:absolute;left:${ch.x}%;top:${ch.y}%;width:${ch.width}%;height:${ch.height}%;`
          if (ch.kind === "text") {
            const align = String(ch.props.align ?? "left")
            return `<div ${bakeAttr({ kind: "text", props: { runs: [{ text: String(ch.props.text ?? "") }], fontSize: Number(ch.props.fontSize ?? TYPE_PX.body), color: String(ch.props.color ?? "token:text"), align, rotate: ch.props.rotate } })} style="${st}font-size:${ch.props.fontSize ?? TYPE_PX.body}px;color:${resolveToken(String(ch.props.color ?? ""), tokens, T("text"))};text-align:${align}">${esc(String(ch.props.text ?? ""))}</div>`
          }
          if (ch.kind === "line") {
            const color = resolveToken(String(ch.props.stroke ?? ""), tokens, T("primary"))
            const horizontal = Number(ch.width) >= Number(ch.height)
            const fill = ch.props.dashed
              ? `background-image:repeating-linear-gradient(${horizontal ? "to right" : "to bottom"},${color} 0 6px,transparent 6px 12px);`
              : `background:${color};`
            return `<div ${bakeAttr({ kind: "line", props: ch.props })} style="${st}${fill}"></div>`
          }
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
