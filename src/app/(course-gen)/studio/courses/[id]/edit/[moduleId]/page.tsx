"use client"

// Canvas editor — one module at a time (30 slides is comfortable; only the
// active slide is mounted interactively, thumbnails are the same components
// scaled down so they can never drift out of sync with the real slide).

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import Moveable from "react-moveable"
import { toast } from "sonner"
import {
  ArrowLeft, Loader2, Undo2, Redo2, Plus, Play, Type, Square, ImageIcon,
  Table2, BarChart3, Save, X, Trash2, Sparkles, SlidersHorizontal,
} from "lucide-react"
import SlideCanvas, { type Master } from "@/components/course-gen/SlideCanvas"
import PropertiesPanel from "@/components/course-gen/PropertiesPanel"
import ChatPanel, { type Proposal } from "@/components/course-gen/ChatPanel"
import { useEditor, useActivePage, type EditorPage } from "@/lib/course-gen/editorStore"
import { SLIDE_W, SLIDE_H, type ThemeTokens } from "@/lib/course-gen/tokens"
import type { CanvasElement } from "@/lib/course-gen/primitives"

const MASTER_LABELS: Record<string, string> = {
  cover: "Cover",
  section_divider: "Section divider",
  content_white: "Content (white)",
  content_lightblue: "Content (light blue)",
  summary_dark: "Summary (dark)",
  self_assessment: "Self-assessment",
  closing_cta: "Closing / CTA",
}

export default function ModuleEditorPage() {
  const { id: courseId, moduleId } = useParams<{ id: string; moduleId: string }>()
  const router = useRouter()

  const [meta, setMeta] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(0.62)
  const [present, setPresent] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [rightPanel, setRightPanel] = useState<"properties" | "chat">("properties")
  const [preview, setPreview] = useState<Proposal | null>(null)

  const store = useEditor()
  const page = useActivePage()
  const stageRef = useRef<HTMLDivElement>(null)
  const targetRef = useRef<HTMLElement | null>(null)
  const [moveableTarget, setMoveableTarget] = useState<HTMLElement | null>(null)

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/course-gen/modules/${moduleId}`)
      .then(r => r.json())
      .then(d => {
        setMeta(d)
        store.init((d.pages ?? []) as EditorPage[])
        setLoading(false)
      })
      .catch(() => { toast.error("Could not load module"); setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId])

  const tokens: ThemeTokens | null = meta?.theme?.tokens ?? null
  const masters: Record<string, Master> = meta?.theme?.layout_templates ?? {}
  const master: Master | null = page ? (masters[page.layout_kind] ?? masters.content_white) : null

  // ── Autosave (debounced, per dirty page) ─────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (store.dirty.size === 0) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const ids = [...store.dirty]
      store.setSaving(true)
      for (const pageId of ids) {
        const p = useEditor.getState().pages.find(x => x.id === pageId)
        if (!p) continue
        const res = await fetch(`/api/course-gen/pages/${pageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            elements: p.elements,
            background: p.background,
            layout_kind: p.layout_kind,
            base_updated_at: p.updated_at,
            mark_diverged: true,
          }),
        })
        if (res.status === 409) { store.setConflict(true); break }
        if (res.ok) {
          const { updated_at } = await res.json()
          useEditor.getState().markSaved(pageId, updated_at)
        }
      }
      store.setSaving(false)
    }, 1200)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.dirty])

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); store.undo() }
      else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); store.redo() }
      else if (e.key === "Escape") { setPresent(false); store.select([]) }
      else if ((e.key === "Delete" || e.key === "Backspace") && store.selection.length && page) {
        e.preventDefault()
        store.applyOps(store.selection.map(elId => ({ op: "delete_element" as const, pageId: page.id, elementId: elId })), "Delete element(s)")
      } else if (page && store.selection.length && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault()
        const step = e.shiftKey ? 1 : 0.2
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0
        store.applyOps(store.selection.map(elId => {
          const el = page.elements.find(x => x.id === elId)!
          return { op: "update_element" as const, pageId: page.id, elementId: elId, patch: { x: el.x + dx, y: el.y + dy } }
        }), "Nudge")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.selection, page])

  // Keep the moveable box attached to the selected element's DOM node.
  useEffect(() => {
    if (!store.selection.length) { setMoveableTarget(null); return }
    const node = stageRef.current?.querySelector<HTMLElement>(`[data-el-id="${store.selection[0]}"]`)
    targetRef.current = node ?? null
    setMoveableTarget(node ?? null)
  }, [store.selection, page?.id, page?.elements])

  // When the agent proposes a rewrite of the OPEN slide, show its compiled
  // result on the stage so the user judges the real thing, not a description.
  const previewElements: CanvasElement[] | null = useMemo(() => {
    if (!preview || !page) return null
    const els = preview.compiled?.[String(page.order_index)]
    return els ?? null
  }, [preview, page])

  const selectedEl: CanvasElement | null = useMemo(
    () => page?.elements.find(e => e.id === store.selection[0]) ?? null,
    [page, store.selection]
  )

  // After the agent commits changes, pull the module fresh — the ops ran
  // server-side (including compiles), so the DB is the source of truth.
  const reload = useCallback(async () => {
    const d = await fetch(`/api/course-gen/modules/${moduleId}`).then(r => r.json())
    setMeta(d)
    const keep = useEditor.getState().activePageId
    store.init((d.pages ?? []) as EditorPage[])
    if (keep && (d.pages ?? []).some((p: any) => p.id === keep)) store.setActivePage(keep)
    setPreview(null)
  }, [moduleId])

  // ── Element helpers ──────────────────────────────────────────────────────
  function addElement(type: CanvasElement["type"]) {
    if (!page) return
    const maxZ = Math.max(0, ...page.elements.map(e => e.zIndex))
    const base = { id: `el-${Date.now()}`, x: 30, y: 40, width: 30, height: 12, zIndex: maxZ + 1 }
    let el: CanvasElement
    switch (type) {
      case "text": el = { ...base, type: "text", runs: [{ text: "New text" }], style: { fontSize: 20, color: "token:text", align: "left", lineHeight: 1.45 } } as CanvasElement; break
      case "shape": el = { ...base, type: "shape", shape: "rect", style: { fill: "token:primary", radius: 12 } } as CanvasElement; break
      case "image": el = { ...base, type: "image", url: "", fit: "cover", height: 25 } as CanvasElement; break
      case "table": el = { ...base, type: "table", width: 50, height: 20, rows: [{ cells: [{ text: "Header" }, { text: "Header" }] }, { cells: [{ text: "Cell" }, { text: "Cell" }] }], colWidths: [50, 50], tableStyle: { headerRow: true, altRowFill: "token:surface-alt", borders: "token:border-subtle" } } as CanvasElement; break
      default: el = { ...base, type: "chart", width: 40, height: 25, chartType: "bar", data: { labels: ["A", "B"], datasets: [{ label: "Series", data: [3, 5] }] } } as CanvasElement
    }
    store.applyOps([{ op: "add_element", pageId: page.id, element: el }], `Add ${type}`)
    store.select([el.id])
  }

  async function addSlide(layoutKind: string) {
    setShowAdd(false)
    const res = await fetch(`/api/course-gen/modules/${moduleId}/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout_kind: layoutKind, after_index: page?.order_index ?? null }),
    })
    if (!res.ok) { toast.error("Could not add slide"); return }
    const { page: created } = await res.json()
    store.addPage(created as EditorPage, (page?.order_index ?? -1) + 1)
    toast.success("Slide added")
  }

  async function deleteSlide(pageId: string) {
    if (!confirm("Delete this slide?")) return
    const res = await fetch(`/api/course-gen/pages/${pageId}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Could not delete slide"); return }
    store.removePage(pageId)
  }

  if (loading || !tokens) {
    return <div className="flex items-center justify-center h-[70vh]"><Loader2 className="h-6 w-6 animate-spin text-[#0C72C6]" /></div>
  }
  if (!page || !master) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-3 text-center">
        <p className="text-sm text-slate-500">This module has no slides yet.</p>
        <button onClick={() => addSlide("content_white")}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#0C72C6]">Add the first slide</button>
      </div>
    )
  }

  // ── Present mode ─────────────────────────────────────────────────────────
  if (present) {
    const idx = store.pages.findIndex(p => p.id === page.id)
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center"
        onClick={() => {
          const next = store.pages[idx + 1]
          if (next) store.setActivePage(next.id); else setPresent(false)
        }}>
        <button onClick={e => { e.stopPropagation(); setPresent(false) }}
          className="absolute top-4 right-4 text-white/60 hover:text-white z-10"><X className="h-6 w-6" /></button>
        <div style={{ transform: `scale(${Math.min(window.innerWidth / SLIDE_W, window.innerHeight / SLIDE_H) * 0.95})` }}>
          <SlideCanvas elements={page.elements} master={master} tokens={tokens}
            pageNumber={page.order_index + 1} moduleNumber={meta.module.order_index}
            partnerLogoLight={meta.course?.partner_logo_light_url} partnerLogoDark={meta.course?.partner_logo_dark_url} />
        </div>
        <p className="absolute bottom-4 text-white/40 text-xs">{idx + 1} / {store.pages.length} — click to advance, Esc to exit</p>
      </div>
    )
  }

  return (
    <div className="-m-6 flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Toolbar */}
      <div className="h-12 border-b border-slate-200 bg-white flex items-center gap-2 px-3 shrink-0">
        <Link href={`/studio/courses/${courseId}`} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded hover:bg-slate-100">
          <ArrowLeft className="h-3.5 w-3.5" /> Modules
        </Link>
        <div className="h-5 w-px bg-slate-200" />

        {[["text", Type], ["shape", Square], ["image", ImageIcon], ["table", Table2], ["chart", BarChart3]].map(([t, Icon]: any) => (
          <button key={t} onClick={() => addElement(t)} title={`Add ${t}`}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 px-2 py-1.5 rounded capitalize">
            <Icon className="h-3.5 w-3.5" /> {t}
          </button>
        ))}

        <div className="h-5 w-px bg-slate-200" />
        <button onClick={store.undo} disabled={!store.undoStack.length} title="Undo (Ctrl+Z)"
          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
        <button onClick={store.redo} disabled={!store.redoStack.length} title="Redo (Ctrl+Y)"
          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>

        <div className="flex-1" />

        <span className="text-xs text-slate-400 truncate max-w-56">{meta.module.title}</span>
        {store.saving
          ? <span className="flex items-center gap-1 text-[11px] text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>
          : store.dirty.size > 0
            ? <span className="flex items-center gap-1 text-[11px] text-amber-600"><Save className="h-3 w-3" /> Unsaved</span>
            : <span className="text-[11px] text-emerald-600">Saved</span>}

        <input type="range" min={0.3} max={1} step={0.02} value={zoom} onChange={e => setZoom(parseFloat(e.target.value))}
          className="w-24 accent-[#0C72C6]" title="Zoom" />
        <button onClick={() => setPresent(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 px-2 py-1.5 rounded">
          <Play className="h-3.5 w-3.5" /> Present
        </button>
        <div className="h-5 w-px bg-slate-200" />
        <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
          <button onClick={() => setRightPanel("properties")} title="Properties"
            className={`p-1.5 rounded-md transition-colors ${rightPanel === "properties" ? "bg-white shadow-sm text-[#0C72C6]" : "text-slate-500 hover:text-slate-700"}`}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setRightPanel("chat")} title="AI Assistant"
            className={`p-1.5 rounded-md transition-colors ${rightPanel === "chat" ? "bg-white shadow-sm text-[#0C72C6]" : "text-slate-500 hover:text-slate-700"}`}>
            <Sparkles className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {store.conflict && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3">
          <p className="text-xs text-amber-800 flex-1">This slide changed elsewhere. Reload to get the latest version — your unsaved changes here will be lost.</p>
          <button onClick={() => router.refresh()} className="text-xs font-semibold text-amber-900 underline">Reload</button>
          <button onClick={() => store.setConflict(false)} className="text-xs text-amber-700">Dismiss</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Slides sidebar */}
        <div className="w-56 shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto p-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Slides</p>
            <button onClick={() => setShowAdd(v => !v)} title="Add slide"
              className="p-1 rounded hover:bg-slate-200 text-slate-500"><Plus className="h-3.5 w-3.5" /></button>
          </div>

          {showAdd && (
            <div className="rounded-lg border border-slate-200 bg-white p-2 space-y-1 mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Choose a master</p>
              {Object.keys(masters).map(k => (
                <button key={k} onClick={() => addSlide(k)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-[#0C72C6]/10 hover:text-[#0C72C6] text-slate-600">
                  {MASTER_LABELS[k] ?? k}
                </button>
              ))}
            </div>
          )}

          {store.pages.map((p, i) => {
            const m = masters[p.layout_kind] ?? masters.content_white
            const active = p.id === page.id
            return (
              <div key={p.id} className="group relative">
                <button onClick={() => store.setActivePage(p.id)}
                  className={`block w-full rounded-lg overflow-hidden border-2 transition-colors ${active ? "border-[#0C72C6]" : "border-transparent hover:border-slate-300"}`}>
                  <div style={{ width: 192, height: 108, overflow: "hidden", position: "relative", background: "#fff" }}>
                    <div style={{ transform: "scale(0.15)", transformOrigin: "top left", pointerEvents: "none" }}>
                      <SlideCanvas elements={p.elements} master={m} tokens={tokens}
                        pageNumber={p.order_index + 1} moduleNumber={meta.module.order_index}
                        partnerLogoLight={meta.course?.partner_logo_light_url}
                        partnerLogoDark={meta.course?.partner_logo_dark_url} />
                    </div>
                  </div>
                </button>
                <span className="absolute top-1 left-1 text-[10px] font-bold text-white bg-black/45 px-1.5 rounded">{i + 1}</span>
                <button onClick={() => deleteSlide(p.id)} title="Delete slide"
                  className="absolute top-1 right-1 p-1 rounded bg-black/45 text-white/80 opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-opacity">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )
          })}
        </div>

        {/* Stage */}
        <div className="flex-1 min-w-0 overflow-auto bg-slate-300 flex items-start justify-center p-8">
          <div ref={stageRef}
            style={{ width: SLIDE_W * zoom, height: SLIDE_H * zoom, position: "relative", flexShrink: 0 }}>
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: SLIDE_W, height: SLIDE_H, boxShadow: "0 8px 32px rgba(0,0,0,.2)" }}>
              <SlideCanvas
                elements={previewElements ?? page.elements} master={master} tokens={tokens}
                pageNumber={page.order_index + 1} moduleNumber={meta.module.order_index}
                partnerLogoLight={meta.course?.partner_logo_light_url}
                partnerLogoDark={meta.course?.partner_logo_dark_url}
                interactive selection={store.selection} onSelect={ids => store.select(ids)}
              />
            </div>

            {moveableTarget && selectedEl && !selectedEl.locked && (
              <Moveable
                target={moveableTarget}
                draggable resizable rotatable
                throttleDrag={0} throttleResize={0} throttleRotate={0}
                keepRatio={false}
                origin={false}
                snappable
                // Drag/resize manipulate the DOM live, then the final geometry
                // is converted back to slide percentages and committed once on
                // release — one history entry per gesture, not per frame.
                onDrag={({ target, beforeTranslate }) => {
                  target.style.transform = `translate(${beforeTranslate[0]}px, ${beforeTranslate[1]}px)${selectedEl.rotation ? ` rotate(${selectedEl.rotation}deg)` : ""}`
                }}
                onDragEnd={({ lastEvent }) => {
                  if (!lastEvent || !page) return
                  const [dx, dy] = lastEvent.beforeTranslate
                  const el = page.elements.find(e => e.id === selectedEl.id)!
                  ;(moveableTarget as HTMLElement).style.transform = el.rotation ? `rotate(${el.rotation}deg)` : ""
                  store.applyOps([{
                    op: "update_element", pageId: page.id, elementId: el.id,
                    patch: { x: el.x + (dx / zoom / SLIDE_W) * 100, y: el.y + (dy / zoom / SLIDE_H) * 100 },
                  }], "Move element")
                }}
                onResize={({ target, width, height, drag }) => {
                  target.style.width = `${width}px`
                  target.style.height = `${height}px`
                  target.style.transform = `translate(${drag.beforeTranslate[0]}px, ${drag.beforeTranslate[1]}px)`
                }}
                onResizeEnd={({ lastEvent }) => {
                  if (!lastEvent || !page) return
                  const el = page.elements.find(e => e.id === selectedEl.id)!
                  const [dx, dy] = lastEvent.drag.beforeTranslate
                  store.applyOps([{
                    op: "update_element", pageId: page.id, elementId: el.id,
                    patch: {
                      width: (lastEvent.width / zoom / SLIDE_W) * 100,
                      height: (lastEvent.height / zoom / SLIDE_H) * 100,
                      x: el.x + (dx / zoom / SLIDE_W) * 100,
                      y: el.y + (dy / zoom / SLIDE_H) * 100,
                    },
                  }], "Resize element")
                }}
                onRotateEnd={({ lastEvent }) => {
                  if (!lastEvent || !page) return
                  store.applyOps([{
                    op: "update_element", pageId: page.id, elementId: selectedEl.id,
                    patch: { rotation: Math.round(lastEvent.rotation) },
                  }], "Rotate element")
                }}
              />
            )}
          </div>
        </div>

        {rightPanel === "properties"
          ? <PropertiesPanel tokens={tokens} />
          : <ChatPanel
              moduleId={moduleId}
              openPageIndex={page.order_index}
              onApplied={reload}
              onPreview={setPreview}
            />}
      </div>
    </div>
  )
}
