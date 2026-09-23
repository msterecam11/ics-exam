"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Upload, Loader2, Trash2, Download, Info } from "lucide-react"
import { FileIcon, fmtSize } from "@/components/lms/groups/file-display"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

// Materials participants download — for the whole course (optionally tied to a
// module) or for one group. Used in the course builder and on a group's page.

type Material = {
  id: string; module_id: string | null; title: string; description: string | null
  file_name: string; size_bytes: number; available_from: "enrolment" | "start" | "completion"
  created_at: string; downloaded_by: number
}
const FROM_LABEL = { enrolment: "From enrolment", start: "From the first day", completion: "After completion" } as const
const ACCEPT = ".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.png,.jpg,.jpeg,.mp4"
const MAX = 50 * 1024 * 1024

export default function MaterialsManager({ courseId, groupId, modules }: {
  courseId: string; groupId?: string | null; modules: { id: string; title: string }[]
}) {
  const [rows, setRows] = useState<Material[] | null>(null)
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [form, setForm] = useState({ title: "", module_id: "", available_from: "enrolment" as Material["available_from"] })
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/lms/materials?course_id=${courseId}${groupId ? `&group_id=${groupId}` : ""}`)
    const d = await res.json().catch(() => [])
    setRows(Array.isArray(d) ? d : [])
  }, [courseId, groupId])
  useEffect(() => { load() }, [load])

  function pick(f: File | null) {
    if (!f) return
    if (f.size > MAX) { toast.error("That file is over 50 MB — split it, or compress it"); return }
    setFile(f)
    setForm(p => ({ ...p, title: f.name.replace(/\.[^.]+$/, "") }))
  }

  async function upload() {
    if (!file) return
    setBusy(true)
    const fd = new FormData()
    fd.append("file", file)
    fd.append("course_id", courseId)
    if (groupId) fd.append("group_id", groupId)
    if (form.module_id) fd.append("module_id", form.module_id)
    fd.append("title", form.title)
    fd.append("available_from", form.available_from)
    const res = await fetch("/api/lms/materials", { method: "POST", body: fd })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast.error(d.error ?? "Upload failed"); return }
    toast.success("Uploaded")
    setOpen(false); setFile(null); setForm({ title: "", module_id: "", available_from: "enrolment" })
    load()
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch("/api/lms/materials", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(d.error ?? "Could not save"); return }
    setRows(prev => prev?.map(r => r.id === id ? { ...r, ...d } : r) ?? prev)
  }

  async function remove(m: Material) {
    if (!confirm(`Delete "${m.title}"? Participants will no longer see it.${m.downloaded_by ? `\n\n${m.downloaded_by} participant(s) already downloaded it — that record is kept.` : ""}`)) return
    const res = await fetch(`/api/lms/materials?id=${m.id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Could not delete"); return }
    setRows(prev => prev?.filter(r => r.id !== m.id) ?? prev)
  }

  const sections: { title: string; items: Material[] }[] = []
  if (rows) {
    const general = rows.filter(r => !r.module_id)
    if (general.length) sections.push({ title: groupId ? "This group" : "Whole course", items: general })
    for (const m of modules) {
      const items = rows.filter(r => r.module_id === m.id)
      if (items.length) sections.push({ title: m.title, items })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-slate-500">
          {groupId ? "Files only this group's participants see." : "Files every participant of the course sees — the manual, handouts, exercise and assignment sheets."}
          {" "}PDF, Office, ZIP, images or video, up to 50 MB each.
        </p>
        <Button onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.click(), 50) }} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-1.5 shrink-0">
          <Upload className="h-4 w-4" /> Upload
        </Button>
      </div>

      {!groupId && (
        <p className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" />
          Each module&apos;s PDF slides are listed for participants automatically, with a Download button — switch that off per module in its Options.
        </p>
      )}

      {rows === null ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
      ) : sections.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-xl py-10 text-center text-sm text-slate-400">No files yet</div>
      ) : sections.map(s => (
        <div key={s.title} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <p className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-100">{s.title}</p>
          <div className="divide-y divide-slate-100">
            {s.items.map(m => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <FileIcon name={m.file_name} className="h-5 w-5 text-[#1B4F8A] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{m.title}</p>
                  <p className="text-xs text-slate-400 truncate">{m.file_name} · {fmtSize(m.size_bytes)} · downloaded by {m.downloaded_by}</p>
                </div>
                {!groupId && (
                  <select value={m.module_id ?? ""} onChange={e => patch(m.id, { module_id: e.target.value || null })}
                    className="h-8 rounded-lg border border-slate-200 px-2 text-xs bg-white max-w-[11rem]" title="Show under">
                    <option value="">Whole course</option>
                    {modules.map(mo => <option key={mo.id} value={mo.id}>{mo.title}</option>)}
                  </select>
                )}
                <select value={m.available_from} onChange={e => patch(m.id, { available_from: e.target.value })}
                  className="h-8 rounded-lg border border-slate-200 px-2 text-xs bg-white" title="When participants can open it">
                  {Object.entries(FROM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <a href={`/api/lms/materials/download?course_id=${courseId}&key=m:${m.id}`} className="p-1.5 rounded-lg text-slate-400 hover:text-[#1B4F8A] hover:bg-slate-100" title="Download">
                  <Download className="h-4 w-4" />
                </a>
                <button onClick={() => remove(m)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <Dialog open={open} onOpenChange={o => { if (!o && !busy) { setOpen(false); setFile(null) } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Upload a file</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={e => pick(e.target.files?.[0] ?? null)} />
            <button type="button" onClick={() => inputRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-200 rounded-xl py-6 text-sm text-slate-500 hover:border-[#1B4F8A]/40 hover:bg-slate-50"
              onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0] ?? null) }}>
              {file ? <span className="font-medium text-slate-800">{file.name} · {fmtSize(file.size)}</span> : "Choose a file, or drop it here"}
            </button>
            <div className="space-y-1.5"><Label>Title participants see</Label><Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
            {!groupId && modules.length > 0 && (
              <div className="space-y-1.5"><Label>Show under</Label>
                <select value={form.module_id} onChange={e => setForm(p => ({ ...p, module_id: e.target.value }))} className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white">
                  <option value="">Whole course</option>
                  {modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1.5"><Label>Participants can open it</Label>
              <select value={form.available_from} onChange={e => setForm(p => ({ ...p, available_from: e.target.value as Material["available_from"] }))} className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white">
                {Object.entries(FROM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setOpen(false); setFile(null) }} disabled={busy}>Cancel</Button>
              <Button onClick={upload} disabled={!file || busy} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Upload
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
