"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Upload, FileCheck2, CheckCircle2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

// An external course (e.g. ICAO): the result is entered by hand for each
// participant, and the provider's certificate is uploaded here. Passing
// completes the course; the program decides whether our certificate comes too.

type Cert = { id: string; issuer: "ics" | "provider"; code: string; has_file: boolean; released: boolean; visible: boolean }
type Row = {
  enrollment_id: string; status: string
  student: { id: string; name: string; email: string } | null
  result: { passed: boolean | null; score: number | null; date: string | null; note: string | null; by_name?: string | null } | null
  certificates: Cert[]
}

export default function ExternalResults({ groupId }: { groupId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [providerSet, setProviderSet] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const res = await fetch(`/api/lms/groups/${groupId}/manual-results`)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? "Could not load"); setRows([]); return }
    setRows(j.rows ?? []); setProviderSet(j.provider_set !== false)
  }, [groupId])
  useEffect(() => { load() }, [load])

  async function save(ids: string[], v: { passed: boolean | null; score?: string; date?: string; note?: string }, key: string) {
    if (v.passed !== true && ids.some(i => rows?.find(r => r.enrollment_id === i)?.status === "completed")
      && !confirm("This re-opens a completed course. Certificates already issued are kept — revoke them under Certificates if needed. Continue?")) return
    setBusy(key)
    const res = await fetch(`/api/lms/groups/${groupId}/manual-results`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollment_ids: ids, passed: v.passed, score: v.score ?? null, date: v.date || null, note: v.note ?? null }),
    })
    const j = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { toast.error(j.error ?? "Could not save"); return }
    toast.success(v.passed === true ? "Saved — course completed" : "Saved")
    setPicked(new Set()); load()
  }

  if (!rows) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
  if (!rows.length) return <div className="border-2 border-dashed border-slate-200 rounded-xl py-12 text-center text-sm text-slate-400">Nobody in this group yet</div>

  const all = picked.size === rows.length
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">External course — enter each participant&apos;s result from the provider. <b>Passed</b> completes the course; then upload the provider&apos;s certificate. Whether an ICS certificate is issued too is set in the program&apos;s Settings.</p>
      {!providerSet && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No provider is set (group <b>Delivered by</b>, or the course&apos;s provider), so there&apos;s no provider certificate to upload. Set one, then mark the result again.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-slate-600 mr-auto">
          <input type="checkbox" className="accent-[#1B4F8A]" checked={all} onChange={() => setPicked(all ? new Set() : new Set(rows.map(r => r.enrollment_id)))} />
          {picked.size ? `${picked.size} chosen` : "Choose all"}
        </label>
        {picked.size > 0 && <>
          <Button size="sm" disabled={!!busy} onClick={() => save([...picked], { passed: true }, "bulk")} className="gap-1.5 h-8 bg-emerald-600 hover:bg-emerald-700 text-white"><CheckCircle2 className="h-3.5 w-3.5" /> Mark passed</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => save([...picked], { passed: false }, "bulk")} className="gap-1.5 h-8"><XCircle className="h-3.5 w-3.5" /> Mark not passed</Button>
        </>}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {rows.map(r => <ResultRow key={r.enrollment_id} r={r} busy={busy === r.enrollment_id}
          picked={picked.has(r.enrollment_id)} onPick={() => setPicked(p => { const n = new Set(p); if (n.has(r.enrollment_id)) n.delete(r.enrollment_id); else n.add(r.enrollment_id); return n })}
          onSave={v => save([r.enrollment_id], v, r.enrollment_id)} onUploaded={load} />)}
      </div>
    </div>
  )
}

function ResultRow({ r, busy, picked, onPick, onSave, onUploaded }: {
  r: Row; busy: boolean; picked: boolean; onPick: () => void
  onSave: (v: { passed: boolean | null; score?: string; date?: string; note?: string }) => void; onUploaded: () => void
}) {
  const [passed, setPassed] = useState<string>(r.result?.passed === true ? "yes" : r.result?.passed === false ? "no" : "")
  const [score, setScore] = useState(r.result?.score != null ? String(r.result.score) : "")
  const [date, setDate] = useState(r.result?.date ?? "")
  const [note, setNote] = useState(r.result?.note ?? "")
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const provider = r.certificates.find(c => c.issuer === "provider")
  const ics = r.certificates.find(c => c.issuer === "ics")
  const dirty = passed !== (r.result?.passed === true ? "yes" : r.result?.passed === false ? "no" : "")
    || score !== (r.result?.score != null ? String(r.result.score) : "") || date !== (r.result?.date ?? "") || note !== (r.result?.note ?? "")

  async function upload(f: File) {
    if (!provider) return
    setUploading(true)
    const fd = new FormData(); fd.append("file", f)
    const res = await fetch(`/api/lms/certificates/${provider.id}/upload`, { method: "POST", body: fd })
    const j = await res.json().catch(() => ({}))
    setUploading(false)
    if (!res.ok) { toast.error(j.error ?? "Upload failed"); return }
    toast.success("Certificate uploaded — the participant can download it"); onUploaded()
  }

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <input type="checkbox" className="accent-[#1B4F8A]" checked={picked} onChange={onPick} />
        <div className="flex-1 min-w-[10rem]">
          <p className="text-sm font-medium text-slate-800">{r.student?.name}{r.status === "completed" && <span className="ml-2 text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full">Completed</span>}</p>
          <p className="text-xs text-slate-400">{r.student?.email}{r.result?.by_name ? ` · entered by ${r.result.by_name}` : ""}</p>
        </div>
        <select value={passed} onChange={e => setPassed(e.target.value)} className={cn("h-8 rounded-lg border px-2 text-sm bg-white",
          passed === "yes" ? "border-emerald-300 text-emerald-700" : passed === "no" ? "border-red-300 text-red-600" : "border-slate-200 text-slate-500")}>
          <option value="">— Not entered</option><option value="yes">Passed</option><option value="no">Not passed</option>
        </select>
        <Input value={score} onChange={e => setScore(e.target.value)} placeholder="Score %" type="number" min={0} max={100} className="h-8 w-24" />
        <Input value={date} onChange={e => setDate(e.target.value)} type="date" className="h-8 w-36" title="Completion date" />
        <Button size="sm" disabled={busy || !dirty} onClick={() => onSave({ passed: passed === "yes" ? true : passed === "no" ? false : null, score, date, note })} className="h-8 bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 pl-7">
        <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Comment (optional)" className="h-8 flex-1 min-w-[12rem] text-xs" />
        {provider ? (
          <>
            <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = "" }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className={cn("inline-flex items-center gap-1.5 text-xs font-medium rounded-lg border px-2.5 py-1.5",
                provider.has_file ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-slate-200 text-slate-600 hover:border-[#1B4F8A] hover:text-[#1B4F8A]")}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : provider.has_file ? <FileCheck2 className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
              {provider.has_file ? "Provider certificate ✓ (replace)" : "Upload provider certificate"}
            </button>
          </>
        ) : r.status === "completed" ? null : <span className="text-xs text-slate-400">Provider certificate: after Passed</span>}
        {ics && <span className="text-xs text-slate-500">ICS certificate {ics.code}{ics.released ? "" : " (held)"}</span>}
        {provider && !provider.released && <span className="text-xs text-amber-700">held until released under Certificates</span>}
      </div>
    </div>
  )
}
