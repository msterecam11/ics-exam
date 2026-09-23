"use client"

import { use, useEffect, useRef, useState, useCallback } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import {
  ArrowLeft, Plus, ChevronDown, Trash2, Edit2, Globe,
  Monitor, Layers, Loader2, CheckCircle2, Send, Archive, Smartphone,
  Settings, MoreVertical, X, GraduationCap, FlaskConical, BookOpen,
  Camera, Clock, RefreshCw, Award, FileText, ClipboardList,
  MessageSquare, GripVertical, ChevronUp, Sparkles, FolderDown, CalendarDays,
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import CourseCatalogueSettings, { CategorySelect } from "@/components/lms/CourseCatalogueSettings"
import { ProviderSelect } from "@/components/lms/ProviderSelect"
import ExamSectionsEditor from "@/components/lms/bank/ExamSectionsEditor"
import GroupsPanel from "@/components/lms/groups/GroupsPanel"
import MaterialsManager from "@/components/lms/groups/MaterialsManager"
import CompletionRulesPanel from "@/components/lms/course/CompletionRulesPanel"

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



// ── Types ──────────────────────────────────────────────────────
interface Course {
  id: string; title: string; description: string | null
  overview_html: string | null; course_code: string | null
  category: string | null; category_id: string | null; thumbnail_url: string | null
  status: string; delivery_mode: string; language: string
  catalogue_visibility?: string | null; catalogue_companies?: string[] | null
  short_description?: string | null; level?: string | null
  duration_hours?: number | null; learning_outcomes?: string[] | null; prerequisites?: string[] | null
  audience?: string | null
  provider_id?: string | null
  progress_enforcement: boolean; certificate_enabled: boolean
  final_exam_pass_mark: number | null
  start_date: string | null; end_date: string | null
  capacity: number | null; enrollment_count: number
  updated_at: string | null
  feedback_enabled: boolean; feedback_anonymous: boolean
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
  expanded?: boolean
}
// ── Constants ──────────────────────────────────────────────────
const DELIVERY_ICONS: Record<string, React.ElementType> = {
  online: Globe, onsite: Monitor, hybrid: Layers,
}
type ActiveView = "overview" | "users" | "settings" | "ai-report" | "materials" | "groups" | string // string = module id
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
      : { ...data, module_type: moduleType, expanded: true }
    )
    onClose()
  }

  const typeMeta = getModuleTypeMeta(moduleType)

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">

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
// COURSE OVERVIEW EDITOR  (Phase 1 — main deliverable)
// ──────────────────────────────────────────────────────────────
function CourseOverviewEditor({ course, modules, onCourseChange, onSaveStatus }: {
  course: Course
  modules: Module[]
  onCourseChange: (updates: Partial<Course>) => void
  onSaveStatus: (s: SaveStatus) => void
}) {
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const saveTimer      = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [uploading, setUploading] = useState(false)

  // Debounced auto-save
  // Changes made within the debounce window are merged, so none is lost.
  const pending = useRef<Partial<Course>>({})
  const scheduleAutoSave = useCallback((patch: Partial<Course>) => {
    onSaveStatus("unsaved")
    pending.current = { ...pending.current, ...patch }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      onSaveStatus("saving")
      const body = pending.current
      pending.current = {}
      const res = await fetch("/api/lms/courses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: course.id, ...body }),
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
        <div className="w-52 [&_select]:h-8 [&_select]:rounded-full [&_select]:bg-blue-50 [&_select]:border-blue-100 [&_select]:text-sm">
          <CategorySelect value={course.category_id ?? null}
            onChange={v => { onCourseChange({ category_id: v }); scheduleAutoSave({ category_id: v }) }} />
        </div>
        <div className="w-56 [&_select]:h-8 [&_select]:rounded-full [&_select]:bg-blue-50 [&_select]:border-blue-100 [&_select]:text-sm">
          <ProviderSelect value={course.provider_id ?? null}
            onChange={v => { onCourseChange({ provider_id: v }); scheduleAutoSave({ provider_id: v }) }} />
        </div>
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

      {/* ── Course overview ───────────────────────────────────── */}
      <div className="mb-7">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Course Overview</label>
        <textarea
          value={course.description ?? ""}
          onChange={e => handleFieldChange("description", e.target.value)}
          rows={5}
          placeholder="What this course is about and who it is for — shown to students on the course page and in the catalogue."
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 leading-relaxed placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 resize-y"
        />
      </div>

      {/* ── Who it is for — one line at the top of the catalogue page ── */}
      <div className="mb-7">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Who This Course Is For</label>
        <p className="text-xs text-slate-400 mb-2">One line, shown first in the catalogue.</p>
        <input
          value={course.audience ?? ""}
          onChange={e => handleFieldChange("audience", e.target.value)}
          maxLength={300}
          placeholder="e.g. Airside operations supervisors and safety officers at certified aerodromes"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
        />
      </div>

      <OverviewList label="Learning Objectives" hint="What students will be able to do after the course"
        placeholder="e.g. Apply GACAR Part 139 requirements to aerodrome inspections"
        items={course.learning_outcomes ?? []}
        onChange={items => { onCourseChange({ learning_outcomes: items }); scheduleAutoSave({ learning_outcomes: items }) }} />

      <div className="mb-7">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Course Modules</label>
        <p className="text-xs text-slate-400 mb-2">Listed automatically from the course — edit them in the sidebar.</p>
        {modules.length === 0 ? <p className="text-sm text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl px-4 py-3">No modules yet.</p> : (
          <ol className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {[...modules].sort((a, b) => a.order_index - b.order_index).map((m, i) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-6 h-6 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="flex-1 text-slate-700">{m.title}</span>
                <span className="text-[11px] text-slate-400 capitalize">{m.module_type === "final_exam" ? "Final exam" : m.module_type.replace("_", " ")}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <OverviewList label="Prerequisites" hint="What students should know or have done before starting"
        placeholder="e.g. At least one year in airside operations"
        items={course.prerequisites ?? []}
        onChange={items => { onCourseChange({ prerequisites: items }); scheduleAutoSave({ prerequisites: items }) }} />

      <p className="text-xs text-slate-400 mt-2 ml-1">Changes auto-save.</p>
    </div>
  )
}

function OverviewList({ label, hint, placeholder, items, onChange }: {
  label: string; hint: string; placeholder: string; items: string[]; onChange: (items: string[]) => void
}) {
  const list = items.length ? items : [""]
  return (
    <div className="mb-7">
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
      <p className="text-xs text-slate-400 mb-2">{hint}</p>
      <div className="space-y-2">
        {list.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1B4F8A]/50 shrink-0" />
            <input value={v} placeholder={placeholder}
              onChange={e => onChange(list.map((x, j) => j === i ? e.target.value : x))}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onChange([...list.slice(0, i + 1), "", ...list.slice(i + 1)]) } }}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20" />
            <button type="button" aria-label="Remove" onClick={() => onChange(list.filter((_, j) => j !== i))}
              className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50"><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...list, ""])} className="mt-2 text-xs font-medium text-[#1B4F8A] hover:underline flex items-center gap-1">
        <Plus className="h-3.5 w-3.5" /> Add
      </button>
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
    ics_certificate_visible:  (course as any).ics_certificate_visible !== false,
    partner_certificate:      !!(course as any).partner_certificate,
    partner_certificate_visible: !!(course as any).partner_certificate_visible,
    certificate_validity_months: (course as any).certificate_validity_months ?? null,
    final_exam_pass_mark: course.final_exam_pass_mark ?? 70,
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: any) => setForm(prev => ({ ...prev, [k]: v }))

  async function save() {
    const mark = form.final_exam_pass_mark
    if (mark == null || !Number.isInteger(mark) || mark < 0 || mark > 100) {
      toast.error("Final exam pass mark must be a whole number from 0 to 100"); return
    }
    if (mark !== (course.final_exam_pass_mark ?? 70) && !confirm(
      `Change the final exam pass mark to ${mark}%?\n\n` +
      "Existing exam results of students who are NOT in a program will be re-checked against the new mark. " +
      "Students who now pass will complete the course and receive their certificate as usual. " +
      "Students who now fail keep any certificate already issued.\n\n" +
      "Programs keep their own pass mark (set in Program Manager), so their results don't change."
    )) return
    setSaving(true)
    const res = await fetch("/api/lms/courses", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: course.id, title: form.title, description: form.description, course_code: form.course_code, category_id: form.category_id || null, delivery_mode: form.delivery_mode,
        catalogue_visibility: form.catalogue_visibility ?? "hidden",
        catalogue_companies: form.catalogue_companies ?? [],
        short_description: form.short_description ?? null,
        level: form.level || null,
        duration_hours: form.duration_hours ?? null,
        learning_outcomes: form.learning_outcomes ?? [], progress_enforcement: form.progress_enforcement, certificate_enabled: form.certificate_enabled, certificate_auto_release: form.certificate_auto_release,
        ics_certificate_visible: form.ics_certificate_visible, partner_certificate: form.partner_certificate,
        partner_certificate_visible: form.partner_certificate_visible,
        certificate_validity_months: form.certificate_validity_months, final_exam_pass_mark: form.final_exam_pass_mark, start_date: form.start_date || null, end_date: form.end_date || null, capacity: form.capacity, feedback_enabled: form.feedback_enabled, feedback_anonymous: form.feedback_anonymous }),
    })
    const data = await res.json(); setSaving(false)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    if (data.regrade_error) toast.warning(data.regrade_error)
    else if (data.regrade && (data.regrade.newlyPassed || data.regrade.newlyFailed)) {
      const r = data.regrade
      toast.success(
        "Settings saved — exam results updated:" +
        (r.newlyPassed ? ` ${r.newlyPassed} student${r.newlyPassed !== 1 ? "s" : ""} now pass.` : "") +
        (r.newlyFailed ? ` ${r.newlyFailed} student${r.newlyFailed !== 1 ? "s" : ""} now fail.` : "") +
        (r.newlyFailedWithCertificate ? ` ${r.newlyFailedWithCertificate} of them already had a certificate, which was kept.` : ""),
        { duration: 10000 }
      )
    } else toast.success("Settings saved")
    onSaved({ ...course, ...form })
  }

  return (
    <div className="max-w-2xl pb-16 space-y-6">
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><BookOpen className="h-4 w-4 text-[#1B4F8A]" /> Basic Information</h3>
        <div className="space-y-1"><Label>Course Title</Label><Input value={form.title ?? ""} onChange={e => set("title", e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Course Code</Label><Input value={form.course_code ?? ""} onChange={e => set("course_code", e.target.value)} placeholder="RFFS-01" /></div>
          <div className="space-y-1">
            <Label>Category</Label>
            <CategorySelect value={form.category_id ?? null} onChange={v => set("category_id", v)} />
          </div>
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
      <CourseCatalogueSettings form={form as any} set={set as any} />

      <div className="bg-white rounded-xl border p-5 space-y-4">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><GraduationCap className="h-4 w-4 text-[#1B4F8A]" /> Learning & Completion</h3>
        <label className="flex items-start gap-3 cursor-pointer bg-slate-50 rounded-lg p-3"><input type="checkbox" checked={form.progress_enforcement} onChange={e => set("progress_enforcement", e.target.checked)} className="mt-0.5" /><div><p className="text-sm font-medium">Sequential progress enforcement</p><p className="text-xs text-slate-500 mt-0.5">Students must complete each item before the next</p></div></label>
        <label className="flex items-start gap-3 cursor-pointer bg-slate-50 rounded-lg p-3"><input type="checkbox" checked={form.certificate_enabled} onChange={e => set("certificate_enabled", e.target.checked)} className="mt-0.5" /><div><p className="text-sm font-medium">Issue certificate on completion</p><p className="text-xs text-slate-500 mt-0.5">Students receive a certificate when they complete the course (see Completion &amp; grading below). Inside a program, that program&apos;s certificate settings apply instead.</p></div></label>
        {form.certificate_enabled && (
          <label className="flex items-start gap-3 cursor-pointer bg-slate-50 rounded-lg p-3 ml-6"><input type="checkbox" checked={form.certificate_auto_release} onChange={e => set("certificate_auto_release", e.target.checked)} className="mt-0.5" /><div><p className="text-sm font-medium">Auto-release certificate</p><p className="text-xs text-slate-500 mt-0.5">Release immediately on completion. Unchecked = hold until an admin releases it.</p></div></label>
        )}
        {form.certificate_enabled && (
          <label className="flex items-start gap-3 cursor-pointer bg-slate-50 rounded-lg p-3 ml-6">
            <input type="checkbox" checked={form.ics_certificate_visible} onChange={e => set("ics_certificate_visible", e.target.checked)} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium">Students can see our certificate</p>
              <p className="text-xs text-slate-500 mt-0.5">Unchecked = we keep the record for our own history and reports; the student sees nothing.</p>
            </div>
          </label>
        )}

        {/* A partner-delivered course: their certificate, our record. */}
        <label className="flex items-start gap-3 cursor-pointer bg-slate-50 rounded-lg p-3">
          <input type="checkbox" checked={form.partner_certificate} onChange={e => set("partner_certificate", e.target.checked)} className="mt-0.5" />
          <div>
            <p className="text-sm font-medium">The service provider also issues a certificate</p>
            <p className="text-xs text-slate-500 mt-0.5">For an ICAO or partner course — we hold a record of theirs so the history and report numbers are complete.</p>
          </div>
        </label>
        {form.partner_certificate && (
          <label className="flex items-start gap-3 cursor-pointer bg-slate-50 rounded-lg p-3 ml-6">
            <input type="checkbox" checked={form.partner_certificate_visible} onChange={e => set("partner_certificate_visible", e.target.checked)} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium">Students can see the partner&apos;s certificate</p>
              <p className="text-xs text-slate-500 mt-0.5">Only worth ticking once we hold their PDF — upload it under Certificates.</p>
            </div>
          </label>
        )}

        <div className="space-y-1"><Label>Certificate valid for (months)</Label>
          <Input type="number" min={1} max={600} className="w-32"
            value={form.certificate_validity_months ?? ""}
            onChange={e => set("certificate_validity_months", e.target.value ? parseInt(e.target.value) : null)} />
          <p className="text-xs text-slate-500">Leave empty if it never expires. Expiring certificates show up in the reports attention list.</p>
        </div>

        <div className="space-y-1"><Label>Final Exam Pass Mark (%)</Label><Input type="number" min={0} max={100} value={Number.isFinite(form.final_exam_pass_mark) ? form.final_exam_pass_mark! : ""} onChange={e => set("final_exam_pass_mark", parseInt(e.target.value))} className="w-32" /><p className="text-xs text-slate-500">Default for new programs, and the mark for students outside programs (their existing results are re-checked). Programs keep their own copy.</p></div>
      </div>
      <CompletionRulesPanel courseId={course.id} />
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4 text-[#1B4F8A]" /> Course Feedback</h3>
        <label className="flex items-start gap-3 cursor-pointer bg-slate-50 rounded-lg p-3">
          <input type="checkbox" checked={form.feedback_enabled} onChange={e => set("feedback_enabled", e.target.checked)} className="mt-0.5" />
          <div>
            <p className="text-sm font-medium">Enable feedback form</p>
            <p className="text-xs text-slate-500 mt-0.5">For students enrolled outside a program. Programs have their own feedback settings (a new program starts from these).</p>
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
      // Step 11 — the exam builder. An exam already in the question bank is
      // edited as sections; one that isn't yet keeps the old editor below a
      // "move into the bank" banner.
      return (
        <ExamSectionsEditor
          moduleId={mod.id}
          initialSettings={(mod.activity_settings as import("@/components/lms/ActivityEditor").ActivitySettings | null) ?? null}
          legacyEditor={
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

    default:
      return <ComingSoon label={meta.label} icon={meta.icon} description="Editor coming soon" />
  }
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
  // Whether participants may download this module's slide PDFs (kept on the
  // module's package; viewing them in the LMS is unaffected).
  const [pkg, setPkg] = useState<{ id: string; slides_downloadable: boolean } | null>(null)
  useEffect(() => {
    fetch(`/api/lms/packages?module_id=${mod.id}`).then(r => r.ok ? r.json() : null)
      .then(p => { if (p?.id) setPkg({ id: p.id, slides_downloadable: p.slides_downloadable !== false }) })
      .catch(() => {})
  }, [mod.id])

  async function save() {
    setSaving(true); setSaved(false)
    if (pkg) await fetch(`/api/lms/packages/${pkg.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides_downloadable: pkg.slides_downloadable }),
    })
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
        {pkg && (
          <div className="flex items-start justify-between gap-4 py-4 border-b border-slate-100 last:border-0">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800">Participants can download the slides</p>
              <p className="text-xs text-slate-500 mt-0.5">The module&apos;s PDF slides appear in Course Material with a Download button. Off: they can still view them in the LMS.</p>
            </div>
            <button type="button" onClick={() => setPkg(p => p && { ...p, slides_downloadable: !p.slides_downloadable })}
              className={cn("relative w-10 h-6 rounded-full transition-colors shrink-0 mt-0.5", pkg.slides_downloadable ? "bg-[#1B4F8A]" : "bg-slate-200")}>
              <span className={cn("absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform", pkg.slides_downloadable ? "left-5" : "left-1")} />
            </button>
          </div>
        )}
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
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
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
  const [toggling,    setToggling]    = useState(false)

  // Modals
  const [moduleModal,     setModuleModal]     = useState(false)
  const [editingModule,   setEditingModule]   = useState<Module | null>(null)
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

  const activeModule = typeof activeView === "string" && !["overview", "users", "settings", "ai-report", "materials", "groups"].includes(activeView)
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
              { key: "materials", icon: FolderDown, label: "Materials" },
              ...(course && course.delivery_mode !== "online" ? [{ key: "groups", icon: CalendarDays, label: "Groups" }] : []),
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
                  modules={modules}
                  onCourseChange={updates => setCourse(prev => prev ? { ...prev, ...updates } : prev)}
                  onSaveStatus={setSaveStatus}
                />
              )}

              {/* Materials */}
              {activeView === "materials" && course && (
                <div className="max-w-4xl pb-20 space-y-4">
                  <h2 className="text-lg font-bold text-slate-900">Materials</h2>
                  <MaterialsManager courseId={courseId} modules={modules.map(m => ({ id: m.id, title: m.title }))} />
                </div>
              )}

              {/* Groups (onsite / hybrid) */}
              {activeView === "groups" && course && (
                <GroupsPanel courseId={courseId} providerId={course.provider_id ?? null} deliveryMode={course.delivery_mode} />
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
    </div>
  )
}
