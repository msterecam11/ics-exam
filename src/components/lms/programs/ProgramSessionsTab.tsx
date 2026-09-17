"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CalendarDays, Clock, MapPin, Plus, Loader2, Users, Video, ChevronRight, Edit, Trash2, Layers, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { type ProgramDetail, postJson } from "./shared"

export type ProgramSession = {
  id: string; title: string; session_date: string; start_time: string; duration_minutes: number
  location: string | null; meeting_link: string | null; recording_url: string | null
  agenda: string | null; notes: string | null
  course_id: string; module_id: string | null; track_id: string | null
  course_title: string | null; track_name: string | null; module_title: string | null
  closed_at: string | null; is_open: boolean; attendance_count: number; marked_count: number
}

/** Ordered course ids a track takes in this program (null = members without a track / everyone). */
function coursesForTrack(detail: ProgramDetail, trackId: string | null): string[] {
  const items = detail.items
    .filter(i => i.track_id === null || (trackId !== null && i.track_id === trackId))
    .sort((a, b) => (a.track_id === null ? 0 : 1) - (b.track_id === null ? 0 : 1) || a.order_index - b.order_index)
  const out: string[] = []
  for (const i of items) {
    const ids = i.course_id ? [i.course_id]
      : detail.path_courses.filter(pc => pc.path_id === i.path_id).sort((a, b) => a.order_index - b.order_index).map(pc => pc.lms_courses?.id).filter(Boolean) as string[]
    for (const id of ids) if (!out.includes(id)) out.push(id)
  }
  return out
}

function SessionDialog({ detail, editing, open, onClose, onSaved }: {
  detail: ProgramDetail; editing: ProgramSession | null; open: boolean; onClose: () => void; onSaved: () => void
}) {
  const { program, tracks } = detail
  const usesTracks = program.structure === "tracks"
  const courseTitle = (id: string) => detail.rules.find(r => r.course_id === id)?.lms_courses?.title ?? "Course"

  const empty = { title: "", track_id: "", course_id: "", module_id: "", session_date: "", start_time: "09:00", duration_minutes: "60", location: "", meeting_link: "", agenda: "", notes: "" }
  const [f, setF] = useState(empty)
  const [modules, setModules] = useState<{ id: string; title: string; module_type: string }[]>([])
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof empty, v: string) => setF(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    setF(editing ? {
      title: editing.title, track_id: editing.track_id ?? "", course_id: editing.course_id, module_id: editing.module_id ?? "",
      session_date: editing.session_date, start_time: editing.start_time?.slice(0, 5) ?? "09:00",
      duration_minutes: String(editing.duration_minutes ?? 60), location: editing.location ?? "",
      meeting_link: editing.meeting_link ?? "", agenda: editing.agenda ?? "", notes: editing.notes ?? "",
    } : empty)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  // Courses the chosen track takes; for "all tracks", every course anyone in the program takes.
  const courseOptions = useMemo(() => {
    if (!usesTracks || f.track_id) return coursesForTrack(detail, f.track_id || null)
    const all: string[] = []
    for (const t of [null, ...tracks.map(t => t.id)]) for (const c of coursesForTrack(detail, t)) if (!all.includes(c)) all.push(c)
    return all
  }, [detail, f.track_id, usesTracks, tracks])

  useEffect(() => {
    setModules([])
    if (!f.course_id) return
    fetch(`/api/lms/modules?course_id=${f.course_id}`).then(r => r.ok ? r.json() : []).then(d => setModules((Array.isArray(d) ? d : []).map((m: any) => ({ id: m.id, title: m.title, module_type: m.module_type }))))
  }, [f.course_id])

  async function save() {
    if (!f.title.trim()) { toast.error("Title is required"); return }
    if (!f.course_id) { toast.error("Choose the course"); return }
    if (!f.session_date || !f.start_time) { toast.error("Date and start time are required"); return }
    setSaving(true)
    const payload: Record<string, unknown> = {
      title: f.title, session_date: f.session_date, start_time: f.start_time, duration_minutes: Number(f.duration_minutes),
      location: f.location, meeting_link: f.meeting_link, agenda: f.agenda, notes: f.notes,
      track_id: f.track_id || null, module_id: f.module_id || null,
    }
    const { ok, data } = editing
      ? await postJson("/api/lms/sessions", "PATCH", { id: editing.id, ...payload })
      : await postJson("/api/lms/sessions", "POST", { ...payload, program_id: program.id, course_id: f.course_id })
    setSaving(false)
    if (!ok) { toast.error(data.error ?? "Could not save the session"); return }
    toast.success(editing ? "Session updated" : "Session scheduled")
    onSaved(); onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit session" : "Schedule a session"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1"><Label>Title *</Label><Input value={f.title} onChange={e => set("title", e.target.value)} placeholder="Day 1 — Introduction" autoFocus /></div>

          {usesTracks && (
            <div className="space-y-1">
              <Label>For</Label>
              <select value={f.track_id} onChange={e => { set("track_id", e.target.value); if (!editing) set("course_id", "") }}
                className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white">
                <option value="">All tracks (everyone taking the course)</option>
                {tracks.map(t => <option key={t.id} value={t.id}>Track: {t.name}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Course *</Label>
              <select value={f.course_id} disabled={!!editing} onChange={e => { set("course_id", e.target.value); set("module_id", "") }}
                className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white disabled:bg-slate-50">
                <option value="">Choose…</option>
                {(editing && !courseOptions.includes(f.course_id) ? [f.course_id, ...courseOptions] : courseOptions)
                  .map(id => <option key={id} value={id}>{courseTitle(id)}</option>)}
              </select>
              {editing && <p className="text-xs text-slate-400">The course can&apos;t change once scheduled.</p>}
            </div>
            <div className="space-y-1">
              <Label>Module (optional)</Label>
              <select value={f.module_id} onChange={e => set("module_id", e.target.value)} disabled={!f.course_id}
                className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white disabled:bg-slate-50">
                <option value="">Not linked to a module</option>
                {modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Date *</Label><Input type="date" value={f.session_date} onChange={e => set("session_date", e.target.value)} /></div>
            <div className="space-y-1"><Label>Start *</Label><Input type="time" value={f.start_time} onChange={e => set("start_time", e.target.value)} /></div>
            <div className="space-y-1"><Label>Minutes</Label><Input type="number" min={5} max={1440} value={f.duration_minutes} onChange={e => set("duration_minutes", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Location</Label><Input value={f.location} onChange={e => set("location", e.target.value)} placeholder="Room 2, Riyadh campus" /></div>
            <div className="space-y-1"><Label>Online meeting link</Label><Input value={f.meeting_link} onChange={e => set("meeting_link", e.target.value)} placeholder="https://…" /></div>
          </div>
          <div className="space-y-1">
            <Label>Agenda</Label>
            <textarea value={f.agenda} onChange={e => set("agenda", e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none" />
          </div>
          <div className="space-y-1">
            <Label>Notes for students</Label>
            <textarea value={f.notes} onChange={e => set("notes", e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />} {editing ? "Save" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ProgramSessionsTab({ detail, isAdmin }: { detail: ProgramDetail; isAdmin: boolean }) {
  const { program } = detail
  const canEdit = program.status !== "archived"
  const [sessions, setSessions] = useState<ProgramSession[]>([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState<{ open: boolean; editing: ProgramSession | null }>({ open: false, editing: null })
  const [trackFilter, setTrackFilter] = useState("")

  const load = useCallback(async () => {
    const res = await fetch(`/api/lms/sessions?program_id=${program.id}`)
    if (res.ok) { const d = await res.json(); setSessions(Array.isArray(d) ? d : []) }
    else toast.error("Could not load sessions")
    setLoading(false)
  }, [program.id])
  useEffect(() => { load() }, [load])

  async function remove(s: ProgramSession) {
    if (!confirm(`Delete "${s.title}"?`)) return
    const res = await fetch(`/api/lms/sessions?id=${s.id}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? "Could not delete"); return }
    toast.success("Session deleted"); load()
  }

  const today = new Date().toISOString().slice(0, 10)
  const visible = sessions.filter(s => !trackFilter || (trackFilter === "all" ? s.track_id === null : s.track_id === trackFilter))
  const upcoming = visible.filter(s => s.session_date >= today && s.is_open).sort((a, b) => (a.session_date + a.start_time).localeCompare(b.session_date + b.start_time))
  const past = visible.filter(s => !(s.session_date >= today && s.is_open))

  const noCourses = detail.rules.length === 0

  const Card = ({ s }: { s: ProgramSession }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-4">
      <div className="w-12 text-center shrink-0">
        <p className="text-[10px] uppercase text-slate-400">{new Date(s.session_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" })}</p>
        <p className="text-xl font-bold text-slate-800 leading-none">{new Date(s.session_date + "T00:00:00").getDate()}</p>
        <p className="text-[10px] uppercase text-slate-400">{new Date(s.session_date + "T00:00:00").toLocaleDateString("en-GB", { month: "short" })}</p>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm text-slate-900">{s.title}</p>
          {!s.is_open && <span className="text-[10px] font-semibold uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Closed</span>}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {s.start_time?.slice(0, 5)} · {s.duration_minutes} min</span>
          <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {s.course_title}</span>
          {program.structure === "tracks" && <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {s.track_name ?? "All tracks"}</span>}
          {s.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {s.location}</span>}
          {s.meeting_link && <a href={s.meeting_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#1B4F8A] hover:underline"><Video className="h-3 w-3" /> Meeting link</a>}
          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {s.attendance_count} attended{s.marked_count ? ` · ${s.marked_count} marked` : ""}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Link href={`/lms-admin/sessions/${s.id}`}>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1">Attendance <ChevronRight className="h-3 w-3" /></Button>
        </Link>
        {canEdit && <button onClick={() => setDialog({ open: true, editing: s })} className="p-1.5 text-slate-400 hover:text-[#1B4F8A]" aria-label="Edit"><Edit className="h-4 w-4" /></button>}
        {isAdmin && <button onClick={() => remove(s)} className="p-1.5 text-slate-300 hover:text-red-500" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>}
      </div>
    </div>
  )

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-2 flex-wrap">
        {program.structure === "tracks" && (
          <select value={trackFilter} onChange={e => setTrackFilter(e.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white">
            <option value="">All sessions</option>
            <option value="all">For all tracks</option>
            {detail.tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {canEdit && (
          <Button onClick={() => setDialog({ open: true, editing: null })} disabled={noCourses}
            className="ml-auto bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
            <Plus className="h-4 w-4" /> Schedule session
          </Button>
        )}
      </div>
      {noCourses && <p className="text-sm text-amber-600">Add courses in the Structure tab before scheduling sessions.</p>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
      ) : visible.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-dashed border-slate-200">
          <CalendarDays className="h-10 w-10 text-slate-200 mx-auto mb-2" />
          <p className="text-slate-600 font-medium text-sm">No sessions scheduled</p>
          <p className="text-xs text-slate-400 mt-1">Classes you schedule here are only for this program&apos;s students.</p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Upcoming</p>
              {upcoming.map(s => <Card key={s.id} s={s} />)}
            </section>
          )}
          {past.length > 0 && (
            <section className={cn("space-y-2", upcoming.length > 0 && "pt-2")}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Past &amp; closed</p>
              {past.map(s => <Card key={s.id} s={s} />)}
            </section>
          )}
        </>
      )}

      <SessionDialog detail={detail} editing={dialog.editing} open={dialog.open} onClose={() => setDialog({ open: false, editing: null })} onSaved={load} />
    </div>
  )
}
