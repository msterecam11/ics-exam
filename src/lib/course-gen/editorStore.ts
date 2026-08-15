"use client"

// Canvas editor state. Every mutation — manual drag, properties change, or
// an AI chat edit — goes through applyOps(). That single funnel is what
// makes undo/redo, autosave, and agent edits share one code path instead of
// three divergent ones.

import { create } from "zustand"
import type { CanvasElement } from "./primitives"

export interface EditorPage {
  id: string
  order_index: number
  layout_kind: string
  background: Record<string, unknown>
  elements: CanvasElement[]
  source_content?: any
  manually_diverged?: boolean
  /** Shipped with an unresolved geometric/QA defect — see orchestrator.ts. */
  needs_review?: boolean
  notes?: string | null
  updated_at: string
}

// ─── Operations ──────────────────────────────────────────────────────────────
// Deliberately small and closed: the AI chat agent emits these same ops, so
// anything it can do the editor can undo, and vice versa.
export type EditorOp =
  | { op: "update_element"; pageId: string; elementId: string; patch: Partial<CanvasElement> }
  | { op: "add_element"; pageId: string; element: CanvasElement }
  | { op: "delete_element"; pageId: string; elementId: string }
  | { op: "reorder_element"; pageId: string; elementId: string; zIndex: number }
  | { op: "set_page"; pageId: string; patch: Partial<EditorPage> }

interface HistoryEntry { label: string; ops: EditorOp[]; inverse: EditorOp[] }

interface EditorState {
  pages: EditorPage[]
  activePageId: string | null
  selection: string[]
  dirty: Set<string>
  saving: boolean
  conflict: boolean
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]

  init: (pages: EditorPage[]) => void
  setActivePage: (id: string) => void
  select: (ids: string[]) => void

  applyOps: (ops: EditorOp[], label: string, opts?: { history?: boolean }) => void
  undo: () => void
  redo: () => void

  markSaved: (pageId: string, updatedAt: string) => void
  setSaving: (v: boolean) => void
  setConflict: (v: boolean) => void
  addPage: (page: EditorPage, at?: number) => void
  removePage: (pageId: string) => void
  reorderPages: (ids: string[]) => void
}

const MAX_HISTORY = 200

function applyOne(pages: EditorPage[], op: EditorOp): EditorPage[] {
  return pages.map(p => {
    if (p.id !== op.pageId) return p
    switch (op.op) {
      case "update_element":
        return { ...p, elements: p.elements.map(e => e.id === op.elementId ? { ...e, ...op.patch } as CanvasElement : e) }
      case "add_element":
        return { ...p, elements: [...p.elements, op.element] }
      case "delete_element":
        return { ...p, elements: p.elements.filter(e => e.id !== op.elementId) }
      case "reorder_element":
        return { ...p, elements: p.elements.map(e => e.id === op.elementId ? { ...e, zIndex: op.zIndex } : e) }
      case "set_page":
        return { ...p, ...op.patch }
    }
  })
}

/** Inverse of an op, computed against the state BEFORE it is applied. */
function invert(pages: EditorPage[], op: EditorOp): EditorOp | null {
  const page = pages.find(p => p.id === op.pageId)
  if (!page) return null
  switch (op.op) {
    case "update_element": {
      const el = page.elements.find(e => e.id === op.elementId)
      if (!el) return null
      const before: Partial<CanvasElement> = {}
      for (const k of Object.keys(op.patch)) (before as any)[k] = (el as any)[k]
      return { op: "update_element", pageId: op.pageId, elementId: op.elementId, patch: before }
    }
    case "add_element":
      return { op: "delete_element", pageId: op.pageId, elementId: op.element.id }
    case "delete_element": {
      const el = page.elements.find(e => e.id === op.elementId)
      return el ? { op: "add_element", pageId: op.pageId, element: el } : null
    }
    case "reorder_element": {
      const el = page.elements.find(e => e.id === op.elementId)
      return el ? { op: "reorder_element", pageId: op.pageId, elementId: op.elementId, zIndex: el.zIndex } : null
    }
    case "set_page": {
      const before: Partial<EditorPage> = {}
      for (const k of Object.keys(op.patch)) (before as any)[k] = (page as any)[k]
      return { op: "set_page", pageId: op.pageId, patch: before }
    }
  }
}

export const useEditor = create<EditorState>((set, get) => ({
  pages: [],
  activePageId: null,
  selection: [],
  dirty: new Set(),
  saving: false,
  conflict: false,
  undoStack: [],
  redoStack: [],

  init: (pages) => set({
    pages,
    activePageId: pages[0]?.id ?? null,
    selection: [],
    dirty: new Set(),
    undoStack: [],
    redoStack: [],
  }),

  setActivePage: (id) => set({ activePageId: id, selection: [] }),
  select: (ids) => set({ selection: ids }),

  applyOps: (ops, label, opts) => {
    if (ops.length === 0) return
    const { pages, undoStack, dirty } = get()

    // Inverses must be computed against the pre-change state, in reverse
    // order, so undoing a compound edit unwinds it exactly.
    const inverse: EditorOp[] = []
    let next = pages
    for (const op of ops) {
      const inv = invert(next, op)
      if (inv) inverse.unshift(inv)
      next = applyOne(next, op)
    }

    const nextDirty = new Set(dirty)
    for (const op of ops) nextDirty.add(op.pageId)

    set({
      pages: next,
      dirty: nextDirty,
      undoStack: opts?.history === false
        ? undoStack
        : [...undoStack, { label, ops, inverse }].slice(-MAX_HISTORY),
      redoStack: opts?.history === false ? get().redoStack : [],
    })
  },

  undo: () => {
    const { undoStack, redoStack, pages, dirty } = get()
    const entry = undoStack[undoStack.length - 1]
    if (!entry) return
    let next = pages
    for (const op of entry.inverse) next = applyOne(next, op)
    const nextDirty = new Set(dirty)
    for (const op of entry.inverse) nextDirty.add(op.pageId)
    set({
      pages: next,
      dirty: nextDirty,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, entry],
    })
  },

  redo: () => {
    const { undoStack, redoStack, pages, dirty } = get()
    const entry = redoStack[redoStack.length - 1]
    if (!entry) return
    let next = pages
    for (const op of entry.ops) next = applyOne(next, op)
    const nextDirty = new Set(dirty)
    for (const op of entry.ops) nextDirty.add(op.pageId)
    set({
      pages: next,
      dirty: nextDirty,
      undoStack: [...undoStack, entry],
      redoStack: redoStack.slice(0, -1),
    })
  },

  markSaved: (pageId, updatedAt) => {
    const dirty = new Set(get().dirty)
    dirty.delete(pageId)
    set({
      dirty,
      pages: get().pages.map(p => p.id === pageId ? { ...p, updated_at: updatedAt } : p),
    })
  },

  setSaving: (v) => set({ saving: v }),
  setConflict: (v) => set({ conflict: v }),

  addPage: (page, at) => {
    const pages = [...get().pages]
    pages.splice(at ?? pages.length, 0, page)
    set({ pages: pages.map((p, i) => ({ ...p, order_index: i })), activePageId: page.id, selection: [] })
  },

  removePage: (pageId) => {
    const pages = get().pages.filter(p => p.id !== pageId).map((p, i) => ({ ...p, order_index: i }))
    set({
      pages,
      activePageId: get().activePageId === pageId ? (pages[0]?.id ?? null) : get().activePageId,
      selection: [],
    })
  },

  reorderPages: (ids) => {
    const byId = new Map(get().pages.map(p => [p.id, p]))
    const pages = ids.map((id, i) => ({ ...byId.get(id)!, order_index: i })).filter(Boolean)
    set({ pages })
  },
}))

/** Convenience selector — the page currently open on the stage. */
export function useActivePage(): EditorPage | null {
  return useEditor(s => s.pages.find(p => p.id === s.activePageId) ?? null)
}
