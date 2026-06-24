"use client"

import { useEffect, useState, useCallback, use } from "react"
import {
  ArrowLeft, Plus, Trash2, Loader2, GripVertical, Search,
  BookOpen, CheckCircle2, Route, X, Users, UserPlus, Info,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { cn }    from "@/lib/utils"
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter,
} from "@dnd-kit/core"
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface PathCourse {
  path_course_id: string; order_index: number; id: string; title: string; status: string
}
interface Member {
  id: string; name: string; email: string; company: string | null; is_active: boolean; added_at: string
}
interface LearningPath {
  id: string; title: string; description: string | null
  certificate_enabled: boolean
  courses: PathCourse[]; members: Member[]
}
type Tab = "courses" | "students"

// ── Sortable course row ───────────────────────────────────────────────────────
function SortableCourseRow({ course, onRemove }: {
  course: PathCourse; onRemove: (pathCourseId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: course.path_course_id })

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 bg-white rounded-lg border border-slate-200 px-3 py-3 group",
        isDragging && "opacity-50 shadow-lg border-[#1B4F8A]/30"
      )}>
      <button {...attributes} {...listeners}
        className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0 touch-none">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
        {course.order_index + 1}
      </div>
      <div className="w-7 h-7 rounded-lg bg-[#1B4F8A]/10 flex items-center justify-center shrink-0">
        <BookOpen className="h-3.5 w-3.5 text-[#1B4F8A]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{course.title}</p>
        <p className="text-xs text-slate-400 capitalize">{course.status}</p>
      </div>
      <button onClick={() => onRemove(course.path_course_id)}
        className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Course picker dialog ──────────────────────────────────────────────────────
function CoursePicker({ open, existingIds, onClose, onAdd }: {
  open: boolean; existingIds: Set<string>; onClose: () => void; onAdd: (courseId: string) => Promise<void>
}) {
  const [all,    setAll]    = useState<any[]>([])
  const [search, setSearch] = useState("")
  const [adding, setAdding] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch("/api/lms/courses").then(r => r.json())
      .then(d => setAll(Array.isArray(d) ? d : d.courses ?? []))
      .finally(() => setLoading(false))
  }, [open])

  const filtered = all.filter(c =>
    !existingIds.has(c.id) && (!search || c.title.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add Course to Path</DialogTitle></DialogHeader>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input placeholder="Search courses…" className="pl-8" value={search}
            onChange={e => setSearch(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">
              {search ? "No courses match" : "All available courses are already added"}
            </p>
          ) : filtered.map(c => (
            <button key={c.id} disabled={!!adding}
              onClick={async () => { setAdding(c.id); try { await onAdd(c.id) } finally { setAdding(null) } }}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-[#1B4F8A]/40 hover:bg-[#1B4F8A]/5 transition-all text-left disabled:opacity-60">
              <div className="w-8 h-8 rounded-lg bg-[#1B4F8A]/10 flex items-center justify-center shrink-0">
                {adding === c.id ? <Loader2 className="h-4 w-4 animate-spin text-[#1B4F8A]" /> : <BookOpen className="h-4 w-4 text-[#1B4F8A]" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{c.title}</p>
                <p className="text-xs text-slate-400 capitalize">{c.status}</p>
              </div>
              <Plus className="h-4 w-4 text-slate-400 shrink-0" />
            </button>
          ))}
        </div>
        <div className="pt-2 border-t border-slate-100">
          <Button variant="outline" onClick={onClose} className="w-full"><X className="h-4 w-4 mr-2" /> Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Add Students Modal ────────────────────────────────────────────────────────
function AddStudentsModal({ open, pathId, existingIds, onClose, onAdded }: {
  open: boolean; pathId: string; existingIds: Set<string>
  onClose: () => void; onAdded: (members: Member[]) => void
}) {
  const [all,      setAll]      = useState<any[]>([])
  const [search,   setSearch]   = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    if (open) {
      setSelected(new Set()); setSearch("")
      setLoading(true)
      fetch("/api/lms/students?limit=500").then(r => r.json())
        .then(d => setAll(Array.isArray(d) ? d : d.students ?? []))
        .finally(() => setLoading(false))
    }
  }, [open])

  const available = all.filter(s =>
    !existingIds.has(s.id) && (!search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()))
  )

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function add() {
    if (!selected.size) return
    setSaving(true)
    try {
      const res  = await fetch(`/api/lms/learning-paths/${pathId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_members", student_ids: [...selected] }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed"); return }
      toast.success(`${data.added} student${data.added !== 1 ? "s" : ""} added`)
      const newMembers = all.filter(s => selected.has(s.id))
        .map(s => ({ ...s, added_at: new Date().toISOString() }))
      onAdded(newMembers); onClose()
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Add Students to Path</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input placeholder="Search students…" className="pl-8 h-8 text-sm" value={search}
              onChange={e => setSearch(e.target.value)} autoFocus />
          </div>
          <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
            ) : available.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                {search ? "No students match" : "All students already in this path"}
              </div>
            ) : available.map(s => (
              <label key={s.id} className={cn(
                "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
                selected.has(s.id) ? "bg-[#1B4F8A]/5" : "hover:bg-slate-50"
              )}>
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)}
                  className="h-4 w-4 rounded border-slate-300 accent-[#1B4F8A]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{s.name}</p>
                  <p className="text-xs text-slate-400">{s.email}
                    {s.company && <span className="ml-1.5 text-slate-300">· {s.company}</span>}
                  </p>
                </div>
              </label>
            ))}
          </div>
          {selected.size > 0 && (
            <p className="text-xs text-[#1B4F8A] font-medium">{selected.size} selected</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={add} disabled={saving || !selected.size} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {saving ? "Adding…" : `Add ${selected.size || ""} Student${selected.size !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LearningPathDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [path,     setPath]     = useState<LearningPath | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<Tab>("courses")
  const [picker,   setPicker]   = useState(false)
  const [addModal, setAddModal] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [enrollResult, setEnrollResult] = useState<{ enrolled: number; skipped: number } | null>(null)
  const [sendEmail, setSendEmail] = useState(true)
  const [search,   setSearch]   = useState("")

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/lms/learning-paths/${id}`)
    if (res.ok) setPath(await res.json())
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  async function toggleCertificate(enabled: boolean) {
    setPath(prev => prev ? { ...prev, certificate_enabled: enabled } : prev)
    const res = await fetch("/api/lms/learning-paths", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, certificate_enabled: enabled }),
    })
    if (!res.ok) {
      setPath(prev => prev ? { ...prev, certificate_enabled: !enabled } : prev)
      toast.error("Failed to update certificate setting")
    }
  }

  async function addCourse(courseId: string) {
    const res = await fetch(`/api/lms/learning-paths/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_course", course_id: courseId }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    setPath(prev => prev ? { ...prev, courses: [...prev.courses, { ...data, order_index: prev.courses.length }] } : prev)
    toast.success("Course added")
  }

  async function removeCourse(pathCourseId: string) {
    const res = await fetch(`/api/lms/learning-paths/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove_course", path_course_id: pathCourseId }),
    })
    if (!res.ok) { toast.error("Failed to remove"); return }
    setPath(prev => prev ? {
      ...prev,
      courses: prev.courses.filter(c => c.path_course_id !== pathCourseId).map((c, i) => ({ ...c, order_index: i })),
    } : prev)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !path) return

    const oldIndex = path.courses.findIndex(c => c.path_course_id === active.id)
    const newIndex = path.courses.findIndex(c => c.path_course_id === over.id)
    const reordered = arrayMove(path.courses, oldIndex, newIndex).map((c, i) => ({ ...c, order_index: i }))
    setPath({ ...path, courses: reordered })

    setSaving(true)
    await fetch(`/api/lms/learning-paths/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder_courses", order: reordered.map(c => ({ path_course_id: c.path_course_id, order_index: c.order_index })) }),
    })
    setSaving(false)
  }

  async function removeMember(studentId: string, name: string) {
    if (!confirm(`Remove ${name} from this path?`)) return
    const res = await fetch(`/api/lms/learning-paths/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove_member", student_id: studentId }),
    })
    if (!res.ok) { toast.error("Failed"); return }
    toast.success(`${name} removed`)
    setPath(prev => prev ? { ...prev, members: prev.members.filter(m => m.id !== studentId) } : prev)
  }

  async function enroll() {
    setEnrolling(true); setEnrollResult(null)
    const res = await fetch(`/api/lms/learning-paths/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enroll", send_email: sendEmail }),
    })
    const data = await res.json()
    setEnrolling(false)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    setEnrollResult({ enrolled: data.enrolled, skipped: data.skipped })
    toast.success(`${data.enrolled} enrollment${data.enrolled !== 1 ? "s" : ""} created`)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
    </div>
  )
  if (!path) return (
    <div className="p-8 text-center text-slate-500">Learning path not found.</div>
  )

  const existingCourseIds = new Set(path.courses.map(c => c.id))
  const existingMemberIds = new Set(path.members.map(m => m.id))
  const filteredMembers   = path.members.filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/lms-admin/learning-paths"
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-emerald-600" />
            <h1 className="text-xl font-bold text-slate-900">{path.title}</h1>
            {saving && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          </div>
          {path.description && <p className="text-sm text-slate-400 mt-0.5 ml-7">{path.description}</p>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-400">Courses</p>
          <p className="text-lg font-bold text-slate-900">{path.courses.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-400">Students</p>
          <p className="text-lg font-bold text-slate-900">{path.members.length}</p>
        </div>
      </div>

      {/* Certificate setting */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={path.certificate_enabled ?? true}
            onChange={e => toggleCertificate(e.target.checked)}
            className="mt-0.5 accent-[#1B4F8A]"
          />
          <div>
            <p className="text-sm font-medium text-slate-800">Issue certificate on path completion</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Students receive a learning path certificate once they pass the final exam of every course in this path
            </p>
          </div>
        </label>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1">
          {([
            { key: "courses",  label: `Courses (${path.courses.length})` },
            { key: "students", label: `Students (${path.members.length})` },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn("px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                tab === t.key ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Courses tab ───────────────────────────────────────────── */}
      {tab === "courses" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Drag to reorder — students will follow this sequence.</p>
            <Button onClick={() => setPicker(true)} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2" size="sm">
              <Plus className="h-4 w-4" /> Add Course
            </Button>
          </div>
          {path.courses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-200 rounded-xl text-center">
              <BookOpen className="h-10 w-10 text-slate-300 mb-3" />
              <p className="font-medium text-slate-600 mb-1">No courses yet</p>
              <p className="text-sm text-slate-400 mb-4">Add courses in the order students should complete them.</p>
              <Button onClick={() => setPicker(true)} size="sm" className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
                <Plus className="h-4 w-4" /> Add First Course
              </Button>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={path.courses.map(c => c.path_course_id)} strategy={verticalListSortingStrategy}>
                {path.courses.map(c => (
                  <SortableCourseRow key={c.path_course_id} course={c} onRemove={removeCourse} />
                ))}
              </SortableContext>
            </DndContext>
          )}
          <CoursePicker open={picker} existingIds={existingCourseIds} onClose={() => setPicker(false)} onAdd={addCourse} />
        </div>
      )}

      {/* ── Students tab ──────────────────────────────────────────── */}
      {tab === "students" && (
        <div className="space-y-4">
          {/* Enroll section */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <p className="font-semibold text-slate-900 text-sm">Enroll Students into Courses</p>
            {enrollResult ? (
              <div className="flex items-center gap-6 py-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <div className="flex gap-6 text-sm">
                  <span><span className="font-bold text-[#1B4F8A]">{enrollResult.enrolled}</span> enrolled</span>
                  <span><span className="font-bold text-slate-400">{enrollResult.skipped}</span> already enrolled</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEnrollResult(null)} className="text-xs">Reset</Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                  <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-[#1B4F8A]" />
                  Send enrollment email
                </label>
                <Button size="sm" onClick={enroll}
                  disabled={enrolling || path.courses.length === 0 || path.members.length === 0}
                  className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
                  {enrolling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
                  {enrolling ? "Enrolling…" : "Enroll All into Path"}
                </Button>
              </div>
            )}
            {path.courses.length === 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <Info className="h-3.5 w-3.5" /> Add courses first before enrolling.
              </p>
            )}
          </div>

          {/* Student list */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400" /> Participants ({path.members.length})
              </h2>
              <div className="flex items-center gap-2">
                <div className="relative w-52">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input placeholder="Search…" className="pl-8 h-8 text-sm" value={search}
                    onChange={e => setSearch(e.target.value)} />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Button size="sm" onClick={() => setAddModal(true)} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
            </div>

            {path.members.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <Users className="h-10 w-10 text-slate-200 mb-3" />
                <p className="font-medium text-slate-600 mb-1">No students yet</p>
                <p className="text-sm text-slate-400 mb-4">Add students, then enroll them into the path's courses.</p>
                <Button size="sm" onClick={() => setAddModal(true)} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
                  <UserPlus className="h-4 w-4" /> Add Students
                </Button>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">No students match</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-5 py-2.5 font-medium text-slate-500 text-xs">Student</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs">Company</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs">Status</th>
                    <th className="px-4 py-2.5 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredMembers.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50 group transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {m.name[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{m.name}</p>
                            <p className="text-xs text-slate-400">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{m.company ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-semibold",
                          m.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                          {m.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => removeMember(m.id, m.name)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <AddStudentsModal
        open={addModal} pathId={id} existingIds={existingMemberIds}
        onClose={() => setAddModal(false)}
        onAdded={newMembers => setPath(prev => prev
          ? { ...prev, members: [...newMembers, ...prev.members] } : prev)}
      />
    </div>
  )
}
