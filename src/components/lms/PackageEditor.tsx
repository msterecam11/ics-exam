"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  GripVertical, Plus, Trash2, Save, ChevronLeft, ChevronRight,
  FileText, FileVideo, HelpCircle, GraduationCap,
  Loader2, CheckCircle2, Image as ImageIcon, AlignLeft,
  Layers, Video, Link2, PlusCircle, X, Settings,
  SkipForward, Eye, EyeOff, Clock, Target, Shield,
  ChevronDown, ChevronUp, Square, CheckSquare, Play,
  Globe, Music, Database, Search, Check, Sparkles, Puzzle,
  BookOpen, ArrowUpDown, AlertTriangle, TextCursor, WholeWord,
  GitBranch, Layers3, Zap, ListOrdered,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import LibraryPicker, { LibraryFile } from "@/components/lms/LibraryPicker"
import { RichTextEditor } from "@/components/lms/RichTextEditor"

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────
export type ItemType =
  | "slide_pdf" | "slide_pptx" | "video" | "youtube" | "audio"
  | "quiz" | "exam" | "text" | "image" | "web_content" | "divider" | "activity"

export interface MCQOption  { id: string; text: string; is_correct: boolean }
export interface OrderItem  { id: string; text: string }
export interface MatchPair  { id: string; left: string; right: string }

export interface PackageQuestion {
  id: string
  type: "mcq_single" | "mcq_multiple" | "open_ended" | "ordering" | "match_pair"
  text: string; points: number
  options?:      MCQOption[]
  items?:        OrderItem[]
  pairs?:        MatchPair[]
  explanation?:  string
  model_answer?: string
}

export interface PackageItem {
  id: string
  type: ItemType
  title: string
  config: Record<string, any>
  required: boolean
  order_index: number
}

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────
const TYPE_META: Record<ItemType, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  slide_pdf:   { icon: FileText,      label: "PDF Slide",      color: "text-red-600",    bg: "bg-red-100"    },
  slide_pptx:  { icon: Layers,        label: "PPTX Slides",    color: "text-orange-600", bg: "bg-orange-100" },
  video:       { icon: FileVideo,     label: "Video",          color: "text-purple-600", bg: "bg-purple-100" },
  youtube:     { icon: Play,          label: "YouTube",        color: "text-red-500",    bg: "bg-red-50"     },
  audio:       { icon: Music,         label: "Audio",          color: "text-pink-600",   bg: "bg-pink-100"   },
  quiz:        { icon: HelpCircle,    label: "Quiz",           color: "text-amber-600",  bg: "bg-amber-100"  },
  exam:        { icon: GraduationCap, label: "Knowledge Test", color: "text-blue-600",   bg: "bg-blue-100"   },
  text:        { icon: AlignLeft,     label: "Text",           color: "text-slate-600",  bg: "bg-slate-100"  },
  image:       { icon: ImageIcon,     label: "Image",          color: "text-pink-600",   bg: "bg-pink-100"   },
  web_content: { icon: Globe,         label: "Web Content",    color: "text-cyan-600",   bg: "bg-cyan-100"   },
  divider:     { icon: Layers,        label: "Section",        color: "text-teal-600",   bg: "bg-teal-100"   },
  activity:    { icon: Puzzle,        label: "Activity",       color: "text-purple-600", bg: "bg-purple-100" },
}

function uid() { return `new_${Math.random().toString(36).slice(2)}` }

function defaultItem(type: ItemType): PackageItem {
  const bases: Record<ItemType, PackageItem["config"]> = {
    slide_pdf:   { file_id: null, file_url: null, file_name: null, page_number: 1 },
    slide_pptx:  { file_id: null, file_url: null, file_name: null },
    video:       { file_id: null, file_url: null, file_name: null, must_watch_pct: 80, allow_skip: false },
    youtube:     { url: "", must_watch_pct: 80, allow_skip: false },
    audio:       { file_id: null, file_url: null, file_name: null },
    quiz:        { questions: [], max_attempts: 3, show_correct: true, required_to_proceed: true },
    exam:        { questions: [], time_limit_minutes: null, pass_mark: 70, max_attempts: 1, anti_cheat: true },
    text:        { html: "" },
    image:       { file_id: null, file_url: null, file_name: null },
    web_content: { url: "", title: "" },
    divider:     { title: "New Section", subtitle: "" },
    activity:    { activity_type: "mcq", difficulty: "medium", ai_generated: false, content: {} },
  }
  return { id: uid(), type, title: TYPE_META[type].label, config: bases[type], required: true, order_index: 0 }
}

// ─────────────────────────────────────────────────────────────────
// PDF helpers
// ─────────────────────────────────────────────────────────────────

// Page count via server API — avoids CORS/worker issues during import
async function getPdfPageCount(url: string): Promise<number> {
  const res = await fetch(`/api/lms/pdf-pages?url=${encodeURIComponent(url)}`)
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error ?? "Failed to read PDF")
  return data.pages as number
}

// ─────────────────────────────────────────────────────────────────
// PdfThumbnail — page number label (no PDF.js needed for strip)
// ─────────────────────────────────────────────────────────────────
function PdfThumbnail({ page }: { url: string; page: number }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-500 gap-1">
      <FileText className="h-5 w-5" />
      <span className="text-[10px] font-medium">{page}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// PdfMainView — browser-native PDF viewer via iframe
// ─────────────────────────────────────────────────────────────────
function PdfMainView({ url, page }: { url: string; page: number }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-200">
      <iframe
        key={`${url}#${page}`}
        src={`${url}#page=${page}&toolbar=0&navpanes=0&scrollbar=0`}
        className="w-full h-full border-0 shadow-lg"
        title={`PDF page ${page}`}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Thumbnail strip item (draggable)
// ─────────────────────────────────────────────────────────────────
function ThumbnailItem({
  item, index, active, onSelect, onDelete,
}: {
  item: PackageItem; index: number; active: boolean
  onSelect: () => void; onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const meta = TYPE_META[item.type]
  const Icon = meta.icon

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative flex flex-col cursor-pointer select-none transition-all",
        isDragging ? "opacity-40 z-50" : ""
      )}
      onClick={onSelect}
    >
      {/* Thumbnail box */}
      <div className={cn(
        "mx-2 rounded-lg overflow-hidden border-2 transition-all",
        active ? "border-[#1B4F8A] shadow-md" : "border-transparent hover:border-slate-300"
      )}>
        {/* Visual area */}
        <div className="h-20 bg-slate-100 flex items-center justify-center relative overflow-hidden">
          {item.type === "slide_pdf" && item.config.file_url ? (
            <PdfThumbnail url={item.config.file_url} page={item.config.page_number ?? 1} />
          ) : (
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", meta.bg)}>
              <Icon className={cn("h-4 w-4", meta.color)} />
            </div>
          )}
          {/* PPTX placeholder */}
          {item.type === "slide_pptx" && (
            <div className="absolute bottom-1 right-1 bg-orange-600 text-white text-[8px] font-bold px-1 rounded">PPTX</div>
          )}
          {/* Drag handle */}
          <div
            {...attributes} {...listeners}
            className="absolute top-1 left-1 p-0.5 rounded bg-black/20 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
            onClick={e => e.stopPropagation()}
          >
            <GripVertical className="h-3 w-3 text-white" />
          </div>
          {/* Delete */}
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="absolute top-1 right-1 p-0.5 rounded bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        {/* Label */}
        <div className={cn("px-2 py-1.5 text-center", active ? "bg-[#1B4F8A]/5" : "bg-white")}>
          <p className="text-[10px] font-semibold text-slate-500 truncate">{index + 1}. {item.title || meta.label}</p>
          <p className={cn("text-[9px]", meta.color)}>{meta.label}</p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Question bank picker (for package quiz/exam items)
// ─────────────────────────────────────────────────────────────────
interface PkgBankSet {
  id: string; name: string; topic: string | null
  questions: {
    id: string; type: string; text_en: string; score: number; difficulty: string
    ordering_items: { text: string }[] | null
    matching_pairs: { left: string; right: string }[] | null
    lms_question_choices: { id: string; text_en: string; is_correct: boolean; order_index: number }[]
  }[]
}

function convertToPkgQuestion(bq: PkgBankSet["questions"][number]): PackageQuestion {
  const type = bq.type === "mcq_multi" ? "mcq_multiple"
             : bq.type === "matching"  ? "match_pair"
             : bq.type as PackageQuestion["type"]
  const base = { id: uid(), text: bq.text_en, points: 1, type }
  if (type === "mcq_single" || type === "mcq_multiple") {
    const opts = [...bq.lms_question_choices].sort((a, b) => a.order_index - b.order_index)
    return { ...base, options: opts.map(c => ({ id: uid(), text: c.text_en, is_correct: c.is_correct })) }
  }
  if (type === "ordering")   return { ...base, items: (bq.ordering_items ?? []).map(it => ({ id: uid(), text: it.text })) }
  if (type === "match_pair") return { ...base, pairs: (bq.matching_pairs ?? []).map(p => ({ id: uid(), left: p.left, right: p.right })) }
  return { ...base, type: "open_ended" }
}

function PackageBankPickerModal({
  onClose, onImport,
}: { onClose: () => void; onImport: (qs: PackageQuestion[]) => void }) {
  const [sets,      setSets]     = useState<PkgBankSet[]>([])
  const [loading,   setLoading]  = useState(true)
  const [activeSet, setActiveSet]= useState<string | null>(null)
  const [selected,  setSelected] = useState<Set<string>>(new Set())
  const [search,    setSearch]   = useState("")

  useEffect(() => {
    fetch("/api/lms/question-bank")
      .then(r => r.json())
      .then((data: PkgBankSet[]) => { setSets(data ?? []); if (data?.length) setActiveSet(data[0].id) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h)
  }, [onClose])

  const currentSet = sets.find(s => s.id === activeSet)
  const filtered = (currentSet?.questions ?? []).filter(q =>
    !search.trim() || q.text_en.toLowerCase().includes(search.toLowerCase())
  )

  function toggle(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleAll() {
    const ids = filtered.map(q => q.id)
    const all = ids.every(id => selected.has(id))
    setSelected(prev => { const s = new Set(prev); ids.forEach(id => all ? s.delete(id) : s.add(id)); return s })
  }

  const TYPE_SHORT: Record<string, string> = { mcq_single:"MCQ", mcq_multi:"Multi", ordering:"Order", matching:"Match", open_ended:"Open" }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <Database className="h-5 w-5 text-[#1B4F8A]" />
            <div>
              <h2 className="font-bold text-slate-900">Pick from Question Bank</h2>
              <p className="text-xs text-slate-400 mt-0.5">Import questions into this quiz / knowledge test</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
        ) : sets.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
            <Database className="h-10 w-10 text-slate-200" />
            <p className="font-semibold text-slate-500">No question sets yet</p>
            <p className="text-sm text-slate-400">Go to Question Bank in the sidebar to create sets and add questions.</p>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            <div className="w-48 border-r border-slate-100 overflow-y-auto shrink-0 py-2">
              {sets.map(set => {
                const cnt = set.questions.filter(q => selected.has(q.id)).length
                return (
                  <button key={set.id} onClick={() => { setActiveSet(set.id); setSearch("") }}
                    className={cn("w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center justify-between gap-1",
                      activeSet === set.id ? "bg-[#1B4F8A]/8 text-[#1B4F8A] font-semibold border-r-2 border-[#1B4F8A]" : "text-slate-600 hover:bg-slate-50"
                    )}>
                    <span className="truncate text-xs">{set.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {cnt > 0 && <span className="text-[10px] bg-[#1B4F8A] text-white rounded-full px-1.5 py-0.5 font-bold">{cnt}</span>}
                      <span className="text-[10px] text-slate-400">{set.questions.length}</span>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 h-8 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20" />
                </div>
                {filtered.length > 0 && (
                  <button onClick={toggleAll} className="text-xs text-[#1B4F8A] hover:underline shrink-0">
                    {filtered.every(q => selected.has(q.id)) ? "Deselect all" : "Select all"}
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                {filtered.map((bq, i) => {
                  const isSel = selected.has(bq.id)
                  return (
                    <button key={bq.id} onClick={() => toggle(bq.id)}
                      className={cn("w-full text-left px-4 py-3 flex items-start gap-3 transition-colors", isSel ? "bg-[#1B4F8A]/5" : "hover:bg-slate-50")}>
                      <div className={cn("w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
                        isSel ? "bg-[#1B4F8A] border-[#1B4F8A] text-white" : "border-slate-300")}>
                        {isSel && <Check className="h-3 w-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs text-slate-400">Q{i + 1}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">{TYPE_SHORT[bq.type] ?? bq.type}</span>
                          <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium capitalize",
                            bq.difficulty === "easy" ? "bg-emerald-50 text-emerald-600" :
                            bq.difficulty === "hard" ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-600"
                          )}>{bq.difficulty}</span>
                          <span className="ml-auto text-xs text-slate-400 shrink-0">{bq.score}pt</span>
                        </div>
                        <p className="text-sm text-slate-700 line-clamp-2 text-left">{bq.text_en}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 shrink-0">
          <span className="text-sm text-slate-500">
            {selected.size > 0 ? <span className="font-semibold text-[#1B4F8A]">{selected.size} selected</span> : "Select questions"}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 rounded-xl hover:bg-slate-100 transition-colors">Cancel</button>
            <button onClick={() => {
              const all = sets.flatMap(s => s.questions).filter(q => selected.has(q.id))
              onImport(all.map(convertToPkgQuestion))
              onClose()
            }} disabled={selected.size === 0}
              className={cn("px-5 py-2 text-sm font-semibold rounded-xl transition-all",
                selected.size > 0 ? "bg-[#1B4F8A] text-white hover:bg-[#163f6e] shadow-sm" : "bg-slate-100 text-slate-400 cursor-not-allowed"
              )}>
              Add {selected.size > 0 ? `${selected.size} Question${selected.size !== 1 ? "s" : ""}` : "Questions"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Question editor (for quiz / exam items)
// ─────────────────────────────────────────────────────────────────
function defaultDataForType(type: PackageQuestion["type"]): Partial<PackageQuestion> {
  switch (type) {
    case "mcq_single":
    case "mcq_multiple":
      return { options: [{ id: uid(), text: "", is_correct: false }, { id: uid(), text: "", is_correct: false }], items: undefined, pairs: undefined }
    case "ordering":
      return { items: [{ id: uid(), text: "" }, { id: uid(), text: "" }, { id: uid(), text: "" }], options: undefined, pairs: undefined }
    case "match_pair":
      return { pairs: [{ id: uid(), left: "", right: "" }, { id: uid(), left: "", right: "" }], options: undefined, items: undefined }
    case "open_ended":
    default:
      return { options: undefined, items: undefined, pairs: undefined }
  }
}

function QuestionEditor({
  questions, onChange,
}: {
  questions: PackageQuestion[]; onChange: (q: PackageQuestion[]) => void
}) {
  const [bankOpen, setBankOpen] = useState(false)

  function addQ() {
    onChange([...questions, {
      id: uid(), type: "mcq_single", text: "", points: 1,
      ...defaultDataForType("mcq_single"),
    }])
  }

  function updateQ(i: number, patch: Partial<PackageQuestion>) {
    const q = questions[i]
    // When type changes, reset type-specific data
    if (patch.type && patch.type !== q.type) {
      patch = { ...patch, ...defaultDataForType(patch.type) }
    }
    const next = questions.map((q, qi) => qi === i ? { ...q, ...patch } : q)
    onChange(next)
  }

  function removeQ(i: number) { onChange(questions.filter((_, qi) => qi !== i)) }

  // MCQ helpers
  function addOpt(qi: number) {
    const q = questions[qi]
    updateQ(qi, { options: [...(q.options ?? []), { id: uid(), text: "", is_correct: false }] })
  }
  function updateOpt(qi: number, oi: number, patch: Partial<MCQOption>) {
    const q = questions[qi]
    const opts = (q.options ?? []).map((o, i) => i === oi ? { ...o, ...patch } : o)
    if (patch.is_correct && q.type === "mcq_single") {
      opts.forEach((o, i) => { if (i !== oi) o.is_correct = false })
    }
    updateQ(qi, { options: opts })
  }
  function removeOpt(qi: number, oi: number) {
    updateQ(qi, { options: (questions[qi].options ?? []).filter((_, i) => i !== oi) })
  }

  // Ordering helpers
  function addItem(qi: number) {
    const q = questions[qi]
    updateQ(qi, { items: [...(q.items ?? []), { id: uid(), text: "" }] })
  }
  function updateItem(qi: number, ii: number, text: string) {
    const q = questions[qi]
    updateQ(qi, { items: (q.items ?? []).map((it, i) => i === ii ? { ...it, text } : it) })
  }
  function removeItem(qi: number, ii: number) {
    updateQ(qi, { items: (questions[qi].items ?? []).filter((_, i) => i !== ii) })
  }
  function moveItem(qi: number, ii: number, dir: -1 | 1) {
    const items = [...(questions[qi].items ?? [])]
    const to = ii + dir
    if (to < 0 || to >= items.length) return
    ;[items[ii], items[to]] = [items[to], items[ii]]
    updateQ(qi, { items })
  }

  // Match pair helpers
  function addPair(qi: number) {
    const q = questions[qi]
    updateQ(qi, { pairs: [...(q.pairs ?? []), { id: uid(), left: "", right: "" }] })
  }
  function updatePair(qi: number, pi: number, patch: Partial<MatchPair>) {
    const q = questions[qi]
    updateQ(qi, { pairs: (q.pairs ?? []).map((p, i) => i === pi ? { ...p, ...patch } : p) })
  }
  function removePair(qi: number, pi: number) {
    updateQ(qi, { pairs: (questions[qi].pairs ?? []).filter((_, i) => i !== pi) })
  }

  return (
    <div className="space-y-4">
      {questions.map((q, qi) => (
        <div key={q.id} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
          {/* Header */}
          <div className="flex items-start gap-2">
            <span className="w-6 h-6 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] text-xs font-bold flex items-center justify-center shrink-0 mt-1">{qi + 1}</span>
            <div className="flex-1 space-y-2">
              <textarea
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30"
                rows={2}
                placeholder="Question text…"
                value={q.text}
                onChange={e => updateQ(qi, { text: e.target.value })}
              />
              <div className="flex items-center gap-3">
                <select
                  value={q.type}
                  onChange={e => updateQ(qi, { type: e.target.value as PackageQuestion["type"] })}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                >
                  <option value="mcq_single">Single choice</option>
                  <option value="mcq_multiple">Multiple choice</option>
                  <option value="ordering">Ordering</option>
                  <option value="match_pair">Match the pair</option>
                  <option value="open_ended">Open ended</option>
                </select>
                <button onClick={() => removeQ(qi)} className="ml-auto text-red-400 hover:text-red-600 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* MCQ options */}
          {(q.type === "mcq_single" || q.type === "mcq_multiple") && (
            <div className="ml-8 space-y-1.5">
              {(q.options ?? []).map((opt, oi) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <button onClick={() => updateOpt(qi, oi, { is_correct: !opt.is_correct })}
                    className={cn("shrink-0 transition-colors", opt.is_correct ? "text-emerald-500" : "text-slate-300 hover:text-slate-400")}>
                    {opt.is_correct ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                  <Input value={opt.text} onChange={e => updateOpt(qi, oi, { text: e.target.value })}
                    placeholder={`Option ${oi + 1}`} className="h-7 text-xs flex-1" />
                  <button onClick={() => removeOpt(qi, oi)} className="text-slate-300 hover:text-red-400 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button onClick={() => addOpt(qi)}
                className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1 mt-1">
                <Plus className="h-3 w-3" /> Add option
              </button>
            </div>
          )}

          {/* Ordering items */}
          {q.type === "ordering" && (
            <div className="ml-8 space-y-1.5">
              <p className="text-xs text-slate-400 mb-2">Enter items in the correct order — students will see them shuffled.</p>
              {(q.items ?? []).map((item, ii) => (
                <div key={item.id} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 w-5 text-center shrink-0">{ii + 1}</span>
                  <Input value={item.text} onChange={e => updateItem(qi, ii, e.target.value)}
                    placeholder={`Step / item ${ii + 1}`} className="h-7 text-xs flex-1" />
                  <button onClick={() => moveItem(qi, ii, -1)} disabled={ii === 0}
                    className="text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => moveItem(qi, ii, 1)} disabled={ii === (q.items?.length ?? 0) - 1}
                    className="text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => removeItem(qi, ii)} className="text-slate-300 hover:text-red-400 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button onClick={() => addItem(qi)}
                className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1 mt-1">
                <Plus className="h-3 w-3" /> Add item
              </button>
            </div>
          )}

          {/* Match pair */}
          {q.type === "match_pair" && (
            <div className="ml-8 space-y-1.5">
              <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-400 mb-1">
                <span>Left (prompt)</span>
                <span>Right (match)</span>
              </div>
              {(q.pairs ?? []).map((pair, pi) => (
                <div key={pair.id} className="flex items-center gap-2">
                  <Input value={pair.left}  onChange={e => updatePair(qi, pi, { left:  e.target.value })}
                    placeholder="Left item"  className="h-7 text-xs flex-1" />
                  <span className="text-slate-300 text-xs shrink-0">→</span>
                  <Input value={pair.right} onChange={e => updatePair(qi, pi, { right: e.target.value })}
                    placeholder="Right match" className="h-7 text-xs flex-1" />
                  <button onClick={() => removePair(qi, pi)} className="text-slate-300 hover:text-red-400 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button onClick={() => addPair(qi)}
                className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1 mt-1">
                <Plus className="h-3 w-3" /> Add pair
              </button>
            </div>
          )}

          {/* Open ended */}
          {q.type === "open_ended" && (
            <div className="ml-8 space-y-1.5">
              <Label className="text-xs text-slate-500">Model answer / grading guide <span className="text-slate-400">(used by AI to grade)</span></Label>
              <textarea
                rows={3}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30"
                placeholder="Describe the ideal answer, key points the student should mention…"
                value={q.model_answer ?? ""}
                onChange={e => updateQ(qi, { model_answer: e.target.value })}
              />
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <button onClick={addQ}
          className="flex-1 py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:border-[#1B4F8A] hover:text-[#1B4F8A] transition-colors flex items-center justify-center gap-2">
          <Plus className="h-4 w-4" /> Add question
        </button>
        <button onClick={() => setBankOpen(true)}
          className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-500 hover:bg-slate-50 transition-colors flex items-center gap-2">
          <Database className="h-4 w-4" /> Question Bank
        </button>
      </div>

      {bankOpen && (
        <PackageBankPickerModal
          onClose={() => setBankOpen(false)}
          onImport={imported => onChange([...questions, ...imported])}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Main content area renderer (editor mode)
// ─────────────────────────────────────────────────────────────────
const ACTIVITY_TYPES: { type: string; label: string; icon: React.ElementType; color: string; bg: string }[] = [
  { type: "mcq",           label: "MCQ",            icon: ListOrdered,  color: "#0C447C", bg: "#E6F1FB" },
  { type: "flashcard",     label: "Flashcard",      icon: BookOpen,     color: "#27500A", bg: "#EAF3DE" },
  { type: "ordering",      label: "Ordering",       icon: ArrowUpDown,  color: "#633806", bg: "#FAEEDA" },
  { type: "error_spotter", label: "Error Spotter",  icon: AlertTriangle,color: "#791F1F", bg: "#FCEBEB" },
  { type: "gap_fill",      label: "Gap Fill",       icon: TextCursor,   color: "#26215C", bg: "#EEEDFE" },
  { type: "word_scramble", label: "Word Scramble",  icon: WholeWord,    color: "#4B1528", bg: "#FBEAF0" },
  { type: "scenario",      label: "Scenario",       icon: GitBranch,    color: "#04342C", bg: "#E1F5EE" },
  { type: "concept_sorter",label: "Concept Sorter", icon: Layers3,      color: "#3B3B00", bg: "#FFFFF0" },
  { type: "acronym",       label: "Acronym",        icon: Sparkles,     color: "#2C1A00", bg: "#FFF3E0" },
  { type: "drag_match",    label: "Drag & Match",   icon: Puzzle,       color: "#1A0033", bg: "#F3E5F5" },
  { type: "fill_blank",    label: "Fill in Blank",  icon: AlignLeft,    color: "#002244", bg: "#E3F2FD" },
  { type: "rapid_fire",    label: "Rapid Fire",     icon: Zap,          color: "#4A0000", bg: "#FFEBEE" },
]

type PlacementMode = "smart" | "here" | "before"

function ActivityItemEditor({
  item, onChange, moduleId, onInsertMore, currentItemIdx, totalItems,
}: {
  item: PackageItem
  onChange: (patch: Partial<PackageItem>) => void
  moduleId: string
  onInsertMore?: (items: Array<PackageItem & { _targetIdx?: number }>, mode: PlacementMode) => void
  currentItemIdx: number
  totalItems: number
}) {
  const cfg = item.config
  const setConfig = (patch: Record<string, any>) => onChange({ config: { ...cfg, ...patch } })
  const [generating,    setGenerating]    = useState(false)
  const [genCount,      setGenCount]      = useState(1)
  const [genLang,       setGenLang]       = useState("English")
  const [genPlacement,  setGenPlacement]  = useState<PlacementMode>("smart")

  const selectedType = ACTIVITY_TYPES.find(t => t.type === cfg.activity_type) ?? ACTIVITY_TYPES[0]
  const hasContent = cfg.content && Object.keys(cfg.content).length > 0

  async function generateActivity() {
    setGenerating(true)
    try {
      const res = await fetch("/api/lms/activities/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module_id: moduleId,
          count: genCount,
          types: [cfg.activity_type ?? "mcq"],
          difficulty: cfg.difficulty ?? "medium",
          placement: genPlacement === "smart" ? "ai_topic" : genPlacement === "before" ? "evenly" : "evenly",
          language: genLang,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Generation failed")
      const acts: any[] = data.activities ?? []
      if (acts.length === 0) throw new Error("No activities returned")
      const slideCount: number = data.slideCount ?? 1

      // Sort all activities by placement_slide (AI smart order)
      const sorted = [...acts].sort((a, b) => (a.placement_slide ?? 0) - (b.placement_slide ?? 0))

      // First in sorted order updates the current item
      const first = sorted[0]
      onChange({
        title: first.title ?? item.title,
        config: {
          ...cfg,
          activity_type: first.type ?? cfg.activity_type,
          content: first.content,
          ai_generated: true,
          difficulty: first.difficulty,
        },
      })

      // Extra activities become new items with computed target positions
      if (sorted.length > 1 && onInsertMore) {
        const extras: Array<PackageItem & { _targetIdx?: number }> = sorted.slice(1).map(act => {
          let targetIdx: number
          if (genPlacement === "smart") {
            // Proportional: place after the slide % of total items
            const ratio = (act.placement_slide ?? 1) / slideCount
            targetIdx = Math.max(currentItemIdx + 1, Math.min(totalItems - 1, Math.round(ratio * totalItems)))
          } else if (genPlacement === "before") {
            // Distribute evenly before the current item
            targetIdx = Math.max(0, currentItemIdx - 1)
          } else {
            // "here" — stack right after current item
            targetIdx = currentItemIdx + 1
          }

          const pi: PackageItem & { _targetIdx?: number } = {
            ...defaultItem("activity"),
            title: act.title ?? "Activity",
            config: {
              activity_type: act.type ?? cfg.activity_type ?? "mcq",
              difficulty: act.difficulty ?? cfg.difficulty ?? "medium",
              ai_generated: true,
              content: act.content ?? {},
            },
            _targetIdx: targetIdx,
          }
          return pi
        })
        onInsertMore(extras, genPlacement)
      }

      toast.success(`${acts.length} activit${acts.length === 1 ? "y" : "ies"} generated`)
    } catch (e: any) {
      toast.error(e.message ?? "Generation failed")
    }
    setGenerating(false)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-white">

      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-white">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
            <Puzzle className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-800 text-sm">Activity Editor</p>
            <p className="text-xs text-slate-400">Choose a type, set difficulty, then generate with AI</p>
          </div>
          {hasContent && (
            <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <Check className="h-3 w-3" /> Ready
            </span>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-2xl">

        {/* Step 1 — Type */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-5 h-5 rounded-full bg-[#1B4F8A] text-white text-[10px] font-bold flex items-center justify-center">1</span>
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Choose activity type</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {ACTIVITY_TYPES.map(t => {
              const Icon = t.icon
              const on = cfg.activity_type === t.type
              return (
                <button key={t.type}
                  onClick={() => setConfig({ activity_type: t.type, content: {} })}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all text-left",
                    on ? "border-transparent shadow-sm" : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white"
                  )}
                  style={on ? { background: t.bg, color: t.color, borderColor: t.color + "60" } : {}}>
                  <Icon className="h-4 w-4 shrink-0" style={on ? { color: t.color } : { color: "#94a3b8" }} />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Step 2 — Difficulty */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-5 h-5 rounded-full bg-[#1B4F8A] text-white text-[10px] font-bold flex items-center justify-center">2</span>
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Set difficulty</p>
          </div>
          <div className="flex gap-2">
            {(["easy","medium","hard"] as const).map(d => (
              <button key={d} onClick={() => setConfig({ difficulty: d })}
                className={cn(
                  "flex-1 py-2 rounded-xl border-2 text-xs font-bold capitalize transition-all",
                  cfg.difficulty === d
                    ? d === "easy"   ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                    : d === "medium" ? "border-amber-400 bg-amber-50 text-amber-700"
                    :                  "border-red-400 bg-red-50 text-red-700"
                    : "border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300 hover:bg-white"
                )}>{d}</button>
            ))}
          </div>
        </div>

        {/* Step 3 — Placement */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-5 h-5 rounded-full bg-[#1B4F8A] text-white text-[10px] font-bold flex items-center justify-center">3</span>
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Placement</p>
          </div>
          <div className="flex flex-col gap-2">
            {([
              {
                mode: "smart" as PlacementMode,
                label: "AI chooses position",
                desc: "AI reads the module flow and places each activity after students have seen the relevant slides — never before the prerequisite content.",
                icon: Sparkles,
              },
              {
                mode: "here" as PlacementMode,
                label: "At current position",
                desc: "All activities are inserted right here in the sidebar, stacked at the current item's position.",
                icon: Target,
              },
              {
                mode: "before" as PlacementMode,
                label: "Before current position",
                desc: "Activities are placed before this item — useful as a recap or warm-up before the upcoming slides.",
                icon: ChevronUp,
              },
            ] as const).map(({ mode, label, desc, icon: Icon }) => (
              <button key={mode} onClick={() => setGenPlacement(mode)}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all",
                  genPlacement === mode
                    ? "border-[#1B4F8A] bg-[#E6F1FB]"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                )}>
                <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", genPlacement === mode ? "text-[#1B4F8A]" : "text-slate-400")} />
                <div>
                  <p className={cn("text-xs font-bold", genPlacement === mode ? "text-[#1B4F8A]" : "text-slate-700")}>{label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Step 4 — Generate */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-5 h-5 rounded-full bg-[#1B4F8A] text-white text-[10px] font-bold flex items-center justify-center">4</span>
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Generate with AI</p>
          </div>

          {/* Count + language row */}
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <p className="text-[11px] text-slate-500 font-semibold mb-1.5">How many activities?</p>
              <div className="flex gap-1.5">
                {[1,2,3,5,10].map(n => (
                  <button key={n} onClick={() => setGenCount(n)}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all",
                      genCount === n
                        ? "border-[#1B4F8A] bg-[#E6F1FB] text-[#1B4F8A]"
                        : "border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300"
                    )}>{n}</button>
                ))}
              </div>
            </div>
            <div className="w-32">
              <p className="text-[11px] text-slate-500 font-semibold mb-1.5">Language</p>
              <select value={genLang} onChange={e => setGenLang(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700 font-medium focus:outline-none focus:border-[#1B4F8A]">
                <option value="English">English</option>
                <option value="French">French</option>
                <option value="Arabic">Arabic</option>
                <option value="Spanish">Spanish</option>
              </select>
            </div>
          </div>

          <button onClick={generateActivity} disabled={generating}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1B4F8A] hover:bg-[#0C447C] text-white text-sm font-semibold transition-colors disabled:opacity-60 shadow-sm">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating
              ? `Generating ${genCount} activit${genCount === 1 ? "y" : "ies"}…`
              : hasContent
              ? `Regenerate (×${genCount})`
              : `Generate ${genCount === 1 ? "activity" : `${genCount} activities`}`
            }
          </button>
          {genCount > 1 && (
            <p className="text-[11px] text-amber-600 mt-2 text-center">
              {genCount - 1} extra activit{genCount - 1 === 1 ? "y" : "ies"} will be added as new items in the sidebar
            </p>
          )}
          {genCount === 1 && (
            <p className="text-[11px] text-slate-400 mt-2 text-center">
              AI uses the module's Expert analysis to create relevant content
            </p>
          )}
        </div>

        {/* Content status */}
        {hasContent ? (
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              {(() => { const Icon = selectedType.icon; return <Icon className="h-4 w-4" style={{ color: selectedType.color }} /> })()}
              <p className="text-sm font-bold text-emerald-800">{selectedType.label} — ready</p>
              <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-600">
                <Sparkles className="h-3 w-3" /> AI generated
              </span>
            </div>

            {/* Human-readable preview per type */}
            {cfg.activity_type === "mcq" && cfg.content?.question && (
              <div className="text-xs text-slate-700 space-y-1">
                <p className="font-medium text-slate-800">Q: {cfg.content.question}</p>
                {cfg.content.options?.map((o: any, i: number) => (
                  <p key={i} className={cn("pl-3", o.is_correct ? "text-emerald-700 font-semibold" : "text-slate-500")}>
                    {o.is_correct ? "✓" : "·"} {o.text}
                  </p>
                ))}
              </div>
            )}
            {cfg.activity_type === "flashcard" && (
              <p className="text-xs text-slate-600">{cfg.content?.cards?.length ?? 0} flashcards generated</p>
            )}
            {cfg.activity_type === "ordering" && (
              <p className="text-xs text-slate-600">{cfg.content?.items?.length ?? 0} items to order — "{cfg.content?.question}"</p>
            )}
            {cfg.activity_type === "error_spotter" && cfg.content?.text && (
              <div className="text-xs text-slate-700 space-y-1">
                <p className="italic text-slate-600">"{cfg.content.text.slice(0, 120)}{cfg.content.text.length > 120 ? "…" : ""}"</p>
                <p className="text-slate-500">{cfg.content.errors?.length ?? 0} errors to find</p>
              </div>
            )}
            {cfg.activity_type === "gap_fill" && cfg.content?.paragraph && (
              <p className="text-xs text-slate-600 italic">"{cfg.content.paragraph.slice(0, 120)}…"</p>
            )}
            {cfg.activity_type === "word_scramble" && (
              <p className="text-xs text-slate-600">Term: <strong>{cfg.content?.word}</strong> — {cfg.content?.hint}</p>
            )}
            {cfg.activity_type === "scenario" && (
              <p className="text-xs text-slate-600">{cfg.content?.situation?.slice(0, 100)}…</p>
            )}
            {cfg.activity_type === "concept_sorter" && (
              <p className="text-xs text-slate-600">{cfg.content?.categories?.length ?? 0} categories, {cfg.content?.items?.length ?? 0} items</p>
            )}
            {cfg.activity_type === "acronym" && (
              <p className="text-xs text-slate-600">Acronym: <strong>{cfg.content?.acronym}</strong></p>
            )}
            {cfg.activity_type === "drag_match" && (
              <p className="text-xs text-slate-600">{cfg.content?.pairs?.length ?? 0} pairs to match</p>
            )}
            {cfg.activity_type === "fill_blank" && cfg.content?.sentence && (
              <p className="text-xs text-slate-600 italic">"{cfg.content.sentence}"</p>
            )}
            {cfg.activity_type === "rapid_fire" && (
              <p className="text-xs text-slate-600">{cfg.content?.questions?.length ?? 0} rapid-fire questions, {cfg.content?.time_per_question_s ?? 10}s each</p>
            )}

            <p className="text-[11px] text-emerald-700 pt-1 border-t border-emerald-200">
              Save the package to publish this activity to students.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <Puzzle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400">No content yet — click "Generate activity content" above</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ItemEditor({
  item, onChange, moduleId, onInsertMore, currentItemIdx, totalItems,
}: {
  item: PackageItem
  onChange: (patch: Partial<PackageItem>) => void
  moduleId: string
  onInsertMore?: (items: Array<PackageItem & { _targetIdx?: number }>, mode: PlacementMode) => void
  currentItemIdx: number
  totalItems: number
}) {
  const cfg = item.config

  const setConfig = (patch: Record<string, any>) =>
    onChange({ config: { ...cfg, ...patch } })

  // ── slide_pdf ──────────────────────────────────────────────────
  if (item.type === "slide_pdf") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 overflow-hidden select-none" onContextMenu={e => e.preventDefault()}>
        {cfg.file_url ? (
          <PdfMainView url={cfg.file_url} page={cfg.page_number ?? 1} />
        ) : (
          <div className="text-center text-slate-500">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No PDF file — import one using the toolbar above.</p>
          </div>
        )}
      </div>
    )
  }

  // ── slide_pptx ─────────────────────────────────────────────────
  if (item.type === "slide_pptx") {
    if (!cfg.file_url) return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="text-center text-slate-500">
          <Layers className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No PPTX file — import one using the toolbar above.</p>
        </div>
      </div>
    )
    const src = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(cfg.file_url)}&action=embedview`
    return (
      <div className="flex-1 flex flex-col bg-slate-900 select-none" onContextMenu={e => e.preventDefault()}>
        <iframe src={src} className="w-full flex-1 border-0" title={cfg.file_name ?? "PPTX"} allowFullScreen />
      </div>
    )
  }

  // ── video ──────────────────────────────────────────────────────
  if (item.type === "video") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 gap-4">
        {cfg.file_url ? (
          <video src={cfg.file_url} controls className="max-h-[70%] max-w-full rounded-lg shadow-xl"
            controlsList="nodownload" onContextMenu={e => e.preventDefault()} />
        ) : (
          <div className="text-center text-slate-500">
            <FileVideo className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No video — use Insert → Video to add one.</p>
          </div>
        )}
        {/* Settings */}
        <div className="flex items-center gap-4 bg-slate-800 rounded-xl px-4 py-2.5 text-sm text-white/70">
          <label className="flex items-center gap-2">
            <span>Must watch</span>
            <input type="range" min={0} max={100} value={cfg.must_watch_pct ?? 80}
              onChange={e => setConfig({ must_watch_pct: +e.target.value })}
              className="w-24" />
            <span className="w-8 text-white font-semibold">{cfg.must_watch_pct ?? 80}%</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={cfg.allow_skip ?? false}
              onChange={e => setConfig({ allow_skip: e.target.checked })} />
            <span>Allow skip</span>
          </label>
        </div>
      </div>
    )
  }

  // ── youtube ────────────────────────────────────────────────────
  if (item.type === "youtube") {
    const getYtId = (url: string) => {
      const m = url.match(/(?:youtu\.be\/|v=|embed\/)([a-zA-Z0-9_-]{11})/)
      return m?.[1] ?? null
    }
    const ytId = cfg.url ? getYtId(cfg.url) : null
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 gap-4">
        {ytId ? (
          <div className="w-full max-w-3xl aspect-video">
            <iframe
              src={`https://www.youtube.com/embed/${ytId}`}
              className="w-full h-full rounded-lg shadow-xl border-0"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md space-y-3">
            <p className="text-white/70 text-sm font-medium">YouTube / Vimeo URL</p>
            <Input
              value={cfg.url ?? ""}
              onChange={e => setConfig({ url: e.target.value })}
              placeholder="https://youtube.com/watch?v=..."
              className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
            />
          </div>
        )}
        {cfg.url && (
          <div className="flex items-center gap-4 bg-slate-800 rounded-xl px-4 py-2.5 text-sm text-white/70">
            <label className="flex items-center gap-2">
              <span>Must watch</span>
              <input type="range" min={0} max={100} value={cfg.must_watch_pct ?? 80}
                onChange={e => setConfig({ must_watch_pct: +e.target.value })} className="w-24" />
              <span className="w-8 text-white font-semibold">{cfg.must_watch_pct ?? 80}%</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={cfg.allow_skip ?? false}
                onChange={e => setConfig({ allow_skip: e.target.checked })} />
              <span>Allow skip</span>
            </label>
          </div>
        )}
        {cfg.url && (
          <button onClick={() => setConfig({ url: "" })}
            className="text-xs text-slate-400 hover:text-white underline">Change URL</button>
        )}
      </div>
    )
  }

  // ── quiz ───────────────────────────────────────────────────────
  if (item.type === "quiz" || item.type === "exam") {
    const isExam = item.type === "exam"
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Settings row */}
          <div className="flex flex-wrap gap-3 items-center p-4 bg-white border border-slate-200 rounded-xl">
            {isExam && (
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-slate-400" />
                <Label className="text-xs text-slate-500">Pass mark</Label>
                <Input type="number" min={0} max={100} value={cfg.pass_mark ?? 70}
                  onChange={e => setConfig({ pass_mark: +e.target.value })}
                  className="w-16 h-7 text-xs" />
                <span className="text-xs text-slate-400">%</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500">Max attempts</Label>
              {(cfg.max_attempts ?? 0) >= 99 ? (
                <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2 py-1 rounded-md">Unlimited</span>
              ) : (
                <Input type="number" min={1} max={98} value={cfg.max_attempts ?? (isExam ? 1 : 3)}
                  onChange={e => setConfig({ max_attempts: +e.target.value })}
                  className="w-16 h-7 text-xs" />
              )}
              <label className="flex items-center gap-1.5 cursor-pointer ml-1">
                <input
                  type="checkbox"
                  checked={(cfg.max_attempts ?? 0) >= 99}
                  onChange={e => setConfig({ max_attempts: e.target.checked ? 99 : (isExam ? 1 : 3) })}
                />
                <span className="text-xs text-slate-500">Unlimited</span>
              </label>
            </div>
            {isExam && (
              <>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <Input type="number" min={1} placeholder="No limit"
                    value={cfg.time_limit_minutes ?? ""}
                    onChange={e => setConfig({ time_limit_minutes: e.target.value ? +e.target.value : null })}
                    className="w-20 h-7 text-xs" />
                  <span className="text-xs text-slate-400">min</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={cfg.anti_cheat ?? true}
                    onChange={e => setConfig({ anti_cheat: e.target.checked })} />
                  <Shield className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-xs text-slate-500">Anti-cheat</span>
                </label>
              </>
            )}
            {!isExam && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={cfg.show_correct ?? true}
                  onChange={e => setConfig({ show_correct: e.target.checked })} />
                <span className="text-xs text-slate-500">Show correct answers</span>
              </label>
            )}
          </div>
          <QuestionEditor
            questions={cfg.questions ?? []}
            onChange={q => setConfig({ questions: q })}
          />
        </div>
      </div>
    )
  }

  // ── text ───────────────────────────────────────────────────────
  if (item.type === "text") {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <RichTextEditor
          value={cfg.html ?? ""}
          bgColor={cfg.bgColor ?? "#ffffff"}
          onChange={html => setConfig({ html })}
          onBgColorChange={bgColor => setConfig({ bgColor })}
        />
      </div>
    )
  }

  // ── image ──────────────────────────────────────────────────────
  if (item.type === "image") {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900 select-none" onContextMenu={e => e.preventDefault()}>
        {cfg.file_url ? (
          <img src={cfg.file_url} alt={cfg.file_name ?? "image"} className="max-h-full max-w-full object-contain" />
        ) : (
          <div className="text-center text-slate-500">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No image — use Insert → Image.</p>
          </div>
        )}
      </div>
    )
  }

  // ── audio ──────────────────────────────────────────────────────
  if (item.type === "audio") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 gap-6 p-8">
        <div className={cn("w-24 h-24 rounded-full flex items-center justify-center",
          cfg.file_url ? "bg-pink-500/20 border-2 border-pink-400/40" : "bg-slate-700")}>
          <Music className={cn("h-10 w-10", cfg.file_url ? "text-pink-300" : "text-slate-500")} />
        </div>
        {cfg.file_url ? (
          <div className="w-full max-w-lg space-y-3">
            <p className="text-white/70 text-sm text-center font-medium">{cfg.file_name ?? "Audio file"}</p>
            <audio src={cfg.file_url} controls className="w-full" controlsList="nodownload" />
          </div>
        ) : (
          <p className="text-slate-500 text-sm">No audio — use Insert → Audio in the toolbar.</p>
        )}
      </div>
    )
  }

  // ── web_content ────────────────────────────────────────────────
  if (item.type === "web_content") {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {/* URL input bar */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-slate-800 border-b border-slate-700">
          <Globe className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            value={cfg.url ?? ""}
            onChange={e => setConfig({ url: e.target.value })}
            placeholder="https://example.com  — paste any URL to embed it"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none"
          />
          {cfg.url && (
            <button onClick={() => setConfig({ url: "" })}
              className="text-slate-500 hover:text-slate-300 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {cfg.url ? (
          <iframe src={cfg.url} className="flex-1 border-0 w-full" title={cfg.title || "Web content"} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 gap-3 text-slate-500">
            <Globe className="h-12 w-12 opacity-20" />
            <p className="text-sm">Paste a URL above to embed any webpage</p>
          </div>
        )}
      </div>
    )
  }

  // ── divider ────────────────────────────────────────────────────
  if (item.type === "divider") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#1B4F8A] text-white gap-4 p-8">
        <input
          className="text-4xl font-bold text-center bg-transparent border-0 border-b-2 border-white/30 focus:border-white outline-none w-full max-w-lg text-white placeholder:text-white/40"
          value={cfg.title ?? ""}
          onChange={e => setConfig({ title: e.target.value })}
          placeholder="Section title…"
        />
        <input
          className="text-lg text-center bg-transparent border-0 border-b border-white/20 focus:border-white/60 outline-none w-full max-w-md text-white/70 placeholder:text-white/30"
          value={cfg.subtitle ?? ""}
          onChange={e => setConfig({ subtitle: e.target.value })}
          placeholder="Subtitle (optional)…"
        />
      </div>
    )
  }

  // ── activity ───────────────────────────────────────────────────
  if (item.type === "activity") {
    return (
      <ActivityItemEditor
        item={item}
        onChange={onChange}
        moduleId={moduleId}
        onInsertMore={onInsertMore}
        currentItemIdx={currentItemIdx}
        totalItems={totalItems}
      />
    )
  }

  return null
}

// ─────────────────────────────────────────────────────────────────
// Main PackageEditor component
// ─────────────────────────────────────────────────────────────────
export default function PackageEditor({
  moduleId, courseId,
}: {
  moduleId: string; courseId: string
}) {
  const [pkg,        setPkg]        = useState<{ id: string; title: string; free_navigation: boolean } | null>(null)
  const [items,      setItems]      = useState<PackageItem[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [dirty,      setDirty]      = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [importing,  setImporting]  = useState(false)

  // LibraryPicker state
  const [picker, setPicker] = useState<{
    open: boolean; mode: "pdf" | "pptx" | "video" | "image" | "audio" | null
  }>({ open: false, mode: null })

  // YouTube URL modal
  const [ytModal, setYtModal] = useState(false)
  const [ytUrl,   setYtUrl]   = useState("")

  // Web Content URL modal
  const [webModal, setWebModal] = useState(false)
  const [webUrl,   setWebUrl]   = useState("")

  // AI title analysis state
  const [aiPanel,       setAiPanel]       = useState(false)
  const [aiLoading,     setAiLoading]     = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<{
    id: string; current_title: string; suggested_title: string; type: string
  }[]>([])
  const [aiSelected,  setAiSelected]  = useState<Set<string>>(new Set())

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // ── Load ─────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/lms/packages?module_id=${moduleId}`)
      .then(r => r.json())
      .then((d: any) => {
        if (d && !d.error) {
          setPkg({ id: d.id, title: d.title, free_navigation: d.free_navigation ?? false })
          const loaded: PackageItem[] = (d.lms_package_items ?? [])
            .sort((a: any, b: any) => a.order_index - b.order_index)
            .map((item: any): PackageItem => ({
              id: item.id, type: item.type, title: item.title ?? TYPE_META[item.type as ItemType]?.label ?? item.type,
              config: item.config ?? {}, required: item.required ?? true, order_index: item.order_index,
            }))
          setItems(loaded)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [moduleId])

  // ── Mark dirty on item changes ───────────────────────────────
  const mark = useCallback(() => setDirty(true), [])

  function updateItem(id: string, patch: Partial<PackageItem>) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
    mark()
  }

  function deleteItem(id: string) {
    setItems(prev => {
      const next = prev.filter(it => it.id !== id)
      const newIdx = Math.min(currentIdx, Math.max(0, next.length - 1))
      setCurrentIdx(newIdx)
      return next
    })
    mark()
  }

  function insertItem(item: PackageItem, afterIdx?: number) {
    setItems(prev => {
      const insertAt = afterIdx !== undefined ? afterIdx + 1 : prev.length
      const next = [...prev]
      next.splice(insertAt, 0, item)
      setCurrentIdx(insertAt)
      return next
    })
    mark()
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = items.findIndex(it => it.id === active.id)
    const to   = items.findIndex(it => it.id === over.id)
    const next = arrayMove(items, from, to)
    setItems(next)
    setCurrentIdx(to)
    mark()
  }

  // ── Import PDF ───────────────────────────────────────────────
  async function handleImportPdf(file: LibraryFile) {
    setImporting(true)
    try {
      const pageCount = await getPdfPageCount(file.public_url)
      const newItems: PackageItem[] = Array.from({ length: pageCount }, (_, i) => ({
        id: uid(), type: "slide_pdf" as const,
        title: `${file.original_name} — Slide ${i + 1}`,
        config: { file_id: file.id, file_url: file.public_url, file_name: file.original_name, page_number: i + 1 },
        required: true, order_index: 0,
      }))
      // Insert after current position
      setItems(prev => {
        const insertAt = currentIdx + 1
        const next = [...prev]
        next.splice(insertAt, 0, ...newItems)
        setCurrentIdx(insertAt)
        return next
      })
      mark()
      toast.success(`${pageCount} slides imported`)
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to read PDF")
    }
    setImporting(false)
  }

  // ── Import PPTX ──────────────────────────────────────────────
  function handleImportPptx(file: LibraryFile) {
    const item = defaultItem("slide_pptx")
    item.title = file.original_name
    item.config = { file_id: file.id, file_url: file.public_url, file_name: file.original_name }
    insertItem(item, currentIdx)
    toast.success("PPTX slide deck added")
  }

  // ── Insert handlers ──────────────────────────────────────────
  function handleInsertVideo(file: LibraryFile) {
    const item = defaultItem("video")
    item.title = file.original_name
    item.config = { ...item.config, file_id: file.id, file_url: file.public_url, file_name: file.original_name }
    insertItem(item, currentIdx)
  }

  function handleInsertImage(file: LibraryFile) {
    const item = defaultItem("image")
    item.title = file.original_name
    item.config = { file_id: file.id, file_url: file.public_url, file_name: file.original_name }
    insertItem(item, currentIdx)
  }

  function handleInsertYoutube() {
    if (!ytUrl.trim()) return
    const item = defaultItem("youtube")
    item.title = "YouTube Video"
    item.config = { ...item.config, url: ytUrl.trim() }
    insertItem(item, currentIdx)
    setYtUrl("")
    setYtModal(false)
  }

  function handleInsertWeb() {
    if (!webUrl.trim()) return
    const item = defaultItem("web_content")
    item.title = "Web Content"
    item.config = { url: webUrl.trim(), title: "" }
    insertItem(item, currentIdx)
    setWebUrl("")
    setWebModal(false)
  }

  function insertSimple(type: ItemType) {
    insertItem(defaultItem(type), currentIdx)
  }

  function handleInsertAudio(file: LibraryFile) {
    const item = defaultItem("audio")
    item.title = file.original_name
    item.config = { file_id: file.id, file_url: file.public_url, file_name: file.original_name }
    insertItem(item, currentIdx)
  }

  // ── Library picker handler ───────────────────────────────────
  function handleFilePicked(file: LibraryFile) {
    if (picker.mode === "pdf")   handleImportPdf(file)
    if (picker.mode === "pptx")  handleImportPptx(file)
    if (picker.mode === "video") handleInsertVideo(file)
    if (picker.mode === "image") handleInsertImage(file)
    if (picker.mode === "audio") handleInsertAudio(file)
    setPicker({ open: false, mode: null })
  }

  // ── AI title analysis ────────────────────────────────────────
  async function runAiAnalysis() {
    if (items.length === 0) { toast.error("Add content items first"); return }
    setAiLoading(true)
    setAiPanel(true)
    setAiSuggestions([])
    try {
      const res = await fetch("/api/lms/packages/analyze-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module_id: moduleId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Analysis failed")
      const suggestions = (data.suggestions ?? []) as typeof aiSuggestions
      setAiSuggestions(suggestions)
      // Pre-select all that differ from current
      setAiSelected(new Set(suggestions.filter(s => s.suggested_title !== s.current_title).map(s => s.id)))
    } catch (e: any) {
      toast.error(e.message ?? "AI analysis failed")
      setAiPanel(false)
    }
    setAiLoading(false)
  }

  function applyAiSuggestions() {
    const count = aiSelected.size
    setItems(prev => prev.map(it => {
      const s = aiSuggestions.find(sg => sg.id === it.id)
      return s && aiSelected.has(it.id) ? { ...it, title: s.suggested_title } : it
    }))
    mark()
    setAiPanel(false)
    setAiSuggestions([])
    toast.success(`Applied ${count} title${count !== 1 ? "s" : ""}`)
  }

  // ── Save ─────────────────────────────────────────────────────
  async function save() {
    setSaving(true)
    try {
      const payload = {
        module_id:       moduleId,
        course_id:       courseId,
        title:           pkg?.title ?? "Package",
        free_navigation: pkg?.free_navigation ?? false,
        items:           items.map((it, i) => ({ ...it, order_index: i })),
      }

      let res: Response
      if (pkg?.id) {
        res = await fetch(`/api/lms/packages/${pkg.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch("/api/lms/packages", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setPkg({ id: data.id, title: data.title, free_navigation: data.free_navigation ?? false })
      // Refresh items with DB ids
      const saved: PackageItem[] = (data.lms_package_items ?? [])
        .sort((a: any, b: any) => a.order_index - b.order_index)
        .map((item: any): PackageItem => ({
          id: item.id, type: item.type,
          title: item.title ?? TYPE_META[item.type as ItemType]?.label ?? item.type,
          config: item.config ?? {}, required: item.required ?? true, order_index: item.order_index,
        }))
      setItems(saved)
      setDirty(false)
      toast.success("Saved")
    } catch (e: any) {
      toast.error(e.message ?? "Save failed")
    }
    setSaving(false)
  }

  // ── Keyboard nav ─────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "ArrowRight" || e.key === "ArrowDown") setCurrentIdx(i => Math.min(i + 1, items.length - 1))
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   setCurrentIdx(i => Math.max(i - 1, 0))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [items.length])

  const currentItem = items[currentIdx] ?? null

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
    </div>
  )

  const pickerAllowedTypes: Record<string, string[]> = {
    pdf:   ["pdf"],
    pptx:  ["pptx", "ppt"],
    video: ["mp4", "mov", "avi", "webm"],
    image: ["image"],
    audio: ["mp3"],
  }

  return (
    <div className="flex flex-col h-full bg-slate-100" style={{ height: "calc(100vh - 56px)" }}>

      {/* ── TOP TOOLBAR ───────────────────────────────────────── */}
      <div className="flex items-center bg-white border-b border-slate-200 shrink-0 min-w-0">

        {/* Scrollable section */}
        <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto min-w-0 flex-1
          [&::-webkit-scrollbar]:h-1.5
          [&::-webkit-scrollbar-track]:bg-slate-100
          [&::-webkit-scrollbar-thumb]:bg-slate-300
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-slate-400">

          {/* Package title */}
          <Input
            value={pkg?.title ?? ""}
            onChange={e => { setPkg(p => p ? { ...p, title: e.target.value } : p); mark() }}
            placeholder="Package title…"
            className="w-40 h-8 text-sm font-semibold shrink-0"
          />

          <div className="w-px h-6 bg-slate-200 shrink-0" />

          {/* Import */}
          <button
            onClick={() => setPicker({ open: true, mode: "pdf" })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium rounded-lg transition-colors shrink-0"
          >
            <FileText className="h-3.5 w-3.5" /> Import PDF
          </button>
          <button
            onClick={() => setPicker({ open: true, mode: "pptx" })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-medium rounded-lg transition-colors shrink-0"
          >
            <Layers className="h-3.5 w-3.5" /> Import PPTX
          </button>

          <div className="w-px h-6 bg-slate-200 shrink-0" />

          {/* Insert */}
          <span className="text-xs text-slate-400 font-medium shrink-0">Insert:</span>
          {[
            { label: "Video",          icon: FileVideo,     action: () => setPicker({ open: true, mode: "video" }) },
            { label: "YouTube",        icon: Play,          action: () => setYtModal(true) },
            { label: "Audio",          icon: Music,         action: () => setPicker({ open: true, mode: "audio" }) },
            { label: "Web Content",    icon: Globe,         action: () => setWebModal(true) },
            { label: "Quiz",           icon: HelpCircle,    action: () => insertSimple("quiz") },
            { label: "Knowledge Test", icon: GraduationCap, action: () => insertSimple("exam") },
            { label: "Activity",       icon: Puzzle,        action: () => insertSimple("activity") },
            { label: "Image",          icon: ImageIcon,     action: () => setPicker({ open: true, mode: "image" }) },
            { label: "Text",           icon: AlignLeft,     action: () => insertSimple("text") },
            { label: "Section",        icon: Layers,        action: () => insertSimple("divider") },
          ].map(({ label, icon: Icon, action }) => (
            <button key={label} onClick={action}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs rounded-lg transition-colors border border-slate-200 shrink-0 whitespace-nowrap">
              <Icon className="h-3 w-3" /> {label}
            </button>
          ))}

          <div className="w-px h-6 bg-slate-200 shrink-0" />

          {/* Free Navigation toggle */}
          <button
            onClick={() => { setPkg(p => p ? { ...p, free_navigation: !p.free_navigation } : p); mark() }}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors shrink-0",
              pkg?.free_navigation
                ? "bg-amber-50 border-amber-300 text-amber-700"
                : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
            )}
            title="Free Navigation: students can jump to any item"
          >
            {pkg?.free_navigation ? <SkipForward className="h-3.5 w-3.5" /> : <Target className="h-3.5 w-3.5" />}
            {pkg?.free_navigation ? "Free Nav" : "Sequential"}
          </button>

          {importing && <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />}
        </div>

        {/* AI Analyze — pinned right */}
        <div className="pl-2 pr-2 py-2 shrink-0 border-l border-slate-200 bg-white">
          <button
            onClick={runAiAnalysis}
            disabled={aiLoading || items.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {aiLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Sparkles className="h-3.5 w-3.5" />}
            AI Analyze
          </button>
        </div>

        {/* Save — pinned right, never scrolls */}
        <div className="pl-2 pr-4 py-2 shrink-0 border-l border-slate-200 bg-white">
          <button
            onClick={save}
            disabled={saving || !dirty}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors",
              dirty
                ? "bg-[#1B4F8A] text-white hover:bg-[#163f6e]"
                : "bg-slate-100 text-slate-400 cursor-default"
            )}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      {/* ── BODY ──────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT THUMBNAIL STRIP */}
        <aside className="w-44 shrink-0 bg-slate-50 border-r border-slate-200 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {items.length} item{items.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto py-2 space-y-1">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                <p className="text-xs text-slate-400">Import a PDF or PPTX to start building</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={items.map(it => it.id)} strategy={verticalListSortingStrategy}>
                  {items.map((item, idx) => (
                    <ThumbnailItem
                      key={item.id}
                      item={item}
                      index={idx}
                      active={idx === currentIdx}
                      onSelect={() => setCurrentIdx(idx)}
                      onDelete={() => deleteItem(item.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          {currentItem ? (
            <>
              {/* Item title bar */}
              <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-200 shrink-0">
                {(() => {
                  const meta = TYPE_META[currentItem.type]
                  const Icon = meta.icon
                  return (
                    <div className={cn("w-6 h-6 rounded-md flex items-center justify-center", meta.bg)}>
                      <Icon className={cn("h-3.5 w-3.5", meta.color)} />
                    </div>
                  )
                })()}
                <Input
                  value={currentItem.title}
                  onChange={e => updateItem(currentItem.id, { title: e.target.value })}
                  className="h-7 text-sm font-medium border-0 bg-transparent focus-visible:ring-0 px-0 flex-1"
                  placeholder="Item title…"
                />
                <span className="text-xs text-slate-400">{currentIdx + 1} / {items.length}</span>
                <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                  <input type="checkbox" checked={currentItem.required}
                    onChange={e => updateItem(currentItem.id, { required: e.target.checked })} />
                  Required
                </label>
              </div>

              {/* Content renderer */}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <ItemEditor
                  item={currentItem}
                  onChange={patch => updateItem(currentItem.id, patch)}
                  moduleId={moduleId}
                  currentItemIdx={currentIdx}
                  totalItems={items.length}
                  onInsertMore={(extras, mode) => {
                    setItems(prev => {
                      const anchorIdx = prev.findIndex(it => it.id === currentItem.id)
                      const next = [...prev]

                      if (mode === "here") {
                        // Stack right after anchor
                        next.splice(anchorIdx + 1, 0, ...extras)
                      } else if (mode === "before") {
                        // Insert before the anchor item
                        next.splice(anchorIdx, 0, ...extras)
                      } else {
                        // smart — each extra has _targetIdx; insert in reverse order so indices stay valid
                        const sorted = [...extras].sort((a, b) => (b._targetIdx ?? 0) - (a._targetIdx ?? 0))
                        for (const ex of sorted) {
                          const at = Math.max(anchorIdx + 1, Math.min(next.length, ex._targetIdx ?? anchorIdx + 1))
                          next.splice(at, 0, ex)
                        }
                      }

                      setCurrentIdx(anchorIdx) // stay on current item
                      return next
                    })
                    mark()
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Layers className="h-16 w-16 opacity-20" />
              <p className="text-sm">Import a PDF or PPTX to start, or insert content using the toolbar</p>
            </div>
          )}
        </main>
      </div>

      {/* ── BOTTOM NAV BAR ────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-white border-t border-slate-200 shrink-0">
          <button
            onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>

          {/* Progress dots */}
          <div className="flex items-center gap-1 max-w-sm overflow-hidden">
            {items.slice(Math.max(0, currentIdx - 5), currentIdx + 6).map((item, dotIdx) => {
              const realIdx = Math.max(0, currentIdx - 5) + dotIdx
              const meta = TYPE_META[item.type]
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentIdx(realIdx)}
                  className={cn(
                    "h-2 rounded-full transition-all",
                    realIdx === currentIdx ? "w-6 bg-[#1B4F8A]" : "w-2 bg-slate-200 hover:bg-slate-300"
                  )}
                  title={item.title}
                />
              )
            })}
          </div>

          <button
            onClick={() => setCurrentIdx(i => Math.min(items.length - 1, i + 1))}
            disabled={currentIdx === items.length - 1}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── LIBRARY PICKER MODAL ──────────────────────────────── */}
      {picker.open && picker.mode && (
        <LibraryPicker
          open={picker.open}
          onClose={() => setPicker({ open: false, mode: null })}
          onSelect={handleFilePicked}
          allowedTypes={pickerAllowedTypes[picker.mode] ?? []}
        />
      )}

      {/* ── YOUTUBE URL MODAL ─────────────────────────────────── */}
      {ytModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="font-semibold text-slate-800">Add YouTube / Vimeo video</h3>
            <Input
              value={ytUrl}
              onChange={e => setYtUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              autoFocus
              onKeyDown={e => e.key === "Enter" && handleInsertYoutube()}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setYtModal(false); setYtUrl("") }}>Cancel</Button>
              <Button onClick={handleInsertYoutube} disabled={!ytUrl.trim()}>Add Video</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI TITLE REVIEW PANEL ────────────────────────────────── */}
      {aiPanel && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">AI Title Suggestions</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {aiLoading
                      ? "Analyzing content… this may take 20–40 seconds"
                      : `${aiSelected.size} of ${aiSuggestions.filter(s => s.suggested_title !== s.current_title).length} selected`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setAiPanel(false); setAiSuggestions([]) }}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {aiLoading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <Loader2 className="h-10 w-10 animate-spin text-purple-300" />
                  <div className="text-center">
                    <p className="font-medium text-slate-700">Reading content…</p>
                    <p className="text-xs text-slate-400 mt-1">PDFs are analyzed page by page</p>
                  </div>
                </div>
              ) : aiSuggestions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <Sparkles className="h-10 w-10 mb-3 opacity-20" />
                  <p className="text-sm">No suggestions — add content items first</p>
                </div>
              ) : (
                <>
                  <div className="px-6 py-2.5 flex items-center justify-between bg-slate-50 sticky top-0 z-10">
                    <span className="text-xs font-medium text-slate-500">{aiSuggestions.length} items analyzed</span>
                    <button
                      className="text-xs text-purple-600 hover:underline"
                      onClick={() => {
                        const changeable = aiSuggestions.filter(s => s.suggested_title !== s.current_title).map(s => s.id)
                        const allSel = changeable.every(id => aiSelected.has(id))
                        setAiSelected(allSel ? new Set() : new Set(changeable))
                      }}
                    >
                      {aiSuggestions.filter(s => s.suggested_title !== s.current_title).every(s => aiSelected.has(s.id))
                        ? "Deselect all" : "Select all"}
                    </button>
                  </div>

                  {aiSuggestions.map((s, idx) => {
                    const meta = TYPE_META[s.type as ItemType] ?? TYPE_META["text"]
                    const Icon = meta.icon
                    const changed = s.suggested_title !== s.current_title
                    const selected = aiSelected.has(s.id)

                    return (
                      <div key={s.id} className={cn("px-6 py-3.5 flex items-start gap-3", selected && changed ? "bg-purple-50/40" : "")}>
                        <div className={cn("w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5", meta.bg)}>
                          <Icon className={cn("h-3.5 w-3.5", meta.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">
                            {idx + 1}. {meta.label}
                          </p>
                          <p className="text-xs text-slate-400 line-through leading-relaxed">{s.current_title}</p>
                          <p className={cn("text-sm font-semibold mt-1 leading-snug", changed ? "text-slate-800" : "text-slate-400 italic")}>
                            {s.suggested_title}
                          </p>
                          {!changed && <p className="text-[10px] text-slate-300 mt-0.5">No change suggested</p>}
                        </div>
                        {changed && (
                          <button
                            onClick={() => setAiSelected(prev => {
                              const n = new Set(prev)
                              n.has(s.id) ? n.delete(s.id) : n.add(s.id)
                              return n
                            })}
                            className={cn(
                              "shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors mt-1",
                              selected ? "bg-purple-600 border-purple-600 text-white" : "border-slate-300 hover:border-purple-400"
                            )}
                          >
                            {selected && <Check className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            {/* Footer */}
            {!aiLoading && aiSuggestions.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between shrink-0">
                <p className="text-sm text-slate-500">
                  {aiSelected.size} title{aiSelected.size !== 1 ? "s" : ""} will be updated
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setAiPanel(false); setAiSuggestions([]) }}>
                    Cancel
                  </Button>
                  <Button
                    onClick={applyAiSuggestions}
                    disabled={aiSelected.size === 0}
                    className="bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-40"
                  >
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                    Apply {aiSelected.size > 0 ? aiSelected.size : ""} Title{aiSelected.size !== 1 ? "s" : ""}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── WEB CONTENT URL MODAL ─────────────────────────────── */}
      {webModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-cyan-100 flex items-center justify-center">
                <Globe className="h-5 w-5 text-cyan-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Embed Web Content</h3>
                <p className="text-xs text-slate-400">Any URL will be embedded as an iframe</p>
              </div>
            </div>
            <Input
              value={webUrl}
              onChange={e => setWebUrl(e.target.value)}
              placeholder="https://example.com"
              autoFocus
              onKeyDown={e => e.key === "Enter" && handleInsertWeb()}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setWebModal(false); setWebUrl("") }}>Cancel</Button>
              <Button onClick={handleInsertWeb} disabled={!webUrl.trim()}>Embed</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
