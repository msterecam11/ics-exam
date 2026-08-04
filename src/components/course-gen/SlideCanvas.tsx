"use client"

// Client-side slide renderer. Mirrors src/lib/course-gen/slideHtml.ts so a
// slide looks the same while editing, in QA screenshots, and in the PDF —
// one element model, three surfaces. Used at full size on the stage and
// scaled down for sidebar thumbnails (same components, no snapshotting).

import { SLIDE_W, SLIDE_H, resolveToken, type ThemeTokens } from "@/lib/course-gen/tokens"
import { effectsCss } from "@/lib/course-gen/effects"
import { iconSvg } from "@/lib/course-gen/icons"
import { chartSvg } from "@/lib/course-gen/charts"
import type { CanvasElement } from "@/lib/course-gen/primitives"

export interface Master {
  background: { asset: string; tone: "dark" | "light"; css?: string }
  chrome: { role: string; x: number; y: number; width: number; height: number; tone: "dark" | "light"; mark?: string }[]
  zones: { name: string; x: number; y: number; width: number; height: number; token?: string }[]
}

interface Props {
  elements: CanvasElement[]
  master: Master
  tokens: ThemeTokens
  pageNumber?: number
  moduleNumber?: number
  partnerLogoLight?: string | null
  partnerLogoDark?: string | null
  /** Interactive mode: selection + click handlers (stage only). */
  selection?: string[]
  onSelect?: (ids: string[]) => void
  onTextCommit?: (elementId: string, text: string) => void
  interactive?: boolean
}

function cssStyle(s: string): React.CSSProperties {
  // Small CSS-string → React style bridge so the effects helper can stay
  // shared with the server renderer instead of being written twice.
  const out: Record<string, string> = {}
  for (const decl of s.split(";")) {
    const i = decl.indexOf(":")
    if (i < 0) continue
    const prop = decl.slice(0, i).trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    out[prop] = decl.slice(i + 1).trim()
  }
  return out as React.CSSProperties
}

function icsLogo(tone: string): string {
  return tone === "dark"
    ? "/course-gen/theme-1/logos/ics-full-white.png"
    : "/course-gen/theme-1/logos/ics-full-color.png"
}

export default function SlideCanvas(props: Props) {
  const { elements, master, tokens, interactive = false, selection = [] } = props

  const pctX = (v: number) => `${(v / 100) * SLIDE_W}px`
  const pctY = (v: number) => `${(v / 100) * SLIDE_H}px`

  return (
    <div
      id="slide-root"
      style={{ position: "relative", width: SLIDE_W, height: SLIDE_H, overflow: "hidden", background: "#fff" }}
      onMouseDown={e => { if (interactive && e.target === e.currentTarget) props.onSelect?.([]) }}
    >
      {/* Background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={master.background.asset} alt=""
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />

      {/* Theme chrome — always drawn from the theme, never stored on the page,
          and never selectable (locked furniture). */}
      {master.chrome.map((slot, i) => {
        const box: React.CSSProperties = {
          position: "absolute", left: pctX(slot.x), top: pctY(slot.y),
          width: pctX(slot.width), height: pctY(slot.height), pointerEvents: "none",
        }
        if (slot.role === "ics_logo")
          // eslint-disable-next-line @next/next/no-img-element
          return <img key={i} src={icsLogo(slot.tone)} alt="ICS Aviation"
            style={{ ...box, objectFit: "contain", objectPosition: "left center" }} />
        if (slot.role === "partner_logo") {
          const wantLight = slot.tone === "dark"
          const url = wantLight
            ? (props.partnerLogoLight ?? props.partnerLogoDark)
            : (props.partnerLogoDark ?? props.partnerLogoLight)
          if (!url) return null
          const recolor = wantLight && !props.partnerLogoLight
          // eslint-disable-next-line @next/next/no-img-element
          return <img key={i} src={url} alt=""
            style={{ ...box, objectFit: "contain", objectPosition: "left center", filter: recolor ? "brightness(0) invert(1)" : undefined }} />
        }
        if (slot.role === "footer_rule")
          return <div key={i} style={{ ...box, background: slot.tone === "dark" ? "rgba(255,255,255,.45)" : resolveToken("token:primary-dark", tokens, "#045089"), opacity: .6 }} />
        if (slot.role === "page_number")
          return <div key={i} style={{ ...box, display: "flex", alignItems: "center", justifyContent: "flex-end", fontSize: 14, color: slot.tone === "dark" ? "rgba(255,255,255,.8)" : resolveToken("token:primary-dark", tokens, "#045089") }}>{props.pageNumber ?? ""}</div>
        if (slot.role === "ghost_numeral")
          return <div key={i} style={{ ...box, display: "flex", alignItems: "center", fontSize: 140, fontWeight: 800, color: resolveToken("token:primary", tokens, "#0C72C6"), opacity: .28, lineHeight: 1 }}>
            {String(props.moduleNumber ?? "").padStart(2, "0")}
          </div>
        return null
      })}

      {/* Elements */}
      {[...elements].sort((a, b) => a.zIndex - b.zIndex).map(el => {
        const selected = selection.includes(el.id)
        const box: React.CSSProperties = {
          position: "absolute",
          left: pctX(el.x), top: pctY(el.y),
          width: pctX(el.width), height: pctY(el.height),
          zIndex: el.zIndex,
          transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
          outline: selected ? "2px solid #0C72C6" : undefined,
          outlineOffset: 1,
          cursor: interactive && !el.locked ? "move" : undefined,
        }
        const common = {
          "data-el-id": el.id,
          className: interactive ? "cg-el" : undefined,
          onMouseDown: interactive && !el.locked
            ? (e: React.MouseEvent) => { e.stopPropagation(); props.onSelect?.([el.id]) }
            : undefined,
        }

        switch (el.type) {
          case "text": {
            const s = el.style
            const html = el.runs.map(r => r.bold ? `<b>${escapeHtml(r.text)}</b>` : escapeHtml(r.text)).join("")
            // An unfilled placeholder reads as a prompt while editing, and is
            // simply skipped when rendering for real (export / QA / present).
            const isPrompt = !!el.placeholder && interactive
            if (el.placeholder && !interactive) return null
            return (
              <div key={el.id} {...common}
                style={{
                  ...box,
                  ...(isPrompt ? {
                    opacity: .45,
                    outline: selected ? undefined : "1.5px dashed rgba(12,114,198,.45)",
                    outlineOffset: 2,
                  } : {}),
                  fontSize: s.fontSize, fontWeight: s.fontWeight ?? 400,
                  color: resolveToken(s.color, tokens, "#333"),
                  textAlign: s.align ?? "left",
                  lineHeight: s.lineHeight ?? 1.45,
                  display: "block", overflow: "visible",
                  whiteSpace: s.noWrap ? "nowrap" : undefined,
                  ...cssStyle(effectsCss(el.effects, tokens, true)),
                }}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )
          }
          case "shape": {
            const s = el.style
            if (el.shape === "line") {
              const color = resolveToken(s.fill, tokens, "#0C72C6")
              const horizontal = el.width >= el.height
              const backgroundImage = s.dashed
                ? `repeating-linear-gradient(${horizontal ? "to right" : "to bottom"},${color} 0 6px,transparent 6px 12px)`
                : undefined
              return <div key={el.id} {...common} style={{ ...box, background: s.dashed ? undefined : color, backgroundImage, ...cssStyle(effectsCss(el.effects, tokens)) }} />
            }
            return <div key={el.id} {...common}
              style={{
                ...box,
                background: resolveToken(s.fill, tokens, "transparent"),
                border: s.stroke ? `${s.strokeWidth ?? 1}px solid ${resolveToken(s.stroke, tokens, "#DDE3EA")}` : undefined,
                borderRadius: s.radius ?? 8,
                opacity: s.opacity ?? 1,
                boxShadow: s.shadow ? "0 8px 24px rgba(0,0,0,.12)" : undefined,
                ...cssStyle(effectsCss(el.effects, tokens)),
              }} />
          }
          case "icon": {
            // Same glyph the export renders, so the canvas is not a
            // prettier-or-uglier approximation of the finished slide.
            const iconColor = resolveToken(el.color, tokens, "#0C72C6")
            const glyph = iconSvg(el.name, { size: "100%", color: iconColor })
            return glyph
              ? <div key={el.id} {...common}
                  style={{ ...box, ...cssStyle(effectsCss(el.effects, tokens)) }}
                  dangerouslySetInnerHTML={{ __html: glyph }} />
              : <div key={el.id} {...common}
                  style={{ ...box, background: iconColor, borderRadius: 4, opacity: .9, ...cssStyle(effectsCss(el.effects, tokens)) }} />
          }
          case "image":
            return el.url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img key={el.id} {...common} src={el.url} alt=""
                  style={{ ...box, objectFit: el.fit ?? "cover", borderRadius: 6, ...cssStyle(effectsCss(el.effects, tokens)) }} />
              : <div key={el.id} {...common}
                  style={{ ...box, background: "linear-gradient(135deg,#eef2f7,#e2e9f2)", border: "1px dashed #cbd5e1", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 12 }}>
                  image
                </div>
          case "table": {
            const border = resolveToken(el.tableStyle.borders, tokens, "#DDE3EA")
            const alt = resolveToken(el.tableStyle.altRowFill, tokens, "#F1F3F6")
            const head = resolveToken("token:primary", tokens, "#0C72C6")
            return (
              <table key={el.id} {...common} style={{ ...box, borderCollapse: "collapse", fontSize: 14, color: "#333", ...cssStyle(effectsCss(el.effects, tokens)) }}>
                <tbody>
                  {el.rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.cells.map((c, ci) => (
                        <td key={ci} colSpan={c.colSpan} rowSpan={c.rowSpan}
                          style={{
                            border: `1px solid ${border}`, padding: "8px 10px", textAlign: "left",
                            background: el.tableStyle.headerRow && ri === 0 ? head : ri % 2 ? alt : undefined,
                            color: el.tableStyle.headerRow && ri === 0 ? "#fff" : undefined,
                            fontWeight: el.tableStyle.headerRow && ri === 0 ? 700 : undefined,
                          }}>{c.text}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
          case "chart":
            // Same SVG the export renders — the canvas is the finished slide,
            // not an approximation of it.
            return <div key={el.id} {...common}
              style={{ ...box, ...cssStyle(effectsCss(el.effects, tokens)) }}
              dangerouslySetInnerHTML={{ __html: chartSvg({ chartType: el.chartType, data: el.data, tokens }) }} />
          default:
            return null
        }
      })}
    </div>
  )
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
