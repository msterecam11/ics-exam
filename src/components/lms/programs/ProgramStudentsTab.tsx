"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Plus, Search, Loader2, UserMinus, UserCheck, CalendarPlus, ArrowRightLeft, Layers, BarChart2, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { type ProgramDetail, fmtDate, postJson } from "./shared"

type StudentOption = { id: string; name: string; email: string; company_id: string | null; lms_companies: { name: string } | null }
type Member = ProgramDetail["members"][number]

function AddStudentsDialog({ detail, open, onClose, onDone }: { detail: ProgramDetail; open: boolean; onClose: () => void; onDone: () => void }) {
  const { program, tracks } = detail
  const [students, setStudents] = useState<StudentOption[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [onlyClient, setOnlyClient] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [trackId, setTrackId] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelected(new Set()); setSearch(""); setTrackId(tracks[0]?.id ?? ""); setOnlyClient(!!program.company_id)
    setLoading(true)
    fetch("/api/lms/students?limit=500").then(r => r.ok ? r.json() : { students: [] })
      .then(d => setStudents(d.students ?? [])).finally(() => setLoading(false))
  }, [open, program.company_id, tracks])

  const inProgram = useMemo(() => new Set(detail.members.map(m => m.student_id)), [detail.members])
  const q = search.trim().toLowerCase()
  const list = students
    .filter(s => !inProgram.has(s.id))
    .filter(s => !onlyClient || !program.company_id || s.company_id === program.company_id)
    .filter(s => !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))

  async function add() {
    if (!selected.size) return
    if (program.structure === "tracks" && !trackId) { toast.error("Choose a track"); return }
    setSaving(true)
    const { ok, data } = await postJson(`/api/lms/programs/${program.id}/members`, "POST", { student_ids: [...selected], track_id: trackId || null })
    setSaving(false)
    if (!ok) { toast.error(data.error ?? "Could not add students"); return }
    const added = (data.results ?? []).filter((r: any) => r.status === "added").length
    toast.success(`${added} student${added !== 1 ? "s" : ""} added${program.status === "draft" ? " — they'll see the program once it's activated" : ""}`)
    if (data.other_company) toast.info(`${data.other_company} of them belong to another company or are individuals`)
    if (data.issues?.length) toast.warning(`Some courses couldn't be enrolled: ${data.issues.slice(0, 3).join("; ")}`, { duration: 10000 })
    onDone(); onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Add students to {program.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          {program.structure === "tracks" && (
            <div className="space-y-1">
              <Label>Track *</Label>
              {tracks.length === 0
                ? <p className="text-sm text-amber-600">Add a track in the Structure tab first.</p>
                : (
                  <select value={trackId} onChange={e => setTrackId(e.target.value)} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white">
                    {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Search students…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {program.company_id && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={onlyClient} onChange={e => setOnlyClient(e.target.checked)} />
              Only {program.lms_companies?.name} students
            </label>
          )}
          <div className="rounded-lg border border-slate-200 max-h-72 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
            ) : list.length === 0 ? (
              <p className="text-sm text-slate-400 p-4 text-center">No students to add</p>
            ) : list.map(s => (
              <label key={s.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={selected.has(s.id)}
                  onChange={e => setSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(s.id) : n.delete(s.id); return n })} />
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 truncate">{s.name}</p>
                  <p className="text-xs text-slate-400 truncate">{s.email}{s.lms_companies ? ` · ${s.lms_companies.name}` : " · Individual"}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={add} disabled={saving || !selected.size || (program.structure === "tracks" && !tracks.length)}
            className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add {selected.size || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MoveDialog({ detail, member, open, onClose, onDone }: { detail: ProgramDetail; member: Member | null; open: boolean; onClose: () => void; onDone: () => void }) {
  const [programs, setPrograms] = useState<{ id: string; name: string; status: string; structure: string }[]>([])
  const [toId, setToId] = useState("")
  const [tracks, setTracks] = useState<{ id: string; name: string }[]>([])
  const [trackId, setTrackId] = useState("")
  const [mode, setMode] = useState<"transfer" | "retake">("transfer")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setToId(""); setTrackId(""); setMode("transfer")
    fetch("/api/lms/programs").then(r => r.ok ? r.json() : []).then(d =>
      setPrograms((Array.isArray(d) ? d : []).filter((p: any) => p.id !== detail.program.id && (p.status === "draft" || p.status === "active"))))
  }, [open, detail.program.id])

  useEffect(() => {
    setTracks([]); setTrackId("")
    if (!toId) return
    fetch(`/api/lms/programs/${toId}`).then(r => r.ok ? r.json() : null).then(d => { setTracks(d?.tracks ?? []); setTrackId(d?.tracks?.[0]?.id ?? "") })
  }, [toId])

  const target = programs.find(p => p.id === toId)

  async function move() {
    if (!member || !toId) return
    setSaving(true)
    const { ok, data } = await postJson(`/api/lms/programs/${detail.program.id}/members`, "PATCH",
      { member_id: member.id, action: mode, to_program_id: toId, to_track_id: trackId || null })
    setSaving(false)
    if (!ok) { toast.error(data.error ?? "Could not move"); return }
    toast.success(mode === "transfer" ? "Moved — progress went with the student" : "Moved for a retake — a fresh start; the old record is kept")
    if (data.sync?.issues?.length) toast.warning(`Some courses couldn't be enrolled: ${data.sync.issues.map((i: any) => i.reason).slice(0, 3).join("; ")}`, { duration: 10000 })
    onDone(); onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Move {member?.lms_students?.name} to another program</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Program</Label>
            <select value={toId} onChange={e => setToId(e.target.value)} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white">
              <option value="">Choose…</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}{p.status === "draft" ? " (draft)" : ""}</option>)}
            </select>
          </div>
          {target?.structure === "tracks" && (
            <div className="space-y-1">
              <Label>Track</Label>
              <select value={trackId} onChange={e => setTrackId(e.target.value)} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white">
                {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {([["transfer", "Transfer", "Progress, attempts and certificates move with them"], ["retake", "Retake", "Fresh start; this program keeps its record"]] as const).map(([k, label, hint]) => (
              <button key={k} type="button" onClick={() => setMode(k)}
                className={cn("p-3 rounded-lg border-2 text-left", mode === k ? "border-[#1B4F8A] bg-[#1B4F8A]/5" : "border-slate-200")}>
                <p className={cn("text-sm font-semibold", mode === k ? "text-[#1B4F8A]" : "text-slate-700")}>{label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{hint}</p>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={move} disabled={saving || !toId || (target?.structure === "tracks" && !trackId)} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />} Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ProgramStudentsTab({ detail, isAdmin, onChanged }: { detail: ProgramDetail; isAdmin: boolean; onChanged: () => void }) {
  const { program, tracks, members } = detail
  const canEdit = isAdmin && program.status !== "archived"
  const [addOpen, setAddOpen] = useState(false)
  const [moveMember, setMoveMember] = useState<Member | null>(null)
  const [search, setSearch] = useState("")
  const [trackFilter, setTrackFilter] = useState("")
  const [showWithdrawn, setShowWithdrawn] = useState(false)
  const trackName = (id: string | null) => tracks.find(t => t.id === id)?.name ?? "—"
  const courseTitle = (courseId: string) =>
    detail.rules.find(r => r.course_id === courseId)?.lms_courses?.title ?? "Course"

  async function act(member: Member, body: Record<string, unknown>, okMsg: string) {
    const { ok, data } = await postJson(`/api/lms/programs/${program.id}/members`, "PATCH", { member_id: member.id, ...body })
    if (!ok) { toast.error(data.error ?? "Could not update"); return }
    toast.success(okMsg)
    if (data.sync?.issues?.length) toast.warning(`Some courses couldn't be enrolled: ${data.sync.issues.map((i: any) => i.reason).slice(0, 3).join("; ")}`, { duration: 10000 })
    onChanged()
  }

  const q = search.trim().toLowerCase()
  const rows = members
    .filter(m => showWithdrawn || m.status !== "withdrawn")
    .filter(m => !trackFilter || m.track_id === trackFilter)
    .filter(m => !q || (m.lms_students?.name ?? "").toLowerCase().includes(q) || (m.lms_students?.email ?? "").toLowerCase().includes(q))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {program.structure === "tracks" && (
          <select value={trackFilter} onChange={e => setTrackFilter(e.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white">
            <option value="">All tracks</option>
            {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showWithdrawn} onChange={e => setShowWithdrawn(e.target.checked)} /> Show withdrawn
        </label>
        {canEdit && (
          <Button onClick={() => setAddOpen(true)} className="ml-auto bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
            <Plus className="h-4 w-4" /> Add students
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-12 text-center">No students{members.length ? " match" : " yet"}.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Student</th>
                {program.structure === "tracks" && <th className="text-left px-4 py-3 font-medium">Track</th>}
                <th className="text-left px-4 py-3 font-medium">Courses</th>
                <th className="text-left px-4 py-3 font-medium">Progress</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">End date</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(m => (
                <tr key={m.id} className={cn(m.status === "withdrawn" && "opacity-60")}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{m.lms_students?.name}</p>
                    <p className="text-xs text-slate-500">{m.lms_students?.email}</p>
                    {m.status !== "active" && (
                      <span className={cn("text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded", m.status === "completed" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500")}>{m.status}</span>
                    )}
                  </td>
                  {program.structure === "tracks" && <td className="px-4 py-3 text-slate-700">{trackName(m.track_id)}</td>}
                  <td className="px-4 py-3 text-slate-600">
                    {m.completed_count}/{m.course_count} completed
                    <p className="text-xs text-slate-400 truncate max-w-[16rem]" title={m.enrollments.filter(e => e.status !== "dropped").map(e => courseTitle(e.course_id)).join(", ")}>
                      {m.enrollments.filter(e => e.status !== "dropped").map(e => courseTitle(e.course_id)).join(", ")}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-[#1B4F8A]" style={{ width: `${m.progress_pct}%` }} /></div>
                      <span className="text-xs text-slate-500">{m.progress_pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 hidden lg:table-cell">
                    {m.end_date_override ? <span className="text-amber-600">{fmtDate(m.end_date_override)} (extended)</span> : fmtDate(program.end_date)}
                  </td>
                  <td className="px-2 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => { window.location.href = `/lms-admin/progress/${m.student_id}` }}>
                          <BarChart2 className="h-4 w-4" /> View progress
                        </DropdownMenuItem>
                        {canEdit && m.status !== "withdrawn" && program.structure === "tracks" && tracks.filter(t => t.id !== m.track_id).map(t => (
                          <DropdownMenuItem key={t.id} className="gap-2 cursor-pointer"
                            onClick={() => { if (confirm(`Move ${m.lms_students?.name} to ${t.name}?\n\nCourses in both tracks keep their progress. Courses only in the old track are withdrawn (history kept).`)) act(m, { action: "move_track", track_id: t.id }, `Moved to ${t.name}`) }}>
                            <Layers className="h-4 w-4" /> Move to {t.name}
                          </DropdownMenuItem>
                        ))}
                        {canEdit && m.status !== "withdrawn" && (
                          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => {
                            const d = prompt("Personal end date for this student (YYYY-MM-DD). Leave empty to use the program's end date.", m.end_date_override ?? "")
                            if (d === null) return
                            act(m, { action: "extend", end_date: d.trim() || null }, d.trim() ? "End date extended" : "Extension removed")
                          }}>
                            <CalendarPlus className="h-4 w-4" /> Extend end date
                          </DropdownMenuItem>
                        )}
                        {canEdit && m.status !== "withdrawn" && (
                          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => setMoveMember(m)}>
                            <ArrowRightLeft className="h-4 w-4" /> Move to another program
                          </DropdownMenuItem>
                        )}
                        {canEdit && m.status !== "withdrawn" && (
                          <DropdownMenuItem className="gap-2 cursor-pointer text-red-600 focus:text-red-600" onClick={() => {
                            if (confirm(`Withdraw ${m.lms_students?.name} from this program?\n\nThey lose access. Their progress and results are kept and they can be reinstated.`))
                              act(m, { action: "withdraw" }, "Student withdrawn")
                          }}>
                            <UserMinus className="h-4 w-4" /> Withdraw
                          </DropdownMenuItem>
                        )}
                        {canEdit && m.status === "withdrawn" && (
                          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => act(m, { action: "reinstate" }, "Student reinstated")}>
                            <UserCheck className="h-4 w-4" /> Reinstate
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddStudentsDialog detail={detail} open={addOpen} onClose={() => setAddOpen(false)} onDone={onChanged} />
      <MoveDialog detail={detail} member={moveMember} open={!!moveMember} onClose={() => setMoveMember(null)} onDone={onChanged} />
      <p className="text-xs text-slate-400">
        Tip: to import new students straight into this program, use Students → Import CSV. <Link href="/lms-admin/students" className="text-[#1B4F8A] hover:underline">Open Students</Link>
      </p>
    </div>
  )
}
