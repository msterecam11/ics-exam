"use client"

import { use, useEffect, useRef, useState, useCallback } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import {
  ArrowLeft, Plus, ChevronDown, ChevronRight,
  Trash2, Edit2, Users, Globe, Monitor, Layers,
  Loader2, CheckCircle2, Send, Archive,
  Eye, Smartphone, Settings, UserPlus, UserX,
  MoreVertical, BarChart2, Search, X,
  GraduationCap, FlaskConical, BookOpen,
  Camera, Clock, Tag, Shield, RefreshCw, Award,
  FileText, HelpCircle, ClipboardList,
  FileVideo, Image, Link2, ListOrdered,
  MessageSquare, Star, Download, ExternalLink,
  Layers2, MoreHorizontal, Lock, GripVertical,
  ChevronUp, Sparkles,
} from "lucide-react"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// Dynamically import TipTap editor (browser-only)
const RichTextEditor = dynamic(() => import("@/components/lms/RichTextEditor").then(m => ({ default: m.RichTextEditor })), {
  ssr: false,
  loading: () => (
    <div className="border border-slate-200 rounded-xl h-48 flex items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
    </div>
  ),
})


// Dynamically import activity editor (quiz / test / exam)
const ActivityEditor = dynamic(() => import("@/components/lms/ActivityEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
    </div>
  ),
})

// Dynamically import assignment editor
const AssignmentEditor = dynamic(() => import("@/components/lms/AssignmentEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
    </div>
  ),
})

// Dynamically import module settings panel
const ModuleSettingsPanel = dynamic(() => import("@/components/lms/ModuleSettingsPanel"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
    </div>
  ),
})

// Dynamically import package editor (WYSIWYG builder)
const PackageBuilder = dynamic(() => import("@/components/lms/PackageEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
    </div>
  ),
})

// Dynamically import package reports
const PackageReports = dynamic(() => import("@/components/lms/PackageReports"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
    </div>
  ),
})


// ── Types ──────────────────────────────────────────────────────
interface Course {
  id: string; title: string; description: string | null
  overview_html: string | null; course_code: string | null
  category: string | null; thumbnail_url: string | null
  status: string; delivery_mode: string; language: string
  progress_enforcement: boolean; certificate_enabled: boolean
  final_exam_pass_mark: number | null
  start_date: string | null; end_date: string | null
  capacity: number | null; enrollment_count: number
  updated_at: string | null
  feedback_enabled: boolean; feedback_anonymous: boolean
}
interface ContentItem {
  id: string; title: string; type: string
  order_index: number; download_allowed: boolean
  is_mandatory: boolean; content?: Record<string, any>
}
interface LibraryFile {
  id: string; name: string; original_name: string
  mime_type: string; file_type?: string
  size_bytes: number; public_url: string; is_external: boolean
  created_at: string
}
interface Module {
  id: string; title: string; description: string | null
  delivery_type: string; order_index: number
  estimated_duration: number | null
  module_type: string
  content_body?: Record<string, unknown> | null
  web_url?: string | null
  library_file?: LibraryFile | null
  library_file_id?: string | null
  downloadable?: boolean
  questions?: Record<string, unknown>[] | null
  activity_settings?: Record<string, unknown> | null
  assignment_brief_html?: string | null
  assignment_rubric?: Record<string, unknown>[] | null
  assignment_submission_types?: string[] | null
  assignment_due_date?: string | null
  assignment_max_attempts?: number | null
  // Module settings
  completion_method?: string | null
  completion_time_minutes?: number | null
  completion_check?: Record<string, unknown>[] | null
  is_mandatory?: boolean
  lock_until_previous?: boolean
  available_from?: string | null
  available_until?: string | null
  show_in_progress?: boolean
  lms_content_items: ContentItem[]
  expanded?: boolean
}
interface Enrollment {
  id: string; status: string; enrolled_at: string
  completed_at: string | null; progress_pct: number; time_spent_s?: number
  lms_students: { id: string; name: string; email: string; company?: string }
}

// Seconds → compact "2h 15m" / "45m" / "30s" / "—"
function fmtTime(s?: number) {
  if (!s || s < 1) return "—"
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ""}`
  if (m > 0) return `${m}m`
  return `${s}s`
}

// ── Constants ──────────────────────────────────────────────────
const DELIVERY_ICONS: Record<string, React.ElementType> = {
  online: Globe, onsite: Monitor, hybrid: Layers,
}
const CONTENT_ICONS: Record<string, React.ElementType> = {
  video: FileVideo, ppt: FileText, pdf: FileText, text: FileText,
  image: Image, link: Link2, steps: ListOrdered, quiz: HelpCircle,
  progress_test: FlaskConical, final_exam: GraduationCap, assignment: ClipboardList,
}
const CONTENT_COLORS: Record<string, string> = {
  video: "text-purple-600 bg-purple-50", ppt: "text-orange-600 bg-orange-50",
  pdf: "text-red-600 bg-red-50", text: "text-slate-600 bg-slate-100",
  image: "text-pink-600 bg-pink-50", link: "text-blue-600 bg-blue-50",
  steps: "text-teal-600 bg-teal-50", quiz: "text-amber-600 bg-amber-50",
  progress_test: "text-blue-600 bg-blue-50", final_exam: "text-amber-700 bg-amber-100",
  assignment: "text-green-600 bg-green-50",
}
const CONTENT_TYPES = [
  { value: "video", label: "Video", group: "media" },
  { value: "ppt", label: "PowerPoint / Slides", group: "media" },
  { value: "pdf", label: "PDF Document", group: "media" },
  { value: "image", label: "Image", group: "media" },
  { value: "link", label: "External Link", group: "media" },
  { value: "text", label: "Text / Rich Content", group: "media" },
  { value: "steps", label: "Step-by-Step Guide", group: "media" },
  { value: "quiz", label: "Quiz", group: "assessment" },
  { value: "progress_test", label: "Progress Test", group: "assessment" },
  { value: "final_exam", label: "Final Exam", group: "assessment" },
  { value: "assignment", label: "Assignment", group: "assessment" },
]

type ActiveView = "overview" | "users" | "settings" | "ai-report" | string // string = module id
type SaveStatus = "saved" | "saving" | "unsaved"

// ──────────────────────────────────────────────────────────────
// MODULE TYPE CONFIG
// ──────────────────────────────────────────────────────────────
const MODULE_TYPE_GROUPS = [
  {
    key: "package",
    label: "Package",
    description: "All-in-one sequential player — slides, video, quiz, knowledge test in one flow",
    icon: "📦",
    color: "border-teal-200 bg-teal-50 hover:border-teal-400",
    activeColor: "border-teal-500 bg-teal-50 ring-2 ring-teal-300",
    badgeColor: "bg-teal-100 text-teal-700",
    types: [{ value: "package", label: "Package", icon: "📦", desc: "PDF · PPT · Video · Audio · Web · Text · Quiz · Knowledge Test" }],
  },
  {
    key: "activity",
    label: "Assessments",
    description: "Formal graded assessments",
    icon: "🎯",
    color: "border-amber-200 bg-amber-50 hover:border-amber-400",
    activeColor: "border-amber-500 bg-amber-50 ring-2 ring-amber-300",
    badgeColor: "bg-amber-100 text-amber-700",
    types: [
      { value: "final_exam",  label: "Final Exam",  icon: "🎓", desc: "End-of-course exam — timed, pass mark required" },
      { value: "assignment",  label: "Assignment",  icon: "📤", desc: "Brief + file or text submission + AI grading" },
    ],
  },
  {
    key: "live_session",
    label: "Live Session",
    description: "Schedule and manage live instructor-led sessions with attendance tracking",
    icon: "📅",
    color: "border-blue-200 bg-blue-50 hover:border-blue-400",
    activeColor: "border-blue-500 bg-blue-50 ring-2 ring-blue-300",
    badgeColor: "bg-blue-100 text-blue-700",
    types: [
      { value: "live_session", label: "Live Session", icon: "📅", desc: "Instructor-led sessions — schedule, open/close, track attendance" },
    ],
  },
] as const

export function getModuleTypeMeta(type: string) {
  for (const group of MODULE_TYPE_GROUPS) {
    const found = group.types.find(t => t.value === type)
    if (found) return { ...found, groupKey: group.key, badgeColor: group.badgeColor }
  }
  return { value: type, label: type, icon: "📦", groupKey: "standard", badgeColor: "bg-slate-100 text-slate-600" }
}

// ──────────────────────────────────────────────────────────────
// MODULE MODAL  (2-step: pick type → fill details)
// ──────────────────────────────────────────────────────────────
function ModuleModal({ open, onClose, courseId, editing, onSaved, existingTypes }: {
  open: boolean; onClose: () => void; courseId: string
  editing: Module | null; onSaved: (m: Module) => void
  existingTypes: string[]
}) {
  const [step,        setStep]        = useState<"type" | "details">("type")
  const [moduleType,  setModuleType]  = useState("package")
  const [title,       setTitle]       = useState("")
  const [description, setDescription] = useState("")
  const [delivery,    setDelivery]    = useState("online")
  const [duration,    setDuration]    = useState("")
  const [saving,      setSaving]      = useState(false)

  useEffect(() => {
    if (open) {
      if (editing) {
        // editing goes straight to details
        setStep("details")
        setModuleType(editing.module_type ?? "content")
        setTitle(editing.title)
        setDescription(editing.description ?? "")
        setDelivery(editing.delivery_type ?? "online")
        setDuration(editing.estimated_duration ? String(editing.estimated_duration) : "")
      } else {
        setStep("type")
        setModuleType("package")
        setTitle(""); setDescription(""); setDelivery("online"); setDuration("")
      }
    }
  }, [open, editing])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!title.trim()) return
    setSaving(true)
    const payload = {
      title:              title.trim(),
      description:        description.trim() || null,
      delivery_type:      delivery,
      estimated_duration: duration ? parseInt(duration) : null,
      module_type:        moduleType,
    }
    const res = editing
      ? await fetch("/api/lms/modules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, ...payload }) })
      : await fetch("/api/lms/modules", { method: "POST",  headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course_id: courseId, ...payload }) })
    const data = await res.json(); setSaving(false)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success(editing ? "Module updated" : "Module created")
    onSaved(editing
      ? { ...editing, ...data }
      : { ...data, module_type: moduleType, lms_content_items: [], expanded: true }
    )
    onClose()
  }

  const typeMeta = getModuleTypeMeta(moduleType)

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">

        {/* ── STEP 1: Type Picker ─────────────────────────────── */}
        {step === "type" && (
          <div className="flex flex-col">
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Add a module</h2>
              <p className="text-sm text-slate-500 mt-0.5">Choose the type of content this module will contain</p>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {MODULE_TYPE_GROUPS.map(group => (
                <div key={group.key}>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{group.label}</p>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {group.types.map(t => {
                      const SINGLE_USE = ["final_exam"]
                      const disabled = SINGLE_USE.includes(t.value) && existingTypes.includes(t.value)
                      return (
                        <button
                          key={t.value}
                          onClick={() => { if (!disabled) { setModuleType(t.value); setStep("details") } }}
                          disabled={disabled}
                          className={cn(
                            "text-left p-3.5 rounded-xl border-2 transition-all",
                            disabled
                              ? "opacity-40 cursor-not-allowed border-slate-200 bg-slate-50"
                              : cn("hover:shadow-sm", group.color),
                          )}
                        >
                          <span className="text-xl mb-2 block">{t.icon}</span>
                          <p className="font-semibold text-slate-800 text-sm">{t.label}</p>
                          {"desc" in t && <p className="text-xs text-slate-500 mt-0.5 leading-snug">{t.desc}</p>}
                          {disabled && <p className="text-xs text-slate-400 mt-1 font-medium">Already added</p>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 pb-5 border-t border-slate-100 pt-4 flex justify-end">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Details ─────────────────────────────────── */}
        {step === "details" && (
          <form onSubmit={submit} className="flex flex-col">
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center gap-3">
              {!editing && (
                <button type="button" onClick={() => setStep("type")}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base">{typeMeta.icon}</span>
                  <h2 className="text-lg font-bold text-slate-900">
                    {editing ? "Edit Module" : typeMeta.label}
                  </h2>
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", typeMeta.badgeColor)}>
                    {typeMeta.label}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-0.5">
                  {editing ? "Update module details" : "Give this module a title and optional details"}
                </p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <Label>Title <span className="text-red-500">*</span></Label>
                <Input
                  value={title} onChange={e => setTitle(e.target.value)}
                  placeholder={`e.g. ${typeMeta.icon} Introduction to Safety`}
                  autoFocus required
                />
              </div>
              <div className="space-y-1">
                <Label>Description <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief summary shown in the sidebar" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Delivery</Label>
                  <select value={delivery} onChange={e => setDelivery(e.target.value)}
                    className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm">
                    <option value="online">Online</option>
                    <option value="onsite">On-site</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Duration (min)</Label>
                  <Input type="number" min={1} value={duration} onChange={e => setDuration(e.target.value)} placeholder="45" />
                </div>
              </div>
            </div>

            <div className="px-6 pb-5 border-t border-slate-100 pt-4 flex justify-between items-center">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving || !title.trim()} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
                {saving
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><Plus className="h-4 w-4" />{editing ? "Save Changes" : "Create Module"}</>
                }
              </Button>
            </div>
          </form>
        )}

      </DialogContent>
    </Dialog>
  )
}

// ──────────────────────────────────────────────────────────────
// CONTENT MODAL
// ──────────────────────────────────────────────────────────────
function ContentModal({ open, onClose, moduleId, editing, onSaved, defaultType }: {
  open: boolean; onClose: () => void; moduleId: string
  editing: ContentItem | null; onSaved: (c: ContentItem) => void
  defaultType?: string
}) {
  const [title, setTitle] = useState(""); const [type, setType] = useState(defaultType ?? "video")
  const [url, setUrl] = useState(""); const [download, setDownload] = useState(false)
  const [isMandatory, setIsMandatory] = useState(true); const [saving, setSaving] = useState(false)
  const [quizzes, setQuizzes] = useState<{ id: string; title: string; question_count: number }[]>([])
  const [selQuizId, setSelQuizId] = useState(""); const [loadingQz, setLoadingQz] = useState(false)
  const [assignInstructions, setAssignInstructions] = useState("")
  const [assignMaxScore, setAssignMaxScore] = useState("100")
  const [assignAllowText, setAssignAllowText] = useState(true)
  const [assignAllowFile, setAssignAllowFile] = useState(true)

  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? ""); setType(editing?.type ?? defaultType ?? "video")
      setUrl(editing?.content?.url ?? ""); setDownload(editing?.download_allowed ?? false)
      setIsMandatory(editing?.is_mandatory ?? true); setSelQuizId(editing?.content?.quiz_id ?? "")
      if (editing?.type === "assignment") {
        setAssignInstructions(editing.content?.instructions ?? "")
        setAssignMaxScore(editing.content?.max_score ? String(editing.content.max_score) : "100")
        setAssignAllowText(editing.content?.allow_text !== false)
        setAssignAllowFile(editing.content?.allow_file !== false)
      }
    }
  }, [open, editing])

  const isQuizLike  = ["quiz", "progress_test", "final_exam"].includes(type)
  const isAssignment = type === "assignment"
  const needsUrl    = ["video", "ppt", "pdf", "image", "link"].includes(type)

  useEffect(() => {
    if (isQuizLike && quizzes.length === 0) {
      setLoadingQz(true)
      fetch("/api/lms/quizzes").then(r => r.json()).then(data => { setQuizzes(Array.isArray(data) ? data : []); setLoadingQz(false) })
    }
  }, [isQuizLike, quizzes.length])

  function buildContent() {
    if (type === "video")  return { url }
    if (type === "ppt")    return { url }
    if (type === "pdf")    return { url }
    if (type === "image")  return { url }
    if (type === "link")   return { url, open_in_tab: true }
    if (type === "text")   return editing?.content ?? { html_en: "", html_ar: "" }
    if (type === "steps")  return editing?.content ?? { steps: [] }
    if (isQuizLike)        return { quiz_id: selQuizId }
    if (isAssignment)      return { instructions: assignInstructions.trim() || null, max_score: assignMaxScore ? parseFloat(assignMaxScore) : null, allow_text: assignAllowText, allow_file: assignAllowFile }
    return {}
  }

  const canSubmit = title.trim() && (!needsUrl || url) && (!isQuizLike || selQuizId)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!canSubmit) return; setSaving(true)
    const res = editing
      ? await fetch("/api/lms/content", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, title: title.trim(), download_allowed: download, is_mandatory: isMandatory, content: buildContent() }) })
      : await fetch("/api/lms/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module_id: moduleId, title: title.trim(), type, content: buildContent(), download_allowed: download, is_mandatory: isMandatory, completion_rule: { type: isQuizLike ? "quiz" : "click" } }) })
    const data = await res.json(); setSaving(false)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    if (!editing && isQuizLike && selQuizId) {
      await fetch("/api/lms/quizzes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selQuizId, content_item_id: data.id }) })
    }
    toast.success(editing ? "Updated" : "Added"); onSaved(data); onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit Content" : "Add Content"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Title <span className="text-red-500">*</span></Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label>Type {editing && <span className="text-slate-400 text-xs ml-1">(cannot change)</span>}</Label>
            <select value={type} onChange={e => { if (!editing) { setType(e.target.value); setSelQuizId("") } }} disabled={!!editing} className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm disabled:opacity-60">
              <optgroup label="Media & Learning">
                {CONTENT_TYPES.filter(t => t.group === "media").map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </optgroup>
              <optgroup label="Assessments">
                {CONTENT_TYPES.filter(t => t.group === "assessment").map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </optgroup>
            </select>
          </div>
          {needsUrl && (
            <div className="space-y-1">
              <Label>URL <span className="text-red-500">*</span></Label>
              <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
            </div>
          )}
          {isAssignment && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Instructions</Label>
                <textarea value={assignInstructions} onChange={e => setAssignInstructions(e.target.value)} rows={3} className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm resize-none" />
              </div>
              <div className="flex gap-3 items-end">
                <div className="flex-1 space-y-1">
                  <Label>Max Score</Label>
                  <Input type="number" min={0} value={assignMaxScore} onChange={e => setAssignMaxScore(e.target.value)} />
                </div>
                <div className="space-y-2 pb-1">
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" checked={assignAllowText} onChange={e => setAssignAllowText(e.target.checked)} /> Text</label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" checked={assignAllowFile} onChange={e => setAssignAllowFile(e.target.checked)} /> File</label>
                </div>
              </div>
            </div>
          )}
          {isQuizLike && (
            <div className="space-y-1">
              <Label>Quiz <span className="text-red-500">*</span></Label>
              {loadingQz ? <div className="text-sm text-slate-400">Loading…</div>
              : quizzes.length === 0 ? <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded">No quizzes found. <a href="/lms-admin/quizzes" target="_blank" className="underline">Create one →</a></p>
              : <select value={selQuizId} onChange={e => setSelQuizId(e.target.value)} required disabled={!!editing} className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm">
                  <option value="">— Choose —</option>
                  {quizzes.map(q => <option key={q.id} value={q.id}>{q.title} ({q.question_count}q)</option>)}
                </select>}
            </div>
          )}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={isMandatory} onChange={e => setIsMandatory(e.target.checked)} /> Mandatory</label>
            {!isQuizLike && !isAssignment && <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={download} onChange={e => setDownload(e.target.checked)} /> Download</label>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !canSubmit} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ──────────────────────────────────────────────────────────────
// ENROLL MODAL
// ──────────────────────────────────────────────────────────────
function EnrollModal({ open, onClose, courseId, onEnrolled }: {
  open: boolean; onClose: () => void; courseId: string; onEnrolled: () => void
}) {
  const [students, setStudents] = useState<any[]>([]); const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState(""); const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false); const [enrolled, setEnrolled] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    Promise.all([
      fetch(`/api/lms/students?limit=200`).then(r => r.json()),
      fetch(`/api/lms/enrollments?course_id=${courseId}`).then(r => r.json()),
    ]).then(([s, e]) => {
      setStudents(s.students ?? [])
      // Only currently-active/completed students are locked as "Enrolled".
      // Unenrolled (dropped) students stay selectable so they can be re-enrolled.
      setEnrolled(new Set((e ?? []).filter((en: any) => en.status !== "dropped").map((en: any) => en.lms_students?.id).filter(Boolean)))
      setLoading(false)
    })
  }, [open, courseId])

  const filtered = students.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase()))
  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function enroll() {
    if (!selected.size) return; setEnrolling(true)
    const res = await fetch("/api/lms/enrollments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course_id: courseId, student_ids: [...selected] }) })
    const data = await res.json(); setEnrolling(false)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success(`${data.enrolled} student(s) enrolled`); onEnrolled(); onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Enroll Students</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Input placeholder="Search students…" value={search} onChange={e => setSearch(e.target.value)} />
          {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
          : <div className="max-h-72 overflow-y-auto space-y-1 border rounded-lg p-2">
              {filtered.map(s => {
                const isEnrolled = enrolled.has(s.id)
                return (
                  <label key={s.id} className={cn("flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer", isEnrolled ? "opacity-40 cursor-not-allowed" : "hover:bg-slate-50", selected.has(s.id) && "bg-blue-50")}>
                    <input type="checkbox" checked={selected.has(s.id) || isEnrolled} disabled={isEnrolled} onChange={() => !isEnrolled && toggle(s.id)} />
                    <div className="w-7 h-7 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] text-xs font-bold flex items-center justify-center shrink-0">{s.name[0]?.toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}{isEnrolled && <span className="ml-2 text-xs text-emerald-600">Enrolled</span>}</p>
                      <p className="text-xs text-slate-400 truncate">{s.email}</p>
                    </div>
                  </label>
                )
              })}
            </div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!selected.size || enrolling} onClick={enroll} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
            {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : `Enroll ${selected.size || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ──────────────────────────────────────────────────────────────
// TEST AS STUDENT MODAL
// ──────────────────────────────────────────────────────────────
function TestAsStudentModal({ open, onClose, courseId }: { open: boolean; onClose: () => void; courseId: string }) {
  const [students, setStudents] = useState<any[]>([]); const [loading, setLoading] = useState(true)
  const [launching, setLaunching] = useState<string | null>(null); const [search, setSearch] = useState("")

  useEffect(() => {
    if (!open) return; setLoading(true)
    fetch(`/api/lms/enrollments?course_id=${courseId}`).then(r => r.json()).then(data => {
      setStudents(Array.isArray(data) ? data.map((e: any) => e.lms_students).filter(Boolean) : []); setLoading(false)
    })
  }, [open, courseId])

  async function launch(studentId: string) {
    setLaunching(studentId)
    const res = await fetch("/api/lms/admin/preview-as", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student_id: studentId, course_id: courseId }) })
    const data = await res.json(); setLaunching(null)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success(`Opening as ${data.student_name}…`); window.open(data.redirect_url, "_blank"); onClose()
  }

  const filtered = students.filter(s => !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase()))

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-[#1B4F8A]" /> Test as Student</DialogTitle></DialogHeader>
        <div className="py-2 space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800"><p className="font-medium">Opens the student portal in a new tab logged in as that student.</p><p className="text-xs text-blue-600 mt-0.5">Session lasts 2 hours.</p></div>
          <Input placeholder="Search enrolled students…" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="max-h-64 overflow-y-auto space-y-1 border rounded-xl p-2">
            {loading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
            : filtered.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">{students.length === 0 ? "No students enrolled" : "No match"}</p>
            : filtered.map(s => (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50">
                <div className="w-8 h-8 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] font-bold text-sm flex items-center justify-center shrink-0">{s.name?.[0]?.toUpperCase()}</div>
                <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{s.name}</p><p className="text-xs text-slate-400 truncate">{s.email}</p></div>
                <Button size="sm" onClick={() => launch(s.id)} disabled={!!launching} className="gap-1.5 h-7 text-xs bg-[#1B4F8A] hover:bg-[#163f6e] text-white shrink-0">
                  {launching === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />} Open
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ──────────────────────────────────────────────────────────────
// ASSIGNMENT SUBMISSIONS MODAL
// ──────────────────────────────────────────────────────────────
function AssignmentSubmissionsModal({ open, onClose, item, courseId }: {
  open: boolean; onClose: () => void; item: ContentItem | null; courseId: string
}) {
  const [submissions, setSubmissions] = useState<any[]>([]); const [loading, setLoading] = useState(true)
  const [grading, setGrading] = useState<string | null>(null)
  const [scoreInput, setScoreInput] = useState(""); const [feedInput, setFeedInput] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !item) return; setLoading(true)
    fetch(`/api/lms/assignments?content_item_id=${item.id}`).then(r => r.json()).then(data => { setSubmissions(Array.isArray(data) ? data : []); setLoading(false) })
  }, [open, item])

  async function grade(subId: string) {
    setSaving(true)
    const res = await fetch("/api/lms/assignments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: subId, status: "graded", score: scoreInput ? parseFloat(scoreInput) : null, feedback: feedInput.trim() || null }) })
    const data = await res.json(); setSaving(false)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    setSubmissions(prev => prev.map(s => s.id === subId ? data : s)); setGrading(null); toast.success("Graded!")
  }

  const maxScore = item?.content?.max_score ?? null
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader><DialogTitle>Submissions — {item?.title}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
          : submissions.length === 0 ? <div className="text-center py-10 text-slate-400"><ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-30" /><p>No submissions yet</p></div>
          : submissions.map(sub => {
            const student = sub.lms_students ?? {}; const isGrading = grading === sub.id
            return (
              <div key={sub.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b">
                  <div className="w-8 h-8 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] font-bold text-sm flex items-center justify-center shrink-0">{student.name?.[0]?.toUpperCase() ?? "?"}</div>
                  <div className="flex-1 min-w-0"><p className="font-medium text-slate-900 text-sm">{student.name}</p><p className="text-xs text-slate-500">{student.email}</p></div>
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", sub.status === "graded" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{sub.status}</span>
                  <p className="text-xs text-slate-400">{new Date(sub.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
                </div>
                <div className="px-4 py-3 space-y-2">
                  {sub.text_response && <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-line max-h-32 overflow-y-auto">{sub.text_response}</p>}
                  {sub.file_url && <a href={sub.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-[#1B4F8A] hover:underline"><Download className="h-3.5 w-3.5" /> {sub.file_name ?? "Download"}</a>}
                </div>
                {isGrading ? (
                  <div className="px-4 pb-4 space-y-2 border-t pt-3">
                    <div className="flex gap-2 items-start">
                      <div className="flex-1"><Label className="text-xs">Feedback</Label><textarea value={feedInput} onChange={e => setFeedInput(e.target.value)} rows={2} className="w-full mt-1 rounded-lg border px-3 py-2 text-sm resize-none" /></div>
                      {maxScore && <div className="w-24 shrink-0"><Label className="text-xs">Score/{maxScore}</Label><Input type="number" min={0} max={maxScore} value={scoreInput} onChange={e => setScoreInput(e.target.value)} className="mt-1 h-9" /></div>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => grade(sub.id)} disabled={saving} className="bg-[#1B4F8A] text-white gap-1.5">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setGrading(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 pb-3 flex items-center justify-between border-t pt-2">
                    {sub.status === "graded" ? <div className="text-sm">Score: <strong>{sub.score ?? "—"}{maxScore ? `/${maxScore}` : ""}</strong></div> : <div />}
                    <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => { setGrading(sub.id); setScoreInput(sub.score ? String(sub.score) : ""); setFeedInput(sub.feedback ?? "") }}>
                      <Star className="h-3 w-3" /> {sub.status === "graded" ? "Re-grade" : "Grade"}
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ──────────────────────────────────────────────────────────────
// COURSE OVERVIEW EDITOR  (Phase 1 — main deliverable)
// ──────────────────────────────────────────────────────────────
function CourseOverviewEditor({ course, onCourseChange, onSaveStatus }: {
  course: Course
  onCourseChange: (updates: Partial<Course>) => void
  onSaveStatus: (s: SaveStatus) => void
}) {
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const saveTimer      = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [uploading, setUploading] = useState(false)

  // Debounced auto-save
  const scheduleAutoSave = useCallback((patch: Partial<Course>) => {
    onSaveStatus("unsaved")
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      onSaveStatus("saving")
      const res = await fetch("/api/lms/courses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: course.id, ...patch }),
      })
      onSaveStatus(res.ok ? "saved" : "unsaved")
    }, 1500)
  }, [course.id, onSaveStatus])

  function handleFieldChange(key: keyof Course, value: string) {
    onCourseChange({ [key]: value })
    scheduleAutoSave({ [key]: value })
  }

  // Cover upload
  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const fd = new FormData(); fd.append("file", file); fd.append("course_id", course.id)
    const res  = await fetch("/api/lms/courses/cover", { method: "POST", body: fd })
    const data = await res.json(); setUploading(false)
    if (!res.ok) { toast.error(data.error ?? "Upload failed"); return }
    onCourseChange({ thumbnail_url: data.url })
    toast.success("Cover updated")
  }

  return (
    <div className="max-w-3xl mx-auto pb-16">

      {/* ── Cover photo ─────────────────────────────────────── */}
      <div
        className={cn(
          "relative w-full rounded-2xl overflow-hidden mb-8 group cursor-pointer",
          "border-2 border-dashed border-slate-200 transition-colors hover:border-[#1B4F8A]/40",
          course.thumbnail_url ? "h-56 border-solid" : "h-40 bg-slate-50"
        )}
        onClick={() => fileInputRef.current?.click()}
      >
        {course.thumbnail_url ? (
          <img src={course.thumbnail_url} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
            <Camera className="h-8 w-8" />
            <p className="text-sm font-medium">Click to add cover photo</p>
            <p className="text-xs">JPEG, PNG, WebP · max 10 MB</p>
          </div>
        )}

        {/* Hover overlay */}
        <div className={cn(
          "absolute inset-0 bg-black/30 flex items-center justify-center gap-3",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          !course.thumbnail_url && "hidden",
        )}>
          {uploading ? <Loader2 className="h-6 w-6 text-white animate-spin" />
          : <div className="flex items-center gap-2 bg-white/90 text-slate-800 text-sm font-medium px-4 py-2 rounded-full shadow">
              <Camera className="h-4 w-4" /> Change Cover
            </div>}
        </div>

        {uploading && !course.thumbnail_url && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 text-[#1B4F8A] animate-spin" />
          </div>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />

      {/* ── Course title ─────────────────────────────────────── */}
      <input
        type="text"
        value={course.title}
        onChange={e => handleFieldChange("title", e.target.value)}
        placeholder="Course Title"
        className="w-full text-3xl font-bold text-slate-900 bg-transparent border-none outline-none placeholder:text-slate-300 mb-2 font-['Plus_Jakarta_Sans',sans-serif]"
      />

      {/* ── Code + Category + Delivery row ───────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <input
          type="text"
          value={course.course_code ?? ""}
          onChange={e => handleFieldChange("course_code", e.target.value)}
          placeholder="Course Code (e.g. RFFS-01)"
          className="text-sm font-mono bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 placeholder:text-slate-400 w-44"
        />
        <input
          type="text"
          value={course.category ?? ""}
          onChange={e => handleFieldChange("category", e.target.value)}
          placeholder="Category / Path"
          className="text-sm bg-blue-50 border border-blue-100 rounded-full px-3 py-1.5 text-slate-600 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 placeholder:text-slate-400 w-44"
        />
        <div className="flex items-center gap-1.5 text-sm text-slate-500 bg-slate-100 rounded-full px-3 py-1.5">
          {(() => { const Icon = DELIVERY_ICONS[course.delivery_mode] ?? Globe; return <Icon className="h-3.5 w-3.5" /> })()}
          <span className="capitalize">{course.delivery_mode}</span>
        </div>
        {course.certificate_enabled && (
          <div className="flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 rounded-full px-3 py-1.5">
            <GraduationCap className="h-3.5 w-3.5" /> Certificate
          </div>
        )}
      </div>

      {/* ── Short description ─────────────────────────────────── */}
      <div className="mb-6">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Short Description</label>
        <textarea
          value={course.description ?? ""}
          onChange={e => handleFieldChange("description", e.target.value)}
          rows={2}
          placeholder="A brief summary shown on the course card (plain text)…"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 resize-none"
        />
      </div>

      {/* ── Overview body (Rich Text) ─────────────────────────── */}
      <div className="mb-2">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Course Overview</label>
        <RichTextEditor
          content={course.overview_html ?? ""}
          onChange={html => {
            onCourseChange({ overview_html: html })
            scheduleAutoSave({ overview_html: html })
          }}
          placeholder="Write a detailed overview of this course — objectives, what students will learn, structure…"
          minHeight={360}
        />
      </div>
      <p className="text-xs text-slate-400 mt-2 ml-1">
        Supports headings, bullet points, bold/italic, links and more. Changes auto-save.
      </p>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// MODULE CONTENT VIEW  (content items accordion)
// ──────────────────────────────────────────────────────────────
function ModuleContentView({ mod, onAddContent, onEditContent, onDeleteContent }: {
  mod: Module
  onAddContent: (moduleId: string) => void
  onEditContent: (item: ContentItem, moduleId: string) => void
  onDeleteContent: (moduleId: string, itemId: string) => void
}) {
  return (
    <div className="max-w-3xl mx-auto pb-16">
      {/* Module header */}
      <div className="mb-8">
        <p className="text-xs font-semibold text-[#1B4F8A] uppercase tracking-wider mb-1">Module</p>
        <h2 className="text-2xl font-bold text-slate-900">{mod.title}</h2>
        {mod.description && <p className="text-slate-500 mt-1">{mod.description}</p>}
        <div className="flex items-center gap-3 mt-2 text-sm text-slate-400">
          {mod.estimated_duration && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{mod.estimated_duration} min</span>}
          <span className="capitalize flex items-center gap-1">
            {(() => { const Icon = DELIVERY_ICONS[mod.delivery_type] ?? Globe; return <><Icon className="h-3.5 w-3.5" />{mod.delivery_type}</> })()}
          </span>
        </div>
      </div>

      {/* Content items */}
      {mod.lms_content_items.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
          <BookOpen className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">This module is empty</p>
          <p className="text-sm text-slate-400 mt-1 mb-5">Add videos, PDFs, quizzes, assignments and more</p>
          <Button onClick={() => onAddContent(mod.id)} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
            <Plus className="h-4 w-4" /> Add First Content Item
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {mod.lms_content_items.sort((a, b) => a.order_index - b.order_index).map((item, ci) => {
            const Icon  = CONTENT_ICONS[item.type] ?? FileText
            const color = CONTENT_COLORS[item.type] ?? "text-slate-600 bg-slate-100"
            return (
              <div key={item.id} className="bg-white rounded-xl border border-slate-200 flex items-center gap-3 px-4 py-3.5 hover:shadow-sm transition-shadow group">
                <span className="text-xs text-slate-300 w-5 text-right shrink-0">{ci + 1}</span>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800">{item.title}</p>
                  <p className="text-xs text-slate-400 capitalize mt-0.5">{item.type.replace("_", " ")}{!item.is_mandatory && " · Optional"}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onEditContent(item, mod.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-[#1B4F8A] hover:bg-[#1B4F8A]/5 transition-colors">
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => onDeleteContent(mod.id, item.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
          <button onClick={() => onAddContent(mod.id)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:text-[#1B4F8A] hover:border-[#1B4F8A]/40 transition-all text-sm font-medium">
            <Plus className="h-4 w-4" /> Add content item
          </button>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// USERS TAB
// ──────────────────────────────────────────────────────────────
function UsersTab({ courseId, onEnroll, refreshKey }: { courseId: string; onEnroll: () => void; refreshKey: number }) {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [dropping, setDropping] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/lms/enrollments?course_id=${courseId}`).then(r => r.json())
      .then(data => { setEnrollments(Array.isArray(data) ? data : []); setLoading(false) })
  }, [courseId, refreshKey])

  async function unenrollStudent(enrollmentId: string) {
    if (!confirm("Unenroll this student from the course? Their progress is kept and they can be re-enrolled anytime.")) return; setDropping(enrollmentId)
    const res = await fetch("/api/lms/enrollments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: enrollmentId, status: "dropped" }) })
    setDropping(null)
    if (!res.ok) { toast.error("Failed"); return }
    setEnrollments(prev => prev.map(e => e.id === enrollmentId ? { ...e, status: "dropped" } : e))
    toast.success("Student unenrolled")
  }

  async function reEnrollStudent(enrollmentId: string) {
    setDropping(enrollmentId)
    const res = await fetch("/api/lms/enrollments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: enrollmentId, status: "active" }) })
    setDropping(null)
    if (!res.ok) { toast.error("Failed"); return }
    setEnrollments(prev => prev.map(e => e.id === enrollmentId ? { ...e, status: "active" } : e))
    toast.success("Student re-enrolled")
  }

  async function resetStudent(enrollmentId: string, studentId: string, name: string) {
    if (!confirm(`Remove ${name} from this course and DELETE all their progress (packages, exams, assignments)? Their certificate is kept. This cannot be undone. If you enroll them again, they start from scratch.`)) return
    setDropping(enrollmentId)
    const res = await fetch("/api/lms/enrollments/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course_id: courseId, student_id: studentId }) })
    setDropping(null)
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? "Failed"); return }
    setEnrollments(prev => prev.filter(e => e.id !== enrollmentId))
    toast.success(`${name} removed and progress reset`)
  }

  const filtered = enrollments.filter(e => !search || e.lms_students?.name?.toLowerCase().includes(search.toLowerCase()) || e.lms_students?.email?.toLowerCase().includes(search.toLowerCase()))
  const stats = { total: enrollments.length, active: enrollments.filter(e => e.status === "active").length, completed: enrollments.filter(e => e.status === "completed").length, avg: enrollments.length > 0 ? Math.round(enrollments.reduce((a, e) => a + e.progress_pct, 0) / enrollments.length) : 0 }

  return (
    <div className="max-w-4xl pb-16 space-y-5">
      <div className="grid grid-cols-4 gap-3">
        {[["Total", stats.total, "text-slate-800"], ["Active", stats.active, "text-blue-700"], ["Completed", stats.completed, "text-emerald-700"], ["Avg. Progress", `${stats.avg}%`, "text-amber-700"]].map(([l, v, c]) => (
          <div key={l as string} className="bg-white rounded-xl border p-4"><p className={cn("text-2xl font-bold", c as string)}>{v}</p><p className="text-xs text-slate-500 mt-0.5">{l}</p></div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input placeholder="Search students…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        <Button onClick={onEnroll} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2 h-9 shrink-0">
          <UserPlus className="h-4 w-4" /> Enroll Students
        </Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>
      : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed py-16 text-center">
          <Users className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">{enrollments.length === 0 ? "No students enrolled" : "No match"}</p>
          {enrollments.length === 0 && <Button onClick={onEnroll} className="mt-4 bg-[#1B4F8A] text-white gap-2"><UserPlus className="h-4 w-4" /> Enroll First Student</Button>}
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="grid grid-cols-[1fr_140px_70px_90px_100px_100px_72px] gap-0 border-b bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Student</span><span>Progress</span><span>Time</span><span>Status</span><span>Enrolled</span><span>Completed</span><span />
          </div>
          <div className="divide-y divide-slate-50">
            {filtered.map(enr => {
              const s = enr.lms_students
              return (
                <div key={enr.id} className="grid grid-cols-[1fr_140px_70px_90px_100px_100px_72px] gap-0 px-4 py-3 items-center hover:bg-slate-50/50">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] font-bold text-xs flex items-center justify-center shrink-0">{s?.name?.[0]?.toUpperCase() ?? "?"}</div>
                    <div className="min-w-0"><p className="text-sm font-medium truncate">{s?.name}</p><p className="text-xs text-slate-400 truncate">{s?.email}</p></div>
                  </div>
                  <div className="flex items-center gap-2 pr-3">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", enr.progress_pct >= 100 ? "bg-emerald-500" : "bg-[#1B4F8A]")} style={{ width: `${enr.progress_pct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-600 w-8 text-right">{enr.progress_pct}%</span>
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums" title="Total active time on this course">{fmtTime(enr.time_spent_s)}</span>
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full inline-block", { "bg-emerald-100 text-emerald-700": enr.status === "completed", "bg-blue-100 text-blue-700": enr.status === "active", "bg-slate-100 text-slate-500": enr.status === "dropped" || !["completed","active","dropped"].includes(enr.status) })}>{enr.status === "dropped" ? "unenrolled" : enr.status}</span>
                  <p className="text-xs text-slate-500">{new Date(enr.enrolled_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })}</p>
                  <p className="text-xs text-slate-500">{enr.completed_at ? new Date(enr.completed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—"}</p>
                  <div className="flex justify-end gap-1">
                    {s?.id && (
                      <Link href={`/lms-admin/students/${s.id}`} className="p-1.5 rounded text-slate-300 hover:text-[#1B4F8A] hover:bg-[#1B4F8A]/10 transition-colors" title="View Progress">
                        <Eye className="h-3.5 w-3.5" />
                      </Link>
                    )}
                    {enr.status === "dropped" ? (
                      <button onClick={() => reEnrollStudent(enr.id)} disabled={dropping === enr.id} className="p-1.5 rounded text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Re-enroll (keeps progress)">
                        {dropping === enr.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                      </button>
                    ) : (
                      <button onClick={() => unenrollStudent(enr.id)} disabled={dropping === enr.id} className="p-1.5 rounded text-slate-300 hover:text-amber-600 hover:bg-amber-50 transition-colors" title="Unenroll (keeps progress, can resume)">
                        {dropping === enr.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {s?.id && (
                      <button onClick={() => resetStudent(enr.id, s.id, s.name ?? "this student")} disabled={dropping === enr.id} className="p-1.5 rounded text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors" title="Remove & reset progress (start from scratch)">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// SETTINGS TAB
// ──────────────────────────────────────────────────────────────
function SettingsTab({ course, onSaved }: { course: Course; onSaved: (c: Course) => void }) {
  const [form, setForm] = useState({
    ...course,
    feedback_enabled:    !!course.feedback_enabled,
    feedback_anonymous:  !!course.feedback_anonymous,
    progress_enforcement: !!course.progress_enforcement,
    certificate_enabled:  !!course.certificate_enabled,
    certificate_auto_release: !!(course as any).certificate_auto_release,
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: any) => setForm(prev => ({ ...prev, [k]: v }))

  async function save() {
    setSaving(true)
    const res = await fetch("/api/lms/courses", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: course.id, title: form.title, description: form.description, course_code: form.course_code, category: form.category, delivery_mode: form.delivery_mode, progress_enforcement: form.progress_enforcement, certificate_enabled: form.certificate_enabled, certificate_auto_release: form.certificate_auto_release, final_exam_pass_mark: form.final_exam_pass_mark, start_date: form.start_date || null, end_date: form.end_date || null, capacity: form.capacity, feedback_enabled: form.feedback_enabled, feedback_anonymous: form.feedback_anonymous }),
    })
    const data = await res.json(); setSaving(false)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success("Settings saved"); onSaved({ ...course, ...form })
  }

  return (
    <div className="max-w-2xl pb-16 space-y-6">
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><BookOpen className="h-4 w-4 text-[#1B4F8A]" /> Basic Information</h3>
        <div className="space-y-1"><Label>Course Title</Label><Input value={form.title ?? ""} onChange={e => set("title", e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Course Code</Label><Input value={form.course_code ?? ""} onChange={e => set("course_code", e.target.value)} placeholder="RFFS-01" /></div>
          <div className="space-y-1"><Label>Category</Label><Input value={form.category ?? ""} onChange={e => set("category", e.target.value)} placeholder="Aviation Safety" /></div>
        </div>
        <div className="space-y-1"><Label>Short Description</Label><textarea value={form.description ?? ""} onChange={e => set("description", e.target.value)} rows={3} className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none" /></div>
        <div className="space-y-1"><Label>Thumbnail URL</Label><Input value={form.thumbnail_url ?? ""} onChange={e => set("thumbnail_url", e.target.value)} placeholder="Or upload via cover photo on Overview tab" /></div>
      </div>
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><Globe className="h-4 w-4 text-[#1B4F8A]" /> Delivery & Access</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Delivery Mode</Label><select value={form.delivery_mode} onChange={e => set("delivery_mode", e.target.value)} className="w-full h-9 rounded-lg border bg-transparent px-3 text-sm"><option value="online">Online</option><option value="onsite">On-site</option><option value="hybrid">Hybrid</option></select></div>
          <div className="space-y-1"><Label>Capacity</Label><Input type="number" min={1} value={form.capacity ?? ""} onChange={e => set("capacity", e.target.value ? parseInt(e.target.value) : null)} placeholder="Unlimited" /></div>
          <div className="space-y-1"><Label>Start Date</Label><Input type="date" value={form.start_date ?? ""} onChange={e => set("start_date", e.target.value || null)} /></div>
          <div className="space-y-1"><Label>End Date</Label><Input type="date" value={form.end_date ?? ""} onChange={e => set("end_date", e.target.value || null)} /></div>
        </div>
      </div>
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><GraduationCap className="h-4 w-4 text-[#1B4F8A]" /> Learning & Completion</h3>
        <label className="flex items-start gap-3 cursor-pointer bg-slate-50 rounded-lg p-3"><input type="checkbox" checked={form.progress_enforcement} onChange={e => set("progress_enforcement", e.target.checked)} className="mt-0.5" /><div><p className="text-sm font-medium">Sequential progress enforcement</p><p className="text-xs text-slate-500 mt-0.5">Students must complete each item before the next</p></div></label>
        <label className="flex items-start gap-3 cursor-pointer bg-slate-50 rounded-lg p-3"><input type="checkbox" checked={form.certificate_enabled} onChange={e => set("certificate_enabled", e.target.checked)} className="mt-0.5" /><div><p className="text-sm font-medium">Issue certificate on completion</p><p className="text-xs text-slate-500 mt-0.5">Students receive a certificate when they pass the final exam</p></div></label>
        {form.certificate_enabled && (
          <label className="flex items-start gap-3 cursor-pointer bg-slate-50 rounded-lg p-3 ml-6"><input type="checkbox" checked={form.certificate_auto_release} onChange={e => set("certificate_auto_release", e.target.checked)} className="mt-0.5" /><div><p className="text-sm font-medium">Auto-release certificate</p><p className="text-xs text-slate-500 mt-0.5">Release immediately on completion. Unchecked = hold until an admin releases it.</p></div></label>
        )}
        <div className="space-y-1"><Label>Final Exam Pass Mark (%)</Label><Input type="number" min={0} max={100} value={form.final_exam_pass_mark ?? 70} onChange={e => set("final_exam_pass_mark", parseInt(e.target.value))} className="w-32" /></div>
      </div>
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4 text-[#1B4F8A]" /> Course Feedback</h3>
        <label className="flex items-start gap-3 cursor-pointer bg-slate-50 rounded-lg p-3">
          <input type="checkbox" checked={form.feedback_enabled} onChange={e => set("feedback_enabled", e.target.checked)} className="mt-0.5" />
          <div>
            <p className="text-sm font-medium">Enable feedback form</p>
            <p className="text-xs text-slate-500 mt-0.5">Students see a feedback form after completing the course</p>
          </div>
        </label>
        {form.feedback_enabled && (
          <div className="space-y-2 pl-1">
            <p className="text-xs font-semibold text-slate-600">Response type</p>
            <div className="flex gap-3">
              <label className={cn("flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-lg border text-sm transition-colors", !form.feedback_anonymous ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium" : "border-border text-slate-600 hover:bg-slate-50")}>
                <input type="radio" name="fb_anon" checked={!form.feedback_anonymous} onChange={() => set("feedback_anonymous", false)} className="hidden" />
                With Names
              </label>
              <label className={cn("flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-lg border text-sm transition-colors", form.feedback_anonymous ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium" : "border-border text-slate-600 hover:bg-slate-50")}>
                <input type="radio" name="fb_anon" checked={form.feedback_anonymous} onChange={() => set("feedback_anonymous", true)} className="hidden" />
                Anonymous
              </label>
            </div>
            <p className="text-xs text-slate-400">
              {form.feedback_anonymous ? "Student names will be hidden in the feedback report." : "Student names will be visible to admins in the feedback report."}
            </p>
          </div>
        )}
      </div>
      <Button onClick={save} disabled={saving || !form.title?.trim()} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Save Settings</>}
      </Button>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// MODULE CANVAS — routes to correct editor based on module_type
// ──────────────────────────────────────────────────────────────

function ModuleContentEditor({ mod, courseId }: { mod: Module; courseId: string }) {
  const type = mod.module_type ?? "content"
  const meta = getModuleTypeMeta(type)

  function ComingSoon({ label, icon, description }: { label: string; icon: string; description: string }) {
    return (
      <div className="max-w-3xl mx-auto pb-20">
        <div className="mb-8 pb-6 border-b border-slate-100">
          <p className="text-xs font-bold text-[#1B4F8A] uppercase tracking-wider mb-1.5 flex items-center gap-2">
            <span>{icon}</span> {label}
          </p>
          <h2 className="text-2xl font-bold text-slate-900 leading-tight">{mod.title}</h2>
          {mod.description && <p className="text-slate-500 mt-1.5 text-sm">{mod.description}</p>}
        </div>
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl py-20 text-center">
          <span className="text-5xl block mb-4">{icon}</span>
          <p className="text-lg font-semibold text-slate-700">{label} editor</p>
          <p className="text-sm text-slate-400 mt-1">{description}</p>
          <span className={cn("inline-block mt-4 text-xs font-semibold px-3 py-1 rounded-full", meta.badgeColor)}>
            Coming next
          </span>
        </div>
      </div>
    )
  }

  switch (type) {
    case "final_exam":
      return (
        <ActivityEditor
          moduleId={mod.id}
          moduleType={type}
          initialQuestions={
            (mod.questions as import("@/components/lms/ActivityEditor").Question[] | null) ?? null
          }
          initialSettings={
            (mod.activity_settings as import("@/components/lms/ActivityEditor").ActivitySettings | null) ?? null
          }
        />
      )

    case "assignment":
      return (
        <AssignmentEditor
          moduleId={mod.id}
          initialBriefHtml={mod.assignment_brief_html ?? null}
          initialRubric={
            (mod.assignment_rubric as import("@/components/lms/AssignmentEditor").RubricCriterion[] | null) ?? null
          }
        />
      )

    case "package":
      return <PackageBuilder moduleId={mod.id} courseId={courseId} />

    case "live_session":
      return <SessionPanel moduleId={mod.id} courseId={courseId} moduleName={mod.title} />

    default:
      return <ComingSoon label={meta.label} icon={meta.icon} description="Editor coming soon" />
  }
}

// ── Session Panel — schedule sessions from within the module ───
function SessionPanel({ moduleId, courseId, moduleName }: { moduleId: string; courseId: string; moduleName: string }) {
  interface LiveSession {
    id: string; title: string; session_date: string; start_time: string
    duration_minutes: number; location: string | null; meeting_link: string | null
    closed_at: string | null; is_open: boolean; attendance_count: number
    notes: string | null; agenda: string | null
    topics_covered: string | null; instructor_notes: string | null
  }

  const [sessions,   setSessions]   = useState<LiveSession[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [toggling,   setToggling]   = useState<string | null>(null)
  const [form, setForm] = useState({
    title: "", session_date: "", start_time: "09:00",
    duration_minutes: 60, location: "", meeting_link: "",
    late_threshold: 15, notes: "", agenda: "",
  })
  const [closeModal, setCloseModal] = useState<{ id: string; title: string } | null>(null)
  const [closeForm,  setCloseForm]  = useState({ topics_covered: "", instructor_notes: "" })

  async function loadSessions() {
    setLoading(true)
    const res = await fetch(`/api/lms/sessions?module_id=${moduleId}`)
    if (res.ok) setSessions(await res.json())
    setLoading(false)
  }

  useEffect(() => { loadSessions() }, [moduleId])

  async function createSession(e: React.FormEvent) {
    e.preventDefault()
    if (!form.session_date) { toast.error("Date required"); return }
    setSaving(true)
    const res = await fetch("/api/lms/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, module_id: moduleId, course_id: courseId }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success("Session scheduled")
    setShowCreate(false)
    setForm({ title: "", session_date: "", start_time: "09:00", duration_minutes: 60, location: "", meeting_link: "", late_threshold: 15, notes: "", agenda: "" })
    loadSessions()
  }

  async function toggleSession(id: string, isOpen: boolean, session?: LiveSession) {
    if (isOpen) {
      // Show wrap-up modal before closing
      setCloseForm({ topics_covered: session?.topics_covered ?? "", instructor_notes: session?.instructor_notes ?? "" })
      setCloseModal({ id, title: session?.title ?? "Session" })
      return
    }
    setToggling(id)
    const res = await fetch("/api/lms/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "open" }),
    })
    setToggling(null)
    if (!res.ok) { toast.error("Failed"); return }
    toast.success("Session opened")
    loadSessions()
  }

  async function confirmCloseSession(skipWrapUp = false) {
    if (!closeModal) return
    setToggling(closeModal.id)
    const payload: Record<string, unknown> = { id: closeModal.id, action: "close" }
    if (!skipWrapUp) {
      payload.topics_covered   = closeForm.topics_covered   || null
      payload.instructor_notes = closeForm.instructor_notes || null
    }
    const res = await fetch("/api/lms/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    setToggling(null)
    setCloseModal(null)
    if (!res.ok) { toast.error("Failed to close session"); return }
    toast.success("Session closed")
    loadSessions()
  }

  async function deleteSession(id: string, title: string) {
    if (!confirm(`Delete "${title}"?`)) return
    const res  = await fetch(`/api/lms/sessions?id=${id}`, { method: "DELETE" })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success("Session deleted")
    loadSessions()
  }

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <div className="mb-8 pb-6 border-b border-slate-100 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-[#1B4F8A] uppercase tracking-wider mb-1.5 flex items-center gap-2">
            <span>📅</span> Live Sessions
          </p>
          <h2 className="text-2xl font-bold text-slate-900 leading-tight">{moduleName}</h2>
          <p className="text-slate-500 mt-1.5 text-sm">Schedule sessions for this module</p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="shrink-0 bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2"
        >
          <Plus className="h-4 w-4" /> Schedule Session
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl py-16 text-center">
          <span className="text-5xl block mb-4">📅</span>
          <p className="text-lg font-semibold text-slate-700">No sessions scheduled</p>
          <p className="text-sm text-slate-400 mt-1">Add a live session for this module</p>
          <Button
            onClick={() => setShowCreate(true)}
            className="mt-4 bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2"
          >
            <Plus className="h-4 w-4" /> Schedule Session
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => (
            <div
              key={s.id}
              className="bg-white rounded-xl border border-slate-200 hover:border-[#1B4F8A]/30 hover:shadow-sm transition-all"
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {s.is_open && (
                        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" /> LIVE
                        </span>
                      )}
                      <Badge className={cn("text-xs border-0", s.is_open ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                        {s.is_open ? "Open" : "Closed"}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-slate-900 truncate">{s.title}</h3>
                    {s.agenda && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{s.agenda}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(s.session_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                        {" · "}{s.start_time?.slice(0, 5)} · {s.duration_minutes} min
                      </span>
                      {s.location && (
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Tag className="h-3.5 w-3.5" /> {s.location}
                        </span>
                      )}
                      {s.meeting_link && (
                        <a href={s.meeting_link} target="_blank" rel="noreferrer"
                           className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" /> Join Link
                        </a>
                      )}
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {s.attendance_count} checked in
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Link href={`/lms-admin/sessions/${s.id}`}>
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                        Attendance <ChevronRight className="h-3 w-3" />
                      </Button>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => toggleSession(s.id, s.is_open, s)} className="gap-2">
                          {toggling === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          {s.is_open ? "Close Session" : "Open Session"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => deleteSession(s.id, s.title)}
                          className="gap-2 text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Close Session Wrap-Up Modal ───────────────────────── */}
      <Dialog open={!!closeModal} onOpenChange={open => { if (!open) setCloseModal(null) }}>
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogHeader className="px-0 pb-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <DialogTitle className="font-bold text-slate-900">Close Session</DialogTitle>
              <Button variant="ghost" size="icon" onClick={() => setCloseModal(null)} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Optionally record what was covered — this helps build richer AI reports later.
            </p>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Topics Covered <span className="text-slate-400 font-normal">(optional)</span></Label>
              <textarea
                className="w-full h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 focus:border-[#1B4F8A]"
                placeholder="What topics were actually covered in this session?"
                value={closeForm.topics_covered}
                onChange={e => setCloseForm(f => ({ ...f, topics_covered: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Instructor Notes <span className="text-slate-400 font-normal">(optional)</span></Label>
              <textarea
                className="w-full h-20 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 focus:border-[#1B4F8A]"
                placeholder="Any observations about this session…"
                value={closeForm.instructor_notes}
                onChange={e => setCloseForm(f => ({ ...f, instructor_notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="px-0 pt-4 border-0 bg-transparent gap-2">
            <Button type="button" variant="ghost" className="text-slate-500" onClick={() => confirmCloseSession(true)}>
              Skip & Close
            </Button>
            <Button type="button" variant="outline" onClick={() => setCloseModal(null)}>Cancel</Button>
            <Button
              type="button"
              className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white"
              onClick={() => confirmCloseSession(false)}
              disabled={toggling === closeModal?.id}
            >
              {toggling === closeModal?.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Close Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Session Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" showCloseButton={false}>
          <DialogHeader className="px-0 pb-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <DialogTitle className="font-bold text-slate-900">Schedule Session</DialogTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowCreate(false)} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <form onSubmit={createSession} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Session Title *</Label>
              <Input
                placeholder={`e.g. ${moduleName} – Live Q&A`}
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" value={form.session_date} onChange={e => setForm(f => ({ ...f, session_date: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Start Time *</Label>
                <Input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Duration (min)</Label>
                <Input type="number" min={15} step={15} value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: +e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Late After (min)</Label>
                <Input type="number" min={0} value={form.late_threshold} onChange={e => setForm(f => ({ ...f, late_threshold: +e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input placeholder="e.g. Room 3A, Building B" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Meeting Link</Label>
              <Input placeholder="https://zoom.us/j/..." value={form.meeting_link} onChange={e => setForm(f => ({ ...f, meeting_link: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Agenda <span className="text-slate-400 font-normal">(what will be covered)</span></Label>
              <textarea
                className="w-full h-20 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 focus:border-[#1B4F8A]"
                placeholder="Topics planned for this session…"
                value={form.agenda}
                onChange={e => setForm(f => ({ ...f, agenda: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <textarea
                className="w-full h-16 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 focus:border-[#1B4F8A]"
                placeholder="Any notes for instructors or students…"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <DialogFooter className="px-0 pt-2 border-0 bg-transparent">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Schedule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Slim settings panel for Package modules ────────────────────
function PackageOptionsPanel({ mod }: { mod: Module }) {
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [fields,  setFields]  = useState({
    is_mandatory:        mod.is_mandatory        ?? false,
    lock_until_previous: mod.lock_until_previous ?? false,
    available_from:      mod.available_from      ?? "",
    available_until:     mod.available_until     ?? "",
    estimated_duration:  mod.estimated_duration  ?? "",
  })

  async function save() {
    setSaving(true); setSaved(false)
    await fetch("/api/lms/modules", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        id:                  mod.id,
        is_mandatory:        fields.is_mandatory,
        lock_until_previous: fields.lock_until_previous,
        available_from:      fields.available_from  || null,
        available_until:     fields.available_until || null,
        estimated_duration:  fields.estimated_duration ? Number(fields.estimated_duration) : null,
      }),
    })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function Toggle({ field, label, hint }: { field: "is_mandatory" | "lock_until_previous"; label: string; hint: string }) {
    return (
      <div className="flex items-start justify-between gap-4 py-4 border-b border-slate-100 last:border-0">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-800">{label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
        </div>
        <button
          type="button"
          onClick={() => setFields(f => ({ ...f, [field]: !f[field] }))}
          className={cn(
            "relative w-10 h-6 rounded-full transition-colors shrink-0 mt-0.5",
            fields[field] ? "bg-[#1B4F8A]" : "bg-slate-200"
          )}
        >
          <span className={cn(
            "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform",
            fields[field] ? "left-5" : "left-1"
          )} />
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-lg pb-20 space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-900">Package Options</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Controls how this package fits into the course flow. Content sequencing is managed inside the package builder.
        </p>
      </div>

      {/* Toggles */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5">
        <Toggle
          field="is_mandatory"
          label="Mandatory"
          hint="Students must complete this package to finish the course"
        />
        <Toggle
          field="lock_until_previous"
          label="Lock until previous module is done"
          hint="Students cannot open this package until the module above is completed"
        />
      </div>

      {/* Scheduling */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Availability</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Available from</label>
            <input
              type="datetime-local"
              value={fields.available_from ? fields.available_from.slice(0, 16) : ""}
              onChange={e => setFields(f => ({ ...f, available_from: e.target.value }))}
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Available until</label>
            <input
              type="datetime-local"
              value={fields.available_until ? fields.available_until.slice(0, 16) : ""}
              onChange={e => setFields(f => ({ ...f, available_until: e.target.value }))}
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
            />
          </div>
        </div>
      </div>

      {/* Estimated duration */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Estimated Duration</p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="1"
            max="999"
            value={fields.estimated_duration}
            onChange={e => setFields(f => ({ ...f, estimated_duration: e.target.value }))}
            placeholder="—"
            className="w-24 h-9 px-3 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
          />
          <span className="text-sm text-slate-500">minutes</span>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 bg-[#1B4F8A] text-white text-sm font-semibold rounded-xl hover:bg-[#163f6e] disabled:opacity-60 transition-all"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : null}
        {saving ? "Saving…" : saved ? "Saved!" : "Save"}
      </button>
    </div>
  )
}

// ── Assignment Settings Panel ──────────────────────────────────
function AssignmentSettingsPanel({ mod }: { mod: Module }) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved")

  const as = (mod.activity_settings as any) ?? {}

  // Submission
  const [allowFile,       setAllowFile]       = useState<boolean>(as.allow_file ?? true)
  const [allowText,       setAllowText]       = useState<boolean>(as.allow_text ?? false)
  const [fileTypes,       setFileTypes]       = useState<string[]>(mod.assignment_submission_types ?? ["pdf", "docx"])
  const [dueDate,         setDueDate]         = useState<string>(mod.assignment_due_date ?? "")

  // Completion
  const [completionMode,  setCompletionMode]  = useState<"gate" | "open">(as.completion_mode ?? "gate")
  const [unlimited,       setUnlimited]       = useState<boolean>(as.unlimited_attempts ?? true)
  const [maxAttempts,     setMaxAttempts]     = useState<string>(
    mod.assignment_max_attempts != null ? String(mod.assignment_max_attempts) : ""
  )

  // Evaluation
  const [evalType,        setEvalType]        = useState<"ai" | "manual" | "hybrid">(as.evaluation_type ?? "manual")
  const [evaluator,       setEvaluator]       = useState<"instructor" | "admin" | "both">(as.evaluator ?? "instructor")
  const [manualRelease,   setManualRelease]   = useState<boolean>(as.manual_release ?? true)

  // Grading
  const [passMark,        setPassMark]        = useState<number>(as.pass_mark ?? 70)

  // Access
  const [isMandatory,     setIsMandatory]     = useState(mod.is_mandatory ?? false)
  const [lockPrev,        setLockPrev]        = useState(mod.lock_until_previous ?? false)
  const [availFrom,       setAvailFrom]       = useState(mod.available_from ?? "")
  const [availUntil,      setAvailUntil]      = useState(mod.available_until ?? "")
  const [showProgress,    setShowProgress]    = useState(mod.show_in_progress ?? true)
  const [estDuration,     setEstDuration]     = useState<string>(
    mod.estimated_duration ? String(mod.estimated_duration) : ""
  )

  function currentAs() {
    return (mod.activity_settings as any) ?? {}
  }

  function scheduleAutoSave(patch: Record<string, unknown>) {
    setSaveStatus("unsaved")
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaveStatus("saving")
      const res = await fetch("/api/lms/modules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mod.id, ...patch }),
      })
      setSaveStatus(res.ok ? "saved" : "unsaved")
      if (!res.ok) toast.error("Settings save failed")
    }, 1200)
  }

  function saveAs(partial: Record<string, unknown>) {
    scheduleAutoSave({ activity_settings: { ...currentAs(), ...partial } })
  }
  function save(patch: Record<string, unknown>) { scheduleAutoSave(patch) }

  function toggleFileType(type: string) {
    const next = fileTypes.includes(type) ? fileTypes.filter(t => t !== type) : [...fileTypes, type]
    if (!next.length) return
    setFileTypes(next)
    save({ assignment_submission_types: next })
  }

  function Toggle({ value, onChange, label, desc }: {
    value: boolean; onChange: (v: boolean) => void; label: string; desc?: string
  }) {
    return (
      <label className="flex items-center justify-between gap-4 cursor-pointer py-0.5">
        <div>
          <p className="text-sm font-medium text-slate-700">{label}</p>
          {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
        </div>
        <button type="button" onClick={() => onChange(!value)}
          className={cn("w-11 h-6 rounded-full transition-colors relative shrink-0", value ? "bg-[#1B4F8A]" : "bg-slate-200")}>
          <span className={cn("w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all", value ? "left-5" : "left-0.5")} />
        </button>
      </label>
    )
  }

  function Checkbox({ checked, onChange, label, desc }: {
    checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string
  }) {
    return (
      <label className="flex items-start gap-3 cursor-pointer group">
        <div onClick={() => onChange(!checked)}
          className={cn(
            "w-5 h-5 rounded border-2 flex items-center justify-center transition-all mt-0.5 shrink-0",
            checked ? "bg-[#1B4F8A] border-[#1B4F8A]" : "border-slate-300 group-hover:border-[#1B4F8A]/50"
          )}>
          {checked && <CheckCircle2 className="h-3 w-3 text-white" />}
        </div>
        <div>
          <p className="text-sm text-slate-700">{label}</p>
          {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
        </div>
      </label>
    )
  }

  function RadioCard({ value, current, onChange, label, desc }: {
    value: string; current: string; onChange: (v: string) => void; label: string; desc: string
  }) {
    const active = value === current
    return (
      <button type="button" onClick={() => onChange(value)}
        className={cn(
          "flex-1 text-left p-4 rounded-xl border-2 transition-all",
          active ? "border-[#1B4F8A] bg-[#1B4F8A]/5" : "border-slate-200 hover:border-slate-300 bg-white"
        )}>
        <div className="flex items-center gap-2 mb-1">
          <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
            active ? "border-[#1B4F8A]" : "border-slate-300")}>
            {active && <div className="w-2 h-2 rounded-full bg-[#1B4F8A]" />}
          </div>
          <p className={cn("text-sm font-semibold", active ? "text-[#1B4F8A]" : "text-slate-700")}>{label}</p>
        </div>
        <p className="text-xs text-slate-400 ml-6">{desc}</p>
      </button>
    )
  }

  const SectionDivider = () => <div className="border-t border-slate-100" />

  return (
    <div className="max-w-2xl mx-auto pb-20 space-y-8">

      {/* Header */}
      <div className="pb-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-[#1B4F8A] uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Settings className="h-3.5 w-3.5" /> Assignment Settings
          </p>
          <p className="text-sm text-slate-500">Submission, evaluation, completion and access rules</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
          {saveStatus === "saving"  && <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>}
          {saveStatus === "saved"   && <><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Saved</>}
          {saveStatus === "unsaved" && <span className="text-amber-500">Unsaved</span>}
        </div>
      </div>

      {/* ── 1. Submission ──────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-800">Submission</p>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5 shadow-sm">

          {/* What students can submit */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">What students submit</p>
            <div className="space-y-2">
              <Checkbox
                checked={allowFile}
                onChange={v => { setAllowFile(v); saveAs({ allow_file: v }) }}
                label="File upload"
                desc="Student uploads a file (PDF, Word, etc.)"
              />
              {allowFile && (
                <div className="ml-8 flex items-center gap-4 flex-wrap">
                  {[{ key: "pdf", label: "PDF (.pdf)" }, { key: "docx", label: "Word (.docx)" }].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer group">
                      <div onClick={() => toggleFileType(key)}
                        className={cn(
                          "w-4 h-4 rounded border-2 flex items-center justify-center transition-all cursor-pointer",
                          fileTypes.includes(key) ? "bg-[#1B4F8A] border-[#1B4F8A]" : "border-slate-300 group-hover:border-[#1B4F8A]/50"
                        )}>
                        {fileTypes.includes(key) && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                      </div>
                      <span className="text-xs text-slate-600">{label}</span>
                    </label>
                  ))}
                </div>
              )}
              <Checkbox
                checked={allowText}
                onChange={v => { setAllowText(v); saveAs({ allow_text: v }) }}
                label="Text answer"
                desc="Student types their answer directly in the browser"
              />
            </div>
          </div>

          <SectionDivider />

          {/* Due date */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> Due Date (optional)
            </label>
            <div className="flex items-center gap-2">
              <input type="datetime-local"
                value={dueDate ? dueDate.slice(0, 16) : ""}
                onChange={e => {
                  const v = e.target.value ? e.target.value + ":00Z" : ""
                  setDueDate(v)
                  save({ assignment_due_date: v || null })
                }}
                className="px-3 h-9 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
              />
              {dueDate && (
                <button type="button" onClick={() => { setDueDate(""); save({ assignment_due_date: null }) }}
                  className="p-1.5 text-slate-400 hover:text-red-400 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400">Students cannot submit after this date and time</p>
          </div>
        </div>
      </div>

      {/* ── 2. Completion Mode ─────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-800">Completion</p>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5 shadow-sm">
          <div className="flex gap-3">
            <RadioCard
              value="gate" current={completionMode}
              onChange={v => { setCompletionMode(v as "gate" | "open"); saveAs({ completion_mode: v }) }}
              label="Gate (must pass)"
              desc="Student must achieve the pass mark to unlock the next module. Can resubmit if they fail."
            />
            <RadioCard
              value="open" current={completionMode}
              onChange={v => { setCompletionMode(v as "gate" | "open"); saveAs({ completion_mode: v }) }}
              label="Always continue"
              desc="Student always moves on after submitting. Grade is informational only."
            />
          </div>

          {completionMode === "gate" && (
            <>
              <SectionDivider />
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <RefreshCw className="h-3 w-3" /> Resubmission attempts
                </p>
                <Toggle
                  value={unlimited}
                  onChange={v => {
                    setUnlimited(v)
                    saveAs({ unlimited_attempts: v })
                    save({ assignment_max_attempts: v ? null : (Number(maxAttempts) || 3) })
                  }}
                  label="Unlimited attempts"
                  desc="Student can resubmit as many times as needed until they pass"
                />
                {!unlimited && (
                  <div className="flex items-center gap-3 ml-0">
                    <input type="number" min="1" max="99"
                      value={maxAttempts}
                      onChange={e => {
                        setMaxAttempts(e.target.value)
                        save({ assignment_max_attempts: Number(e.target.value) || 1 })
                      }}
                      className="w-20 px-3 h-9 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
                    />
                    <span className="text-sm text-slate-500">maximum attempts</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 3. Evaluation ──────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-800">Evaluation</p>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5 shadow-sm">

          {/* Type */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Who grades</p>
            <div className="flex gap-3 flex-wrap">
              {([
                { value: "ai",     label: "AI only",  desc: "Graded instantly by AI against the rubric" },
                { value: "manual", label: "Manual",   desc: "Instructor or admin grades manually" },
                { value: "hybrid", label: "Hybrid",   desc: "AI grades first, human can adjust and release" },
              ] as const).map(o => (
                <RadioCard key={o.value} value={o.value} current={evalType}
                  onChange={v => { setEvalType(v as "ai" | "manual" | "hybrid"); saveAs({ evaluation_type: v }) }}
                  label={o.label} desc={o.desc}
                />
              ))}
            </div>
          </div>

          {/* Evaluator — shown when manual or hybrid */}
          {(evalType === "manual" || evalType === "hybrid") && (
            <>
              <SectionDivider />
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Who can review submissions</p>
                <div className="flex gap-4 flex-wrap">
                  {([
                    { value: "instructor", label: "Instructor only" },
                    { value: "admin",      label: "Admin only" },
                    { value: "both",       label: "Instructor & Admin" },
                  ] as const).map(o => (
                    <label key={o.value} className="flex items-center gap-2 cursor-pointer">
                      <div onClick={() => { setEvaluator(o.value); saveAs({ evaluator: o.value }) }}
                        className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all",
                          evaluator === o.value ? "border-[#1B4F8A]" : "border-slate-300 hover:border-[#1B4F8A]/50"
                        )}>
                        {evaluator === o.value && <div className="w-2 h-2 rounded-full bg-[#1B4F8A]" />}
                      </div>
                      <span className="text-sm text-slate-700">{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          <SectionDivider />

          {/* Release */}
          <div className="space-y-2">
            <Toggle
              value={manualRelease}
              onChange={v => { setManualRelease(v); saveAs({ manual_release: v }) }}
              label="Manually release results to students"
              desc="Hold the grade until you explicitly click Release — even for AI grading. Unchecked = auto-release immediately."
            />
            {evalType === "ai" && !manualRelease && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">AI grades will be visible to students immediately after submission.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. Grading ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-800">Grading</p>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Award className="h-3 w-3" /> Pass Mark
            </label>
            <div className="flex items-center gap-4">
              <input type="range" min="0" max="100" step="5"
                value={passMark}
                onChange={e => {
                  const v = Number(e.target.value)
                  setPassMark(v)
                  saveAs({ pass_mark: v })
                }}
                className="flex-1 accent-[#1B4F8A]"
              />
              <span className="text-lg font-bold text-[#1B4F8A] w-14 text-right">{passMark}%</span>
            </div>
            <p className="text-xs text-slate-400">
              Student passes if score ÷ total rubric points ≥ {passMark}%
            </p>
          </div>
        </div>
      </div>

      {/* ── 5. Access & Display ────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-800">Access & Display</p>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <Toggle value={isMandatory} onChange={v => { setIsMandatory(v); save({ is_mandatory: v }) }}
            label="Mandatory" desc="Blocks course completion if not submitted" />
          <SectionDivider />
          <Toggle value={lockPrev} onChange={v => { setLockPrev(v); save({ lock_until_previous: v }) }}
            label="Lock Until Previous Complete" desc="Previous module must be done first" />
          <SectionDivider />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "Available From", val: availFrom, set: setAvailFrom, key: "available_from" },
              { label: "Available Until", val: availUntil, set: setAvailUntil, key: "available_until" },
            ].map(({ label, val, set, key }) => (
              <div key={key} className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3 w-3" /> {label}
                </label>
                <div className="flex items-center gap-2">
                  <input type="datetime-local"
                    value={val ? val.slice(0, 16) : ""}
                    onChange={e => {
                      const v = e.target.value ? e.target.value + ":00Z" : ""
                      set(v)
                      save({ [key]: v || null })
                    }}
                    className="flex-1 px-3 h-9 text-xs border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
                  />
                  {val && (
                    <button onClick={() => { set(""); save({ [key]: null }) }}
                      className="p-1.5 text-slate-300 hover:text-red-400 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <SectionDivider />
          <Toggle value={showProgress} onChange={v => { setShowProgress(v); save({ show_in_progress: v }) }}
            label="Show in Progress Bar" desc="Include in the course completion percentage" />
          <SectionDivider />
          <div className="flex items-center gap-3">
            <input type="number" min="1" max="600"
              value={estDuration}
              onChange={e => { setEstDuration(e.target.value); save({ estimated_duration: e.target.value ? Number(e.target.value) : null }) }}
              placeholder="e.g. 60"
              className="w-24 px-3 h-9 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
            />
            <span className="text-sm text-slate-500">minutes estimated duration</span>
          </div>
        </div>
      </div>

    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// ASSIGNMENT SUBMISSIONS PANEL
// ──────────────────────────────────────────────────────────────
interface Submission {
  id: string; attempt_no: number; status: string
  score: number | null; max_score: number | null; passed: boolean
  answers: { file_url?: string; file_name?: string; file_size?: number } | null
  ai_feedback: { overall_comment?: string } | null
  submitted_at: string | null
  lms_students: { id: string; name: string; email: string } | null
}
interface RubricCriterionGrade { id: string; title: string; description: string | null; maxScore: number; score: number }

function AssignmentSubmissionsPanel({ mod }: { mod: Module }) {
  const rubric = (mod.assignment_rubric ?? []) as { id: string; title: string; description: string | null; maxScore: number }[]
  const as     = (mod.activity_settings as any) ?? {}
  const evalType     = (as.evaluation_type ?? "manual") as "ai" | "manual" | "hybrid"
  const manualRelease = as.manual_release ?? true

  const [submissions,  setSubmissions]  = useState<Submission[]>([])
  const [loading,      setLoading]      = useState(true)
  const [grading,      setGrading]      = useState<Submission | null>(null)
  const [grades,       setGrades]       = useState<RubricCriterionGrade[]>([])
  const [overallScore, setOverallScore] = useState("")
  const [maxScore,     setMaxScore]     = useState("")
  const [passed,       setPassed]       = useState(false)
  const [feedback,     setFeedback]     = useState("")
  const [saving,       setSaving]       = useState(false)
  const [aiLoading,    setAiLoading]    = useState<string | null>(null)  // attempt id being AI-graded
  const [releasing,    setReleasing]    = useState<string | null>(null)  // attempt id being released

  useEffect(() => {
    fetch(`/api/lms/module-assignment?module_id=${mod.id}`)
      .then(r => r.json())
      .then(d => { setSubmissions(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [mod.id])

  function openGrade(sub: Submission) {
    setGrading(sub)
    setFeedback(sub.ai_feedback?.overall_comment ?? "")
    setPassed(sub.passed)
    if (rubric.length > 0) {
      setGrades(rubric.map(r => ({ ...r, score: 0 })))
      setOverallScore("")
      setMaxScore(String(rubric.reduce((s, r) => s + r.maxScore, 0)))
    } else {
      setGrades([])
      setOverallScore(sub.score != null ? String(sub.score) : "")
      setMaxScore(sub.max_score != null ? String(sub.max_score) : "100")
    }
  }

  function derivedScore() {
    if (rubric.length > 0) return grades.reduce((s, g) => s + (g.score || 0), 0)
    return Number(overallScore) || 0
  }

  async function publishGrade() {
    if (!grading) return
    setSaving(true)
    const sc  = derivedScore()
    const mx  = rubric.length > 0 ? rubric.reduce((s, r) => s + r.maxScore, 0) : (Number(maxScore) || 100)
    const res = await fetch("/api/lms/module-assignment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attempt_id: grading.id, score: sc, max_score: mx, passed, feedback }),
    })
    if (res.ok) {
      toast.success("Grade published")
      setSubmissions(prev => prev.map(s =>
        s.id === grading.id ? { ...s, status: "graded", score: sc, max_score: mx, passed, ai_feedback: { overall_comment: feedback } } : s
      ))
      setGrading(null)
    } else {
      toast.error("Failed to save grade")
    }
    setSaving(false)
  }

  async function runAiGrade(sub: Submission) {
    setAiLoading(sub.id)
    try {
      const res = await fetch("/api/lms/grade-assignment-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attempt_id: sub.id, module_id: mod.id }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success("AI grading complete")
        setSubmissions(prev => prev.map(s =>
          s.id === sub.id ? { ...s, ...data } : s
        ))
      } else {
        toast.error(data.error ?? "AI grading failed")
      }
    } catch {
      toast.error("AI grading failed")
    }
    setAiLoading(null)
  }

  async function releaseResult(sub: Submission) {
    setReleasing(sub.id)
    const res = await fetch("/api/lms/module-assignment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attempt_id: sub.id, release: true }),
    })
    if (res.ok) {
      toast.success("Result released to student")
      setSubmissions(prev => prev.map(s =>
        s.id === sub.id ? { ...s, status: "released" } : s
      ))
    } else {
      toast.error("Release failed")
    }
    setReleasing(null)
  }

  const pending  = submissions.filter(s => s.status === "submitted").length
  const graded   = submissions.filter(s => s.status === "graded").length
  const released = submissions.filter(s => s.status === "released").length

  return (
    <div className="max-w-3xl mx-auto pb-20">
      {/* Header */}
      <div className="mb-6 pb-5 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-bold text-[#1B4F8A] uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" /> Submissions
          </p>
          <h2 className="text-xl font-bold text-slate-900">{mod.title}</h2>
        </div>
        <div className="flex items-center gap-2 text-xs flex-wrap">
          {pending > 0 && (
            <span className="flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-xl font-medium">
              <ClipboardList className="h-3.5 w-3.5" /> {pending} pending
            </span>
          )}
          {graded > 0 && (
            <span className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-xl font-medium">
              <Award className="h-3.5 w-3.5" /> {graded} graded
            </span>
          )}
          {released > 0 && (
            <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> {released} released
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      ) : submissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList className="h-10 w-10 text-slate-200 mb-3" />
          <p className="text-slate-500 font-medium">No submissions yet</p>
          <p className="text-slate-400 text-sm mt-1">Students haven&apos;t submitted this assignment</p>
        </div>
      ) : (
        <div className="space-y-2">
          {submissions.map(sub => {
            const isGraded  = sub.status === "graded"
            const isPending = sub.status === "submitted"
            return (
              <div key={sub.id}
                className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex items-center gap-4 hover:border-slate-300 transition-colors">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] font-bold text-sm flex items-center justify-center shrink-0">
                  {sub.lms_students?.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{sub.lms_students?.name ?? "—"}</p>
                  <p className="text-xs text-slate-400">
                    {sub.lms_students?.email} · Attempt #{sub.attempt_no}
                    {sub.submitted_at ? ` · ${new Date(sub.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                  </p>
                </div>
                {/* File */}
                {sub.answers?.file_url && (
                  <a href={sub.answers.file_url} target="_blank" rel="noreferrer"
                    className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1 shrink-0">
                    <FileText className="h-3.5 w-3.5" />
                    {sub.answers.file_name ?? "Download"}
                  </a>
                )}
                {/* Score */}
                {isGraded && sub.score != null && (
                  <div className="text-right shrink-0">
                    <p className={cn("text-sm font-bold", sub.passed ? "text-emerald-600" : "text-red-500")}>
                      {sub.score}/{sub.max_score}
                    </p>
                    <p className={cn("text-xs", sub.passed ? "text-emerald-500" : "text-red-400")}>
                      {sub.passed ? "Passed" : "Failed"}
                    </p>
                  </div>
                )}
                {/* Status + actions */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", {
                    "bg-amber-100 text-amber-700":     isPending,
                    "bg-indigo-100 text-indigo-700":   isGraded,
                    "bg-emerald-100 text-emerald-700": sub.status === "released",
                  })}>
                    {isPending ? "Pending" : isGraded ? "Graded" : "Released"}
                  </span>

                  {/* AI Grade button — show when pending and eval includes AI */}
                  {isPending && (evalType === "ai" || evalType === "hybrid") && (
                    <button
                      onClick={() => runAiGrade(sub)}
                      disabled={aiLoading === sub.id}
                      className="flex items-center gap-1 text-xs text-violet-600 font-medium hover:underline disabled:opacity-50">
                      {aiLoading === sub.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <FlaskConical className="h-3 w-3" />}
                      AI Grade
                    </button>
                  )}

                  {/* Manual grade button — always available */}
                  <button
                    onClick={() => openGrade(sub)}
                    className="text-xs text-[#1B4F8A] font-medium hover:underline">
                    {isGraded || sub.status === "released" ? "Edit" : "Grade"}
                  </button>

                  {/* Release button — show when graded and manual_release is on */}
                  {isGraded && manualRelease && (
                    <button
                      onClick={() => releaseResult(sub)}
                      disabled={releasing === sub.id}
                      className="flex items-center gap-1 text-xs text-emerald-600 font-semibold hover:underline disabled:opacity-50">
                      {releasing === sub.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <CheckCircle2 className="h-3 w-3" />}
                      Release
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Grading Dialog ──────────────────────────────────── */}
      <Dialog open={!!grading} onOpenChange={open => { if (!open) setGrading(null) }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Award className="h-4 w-4 text-[#1B4F8A]" />
              Grade — {grading?.lms_students?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* File link */}
            {grading?.answers?.file_url && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                <a href={grading.answers.file_url} target="_blank" rel="noreferrer"
                  className="text-sm text-[#1B4F8A] hover:underline truncate flex-1">
                  {grading.answers.file_name ?? "View submission"}
                </a>
              </div>
            )}

            {/* Rubric scoring */}
            {rubric.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rubric</p>
                {grades.map((g, i) => (
                  <div key={g.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-800">{g.title}</p>
                        {g.description && <p className="text-xs text-slate-400 mt-0.5">{g.description}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number" min={0} max={g.maxScore}
                          value={g.score}
                          onChange={e => {
                            const v = Math.min(g.maxScore, Math.max(0, Number(e.target.value)))
                            setGrades(prev => prev.map((x, j) => j === i ? { ...x, score: v } : x))
                          }}
                          className="w-14 h-8 text-sm text-center border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
                        />
                        <span className="text-xs text-slate-400">/ {g.maxScore}</span>
                      </div>
                    </div>
                    <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-[#1B4F8A] rounded-full transition-all"
                        style={{ width: `${g.maxScore > 0 ? Math.round((g.score / g.maxScore) * 100) : 0}%` }} />
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between px-1 pt-1">
                  <p className="text-xs text-slate-500">Total score</p>
                  <p className="text-base font-bold text-slate-900">
                    {derivedScore()} / {rubric.reduce((s, r) => s + r.maxScore, 0)}
                  </p>
                </div>
              </div>
            ) : (
              /* Manual score — no rubric */
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Score</p>
                <div className="flex items-center gap-3">
                  <input
                    type="number" min={0} max={Number(maxScore) || 100}
                    value={overallScore}
                    onChange={e => setOverallScore(e.target.value)}
                    placeholder="0"
                    className="w-20 h-9 text-sm text-center border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
                  />
                  <span className="text-slate-400 text-sm">/</span>
                  <input
                    type="number" min={1}
                    value={maxScore}
                    onChange={e => setMaxScore(e.target.value)}
                    placeholder="100"
                    className="w-20 h-9 text-sm text-center border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
                  />
                </div>
              </div>
            )}

            {/* Pass / Fail */}
            <div className="flex items-center gap-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex-1">Result</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPassed(true)}
                  className={cn("px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all", passed
                    ? "bg-emerald-500 text-white border-emerald-500"
                    : "bg-white text-slate-500 border-slate-200 hover:border-emerald-300")}>
                  Pass
                </button>
                <button
                  onClick={() => setPassed(false)}
                  className={cn("px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all", !passed
                    ? "bg-red-500 text-white border-red-500"
                    : "bg-white text-slate-500 border-slate-200 hover:border-red-300")}>
                  Fail
                </button>
              </div>
            </div>

            {/* Feedback */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Feedback to student</p>
              <textarea
                rows={4}
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Optional — written feedback visible to the student after grading"
                className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <button onClick={() => setGrading(null)}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
              Cancel
            </button>
            <button
              onClick={publishGrade}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-[#1B4F8A] text-white text-sm font-semibold rounded-xl hover:bg-[#163f6e] transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
              Publish Grade
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ModuleCanvas({ module: mod, courseId }: { module: Module; courseId: string }) {
  const [tab, setTab] = useState<"content" | "settings" | "submissions">("content")

  return (
    <div className="h-full flex flex-col">
      {/* ── Tab bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-6 pt-4 pb-4 border-b border-slate-100 shrink-0">
        <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
          <button
            onClick={() => setTab("content")}
            className={cn(
              "px-4 py-1.5 text-xs font-semibold rounded-lg transition-all",
              tab === "content"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            Content
          </button>
          <button
            onClick={() => setTab("settings")}
            className={cn(
              "px-4 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5",
              tab === "settings"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Settings className="h-3 w-3" /> Settings
          </button>
          {mod.module_type === "assignment" && (
            <button
              onClick={() => setTab("submissions")}
              className={cn(
                "px-4 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5",
                tab === "submissions"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <ClipboardList className="h-3 w-3" /> Submissions
            </button>
          )}
        </div>
        <span className="ml-3 text-xs text-slate-400 truncate hidden sm:block">
          {mod.title}
        </span>
      </div>

      {/* ── Canvas body ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 pt-6">
        {tab === "submissions" ? (
          <AssignmentSubmissionsPanel mod={mod} />
        ) : tab === "content" ? (
          <ModuleContentEditor mod={mod} courseId={courseId} />
        ) : mod.module_type === "package" ? (
          <PackageOptionsPanel mod={mod} />
        ) : mod.module_type === "assignment" ? (
          <AssignmentSettingsPanel mod={mod} />
        ) : (
          <ModuleSettingsPanel
            moduleId={mod.id}
            initialSettings={{
              completion_method:       (mod.completion_method as "button" | "time" | "check") ?? "button",
              completion_time_minutes: mod.completion_time_minutes ?? null,
              completion_check:        (mod.completion_check as unknown as import("@/components/lms/ModuleSettingsPanel").CheckQuestion[]) ?? [],
              is_mandatory:            mod.is_mandatory ?? false,
              lock_until_previous:     mod.lock_until_previous ?? false,
              available_from:          mod.available_from ?? null,
              available_until:         mod.available_until ?? null,
              show_in_progress:        mod.show_in_progress ?? true,
              estimated_duration:      mod.estimated_duration ?? null,
            }}
          />
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// SORTABLE MODULE ITEM (sidebar drag-and-drop)
// ──────────────────────────────────────────────────────────────
function SortableModuleItem({
  mod, index, total, isActive, typeMeta,
  onSelect, onEdit, onDelete, onMoveUp, onMoveDown,
}: {
  mod: Module; index: number; total: number; isActive: boolean
  typeMeta: { icon: string; label: string }
  onSelect: () => void; onEdit: () => void; onDelete: () => void
  onMoveUp: () => void; onMoveDown: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: mod.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group relative", isDragging && "opacity-50 z-50")}
    >
      {/* Drag handle — visible on hover */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-white/30 hover:text-white/60 z-10"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>

      <button
        onClick={onSelect}
        className={cn("w-full flex items-start gap-2.5 pl-7 pr-10 py-2.5 text-left transition-colors",
          isActive
            ? "bg-white/15 text-white"
            : "text-white/70 hover:bg-white/10 hover:text-white"
        )}>
        <span className="shrink-0 w-5 h-5 rounded-full bg-white/15 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs leading-snug line-clamp-2 font-medium">{mod.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px]">{typeMeta.icon}</span>
            <span className="text-[10px] text-white/40">{typeMeta.label}</span>
          </div>
        </div>
      </button>

      {/* Kebab menu on hover */}
      <div className="absolute right-1 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger render={<button className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors" />}>
            <MoreVertical className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem className="gap-2 text-xs" onClick={onEdit}>
              <Edit2 className="h-3.5 w-3.5" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-xs" onClick={onMoveUp} disabled={index === 0}>
              <ChevronUp className="h-3.5 w-3.5" /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-xs" onClick={onMoveDown} disabled={index === total - 1}>
              <ChevronDown className="h-3.5 w-3.5" /> Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-xs text-red-600 focus:text-red-600" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// AI REPORT VIEW
// ──────────────────────────────────────────────────────────────
function AiReportView({ report, analyzing, onAnalyze }: {
  report: any | null; analyzing: boolean; onAnalyze: () => void
}) {
  if (!report && !analyzing) {
    return (
      <div className="max-w-2xl mx-auto pt-16 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-50 mb-5">
          <Sparkles className="h-8 w-8 text-purple-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Expert Course Analysis</h2>
        <p className="text-slate-500 text-sm mb-6 max-w-md mx-auto">
          Run Expert analysis to get a structured breakdown of what each module covers. The exam analysis will then map every question to the relevant course module.
        </p>
        <Button
          onClick={onAnalyze}
          className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
        >
          <Sparkles className="h-4 w-4" /> Run Expert Analysis
        </Button>
      </div>
    )
  }

  if (analyzing && !report) {
    return (
      <div className="flex flex-col items-center justify-center pt-24 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
        <p className="text-slate-500 text-sm">Expert analysis in progress…</p>
      </div>
    )
  }

  const modules: any[] = report?.modules ?? []
  const exams:   any[] = report?.exams   ?? []

  return (
    <div className="max-w-3xl mx-auto pb-16 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" /> Expert Course Report
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Generated {report?.generated_at ? new Date(report.generated_at).toLocaleString() : "—"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
          onClick={onAnalyze}
          disabled={analyzing}
        >
          {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Re-analyze
        </Button>
      </div>

      {/* Exam analysis — shown first so it's immediately visible */}
      {exams.length > 0 && (
        <section>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Final Exam Analysis</p>
          {exams.map((exam: any, i: number) => (
            <div key={exam.module_id ?? i} className="bg-white rounded-xl border border-purple-200 p-4 space-y-4">
              <div>
                <p className="font-semibold text-slate-900">{exam.module_title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{exam.summary}</p>
              </div>
              {exam.sections?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">Questions by Course Module</p>
                  <div className="space-y-2">
                    {exam.sections.map((sec: any, j: number) => (
                      <div key={j} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <p className="text-xs font-medium text-slate-700 truncate">{sec.title}</p>
                            <p className="text-xs text-slate-400 shrink-0 ml-2">{sec.question_count} Q · {sec.percentage}%</p>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-purple-400"
                              style={{ width: `${sec.percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Module summaries */}
      {modules.length > 0 && (
        <section>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Course Modules ({modules.length})</p>
          <div className="space-y-3">
            {modules.map((m: any, i: number) => (
              <div key={m.module_id ?? i} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#1B4F8A]/10 text-[#1B4F8A] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-slate-900 text-sm">{m.module_title}</p>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full capitalize">
                        {m.module_type?.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">{m.summary}</p>
                    {m.topics?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {m.topics.map((t: string, j: number) => (
                          <span key={j} className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {modules.length === 0 && exams.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <p className="text-sm">No analysis data yet. Run Expert Analysis to generate the report.</p>
          <Button onClick={onAnalyze} className="mt-4 bg-purple-600 hover:bg-purple-700 text-white gap-2" disabled={analyzing}>
            <Sparkles className="h-4 w-4" /> Run Expert Analysis
          </Button>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// MAIN PAGE
// ──────────────────────────────────────────────────────────────
export default function CourseBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = use(params)

  const [course,      setCourse]      = useState<Course | null>(null)
  const [modules,     setModules]     = useState<Module[]>([])
  const [loading,     setLoading]     = useState(true)
  const [activeView,  setActiveView]  = useState<ActiveView>("overview")
  const [saveStatus,  setSaveStatus]  = useState<SaveStatus>("saved")
  const [enrollKey,   setEnrollKey]   = useState(0)
  const [toggling,    setToggling]    = useState(false)

  // Modals
  const [moduleModal,     setModuleModal]     = useState(false)
  const [editingModule,   setEditingModule]   = useState<Module | null>(null)
  const [enrollModal,     setEnrollModal]     = useState(false)
  const [contentModal,    setContentModal]    = useState<string | null>(null)
  const [addingType,      setAddingType]      = useState<string | undefined>(undefined)
  const [editingContent,  setEditingContent]  = useState<{ item: ContentItem; moduleId: string } | null>(null)
  const [testAsStudent,   setTestAsStudent]   = useState(false)
  const [submissionsItem, setSubmissionsItem] = useState<ContentItem | null>(null)
  const [aiAnalyzing,     setAiAnalyzing]     = useState(false)
  const [aiReport,        setAiReport]        = useState<any>(null)

  useEffect(() => {
    async function init() {
      setLoading(true)
      const [courseRes, modulesRes] = await Promise.all([
        fetch(`/api/lms/courses?status=all`),
        fetch(`/api/lms/modules?course_id=${courseId}`),
      ])
      const courses = await courseRes.json()
      const found   = Array.isArray(courses) ? courses.find((c: any) => c.id === courseId) : null
      setCourse(found ?? null)
      const mods = await modulesRes.json()
      setModules((Array.isArray(mods) ? mods : []).map((m: Module) => ({ ...m, expanded: true })))
      setLoading(false)
    }
    init()
  }, [courseId])

  async function deleteModule(id: string) {
    if (!confirm("Delete this module and all its content?")) return
    const res  = await fetch(`/api/lms/modules?id=${id}`, { method: "DELETE" })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success("Module deleted")
    setModules(prev => prev.filter(m => m.id !== id))
    if (activeView === id) setActiveView("overview")
  }

  async function reorderModules(reordered: Module[]) {
    const updated = reordered.map((m, i) => ({ ...m, order_index: i }))
    setModules(updated)
    // Persist new order_index values for all modules that changed
    await Promise.all(
      updated
        .filter((m, i) => m.order_index !== modules[i]?.order_index)
        .map(m => fetch("/api/lms/modules", {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ id: m.id, order_index: m.order_index }),
        }))
    )
  }

  async function moveModule(id: string, direction: "up" | "down") {
    const idx  = modules.findIndex(m => m.id === id)
    const next = direction === "up" ? idx - 1 : idx + 1
    if (next < 0 || next >= modules.length) return
    await reorderModules(arrayMove(modules, idx, next))
  }

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function handleModuleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = modules.findIndex(m => m.id === active.id)
    const to   = modules.findIndex(m => m.id === over.id)
    reorderModules(arrayMove(modules, from, to))
  }

  async function deleteContent(moduleId: string, contentId: string) {
    if (!confirm("Remove this content item?")) return
    const res  = await fetch(`/api/lms/content?id=${contentId}`, { method: "DELETE" })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success("Removed")
    setModules(prev => prev.map(m => m.id === moduleId ? { ...m, lms_content_items: m.lms_content_items.filter(c => c.id !== contentId) } : m))
  }

  async function toggleStatus() {
    if (!course) return
    const newStatus = course.status === "published" ? "draft" : "published"
    setToggling(true)
    const res  = await fetch("/api/lms/courses", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: courseId, status: newStatus }) })
    const data = await res.json(); setToggling(false)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    setCourse(prev => prev ? { ...prev, status: newStatus } : prev)
    toast.success(newStatus === "published" ? "Course published ✓" : "Reverted to draft")
  }

  async function analyzeFullCourse() {
    if (!course || aiAnalyzing) return
    setAiAnalyzing(true)
    toast.info("Expert analysis started — this may take a minute…")
    try {
      const res = await fetch("/api/lms/analyze/course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course_id: courseId }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Analysis failed"); return }
      const { modules_analyzed, exams_analyzed, failed } = data
      if (failed?.length) {
        console.error("[AI Analyze] failed:", failed)
        toast.warning(`Analyzed ${modules_analyzed} module(s), ${exams_analyzed} exam(s). Failed: ${failed.join(" | ")}`)
      } else {
        toast.success(`Analysis complete — ${modules_analyzed} module(s), ${exams_analyzed} exam(s) analyzed`)
      }
      // Fetch report
      const rRes = await fetch(`/api/lms/analyze/report?course_id=${courseId}`)
      if (rRes.ok) { setAiReport(await rRes.json()); setActiveView("ai-report") }
    } catch {
      toast.error("Analysis failed — check console")
    } finally {
      setAiAnalyzing(false)
    }
  }

  // Quick-add blocks that don't need a modal (divider, callout)
  async function quickAddBlock(type: string, moduleId: string) {
    const defaults: Record<string, { title: string; content: Record<string, any> }> = {
      divider: { title: "Section Divider", content: {} },
      callout: { title: "Important note", content: { variant: "info", text: "Add your note here" } },
    }
    const d = defaults[type]; if (!d) return
    const res  = await fetch("/api/lms/content", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module_id: moduleId, title: d.title, type, content: d.content, download_allowed: false, is_mandatory: false, completion_rule: { type: "click" } }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    setModules(prev => prev.map(m => m.id === moduleId ? { ...m, lms_content_items: [...m.lms_content_items, data] } : m))
    toast.success(`${type === "divider" ? "Divider" : "Callout"} added`)
  }

  const activeModule = typeof activeView === "string" && activeView !== "overview" && activeView !== "users" && activeView !== "settings"
    ? modules.find(m => m.id === activeView) ?? null
    : null

  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-100">
      <Loader2 className="h-8 w-8 animate-spin text-[#1B4F8A]" />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-100 overflow-hidden">

      {/* ══ STICKY TOP BAR ══════════════════════════════════════ */}
      <div className="h-12 bg-white border-b border-slate-200 flex items-center px-4 gap-3 shrink-0 z-10">
        <Link href="/lms-admin/courses" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm transition-colors shrink-0">
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Courses</span>
        </Link>

        <div className="w-px h-5 bg-slate-200" />

        <p className="text-sm font-semibold text-slate-800 truncate flex-1 min-w-0">{course?.title}</p>

        {/* Save status */}
        <div className="shrink-0 text-xs flex items-center gap-1.5">
          {saveStatus === "saving"  && <><Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /><span className="text-slate-400">Saving…</span></>}
          {saveStatus === "saved"   && <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /><span className="text-slate-400 hidden sm:inline">Saved</span></>}
          {saveStatus === "unsaved" && <span className="text-amber-500">Unsaved</span>}
        </div>

        {/* Status badge */}
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full shrink-0", {
          "bg-amber-100 text-amber-700":   course?.status === "draft",
          "bg-emerald-100 text-emerald-700": course?.status === "published",
          "bg-slate-100 text-slate-500":   course?.status === "archived",
        })}>
          {course?.status}
        </span>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs hidden sm:flex"
            onClick={() => {
              const moduleParam = activeModule ? `?module=${activeModule.id}` : ""
              window.open(`/lms-admin/courses/${courseId}/preview${moduleParam}`, "_blank")
            }}>
            <Smartphone className="h-3.5 w-3.5" /> Preview
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs hidden sm:flex" onClick={() => setEnrollModal(true)}>
            <UserPlus className="h-3.5 w-3.5" /> Enroll
          </Button>
          <Button size="sm" variant="outline"
            className="gap-1.5 h-8 text-xs hidden sm:flex border-purple-200 text-purple-700 hover:bg-purple-50"
            onClick={analyzeFullCourse}
            disabled={aiAnalyzing}
          >
            {aiAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {aiAnalyzing ? "Analyzing…" : "Expert Analyze"}
          </Button>
          {course && course.status !== "archived" && (
            <Button size="sm" disabled={toggling}
              className={cn("gap-1.5 h-8 text-xs", course.status === "published" ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white")}
              onClick={toggleStatus}>
              {toggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : course.status === "published" ? <><Archive className="h-3.5 w-3.5" /> Unpublish</> : <><Send className="h-3.5 w-3.5" /> Publish</>}
            </Button>
          )}
        </div>
      </div>

      {/* ══ BODY ════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR ──────────────────────────────────────── */}
        <aside className="w-60 shrink-0 bg-[#1B4F8A] flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto py-3">

            {/* Overview */}
            <button
              onClick={() => setActiveView("overview")}
              className={cn("w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left",
                activeView === "overview"
                  ? "bg-white/15 text-white font-semibold"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}>
              <BookOpen className="h-4 w-4 shrink-0" /> Overview
            </button>

            {/* Modules header */}
            <div className="px-4 pt-4 pb-1.5 flex items-center justify-between">
              <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">Modules</p>
              <button
                onClick={() => { setEditingModule(null); setModuleModal(true) }}
                className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                title="Add module"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Module list */}
            {modules.length === 0 ? (
              <button
                onClick={() => { setEditingModule(null); setModuleModal(true) }}
                className="mx-3 w-[calc(100%-24px)] flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-white/20 text-white/40 hover:text-white/70 hover:border-white/30 text-xs transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add first module
              </button>
            ) : (
              <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleModuleDragEnd}>
                <SortableContext items={modules.map(m => m.id)} strategy={verticalListSortingStrategy}>
                  {modules.map((mod, mi) => {
                    const typeMeta = getModuleTypeMeta(mod.module_type ?? "content")
                    return (
                      <SortableModuleItem
                        key={mod.id}
                        mod={mod}
                        index={mi}
                        total={modules.length}
                        isActive={activeView === mod.id}
                        typeMeta={typeMeta}
                        onSelect={() => setActiveView(mod.id)}
                        onEdit={() => { setEditingModule(mod); setModuleModal(true) }}
                        onDelete={() => deleteModule(mod.id)}
                        onMoveUp={() => moveModule(mod.id, "up")}
                        onMoveDown={() => moveModule(mod.id, "down")}
                      />
                    )
                  })}
                </SortableContext>
              </DndContext>
            )}

            {/* Divider */}
            <div className="mx-4 my-3 border-t border-white/10" />

            {/* Users + Settings */}
            {[
              { key: "users",     icon: Users,     label: "Students" },
              { key: "settings",  icon: Settings,  label: "Settings" },
              { key: "ai-report", icon: Sparkles,  label: "Expert Report" },
            ].map(({ key, icon: Icon, label }) => (
              <button key={key}
                onClick={() => {
                  if (key === "ai-report") {
                    // Always re-fetch so exam data shows after analysis
                    fetch(`/api/lms/analyze/report?course_id=${courseId}`)
                      .then(r => r.ok ? r.json() : null)
                      .then(data => { if (data) setAiReport(data) })
                  }
                  setActiveView(key as ActiveView)
                }}
                className={cn("w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors",
                  activeView === key
                    ? "bg-white/15 text-white font-semibold"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}>
                <Icon className="h-4 w-4 shrink-0" />
                {label}
                {key === "ai-report" && aiReport && (
                  <span className="ml-auto text-[10px] bg-purple-500/30 text-purple-200 px-1.5 py-0.5 rounded-full">ready</span>
                )}
              </button>
            ))}
          </div>

          {/* Sidebar footer — enrollment count */}
          <div className="px-4 py-3 border-t border-white/10">
            <p className="text-white/40 text-xs">{course?.enrollment_count ?? 0} students enrolled</p>
          </div>
        </aside>

        {/* ── MAIN CANVAS ───────────────────────────────────────── */}
        <main className="flex-1 overflow-hidden flex flex-col">

          {/* Module canvas fills full height with its own tab bar + scroll */}
          {activeModule && (
            <ModuleCanvas key={activeModule.id} module={activeModule} courseId={courseId} />
          )}

          {/* Non-module views get normal padding */}
          {!activeModule && (
            <div className="flex-1 overflow-y-auto px-8 pt-8">

              {/* Overview */}
              {activeView === "overview" && course && (
                <CourseOverviewEditor
                  course={course}
                  onCourseChange={updates => setCourse(prev => prev ? { ...prev, ...updates } : prev)}
                  onSaveStatus={setSaveStatus}
                />
              )}

              {/* Users */}
              {activeView === "users" && (
                <UsersTab courseId={courseId} onEnroll={() => setEnrollModal(true)} refreshKey={enrollKey} />
              )}

              {/* Settings */}
              {activeView === "settings" && course && (
                <SettingsTab course={course} onSaved={c => setCourse(c)} />
              )}

              {/* AI Report */}
              {activeView === "ai-report" && (
                <AiReportView
                  report={aiReport}
                  analyzing={aiAnalyzing}
                  onAnalyze={analyzeFullCourse}
                />
              )}

            </div>
          )}
        </main>
      </div>

      {/* ══ MODALS ══════════════════════════════════════════════ */}
      <ModuleModal
        open={moduleModal}
        onClose={() => { setModuleModal(false); setEditingModule(null) }}
        courseId={courseId}
        editing={editingModule}
        existingTypes={modules.map(m => m.module_type ?? "")}
        onSaved={m => {
          if (editingModule) { setModules(prev => prev.map(x => x.id === m.id ? { ...x, ...m } : x)) }
          else { setModules(prev => [...prev, m]); setActiveView(m.id) }
        }}
      />
      <ContentModal
        open={!!contentModal || !!editingContent}
        onClose={() => { setContentModal(null); setEditingContent(null); setAddingType(undefined) }}
        moduleId={editingContent?.moduleId ?? contentModal ?? ""}
        editing={editingContent?.item ?? null}
        defaultType={editingContent ? undefined : addingType}
        onSaved={item => {
          const targetId = editingContent?.moduleId ?? contentModal
          setModules(prev => prev.map(m => {
            if (m.id !== targetId) return m
            if (editingContent) return { ...m, lms_content_items: m.lms_content_items.map(c => c.id === item.id ? item : c) }
            return { ...m, lms_content_items: [...m.lms_content_items, item] }
          }))
        }}
      />
      <EnrollModal open={enrollModal} onClose={() => setEnrollModal(false)} courseId={courseId} onEnrolled={() => setEnrollKey(k => k + 1)} />
      <TestAsStudentModal open={testAsStudent} onClose={() => setTestAsStudent(false)} courseId={courseId} />
      <AssignmentSubmissionsModal open={!!submissionsItem} onClose={() => setSubmissionsItem(null)} item={submissionsItem} courseId={courseId} />
    </div>
  )
}
