"use client"

import { use, useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Plus, ChevronDown, ChevronRight, GripVertical,
  Trash2, Edit, Users, Globe, Monitor, Layers,
  FileVideo, FileText, Image, Link2, ListOrdered,
  HelpCircle, ClipboardList, Loader2, CheckCircle2,
  MoreHorizontal, Eye, EyeOff, Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────
interface ContentItem {
  id:               string
  title:            string
  type:             string
  order_index:      number
  download_allowed: boolean
  is_mandatory:     boolean
}

interface Module {
  id:                    string
  title:                 string
  description:           string | null
  delivery_type:         string
  order_index:           number
  estimated_duration:    number | null
  lms_content_items:     ContentItem[]
  expanded?:             boolean
}

interface Course {
  id:            string
  title:         string
  status:        string
  delivery_mode: string
  enrollment_count: number
}

// ── Content type icons ────────────────────────────────────────
const CONTENT_ICONS: Record<string, React.ElementType> = {
  video:      FileVideo,
  ppt:        FileText,
  pdf:        FileText,
  text:       FileText,
  image:      Image,
  link:       Link2,
  steps:      ListOrdered,
  quiz:       HelpCircle,
  assignment: ClipboardList,
}

const CONTENT_COLORS: Record<string, string> = {
  video:      "text-purple-600 bg-purple-50",
  ppt:        "text-orange-600 bg-orange-50",
  pdf:        "text-red-600 bg-red-50",
  text:       "text-slate-600 bg-slate-100",
  image:      "text-pink-600 bg-pink-50",
  link:       "text-blue-600 bg-blue-50",
  steps:      "text-teal-600 bg-teal-50",
  quiz:       "text-amber-600 bg-amber-50",
  assignment: "text-green-600 bg-green-50",
}

const CONTENT_TYPES = [
  { value: "video",      label: "Video" },
  { value: "ppt",        label: "PowerPoint / Slides" },
  { value: "pdf",        label: "PDF Document" },
  { value: "text",       label: "Text / Rich Content" },
  { value: "image",      label: "Image" },
  { value: "link",       label: "External Link" },
  { value: "steps",      label: "Step-by-Step Guide" },
  { value: "quiz",       label: "Quiz" },
  { value: "assignment", label: "Assignment" },
]

const DELIVERY_ICONS: Record<string, React.ElementType> = {
  online: Globe, onsite: Monitor, hybrid: Layers,
}

// ── Add Module Modal ──────────────────────────────────────────
function AddModuleModal({
  open, onClose, courseId, onAdded, existingModules,
}: {
  open: boolean; onClose: () => void; courseId: string
  onAdded: (m: Module) => void; existingModules: Module[]
}) {
  const [title,       setTitle]       = useState("")
  const [description, setDescription] = useState("")
  const [delivery,    setDelivery]    = useState("online")
  const [duration,    setDuration]    = useState("")
  const [saving,      setSaving]      = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res  = await fetch("/api/lms/modules", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        course_id:          courseId,
        title:              title.trim(),
        description:        description.trim() || null,
        delivery_type:      delivery,
        estimated_duration: duration ? parseInt(duration) : null,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success("Module added")
    onAdded({ ...data, lms_content_items: [], expanded: true })
    setTitle(""); setDescription(""); setDuration("")
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Module</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Title <span className="text-red-500">*</span></Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Module 1: Introduction" required />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional overview" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Delivery Type</Label>
              <select
                value={delivery}
                onChange={e => setDelivery(e.target.value)}
                className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                <option value="online">Online</option>
                <option value="onsite">On-site</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Duration (min)</Label>
              <Input type="number" min={1} value={duration} onChange={e => setDuration(e.target.value)} placeholder="e.g. 45" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !title.trim()} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Module"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Add Content Modal ─────────────────────────────────────────
function AddContentModal({
  open, onClose, moduleId, onAdded,
}: {
  open: boolean; onClose: () => void; moduleId: string
  onAdded: (c: ContentItem) => void
}) {
  const [title,       setTitle]       = useState("")
  const [type,        setType]        = useState("video")
  const [url,         setUrl]         = useState("")
  const [download,    setDownload]    = useState(false)
  const [isMandatory, setIsMandatory] = useState(true)
  const [saving,      setSaving]      = useState(false)

  // Build content JSONB based on type
  function buildContent() {
    if (type === "video") return { url, duration_seconds: null }
    if (type === "ppt")   return { url, slide_count: null }
    if (type === "pdf")   return { url, page_count: null }
    if (type === "image") return { url, caption: "" }
    if (type === "link")  return { url, open_in_tab: true }
    if (type === "text")  return { html_en: "", html_ar: "" }
    if (type === "steps") return { steps: [] }
    return {}
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res  = await fetch("/api/lms/content", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        module_id:        moduleId,
        title:            title.trim(),
        type,
        content:          buildContent(),
        download_allowed: download,
        is_mandatory:     isMandatory,
        completion_rule:  { type: type === "quiz" ? "quiz" : "click" },
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success("Content added")
    onAdded(data)
    setTitle(""); setUrl(""); setDownload(false); setIsMandatory(true)
    onClose()
  }

  const needsUrl = ["video","ppt","pdf","image","link"].includes(type)

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Content Item</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Title <span className="text-red-500">*</span></Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Introduction Video" required />
          </div>
          <div className="space-y-1">
            <Label>Content Type</Label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
            >
              {CONTENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {needsUrl && (
            <div className="space-y-1">
              <Label>URL <span className="text-red-500">*</span></Label>
              <Input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder={type === "link" ? "https://..." : "Storage URL or CDN link"}
                required={needsUrl}
              />
            </div>
          )}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={isMandatory} onChange={e => setIsMandatory(e.target.checked)}
                className="rounded" />
              Mandatory
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={download} onChange={e => setDownload(e.target.checked)}
                className="rounded" />
              Allow download
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !title.trim() || (needsUrl && !url)}
              className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Content"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Enroll Students Modal ─────────────────────────────────────
function EnrollModal({
  open, onClose, courseId, onEnrolled,
}: {
  open: boolean; onClose: () => void; courseId: string; onEnrolled: () => void
}) {
  const [students,   setStudents]   = useState<any[]>([])
  const [selected,   setSelected]   = useState<Set<string>>(new Set())
  const [search,     setSearch]     = useState("")
  const [loading,    setLoading]    = useState(true)
  const [enrolling,  setEnrolling]  = useState(false)
  const [enrolled,   setEnrolled]   = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    Promise.all([
      fetch(`/api/lms/students?limit=200`).then(r => r.json()),
      fetch(`/api/lms/enrollments?course_id=${courseId}`).then(r => r.json()),
    ]).then(([s, e]) => {
      setStudents(s.students ?? [])
      setEnrolled(new Set((e ?? []).map((en: any) => en.lms_students?.id).filter(Boolean)))
      setLoading(false)
    })
  }, [open, courseId])

  const filtered = students.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  )

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function enroll() {
    if (!selected.size) return
    setEnrolling(true)
    const res  = await fetch("/api/lms/enrollments", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ course_id: courseId, student_ids: [...selected] }),
    })
    const data = await res.json()
    setEnrolling(false)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success(`${data.enrolled} student(s) enrolled`)
    onEnrolled()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Enroll Students</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            placeholder="Search students…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-1 border border-slate-200 rounded-lg p-2">
              {filtered.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No students found</p>
              )}
              {filtered.map(s => {
                const isEnrolled = enrolled.has(s.id)
                return (
                  <label key={s.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                      isEnrolled ? "opacity-40 cursor-not-allowed" : "hover:bg-slate-50",
                      selected.has(s.id) && "bg-blue-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(s.id) || isEnrolled}
                      disabled={isEnrolled}
                      onChange={() => !isEnrolled && toggle(s.id)}
                      className="rounded"
                    />
                    <div className="w-7 h-7 rounded-full bg-[#1B4F8A]/10 flex items-center justify-center text-[#1B4F8A] text-xs font-bold shrink-0">
                      {s.name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}
                        {isEnrolled && <span className="ml-2 text-xs text-emerald-600">Already enrolled</span>}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{s.email}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
          {selected.size > 0 && (
            <p className="text-sm text-[#1B4F8A] font-medium">{selected.size} student(s) selected</p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!selected.size || enrolling}
            onClick={enroll}
            className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white"
          >
            {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : `Enroll ${selected.size || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = use(params)
  const router = useRouter()

  const [course,      setCourse]      = useState<Course | null>(null)
  const [modules,     setModules]     = useState<Module[]>([])
  const [loading,     setLoading]     = useState(true)
  const [enrollCount, setEnrollCount] = useState(0)

  const [moduleModal,  setModuleModal]  = useState(false)
  const [enrollModal,  setEnrollModal]  = useState(false)
  const [contentModal, setContentModal] = useState<string | null>(null) // module id
  const [deletingId,   setDeletingId]   = useState<string | null>(null)

  const loadModules = useCallback(async () => {
    const res  = await fetch(`/api/lms/modules?course_id=${courseId}`)
    const data = await res.json()
    setModules((data ?? []).map((m: Module) => ({ ...m, expanded: true })))
  }, [courseId])

  useEffect(() => {
    async function init() {
      setLoading(true)
      const [courseRes, modulesRes, enrollRes] = await Promise.all([
        fetch(`/api/lms/courses?status=all`),
        fetch(`/api/lms/modules?course_id=${courseId}`),
        fetch(`/api/lms/enrollments?course_id=${courseId}`),
      ])
      const courses = await courseRes.json()
      const found   = Array.isArray(courses) ? courses.find((c: any) => c.id === courseId) : null
      setCourse(found ?? null)

      const mods = await modulesRes.json()
      setModules((mods ?? []).map((m: Module) => ({ ...m, expanded: true })))

      const enr = await enrollRes.json()
      setEnrollCount(Array.isArray(enr) ? enr.length : 0)

      setLoading(false)
    }
    init()
  }, [courseId])

  function toggleModule(id: string) {
    setModules(prev => prev.map(m => m.id === id ? { ...m, expanded: !m.expanded } : m))
  }

  async function deleteModule(id: string) {
    if (!confirm("Delete this module? All content items will also be removed.")) return
    setDeletingId(id)
    const res  = await fetch(`/api/lms/modules?id=${id}`, { method: "DELETE" })
    const data = await res.json()
    setDeletingId(null)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success("Module deleted")
    setModules(prev => prev.filter(m => m.id !== id))
  }

  async function deleteContent(moduleId: string, contentId: string) {
    if (!confirm("Remove this content item?")) return
    const res  = await fetch(`/api/lms/content?id=${contentId}`, { method: "DELETE" })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success("Content removed")
    setModules(prev => prev.map(m =>
      m.id === moduleId
        ? { ...m, lms_content_items: m.lms_content_items.filter(c => c.id !== contentId) }
        : m
    ))
  }

  async function toggleDownload(contentId: string, moduleId: string, current: boolean) {
    const res = await fetch("/api/lms/content", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id: contentId, download_allowed: !current }),
    })
    if (!res.ok) { toast.error("Failed to update"); return }
    setModules(prev => prev.map(m =>
      m.id === moduleId
        ? {
            ...m,
            lms_content_items: m.lms_content_items.map(c =>
              c.id === contentId ? { ...c, download_allowed: !current } : c
            ),
          }
        : m
    ))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  const DeliveryIcon = course ? (DELIVERY_ICONS[course.delivery_mode] ?? Globe) : Globe

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/lms-admin/courses">
            <Button variant="ghost" size="icon" className="rounded-full mt-0.5">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{course?.title ?? "Course"}</h1>
            <div className="flex items-center gap-2 mt-1">
              {course && (
                <>
                  <Badge className={cn("text-xs border-0", {
                    "bg-amber-100 text-amber-700":   course.status === "draft",
                    "bg-emerald-100 text-emerald-700": course.status === "published",
                    "bg-slate-100 text-slate-500":   course.status === "archived",
                  })}>
                    {course.status}
                  </Badge>
                  <Badge variant="outline" className="text-xs gap-1">
                    <DeliveryIcon className="h-3 w-3" /> {course.delivery_mode}
                  </Badge>
                  <span className="text-sm text-slate-500 flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {enrollCount} enrolled
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" className="gap-2" onClick={() => setEnrollModal(true)}>
            <Users className="h-4 w-4" /> Enroll Students
          </Button>
          <Button className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2"
            onClick={() => setModuleModal(true)}>
            <Plus className="h-4 w-4" /> Add Module
          </Button>
        </div>
      </div>

      {/* Modules */}
      {modules.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
          <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <Plus className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-slate-600 font-medium">No modules yet</p>
          <p className="text-sm text-slate-400 mt-1">Add your first module to start building this course</p>
          <Button className="mt-4 bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2"
            onClick={() => setModuleModal(true)}>
            <Plus className="h-4 w-4" /> Add First Module
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {modules.map((mod, mi) => (
            <div key={mod.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Module header */}
              <div
                className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => toggleModule(mod.id)}
              >
                <GripVertical className="h-4 w-4 text-slate-300 shrink-0" />
                <div className="flex-1 flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] text-xs font-bold flex items-center justify-center shrink-0">
                    {mi + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{mod.title}</p>
                    <p className="text-xs text-slate-500">
                      {mod.lms_content_items.length} item{mod.lms_content_items.length !== 1 ? "s" : ""}
                      {mod.estimated_duration ? ` · ${mod.estimated_duration} min` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-xs hidden sm:flex gap-1">
                    {(() => { const Icon = DELIVERY_ICONS[mod.delivery_type] ?? Globe; return <Icon className="h-3 w-3" /> })()}
                    {mod.delivery_type}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon" className="h-7 w-7" />}
                      onClick={e => e.stopPropagation()}
                    >
                      {deletingId === mod.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <MoreHorizontal className="h-3.5 w-3.5" />}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem className="gap-2" onClick={e => { e.stopPropagation(); setContentModal(mod.id) }}>
                        <Plus className="h-4 w-4" /> Add Content
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2 text-red-600 focus:text-red-600"
                        onClick={e => { e.stopPropagation(); deleteModule(mod.id) }}
                      >
                        <Trash2 className="h-4 w-4" /> Delete Module
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {mod.expanded
                    ? <ChevronDown className="h-4 w-4 text-slate-400" />
                    : <ChevronRight className="h-4 w-4 text-slate-400" />}
                </div>
              </div>

              {/* Content items */}
              {mod.expanded && (
                <div className="border-t border-slate-100">
                  {mod.lms_content_items.length === 0 ? (
                    <div className="px-6 py-4 text-center">
                      <p className="text-sm text-slate-400">No content yet.</p>
                      <button
                        onClick={() => setContentModal(mod.id)}
                        className="mt-1 text-sm text-[#1B4F8A] hover:underline font-medium"
                      >
                        + Add content item
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {mod.lms_content_items
                        .sort((a, b) => a.order_index - b.order_index)
                        .map((item, ci) => {
                          const Icon  = CONTENT_ICONS[item.type] ?? FileText
                          const color = CONTENT_COLORS[item.type] ?? "text-slate-600 bg-slate-100"
                          return (
                            <div key={item.id}
                              className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50 transition-colors"
                            >
                              <GripVertical className="h-3.5 w-3.5 text-slate-200 shrink-0" />
                              <span className="text-xs text-slate-400 w-5 text-right shrink-0">{ci + 1}</span>
                              <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", color)}>
                                <Icon className="h-3.5 w-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800 truncate">{item.title}</p>
                                <p className="text-xs text-slate-400 uppercase">{item.type}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {!item.is_mandatory && (
                                  <Badge variant="outline" className="text-xs py-0">Optional</Badge>
                                )}
                                <button
                                  title={item.download_allowed ? "Download enabled — click to disable" : "Download disabled — click to enable"}
                                  onClick={() => toggleDownload(item.id, mod.id, item.download_allowed)}
                                  className={cn(
                                    "p-1 rounded transition-colors",
                                    item.download_allowed
                                      ? "text-emerald-500 hover:text-emerald-700"
                                      : "text-slate-300 hover:text-slate-500"
                                  )}
                                >
                                  {item.download_allowed ? <Eye className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  onClick={() => deleteContent(mod.id, item.id)}
                                  className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      <div className="px-6 py-2">
                        <button
                          onClick={() => setContentModal(mod.id)}
                          className="text-sm text-[#1B4F8A] hover:underline font-medium"
                        >
                          + Add content item
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <AddModuleModal
        open={moduleModal}
        onClose={() => setModuleModal(false)}
        courseId={courseId}
        existingModules={modules}
        onAdded={m => setModules(prev => [...prev, m])}
      />
      <AddContentModal
        open={!!contentModal}
        onClose={() => setContentModal(null)}
        moduleId={contentModal ?? ""}
        onAdded={item => {
          setModules(prev => prev.map(m =>
            m.id === contentModal
              ? { ...m, lms_content_items: [...m.lms_content_items, item] }
              : m
          ))
        }}
      />
      <EnrollModal
        open={enrollModal}
        onClose={() => setEnrollModal(false)}
        courseId={courseId}
        onEnrolled={() => {
          fetch(`/api/lms/enrollments?course_id=${courseId}`)
            .then(r => r.json())
            .then(e => setEnrollCount(Array.isArray(e) ? e.length : 0))
        }}
      />
    </div>
  )
}
