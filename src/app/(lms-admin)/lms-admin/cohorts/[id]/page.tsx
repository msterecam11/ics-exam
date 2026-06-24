"use client"

import { use, useEffect, useState, useCallback } from "react"
import {
  ArrowLeft, Users, UserPlus, Trash2, Loader2, Search, X,
  BookOpen, CheckCircle2, GraduationCap, Info, Plus,
  Layers, ChevronDown, ChevronRight, Edit2, GripVertical,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { cn }    from "@/lib/utils"
import Link from "next/link"
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter,
} from "@dnd-kit/core"
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

// ── Types ─────────────────────────────────────────────────────────────────────
interface CourseItem {
  cohort_course_id?: string
  track_course_id?:  string
  order_index: number
  id: string; title: string; status: string
}
interface Track {
  id: string; name: string; order_index: number; courses: CourseItem[]
}
interface Member {
  id: string; name: string; email: string
  company: string | null; is_active: boolean; added_at: string; track_id: string | null
}
interface Cohort {
  id: string; name: string; description: string | null
  mode: "unified" | "specialization"; start_date: string | null; end_date: string | null
  certificate_enabled: boolean
  courses: CourseItem[]; tracks: Track[]; members: Member[]
}
interface Student { id: string; name: string; email: string; company: string | null; is_active: boolean }
type Tab = "courses" | "tracks" | "students" | "enroll"

// ── Shared: Sortable course row ───────────────────────────────────────────────
function SortableCourseRow({ course, idKey, onRemove }: {
  course: CourseItem; idKey: string; onRemove: (id: string) => void
}) {
  const sortId = (course as any)[idKey]
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortId })

  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 bg-white rounded-lg border border-slate-200 px-3 py-2.5 group",
        isDragging && "opacity-50 shadow-md"
      )}>
      <button {...attributes} {...listeners}
        className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0 touch-none">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
        {course.order_index + 1}
      </div>
      <div className="w-7 h-7 rounded-lg bg-[#1B4F8A]/10 flex items-center justify-center shrink-0">
        <BookOpen className="h-3.5 w-3.5 text-[#1B4F8A]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{course.title}</p>
        <p className="text-xs text-slate-400 capitalize">{course.status}</p>
      </div>
      <button onClick={() => onRemove(sortId)}
        className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Shared: Course picker dialog ──────────────────────────────────────────────
function CoursePicker({ open, existingIds, onClose, onAdd }: {
  open: boolean; existingIds: Set<string>; onClose: () => void; onAdd: (courseId: string) => Promise<void>
}) {
  const [all,    setAll]    = useState<Student[]>([])
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

  const filtered = all.filter((c: any) =>
    !existingIds.has(c.id) && (!search || c.title.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add Course</DialogTitle></DialogHeader>
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
              {search ? "No courses match" : "All available courses already added"}
            </p>
          ) : filtered.map((c: any) => (
            <button key={c.id} disabled={!!adding} onClick={async () => {
              setAdding(c.id); try { await onAdd(c.id) } finally { setAdding(null) }
            }}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-[#1B4F8A]/40 hover:bg-[#1B4F8A]/5 text-left disabled:opacity-60 transition-all">
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
function AddStudentsModal({ open, cohortId, existingIds, tracks, mode, onClose, onAdded }: {
  open: boolean; cohortId: string; existingIds: Set<string>; tracks: Track[]
  mode: "unified"|"specialization"; onClose: () => void; onAdded: (s: Member[]) => void
}) {
  const [all,      setAll]      = useState<Student[]>([])
  const [search,   setSearch]   = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [trackId,  setTrackId]  = useState("")
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    if (open) {
      setSelected(new Set()); setSearch(""); setTrackId("")
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
      const body: Record<string, unknown> = { action: "add_members", student_ids: [...selected] }
      if (mode === "specialization" && trackId) body.track_id = trackId
      const res  = await fetch(`/api/lms/cohorts/${cohortId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed"); return }
      toast.success(`${data.added} student${data.added !== 1 ? "s" : ""} added`)
      const newMembers = all.filter(s => selected.has(s.id))
        .map(s => ({ ...s, added_at: new Date().toISOString(), track_id: trackId || null }))
      onAdded(newMembers); onClose()
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Add Students</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          {mode === "specialization" && tracks.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Assign to Track (optional)</label>
              <select value={trackId} onChange={e => setTrackId(e.target.value)}
                className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm">
                <option value="">— No track —</option>
                {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
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
                {search ? "No students match" : "All students already in cohort"}
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
            <p className="text-xs text-[#1B4F8A] font-medium">{selected.size} student{selected.size !== 1 ? "s" : ""} selected</p>
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

// ── Track Panel (specialization) ──────────────────────────────────────────────
function TrackPanel({ track, onUpdate, onDelete }: {
  track: Track
  onUpdate: (updated: Track) => void
  onDelete: (trackId: string) => void
}) {
  const [expanded,  setExpanded]  = useState(false)
  const [picker,    setPicker]    = useState(false)
  const [editing,   setEditing]   = useState(false)
  const [name,      setName]      = useState(track.name)
  const [saving,    setSaving]    = useState(false)
  const [reordering, setReordering] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const existingIds = new Set(track.courses.map(c => c.id))

  async function addCourse(courseId: string) {
    const res = await fetch(`/api/lms/cohort-tracks/${track.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_course", course_id: courseId }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    onUpdate({ ...track, courses: [...track.courses, { ...data, order_index: track.courses.length }] })
    toast.success("Course added")
  }

  async function removeCourse(trackCourseId: string) {
    const res = await fetch(`/api/lms/cohort-tracks/${track.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove_course", track_course_id: trackCourseId }),
    })
    if (!res.ok) { toast.error("Failed to remove"); return }
    onUpdate({ ...track, courses: track.courses.filter(c => c.track_course_id !== trackCourseId).map((c, i) => ({ ...c, order_index: i })) })
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIdx = track.courses.findIndex(c => c.track_course_id === active.id)
    const newIdx = track.courses.findIndex(c => c.track_course_id === over.id)
    const reordered = arrayMove(track.courses, oldIdx, newIdx).map((c, i) => ({ ...c, order_index: i }))
    onUpdate({ ...track, courses: reordered })

    setReordering(true)
    await fetch(`/api/lms/cohort-tracks/${track.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder_courses", order: reordered.map(c => ({ track_course_id: c.track_course_id, order_index: c.order_index })) }),
    })
    setReordering(false)
  }

  async function saveName() {
    if (!name.trim() || name === track.name) { setEditing(false); return }
    setSaving(true)
    const res = await fetch("/api/lms/cohort-tracks", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: track.id, name: name.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Failed") } else {
      onUpdate({ ...track, name: data.name })
      toast.success("Track renamed")
    }
    setSaving(false); setEditing(false)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Track header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-2 flex-1 text-left">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
            <Layers className="h-4 w-4 text-violet-600" />
          </div>
          {editing ? (
            <Input value={name} onChange={e => setName(e.target.value)} className="h-7 text-sm"
              autoFocus onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setEditing(false); setName(track.name) } }}
              onClick={e => e.stopPropagation()} />
          ) : (
            <div className="flex-1">
              <p className="font-semibold text-slate-900 text-sm">{track.name}</p>
              <p className="text-xs text-slate-400">{track.courses.length} course{track.courses.length !== 1 ? "s" : ""}</p>
            </div>
          )}
          {expanded ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
        </button>
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <Button size="sm" onClick={saveName} disabled={saving} className="h-7 px-2 bg-[#1B4F8A] hover:bg-[#163f6f] text-white text-xs">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(track.name) }} className="h-7 px-2 text-xs">Cancel</Button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => onDelete(track.id)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded course list */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-2 bg-slate-50">
          {track.courses.length === 0 ? (
            <div className="text-center py-6">
              <BookOpen className="h-7 w-7 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No courses yet</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={track.courses.map(c => c.track_course_id!)} strategy={verticalListSortingStrategy}>
                {track.courses.map(c => (
                  <SortableCourseRow key={c.track_course_id} course={c} idKey="track_course_id" onRemove={removeCourse} />
                ))}
              </SortableContext>
            </DndContext>
          )}
          <Button size="sm" variant="outline" onClick={() => setPicker(true)}
            className="w-full gap-1.5 text-xs border-dashed">
            <Plus className="h-3.5 w-3.5" /> Add Course
          </Button>
        </div>
      )}

      <CoursePicker open={picker} existingIds={existingIds} onClose={() => setPicker(false)} onAdd={addCourse} />
    </div>
  )
}

// ── Enroll Tab ────────────────────────────────────────────────────────────────
function EnrollTab({ cohortId, cohort }: { cohortId: string; cohort: Cohort }) {
  const [sendEmail, setSendEmail] = useState(true)
  const [selTrack,  setSelTrack]  = useState("")
  const [enrolling, setEnrolling] = useState(false)
  const [result,    setResult]    = useState<{ enrolled: number; skipped: number } | null>(null)

  const isSpec = cohort.mode === "specialization"

  const hasCourses = isSpec
    ? cohort.tracks.some(t => t.courses.length > 0)
    : cohort.courses.length > 0

  async function enroll() {
    setEnrolling(true); setResult(null)
    const body: Record<string, unknown> = { action: "enroll", send_email: sendEmail }
    if (isSpec && selTrack) body.track_id = selTrack

    const res  = await fetch(`/api/lms/cohorts/${cohortId}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    const data = await res.json()
    setEnrolling(false)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    setResult({ enrolled: data.enrolled, skipped: data.skipped })
    toast.success(`${data.enrolled} enrollment${data.enrolled !== 1 ? "s" : ""} created`)
  }

  if (result) return (
    <div className="flex flex-col items-center justify-center py-16 text-center max-w-sm mx-auto">
      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
      </div>
      <p className="text-lg font-semibold text-slate-900 mb-5">Enrollment Complete</p>
      <div className="flex gap-10">
        <div><p className="text-3xl font-bold text-[#1B4F8A]">{result.enrolled}</p><p className="text-sm text-slate-500">Enrolled</p></div>
        <div><p className="text-3xl font-bold text-slate-400">{result.skipped}</p><p className="text-sm text-slate-500">Already enrolled</p></div>
      </div>
      <Button onClick={() => setResult(null)} variant="outline" className="mt-6">Enroll Again</Button>
    </div>
  )

  return (
    <div className="max-w-lg space-y-4 py-2">
      {!hasCourses && (
        <div className="bg-amber-50 rounded-xl px-4 py-3 flex gap-3 text-sm text-amber-700">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
          {isSpec ? "Add courses to tracks first." : "Add courses to this cohort first."}
        </div>
      )}
      {cohort.members.length === 0 && (
        <div className="bg-amber-50 rounded-xl px-4 py-3 flex gap-3 text-sm text-amber-700">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
          No students in this cohort yet.
        </div>
      )}
      {isSpec && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Enroll which track?</label>
          <select value={selTrack} onChange={e => setSelTrack(e.target.value)}
            className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm">
            <option value="">All tracks</option>
            {cohort.tracks.filter(t => t.courses.length > 0).map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.courses.length} courses)</option>
            ))}
          </select>
        </div>
      )}
      {!isSpec && cohort.courses.length > 0 && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Course Sequence</p>
          {cohort.courses.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
              <span className="w-5 h-5 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              {c.title}
            </div>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 accent-[#1B4F8A]" />
        <span className="text-sm text-slate-700">Send enrollment email to students</span>
      </label>
      <div className="flex items-center gap-2 text-sm text-slate-500 bg-blue-50 rounded-xl px-4 py-3">
        <Info className="h-4 w-4 text-blue-400 shrink-0" />
        {cohort.members.length} student{cohort.members.length !== 1 ? "s" : ""} will be enrolled. Already-enrolled students are skipped.
      </div>
      <Button onClick={enroll} disabled={enrolling || !hasCourses || !cohort.members.length}
        className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2 w-full">
        {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
        {enrolling ? "Enrolling…" : "Enroll Now"}
      </Button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CohortDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: cohortId } = use(params)
  const [cohort,    setCohort]    = useState<Cohort | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState<Tab>("courses")
  const [search,    setSearch]    = useState("")
  const [addModal,  setAddModal]  = useState(false)
  const [picker,    setPicker]    = useState(false)  // unified course picker
  const [reordering, setReordering] = useState(false)
  const [assigningMember, setAssigningMember] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/lms/cohorts/${cohortId}`)
    if (res.ok) setCohort(await res.json())
    setLoading(false)
  }, [cohortId])

  useEffect(() => { load() }, [load])

  // ── Unified course actions ────────────────────────────────────
  async function addCohortCourse(courseId: string) {
    const res = await fetch(`/api/lms/cohorts/${cohortId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_course", course_id: courseId }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    setCohort(prev => prev ? { ...prev, courses: [...prev.courses, data] } : prev)
    toast.success("Course added")
  }

  async function removeCohortCourse(cohortCourseId: string) {
    const res = await fetch(`/api/lms/cohorts/${cohortId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove_course", cohort_course_id: cohortCourseId }),
    })
    if (!res.ok) { toast.error("Failed to remove"); return }
    setCohort(prev => prev ? {
      ...prev,
      courses: prev.courses.filter(c => c.cohort_course_id !== cohortCourseId).map((c, i) => ({ ...c, order_index: i })),
    } : prev)
  }

  async function handleCohortCourseReorder(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !cohort) return

    const oldIdx = cohort.courses.findIndex(c => c.cohort_course_id === active.id)
    const newIdx = cohort.courses.findIndex(c => c.cohort_course_id === over.id)
    const reordered = arrayMove(cohort.courses, oldIdx, newIdx).map((c, i) => ({ ...c, order_index: i }))
    setCohort({ ...cohort, courses: reordered })

    setReordering(true)
    await fetch(`/api/lms/cohorts/${cohortId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder_courses", order: reordered.map(c => ({ cohort_course_id: c.cohort_course_id, order_index: c.order_index })) }),
    })
    setReordering(false)
  }

  // ── Track actions ─────────────────────────────────────────────
  async function addTrack() {
    const name = prompt("Track name:")
    if (!name?.trim()) return
    const res = await fetch("/api/lms/cohort-tracks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cohort_id: cohortId, name: name.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    setCohort(prev => prev ? { ...prev, tracks: [...prev.tracks, data] } : prev)
    toast.success("Track created")
  }

  async function deleteTrack(trackId: string) {
    if (!confirm("Delete this track? Students will be unassigned.")) return
    const res = await fetch(`/api/lms/cohort-tracks?id=${trackId}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Failed to delete"); return }
    setCohort(prev => prev ? {
      ...prev,
      tracks:  prev.tracks.filter(t => t.id !== trackId),
      members: prev.members.map(m => m.track_id === trackId ? { ...m, track_id: null } : m),
    } : prev)
    toast.success("Track deleted")
  }

  async function toggleCertificate(enabled: boolean) {
    setCohort(prev => prev ? { ...prev, certificate_enabled: enabled } : prev)
    const res = await fetch("/api/lms/cohorts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cohortId, certificate_enabled: enabled }),
    })
    if (!res.ok) {
      setCohort(prev => prev ? { ...prev, certificate_enabled: !enabled } : prev)
      toast.error("Failed to update certificate setting")
    }
  }

  // ── Member actions ────────────────────────────────────────────
  async function removeMember(memberId: string, name: string) {
    if (!confirm(`Remove ${name} from this cohort?`)) return
    const res = await fetch(`/api/lms/cohorts/${cohortId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove_member", student_id: memberId }),
    })
    if (!res.ok) { toast.error("Failed"); return }
    toast.success(`${name} removed`)
    setCohort(prev => prev ? { ...prev, members: prev.members.filter(m => m.id !== memberId) } : null)
  }

  async function assignTrack(studentId: string, trackId: string | null) {
    setAssigningMember(studentId)
    await fetch(`/api/lms/cohorts/${cohortId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign_track", student_id: studentId, track_id: trackId }),
    })
    setCohort(prev => prev ? {
      ...prev, members: prev.members.map(m => m.id === studentId ? { ...m, track_id: trackId } : m),
    } : null)
    setAssigningMember(null)
  }

  // ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex justify-center pt-20"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>
  )
  if (!cohort) return (
    <div className="p-6 text-center text-slate-500">
      Cohort not found. <Link href="/lms-admin/cohorts" className="text-[#1B4F8A] underline">Back to cohorts</Link>
    </div>
  )

  const isSpec     = cohort.mode === "specialization"
  const existingMemberIds = new Set(cohort.members.map(m => m.id))
  const existingCourseIds = new Set(cohort.courses.map(c => c.id))

  const tabs: { key: Tab; label: string }[] = isSpec
    ? [
        { key: "tracks",   label: `Tracks (${cohort.tracks.length})` },
        { key: "students", label: `Students (${cohort.members.length})` },
        { key: "enroll",   label: "Enroll" },
      ]
    : [
        { key: "courses",  label: `Courses (${cohort.courses.length})` },
        { key: "students", label: `Students (${cohort.members.length})` },
        { key: "enroll",   label: "Enroll" },
      ]

  const filteredMembers = cohort.members.filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  )

  function fmt(d: string | null) {
    if (!d) return "—"
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/lms-admin/cohorts"
          className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2.5">
            {isSpec ? <Layers className="h-6 w-6 text-violet-600" /> : <GraduationCap className="h-6 w-6 text-[#1B4F8A]" />}
            <h1 className="text-2xl font-bold text-slate-900">{cohort.name}</h1>
            <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full",
              isSpec ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700")}>
              {isSpec ? "Specialization" : "Unified"}
            </span>
            {reordering && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          </div>
          {cohort.description && <p className="text-sm text-slate-500 mt-0.5 ml-8">{cohort.description}</p>}
        </div>
        <Button onClick={() => setAddModal(true)} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
          <UserPlus className="h-4 w-4" /> Add Students
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Students",  value: cohort.members.length },
          { label: "Active",    value: cohort.members.filter(m => m.is_active).length },
          { label: "Start",     value: fmt(cohort.start_date), text: true },
          { label: "End",       value: fmt(cohort.end_date),   text: true },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-400 mb-0.5">{s.label}</p>
            <p className={cn(s.text ? "text-sm font-semibold text-slate-700 mt-0.5" : "text-lg font-bold text-slate-900")}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Certificate setting */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={cohort.certificate_enabled ?? true}
            onChange={e => toggleCertificate(e.target.checked)}
            className="mt-0.5 accent-[#1B4F8A]"
          />
          <div>
            <p className="text-sm font-medium text-slate-800">Issue certificate on cohort completion</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {isSpec
                ? "Students receive a cohort certificate once they pass the final exam of every course in their assigned track"
                : "Students receive a cohort certificate once they pass the final exam of every course in this cohort"}
            </p>
          </div>
        </label>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn("px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                tab === t.key ? "border-[#1B4F8A] text-[#1B4F8A]" : "border-transparent text-slate-500 hover:text-slate-700")}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Courses tab (unified) ─────────────────────────────────── */}
      {tab === "courses" && !isSpec && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Add courses in the order students will take them. Drag to reorder.</p>
            <Button onClick={() => setPicker(true)} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2" size="sm">
              <Plus className="h-4 w-4" /> Add Course
            </Button>
          </div>
          {cohort.courses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-200 rounded-xl text-center">
              <BookOpen className="h-10 w-10 text-slate-300 mb-3" />
              <p className="font-medium text-slate-600 mb-1">No courses yet</p>
              <p className="text-sm text-slate-400 mb-4">Add courses in the order students should complete them.</p>
              <Button onClick={() => setPicker(true)} size="sm" className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
                <Plus className="h-4 w-4" /> Add First Course
              </Button>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCohortCourseReorder}>
              <SortableContext items={cohort.courses.map(c => c.cohort_course_id!)} strategy={verticalListSortingStrategy}>
                {cohort.courses.map(c => (
                  <SortableCourseRow key={c.cohort_course_id} course={c} idKey="cohort_course_id" onRemove={removeCohortCourse} />
                ))}
              </SortableContext>
            </DndContext>
          )}
          <CoursePicker open={picker} existingIds={existingCourseIds} onClose={() => setPicker(false)} onAdd={addCohortCourse} />
        </div>
      )}

      {/* ── Tracks tab (specialization) ───────────────────────────── */}
      {tab === "tracks" && isSpec && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Each track has its own course sequence. Assign students to tracks in the Students tab.</p>
            <Button onClick={addTrack} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2" size="sm">
              <Plus className="h-4 w-4" /> New Track
            </Button>
          </div>
          {cohort.tracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-200 rounded-xl text-center">
              <Layers className="h-10 w-10 text-slate-300 mb-3" />
              <p className="font-medium text-slate-600 mb-1">No tracks yet</p>
              <p className="text-sm text-slate-400 mb-4">Create tracks to split students into groups with different course sequences.</p>
              <Button onClick={addTrack} size="sm" className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
                <Plus className="h-4 w-4" /> Create First Track
              </Button>
            </div>
          ) : cohort.tracks.map(track => (
            <TrackPanel
              key={track.id}
              track={track}
              onUpdate={updated => setCohort(prev => prev ? {
                ...prev, tracks: prev.tracks.map(t => t.id === updated.id ? updated : t),
              } : prev)}
              onDelete={deleteTrack}
            />
          ))}
        </div>
      )}

      {/* ── Students tab ──────────────────────────────────────────── */}
      {tab === "students" && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-400" /> Members
            </h2>
            <div className="relative w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input placeholder="Search members…" className="pl-8 h-8 text-sm" value={search}
                onChange={e => setSearch(e.target.value)} />
              {search && (
                <button onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          {cohort.members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-10 w-10 text-slate-200 mb-3" />
              <p className="font-medium text-slate-600 mb-1">No students yet</p>
              <p className="text-sm text-slate-400 mb-4">Add students to start managing them as a group.</p>
              <Button onClick={() => setAddModal(true)} size="sm" className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
                <UserPlus className="h-4 w-4" /> Add Students
              </Button>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">No members match your search</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-5 py-2.5 font-medium text-slate-500 text-xs">Student</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs">Company</th>
                  {isSpec && <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs">Track</th>}
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs">Status</th>
                  <th className="px-4 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredMembers.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50 group transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] font-bold text-xs flex items-center justify-center shrink-0">
                          {m.name[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{m.name}</p>
                          <p className="text-xs text-slate-400">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{m.company ?? "—"}</td>
                    {isSpec && (
                      <td className="px-4 py-3">
                        <div className="relative inline-flex items-center">
                          <select value={m.track_id ?? ""} disabled={assigningMember === m.id}
                            onChange={e => assignTrack(m.id, e.target.value || null)}
                            className="appearance-none w-40 h-7 rounded-lg border border-slate-200 bg-white px-2 pr-6 text-xs text-slate-700 cursor-pointer hover:border-slate-300 focus:outline-none disabled:opacity-50">
                            <option value="">— No track —</option>
                            {cohort.tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          {assigningMember === m.id
                            ? <Loader2 className="absolute right-1.5 h-3 w-3 animate-spin text-slate-400" />
                            : <ChevronDown className="absolute right-1.5 h-3 w-3 text-slate-400 pointer-events-none" />}
                        </div>
                      </td>
                    )}
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
      )}

      {/* ── Enroll tab ────────────────────────────────────────────── */}
      {tab === "enroll" && <EnrollTab cohortId={cohortId} cohort={cohort} />}

      {/* Add Students Modal */}
      <AddStudentsModal
        open={addModal} cohortId={cohortId} existingIds={existingMemberIds}
        tracks={cohort.tracks} mode={cohort.mode}
        onClose={() => setAddModal(false)}
        onAdded={newMembers => setCohort(prev => prev
          ? { ...prev, members: [...newMembers, ...prev.members] } : null)}
      />
    </div>
  )
}
