"use client"

// Right-hand inspector. Every change goes through applyOps() so it lands in
// the same undo history as drag/resize and AI chat edits.

import { useEditor, useActivePage } from "@/lib/course-gen/editorStore"
import type { CanvasElement, ElementEffects } from "@/lib/course-gen/primitives"
import type { ThemeTokens } from "@/lib/course-gen/tokens"
import { MousePointer2, Lock, Unlock, Trash2, CopyPlus, ArrowUp, ArrowDown } from "lucide-react"

const COLOR_TOKENS = [
  "primary", "primary-dark", "primary-light", "navy",
  "accent-warm", "danger", "success", "tab-yellow",
  "text", "text-inverse", "surface", "surface-alt", "surface-cream",
]

const label = "block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1"
const input = "w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0C72C6]/30"
const section = "border-t border-slate-100 pt-3 mt-3 space-y-2.5"

export default function PropertiesPanel({ tokens }: { tokens: ThemeTokens }) {
  const page = useActivePage()
  const selection = useEditor(s => s.selection)
  const applyOps = useEditor(s => s.applyOps)

  const el = page?.elements.find(e => e.id === selection[0]) ?? null

  if (!page || !el) {
    return (
      <div className="w-72 shrink-0 border-l border-slate-200 bg-white p-5 overflow-y-auto">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6">Properties</p>
        <div className="flex flex-col items-center text-center gap-2 mt-10 text-slate-300">
          <MousePointer2 className="h-7 w-7" />
          <p className="text-sm font-medium text-slate-500">Select an element</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Click anything on the slide to edit its position, size, text, colour, and effects.
          </p>
        </div>
      </div>
    )
  }

  function patch(p: Partial<CanvasElement>, label = "Change property") {
    applyOps([{ op: "update_element", pageId: page!.id, elementId: el!.id, patch: p }], label)
  }
  function patchEffects(p: Partial<ElementEffects>) {
    patch({ effects: { ...(el!.effects ?? {}), ...p } } as Partial<CanvasElement>, "Change effect")
  }

  const eff = el.effects ?? {}
  const maxZ = Math.max(...page.elements.map(e => e.zIndex))

  return (
    <div className="w-72 shrink-0 border-l border-slate-200 bg-white p-5 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Properties</p>
        <span className="text-[10px] font-bold text-[#0C72C6] bg-[#0C72C6]/10 px-2 py-0.5 rounded capitalize">{el.type}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 mb-3">
        <button title={el.locked ? "Unlock" : "Lock"} onClick={() => patch({ locked: !el.locked }, el.locked ? "Unlock" : "Lock")}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-500">
          {el.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </button>
        <button title="Bring forward" onClick={() => patch({ zIndex: Math.min(maxZ + 1, el.zIndex + 1) }, "Bring forward")}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><ArrowUp className="h-3.5 w-3.5" /></button>
        <button title="Send backward" onClick={() => patch({ zIndex: Math.max(1, el.zIndex - 1) }, "Send backward")}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><ArrowDown className="h-3.5 w-3.5" /></button>
        <button title="Duplicate"
          onClick={() => applyOps([{
            op: "add_element", pageId: page.id,
            element: { ...el, id: `el-${Date.now()}`, x: el.x + 2, y: el.y + 2, zIndex: maxZ + 1 } as CanvasElement,
          }], "Duplicate element")}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><CopyPlus className="h-3.5 w-3.5" /></button>
        <button title="Delete"
          onClick={() => applyOps([{ op: "delete_element", pageId: page.id, elementId: el.id }], "Delete element")}
          className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 ml-auto"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>

      {/* Geometry */}
      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "width", "height"] as const).map(k => (
          <div key={k}>
            <label className={label}>{k}</label>
            <input type="number" step={0.1} className={input} value={Number(el[k]).toFixed(1)}
              onChange={e => patch({ [k]: parseFloat(e.target.value) || 0 } as any, "Move/resize")} />
          </div>
        ))}
        <div>
          <label className={label}>Rotation</label>
          <input type="number" step={1} className={input} value={el.rotation ?? 0}
            onChange={e => patch({ rotation: parseFloat(e.target.value) || 0 }, "Rotate")} />
        </div>
      </div>

      {/* Text */}
      {el.type === "text" && (
        <div className={section}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Text</p>
          <textarea className={`${input} min-h-20 resize-y`}
            value={el.placeholder ? "" : el.runs.map(r => r.text).join("")}
            placeholder={el.placeholder ? el.runs.map(r => r.text).join("") : undefined}
            onChange={e => patch({ runs: [{ text: e.target.value }], placeholder: false } as any, "Edit text")} />
          {el.placeholder && (
            <p className="s-meta" style={{ fontSize: 11 }}>
              This is a master placeholder — typing here turns it into real content.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Size</label>
              <input type="number" className={input} value={el.style.fontSize}
                onChange={e => patch({ style: { ...el.style, fontSize: parseInt(e.target.value) || 16 } } as any, "Font size")} />
            </div>
            <div>
              <label className={label}>Weight</label>
              <select className={input} value={el.style.fontWeight ?? 400}
                onChange={e => patch({ style: { ...el.style, fontWeight: parseInt(e.target.value) } } as any, "Font weight")}>
                {[300, 400, 700, 800].map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={label}>Align</label>
            <div className="flex gap-1">
              {(["left", "center", "right"] as const).map(a => (
                <button key={a} onClick={() => patch({ style: { ...el.style, align: a } } as any, "Align text")}
                  className={`flex-1 text-xs py-1 rounded border ${el.style.align === a ? "bg-[#0C72C6] text-white border-[#0C72C6]" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{a}</button>
              ))}
            </div>
          </div>
          <ColorField label="Colour" value={el.style.color} tokens={tokens}
            onChange={v => patch({ style: { ...el.style, color: v } } as any, "Text colour")} />
        </div>
      )}

      {/* Shape */}
      {el.type === "shape" && (
        <div className={section}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Shape</p>
          <ColorField label="Fill" value={el.style.fill} tokens={tokens}
            onChange={v => patch({ style: { ...el.style, fill: v } } as any, "Fill colour")} />
          <div>
            <label className={label}>Corner radius</label>
            <input type="range" min={0} max={60} className="w-full accent-[#0C72C6]" value={el.style.radius ?? 8}
              onChange={e => patch({ style: { ...el.style, radius: parseInt(e.target.value) } } as any, "Corner radius")} />
          </div>
        </div>
      )}

      {/* Chart — the data IS the chart, so this edits numbers, not pixels.
          Every change goes through patch() like any other property, so it
          lands on the same undo stack and autosave as a text edit. */}
      {el.type === "chart" && (
        <ChartEditor
          el={el}
          onChange={(next, label) => patch(next as Partial<CanvasElement>, label)}
        />
      )}

      {/* Image */}
      {el.type === "image" && (
        <div className={section}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Image</p>
          <div>
            <label className={label}>URL</label>
            <input className={input} value={el.url} placeholder="https://…"
              onChange={e => patch({ url: e.target.value } as any, "Replace image")} />
          </div>
          <div>
            <label className={label}>Fit</label>
            <div className="flex gap-1">
              {(["cover", "contain"] as const).map(f => (
                <button key={f} onClick={() => patch({ fit: f } as any, "Image fit")}
                  className={`flex-1 text-xs py-1 rounded border ${el.fit === f ? "bg-[#0C72C6] text-white border-[#0C72C6]" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{f}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={label}>Crop shape</label>
            <select className={input} value={eff.mask ?? "none"}
              onChange={e => patchEffects({ mask: e.target.value as any })}>
              {["none", "rounded", "circle", "squircle"].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" className="accent-[#0C72C6]" checked={!!eff.grayscale}
              onChange={e => patchEffects({ grayscale: e.target.checked })} />
            Grayscale
          </label>
          <div>
            <label className={label}>Brightness</label>
            <input type="range" min={0.3} max={1.7} step={0.05} className="w-full accent-[#0C72C6]"
              value={eff.brightness ?? 1} onChange={e => patchEffects({ brightness: parseFloat(e.target.value) })} />
          </div>
        </div>
      )}

      {/* Effects — shared across every element type */}
      <div className={section}>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Effects</p>

        <div>
          <label className={label}>Shadow</label>
          <select className={input} value={eff.shadow ?? "none"}
            onChange={e => patchEffects({ shadow: e.target.value as any })}>
            {["none", "sm", "md", "lg", "glow"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {el.type === "text" && (
          <>
            <div>
              <label className={label}>Text shadow</label>
              <select className={input} value={eff.textShadow ?? "none"}
                onChange={e => patchEffects({ textShadow: e.target.value as any })}>
                {["none", "soft", "strong"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Outline width</label>
              <input type="range" min={0} max={4} step={0.5} className="w-full accent-[#0C72C6]"
                value={eff.textStroke?.width ?? 0}
                onChange={e => patchEffects({ textStroke: { width: parseFloat(e.target.value), color: eff.textStroke?.color ?? "token:navy" } })} />
            </div>
          </>
        )}

        <div>
          <label className={label}>Opacity</label>
          <input type="range" min={0.1} max={1} step={0.05} className="w-full accent-[#0C72C6]"
            value={eff.opacity ?? 1} onChange={e => patchEffects({ opacity: parseFloat(e.target.value) })} />
        </div>

        {el.type !== "text" && (
          <div>
            <label className={label}>Backdrop blur</label>
            <input type="range" min={0} max={24} step={1} className="w-full accent-[#0C72C6]"
              value={eff.blur ?? 0} onChange={e => patchEffects({ blur: parseInt(e.target.value) })} />
          </div>
        )}

        <div>
          <label className={label}>Gradient fill</label>
          {eff.gradient ? (
            <div className="space-y-1.5">
              <ColorField label="From" value={eff.gradient.from} tokens={tokens}
                onChange={v => patchEffects({ gradient: { ...eff.gradient!, from: v } })} />
              <ColorField label="To" value={eff.gradient.to} tokens={tokens}
                onChange={v => patchEffects({ gradient: { ...eff.gradient!, to: v } })} />
              <button className="text-[11px] text-red-500 hover:text-red-700"
                onClick={() => patchEffects({ gradient: undefined })}>Remove gradient</button>
            </div>
          ) : (
            <button className="text-[11px] font-semibold text-[#0C72C6] hover:text-[#0a63ab]"
              onClick={() => patchEffects({ gradient: { from: "token:primary", to: "token:primary-dark", angle: 135 } })}>
              + Add gradient
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ColorField({ label: text, value, tokens, onChange }: {
  label: string; value?: string; tokens: ThemeTokens; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className={label}>{text}</label>
      <div className="flex flex-wrap gap-1">
        {COLOR_TOKENS.map(t => {
          const ref = `token:${t}`
          const active = value === ref
          return (
            <button key={t} title={t} onClick={() => onChange(ref)}
              className={`w-5 h-5 rounded border transition-transform ${active ? "ring-2 ring-[#0C72C6] scale-110 border-white" : "border-slate-200 hover:scale-110"}`}
              style={{ background: tokens.colors[t] ?? "#ccc" }} />
          )
        })}
      </div>
    </div>
  )
}

/**
 * Chart data editor.
 *
 * A generated chart is only as useful as it is correctable — an admin who
 * spots a wrong figure needs to fix the number, not redraw a picture. Because
 * charts render from data rather than from a raster, editing a cell here
 * redraws the chart on the canvas immediately, at full fidelity, and the same
 * edit flows straight through to the PDF export.
 */
function ChartEditor({ el, onChange }: {
  el: Extract<CanvasElement, { type: "chart" }>
  onChange: (patch: Record<string, unknown>, label: string) => void
}) {
  const data = el.data ?? { labels: [], datasets: [] }
  const labels = data.labels ?? []
  const datasets = data.datasets?.length ? data.datasets : [{ label: "Series 1", data: [] }]

  function write(labels: string[], datasets: { label: string; data: number[] }[], why: string) {
    onChange({ data: { labels, datasets } }, why)
  }

  function setLabel(i: number, v: string) {
    const next = [...labels]; next[i] = v
    write(next, datasets, "Edit chart label")
  }

  function setValue(di: number, i: number, v: string) {
    const n = parseFloat(v)
    const nextSets = datasets.map((ds, j) => {
      if (j !== di) return ds
      const d = [...(ds.data ?? [])]
      d[i] = Number.isFinite(n) ? n : 0
      return { ...ds, data: d }
    })
    write(labels, nextSets, "Edit chart value")
  }

  function setSeriesName(di: number, v: string) {
    write(labels, datasets.map((ds, j) => (j === di ? { ...ds, label: v } : ds)), "Rename series")
  }

  function addRow() {
    write(
      [...labels, `Item ${labels.length + 1}`],
      datasets.map(ds => ({ ...ds, data: [...(ds.data ?? []), 0] })),
      "Add chart row"
    )
  }

  function removeRow(i: number) {
    write(
      labels.filter((_, j) => j !== i),
      datasets.map(ds => ({ ...ds, data: (ds.data ?? []).filter((_, j) => j !== i) })),
      "Remove chart row"
    )
  }

  function addSeries() {
    write(labels, [...datasets, { label: `Series ${datasets.length + 1}`, data: labels.map(() => 0) }], "Add series")
  }

  function removeSeries(di: number) {
    write(labels, datasets.filter((_, j) => j !== di), "Remove series")
  }

  // Mirrors the renderer's own rules so the warning matches what will be drawn.
  const willConvert = el.chartType === "donut" && labels.length > 7
  const willGoHorizontal = el.chartType === "bar" && labels.length > 8

  return (
    <div className={section}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Chart</p>

      <div>
        <label className={label}>Type</label>
        <div className="flex gap-1">
          {(["bar", "line", "donut"] as const).map(t => (
            <button key={t} onClick={() => onChange({ chartType: t }, "Change chart type")}
              className={`flex-1 text-xs py-1 rounded border capitalize ${el.chartType === t ? "bg-[#0C72C6] text-white border-[#0C72C6]" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{t}</button>
          ))}
        </div>
      </div>

      {(willConvert || willGoHorizontal) && (
        <p className="text-[10px] leading-relaxed text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
          {willConvert
            ? `${labels.length} categories is too many for a donut — it will be drawn as a bar chart so the values stay readable.`
            : `${labels.length} categories — bars will be drawn horizontally so the labels stay legible.`}
        </p>
      )}

      {/* Series names, only when there is more than one to distinguish */}
      {datasets.length > 1 && (
        <div className="space-y-1">
          <label className={label}>Series</label>
          {datasets.map((ds, di) => (
            <div key={di} className="flex items-center gap-1">
              <input className={input} value={ds.label ?? ""} placeholder={`Series ${di + 1}`}
                onChange={e => setSeriesName(di, e.target.value)} />
              <button onClick={() => removeSeries(di)} title="Remove series"
                className="shrink-0 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <label className={label}>Data</label>
        <div className="space-y-1 max-h-64 overflow-y-auto pr-0.5">
          {labels.map((lb, i) => (
            <div key={i} className="flex items-center gap-1">
              <input className={`${input} flex-1`} value={lb} placeholder="Label"
                onChange={e => setLabel(i, e.target.value)} />
              {datasets.map((ds, di) => (
                <input key={di} type="number" className={`${input} w-16 shrink-0`}
                  value={ds.data?.[i] ?? 0}
                  onChange={e => setValue(di, i, e.target.value)} />
              ))}
              <button onClick={() => removeRow(i)} title="Remove row"
                className="shrink-0 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {labels.length === 0 && (
            <p className="text-[11px] text-slate-400 italic py-1">No data yet — add a row to start.</p>
          )}
        </div>
      </div>

      <div className="flex gap-1">
        <button onClick={addRow}
          className="flex-1 text-xs py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
          + Row
        </button>
        {el.chartType !== "donut" && (
          <button onClick={addSeries}
            className="flex-1 text-xs py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
            + Series
          </button>
        )}
      </div>

      {el.chartType === "donut" && datasets.length > 1 && (
        <p className="text-[10px] text-slate-400 leading-relaxed">
          A donut shows one series — only the first is drawn.
        </p>
      )}
    </div>
  )
}
