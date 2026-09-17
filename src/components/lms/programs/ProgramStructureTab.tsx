"use client"

import { useEffect, useState } from "react"
import { BookOpen, Route, Plus, Trash2, Loader2, Layers, Edit, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { type ProgramDetail, postJson } from "./shared"

type Option = { id: string; title: string }

function useCatalog() {
  const [courses, setCourses] = useState<Option[]>([])
  const [paths, setPaths] = useState<Option[]>([])
  useEffect(() => {
    fetch("/api/lms/courses").then(r => r.ok ? r.json() : []).then(d => setCourses((Array.isArray(d) ? d : []).filter((c: any) => c.status !== "archived")))
    fetch("/api/lms/learning-paths").then(r => r.ok ? r.json() : []).then(d => setPaths(Array.isArray(d) ? d : []))
  }, [])
  return { courses, paths }
}

function reportSync(data: any) {
  const s = data?.sync
  if (!s) return
  const parts: string[] = []
  if (s.created) parts.push(`${s.created} enrollment${s.created !== 1 ? "s" : ""} added`)
  if (s.withdrawn) parts.push(`${s.withdrawn} withdrawn (history kept)`)
  if (parts.length) toast.info(`Students updated: ${parts.join(", ")}`)
  if (s.issues?.length) toast.warning(`${s.issues.length} could not be enrolled: ${[...new Set(s.issues)].slice(0, 3).join("; ")}`, { duration: 10000 })
}

// ── One scope (whole program / common courses / one track) ──────────────
function ScopeItems({ detail, trackId, canEdit, allowPaths, allowCourses, single, onChanged }: {
  detail: ProgramDetail; trackId: string | null; canEdit: boolean
  allowPaths: boolean; allowCourses: boolean; single: boolean; onChanged: () => void
}) {
  const { courses, paths } = useCatalog()
  const [kind, setKind] = useState<"course" | "path">(allowCourses ? "course" : "path")
  const [pick, setPick] = useState("")
  const [busy, setBusy] = useState(false)
  const items = detail.items.filter(i => i.track_id === trackId).sort((a, b) => a.order_index - b.order_index)
  const programId = detail.program.id

  async function add() {
    if (!pick) return
    setBusy(true)
    const { ok, data } = await postJson(`/api/lms/programs/${programId}/structure`, "POST",
      { action: "add_item", track_id: trackId, ...(kind === "course" ? { course_id: pick } : { path_id: pick }) })
    setBusy(false)
    if (!ok) { toast.error(data.error ?? "Could not add"); return }
    setPick(""); reportSync(data); onChanged()
  }

  async function remove(itemId: string, title: string) {
    if (!confirm(`Remove "${title}" from this program?\n\nStudents who were taking it are withdrawn from it. Their progress and results are kept as history.`)) return
    const { ok, data } = await postJson(`/api/lms/programs/${programId}/structure`, "POST", { action: "remove_item", item_id: itemId })
    if (!ok) { toast.error(data.error ?? "Could not remove"); return }
    reportSync(data); onChanged()
  }

  const inPath = (pathId: string) => detail.path_courses.filter(pc => pc.path_id === pathId).map(pc => pc.lms_courses?.title).filter(Boolean)

  return (
    <div className="space-y-2">
      {items.length === 0 && <p className="text-sm text-slate-400">Nothing added yet.</p>}
      {items.map(i => {
        const isPath = !!i.path_id
        const title = isPath ? i.lms_learning_paths?.title ?? "Learning path" : i.lms_courses?.title ?? "Course"
        return (
          <div key={i.id} className="flex items-start gap-3 bg-slate-50 rounded-lg px-3 py-2.5">
            {isPath ? <Route className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" /> : <BookOpen className="h-4 w-4 text-[#1B4F8A] mt-0.5 shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{title}</p>
              {isPath && <p className="text-xs text-slate-400">{inPath(i.path_id!).join(" → ") || "No courses"}</p>}
            </div>
            {canEdit && (
              <button onClick={() => remove(i.id, title)} className="text-slate-300 hover:text-red-500 shrink-0" aria-label="Remove">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )
      })}
      {canEdit && !(single && items.length >= 1) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {allowCourses && allowPaths && (
            <select value={kind} onChange={e => { setKind(e.target.value as any); setPick("") }}
              className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white">
              <option value="course">Course</option>
              <option value="path">Learning path</option>
            </select>
          )}
          <select value={pick} onChange={e => setPick(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white flex-1 min-w-[12rem]">
            <option value="">{kind === "course" ? "Choose a course…" : "Choose a learning path…"}</option>
            {(kind === "course" ? courses : paths).map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
          <Button size="sm" onClick={add} disabled={!pick || busy} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-1.5 h-9">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Rules (pass mark / attempts per course) ─────────────────────────────
function RulesTable({ detail, canEdit, onChanged }: { detail: ProgramDetail; canEdit: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [pass, setPass] = useState("")
  const [attempts, setAttempts] = useState("")
  const [busy, setBusy] = useState(false)
  const rules = [...detail.rules].sort((a, b) => (a.lms_courses?.title ?? "").localeCompare(b.lms_courses?.title ?? ""))
  if (!rules.length) return null

  async function save(courseId: string, oldPass: number) {
    const newPass = Number(pass)
    let apply = false
    if (newPass !== oldPass) {
      apply = confirm(
        `Change the pass mark to ${newPass}%.\n\n` +
        "OK — also re-check this program's existing exam results against the new mark.\n" +
        "Cancel — keep existing results; only new attempts use it."
      )
    }
    setBusy(true)
    const { ok, data } = await postJson(`/api/lms/programs/${detail.program.id}/rules`, "PATCH",
      { course_id: courseId, pass_mark: newPass, max_attempts: Number(attempts), apply_to_existing: apply })
    setBusy(false)
    if (!ok) { toast.error(data.error ?? "Could not save"); return }
    if (data.regrade_error) toast.warning(data.regrade_error)
    else if (data.regrade && (data.regrade.newlyPassed || data.regrade.newlyFailed))
      toast.success(`Saved — ${data.regrade.newlyPassed} now pass, ${data.regrade.newlyFailed} now fail` +
        (data.regrade.newlyFailedWithCertificate ? ` (${data.regrade.newlyFailedWithCertificate} keep their certificate)` : ""), { duration: 10000 })
    else toast.success("Saved")
    setEditing(null); onChanged()
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <p className="text-sm font-semibold text-slate-800">Pass mark &amp; attempts in this program</p>
        <p className="text-xs text-slate-500">Copied from each course when it was added, then independent — changing a course&apos;s default doesn&apos;t change this program.</p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs">
          <tr><th className="text-left px-5 py-2 font-medium">Course</th><th className="text-left px-3 py-2 font-medium">Pass mark</th><th className="text-left px-3 py-2 font-medium">Attempts</th><th className="w-20" /></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rules.map(r => (
            <tr key={r.course_id}>
              <td className="px-5 py-2.5 text-slate-800">{r.lms_courses?.title ?? "Course"}</td>
              {editing === r.course_id ? (
                <>
                  <td className="px-3 py-2"><Input type="number" min={0} max={100} value={pass} onChange={e => setPass(e.target.value)} className="h-8 w-20" /></td>
                  <td className="px-3 py-2"><Input type="number" min={1} max={20} value={attempts} onChange={e => setAttempts(e.target.value)} className="h-8 w-20" /></td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button onClick={() => save(r.course_id, r.pass_mark)} disabled={busy} className="text-emerald-600 mr-2" aria-label="Save"><Check className="h-4 w-4" /></button>
                    <button onClick={() => setEditing(null)} className="text-slate-400" aria-label="Cancel"><X className="h-4 w-4" /></button>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-3 py-2.5 text-slate-700">{r.pass_mark}%</td>
                  <td className="px-3 py-2.5 text-slate-700">{r.max_attempts}</td>
                  <td className="px-3 py-2.5">
                    {canEdit && (
                      <button onClick={() => { setEditing(r.course_id); setPass(String(r.pass_mark)); setAttempts(String(r.max_attempts)) }}
                        className="text-slate-400 hover:text-[#1B4F8A]" aria-label="Edit"><Edit className="h-4 w-4" /></button>
                    )}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ProgramStructureTab({ detail, isAdmin, onChanged }: { detail: ProgramDetail; isAdmin: boolean; onChanged: () => void }) {
  const { program, tracks } = detail
  const canEdit = isAdmin && program.status !== "archived"
  const [newTrack, setNewTrack] = useState("")
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  async function trackAction(body: any, okMsg?: string) {
    const { ok, data } = await postJson(`/api/lms/programs/${program.id}/structure`, "POST", body)
    if (!ok) { toast.error(data.error ?? "Could not save"); return false }
    if (okMsg) toast.success(okMsg)
    onChanged(); return true
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {program.structure === "course" && (
        <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-2"><BookOpen className="h-4 w-4 text-[#1B4F8A]" /> The course everyone takes</p>
          <ScopeItems detail={detail} trackId={null} canEdit={canEdit} allowCourses allowPaths={false} single onChanged={onChanged} />
        </section>
      )}

      {program.structure === "path" && (
        <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Route className="h-4 w-4 text-violet-500" /> The learning path everyone follows</p>
          <ScopeItems detail={detail} trackId={null} canEdit={canEdit} allowCourses={false} allowPaths single onChanged={onChanged} />
        </section>
      )}

      {program.structure === "tracks" && (
        <>
          <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Courses for all tracks</p>
              <p className="text-xs text-slate-500">Everyone in the program takes these (e.g. the General course).</p>
            </div>
            <ScopeItems detail={detail} trackId={null} canEdit={canEdit} allowCourses allowPaths single={false} onChanged={onChanged} />
          </section>

          {tracks.map(t => {
            const count = detail.members.filter(m => m.track_id === t.id && m.status !== "withdrawn").length
            return (
              <section key={t.id} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  {renaming === t.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input value={renameValue} onChange={e => setRenameValue(e.target.value)} className="h-8 max-w-xs" autoFocus />
                      <button onClick={async () => { if (await trackAction({ action: "rename_track", track_id: t.id, name: renameValue })) setRenaming(null) }} className="text-emerald-600" aria-label="Save"><Check className="h-4 w-4" /></button>
                      <button onClick={() => setRenaming(null)} className="text-slate-400" aria-label="Cancel"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <Layers className="h-4 w-4 text-[#1B4F8A]" /> {t.name}
                      <span className="text-xs font-normal text-slate-400">{count} student{count !== 1 ? "s" : ""}</span>
                    </p>
                  )}
                  {canEdit && renaming !== t.id && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setRenaming(t.id); setRenameValue(t.name) }} className="text-slate-400 hover:text-[#1B4F8A]" aria-label="Rename"><Edit className="h-4 w-4" /></button>
                      <button onClick={() => { if (confirm(`Delete track "${t.name}"?`)) trackAction({ action: "delete_track", track_id: t.id }, "Track deleted") }}
                        className="text-slate-300 hover:text-red-500" aria-label="Delete track"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>
                <ScopeItems detail={detail} trackId={t.id} canEdit={canEdit} allowCourses allowPaths single={false} onChanged={onChanged} />
              </section>
            )
          })}

          {canEdit && (
            <div className="flex gap-2">
              <Input value={newTrack} onChange={e => setNewTrack(e.target.value)} placeholder="New track name, e.g. Operations" className="max-w-xs"
                onKeyDown={async e => { if (e.key === "Enter" && newTrack.trim() && await trackAction({ action: "add_track", name: newTrack })) setNewTrack("") }} />
              <Button variant="outline" disabled={!newTrack.trim()} className="gap-1.5"
                onClick={async () => { if (await trackAction({ action: "add_track", name: newTrack })) setNewTrack("") }}>
                <Plus className="h-4 w-4" /> Add track
              </Button>
            </div>
          )}
        </>
      )}

      <RulesTable detail={detail} canEdit={canEdit} onChanged={onChanged} />
    </div>
  )
}
