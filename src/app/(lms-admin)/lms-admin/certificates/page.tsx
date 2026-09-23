"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Award, Search, Loader2, ChevronDown, ChevronUp, Download, Upload, Ban,
  RotateCcw, Send, Pencil, History, Eye, EyeOff, Building2, Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import IssueCertificateDialog from "@/components/lms/IssueCertificateDialog"

// Every certificate in one place: Company → Program → Course → participant,
// plus the two branches that would otherwise be unreachable — individual
// learners, and courses taken outside any program.

type Cert = {
  id: string
  student: { id: string; name: string; email: string | null }
  course: { id: string; title: string }
  program: { id: string; name: string; individual: boolean } | null
  company: { id: string; name: string } | null
  number: string
  provider_ref: string | null
  issuer: "ics" | "provider"
  provider: { id: string; name: string } | null
  visible_to_student: boolean
  has_file: boolean
  issued_at: string
  released_at: string | null
  revoked_at: string | null
  revoked_reason: string | null
  expires_at: string | null
  status: "released" | "held" | "revoked" | "expired"
}

const STATUS_STYLE: Record<Cert["status"], string> = {
  released: "bg-emerald-50 text-emerald-700",
  held:     "bg-amber-50 text-amber-700",
  revoked:  "bg-red-50 text-red-600",
  expired:  "bg-slate-100 text-slate-500",
}

const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"

export default function CertificatesPage() {
  const [rows, setRows] = useState<Cert[] | null>(null)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<"all" | Cert["status"]>("all")
  const [issuer, setIssuer] = useState<"all" | "ics" | "provider">("all")
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<Cert | null>(null)
  const [history, setHistory] = useState<any[] | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploadFor, setUploadFor] = useState<string | null>(null)
  const [issuing, setIssuing] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch("/api/lms/certificates")
    setRows(res.ok ? await res.json() : [])
  }, [])
  useEffect(() => { load() }, [load])

  async function act(c: Cert, action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/lms/certificates", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: c.id, action, ...extra }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? "Could not save"); return false }
    load(); return true
  }

  async function revoke(c: Cert) {
    const reason = prompt(`Revoke ${c.number}?\n\nWhy? The reason is kept on the record.`)
    if (reason === null) return
    if (!reason.trim()) { toast.error("A reason is required"); return }
    if (await act(c, "revoke", { reason })) toast.success("Revoked")
  }

  async function upload(file: File) {
    if (!uploadFor) return
    const body = new FormData(); body.append("file", file)
    const res = await fetch(`/api/lms/certificates/${uploadFor}/upload`, { method: "POST", body })
    const data = await res.json().catch(() => ({}))
    setUploadFor(null)
    if (!res.ok) { toast.error(data.error ?? "Could not upload"); return }
    toast.success("Document attached"); load()
  }

  async function showHistory(c: Cert) {
    setHistory([])
    const res = await fetch(`/api/lms/certificates/${c.id}/history`)
    setHistory(res.ok ? await res.json() : [])
  }

  const q = search.trim().toLowerCase()
  const filtered = useMemo(() => (rows ?? []).filter(c =>
    (status === "all" || c.status === status) &&
    (issuer === "all" || c.issuer === issuer) &&
    (!q || c.student.name.toLowerCase().includes(q)
        || c.number.toLowerCase().includes(q)
        || (c.provider_ref ?? "").toLowerCase().includes(q)
        || c.course.title.toLowerCase().includes(q))), [rows, status, issuer, q])

  // Company → Program → Course, with the two catch-all branches.
  const tree = useMemo(() => {
    const byCompany = new Map<string, { name: string; programs: Map<string, { name: string; courses: Map<string, { title: string; certs: Cert[] }> }> }>()
    for (const c of filtered) {
      const companyKey = c.company?.id ?? (c.program?.individual ? "__individual__" : "__none__")
      const companyName = c.company?.name ?? (c.program?.individual ? "Individual learners" : "No company")
      if (!byCompany.has(companyKey)) byCompany.set(companyKey, { name: companyName, programs: new Map() })
      const company = byCompany.get(companyKey)!

      const programKey = c.program?.id ?? "__outside__"
      const programName = c.program?.name ?? "Outside programs"
      if (!company.programs.has(programKey)) company.programs.set(programKey, { name: programName, courses: new Map() })
      const program = company.programs.get(programKey)!

      if (!program.courses.has(c.course.id)) program.courses.set(c.course.id, { title: c.course.title, certs: [] })
      program.courses.get(c.course.id)!.certs.push(c)
    }
    return [...byCompany.entries()].map(([id, v]) => ({
      id, name: v.name,
      count: [...v.programs.values()].reduce((t, p) => t + [...p.courses.values()].reduce((n, c) => n + c.certs.length, 0), 0),
      programs: [...v.programs.entries()].map(([pid, p]) => ({
        id: pid, name: p.name,
        count: [...p.courses.values()].reduce((n, c) => n + c.certs.length, 0),
        courses: [...p.courses.entries()].map(([cid, c]) => ({ id: cid, ...c })),
      })),
    })).sort((a, b) => b.count - a.count)
  }, [filtered])

  const totals = useMemo(() => {
    const all = rows ?? []
    return {
      total: all.length,
      held: all.filter(c => c.status === "held").length,
      revoked: all.filter(c => c.status === "revoked").length,
      partner: all.filter(c => c.issuer === "provider").length,
    }
  }, [rows])

  return (
    <div className="space-y-6">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Award className="h-6 w-6 text-[#1B4F8A]" /> Certificates
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {totals.total} in total · {totals.held} awaiting release · {totals.partner} from partners · {totals.revoked} revoked
          </p>
        </div>
        <Button onClick={() => setIssuing(true)} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
          <Plus className="h-4 w-4" /> Issue certificate
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search by name, number or course…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {(["all", "released", "held", "expired", "revoked"] as const).map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={cn("px-3 py-1.5 rounded-md capitalize", status === s ? "bg-[#1B4F8A] text-white" : "text-slate-600 hover:bg-slate-50")}>{s}</button>
          ))}
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {([["all", "All"], ["ics", "Ours"], ["provider", "Partner"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setIssuer(k)}
              className={cn("px-3 py-1.5 rounded-md", issuer === k ? "bg-[#1B4F8A] text-white" : "text-slate-600 hover:bg-slate-50")}>{label}</button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Award className="h-12 w-12 text-slate-200 mb-3" />
          <p className="text-slate-600 font-medium">{rows.length ? "Nothing matches" : "No certificates yet"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tree.map(company => (
            <div key={company.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <button onClick={() => setOpen(o => ({ ...o, [company.id]: !o[company.id] }))}
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 text-left">
                <Building2 className="h-4 w-4 text-[#1B4F8A] shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{company.name}</span>
                  <span className="block text-xs text-slate-400">{company.count} certificate{company.count === 1 ? "" : "s"}</span>
                </span>
                {open[company.id] ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
              </button>

              {open[company.id] && (
                <div className="border-t border-slate-100 px-4 py-3 space-y-2">
                  {company.programs.map(program => (
                    <div key={program.id} className="border border-slate-100 rounded-lg overflow-hidden">
                      <button onClick={() => setOpen(o => ({ ...o, [program.id]: !o[program.id] }))}
                        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left">
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-slate-700 truncate">{program.name}</span>
                          <span className="block text-xs text-slate-400">{program.count} certificate{program.count === 1 ? "" : "s"}</span>
                        </span>
                        {open[program.id] ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                      </button>

                      {open[program.id] && program.courses.map(course => (
                        <div key={course.id} className="border-t border-slate-50">
                          <p className="px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{course.title}</p>
                          <table className="w-full text-sm">
                            <tbody>
                              {course.certs.map(c => (
                                <tr key={c.id} className="border-t border-slate-50">
                                  <td className="px-4 py-2">
                                    <p className="text-slate-800">{c.student.name}</p>
                                    <p className="text-xs text-slate-400 font-mono">{c.number}{c.provider_ref ? ` · ${c.provider_ref}` : ""}</p>
                                  </td>
                                  <td className="px-2 py-2 text-xs text-slate-500 whitespace-nowrap">
                                    {c.issuer === "provider" ? (c.provider?.name ?? "Partner") : "ICS"}
                                  </td>
                                  <td className="px-2 py-2 text-xs text-slate-500 whitespace-nowrap">{fmt(c.issued_at)}</td>
                                  <td className="px-2 py-2 whitespace-nowrap">
                                    <span className={cn("text-xs px-2 py-0.5 rounded-full capitalize", STATUS_STYLE[c.status])}>{c.status}</span>
                                    {!c.visible_to_student && (
                                      <span className="ml-1.5 text-[10px] text-slate-400 inline-flex items-center gap-1"><EyeOff className="h-3 w-3" />internal</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right whitespace-nowrap">
                                    {c.has_file && (
                                      <a href={`/api/lms/certificates/${c.id}/file`} target="_blank" rel="noopener noreferrer"
                                        className="p-1.5 inline-flex rounded-lg text-slate-400 hover:text-[#1B4F8A] hover:bg-slate-50" title="Download"><Download className="h-4 w-4" /></a>
                                    )}
                                    <button onClick={() => { setUploadFor(c.id); fileInput.current?.click() }}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-[#1B4F8A] hover:bg-slate-50" title={c.has_file ? "Replace the document" : "Attach the document"}><Upload className="h-4 w-4" /></button>
                                    {!c.released_at && !c.revoked_at && (
                                      <button onClick={async () => { if (await act(c, "release")) toast.success("Released") }}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50" title="Release to the student"><Send className="h-4 w-4" /></button>
                                    )}
                                    <button onClick={() => setEditing(c)} className="p-1.5 rounded-lg text-slate-400 hover:text-[#1B4F8A] hover:bg-slate-50" title="Edit"><Pencil className="h-4 w-4" /></button>
                                    <button onClick={() => { setEditing(c); showHistory(c) }} className="p-1.5 rounded-lg text-slate-400 hover:text-[#1B4F8A] hover:bg-slate-50" title="History"><History className="h-4 w-4" /></button>
                                    {c.revoked_at ? (
                                      <button onClick={async () => { if (await act(c, "restore")) toast.success("Restored") }}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50" title="Restore"><RotateCcw className="h-4 w-4" /></button>
                                    ) : (
                                      <button onClick={() => revoke(c)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50" title="Revoke"><Ban className="h-4 w-4" /></button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <IssueCertificateDialog open={issuing} onClose={() => setIssuing(false)} onIssued={load} />

      <input ref={fileInput} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f) }} />

      <Dialog open={!!editing} onOpenChange={o => { if (!o) { setEditing(null); setHistory(null) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.number}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                {editing.student.name} · {editing.course.title}
                {editing.revoked_reason && <span className="block text-xs text-red-500 mt-1">Revoked: {editing.revoked_reason}</span>}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Issued</Label>
                  <Input type="date" defaultValue={editing.issued_at?.slice(0, 10)}
                    onBlur={e => act(editing, "edit", { issued_at: e.target.value || null })} />
                </div>
                <div className="space-y-1">
                  <Label>Expires</Label>
                  <Input type="date" defaultValue={editing.expires_at?.slice(0, 10) ?? ""}
                    onBlur={e => act(editing, "edit", { expires_at: e.target.value || null })} />
                </div>
              </div>
              {editing.issuer === "provider" && (
                <div className="space-y-1">
                  <Label>Their certificate number</Label>
                  <Input defaultValue={editing.provider_ref ?? ""} placeholder="As printed on their certificate"
                    onBlur={e => act(editing, "edit", { provider_ref: e.target.value })} />
                </div>
              )}
              <button
                onClick={async () => { if (await act(editing, "edit", { visible_to_student: !editing.visible_to_student })) { toast.success("Saved"); setEditing(null) } }}
                className="flex items-center gap-2 text-sm text-slate-700 border border-slate-200 rounded-lg px-3 py-2 w-full hover:bg-slate-50">
                {editing.visible_to_student ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-slate-400" />}
                {editing.visible_to_student ? "The student can see this certificate" : "Internal record — the student sees nothing"}
                <span className="ml-auto text-xs text-[#1B4F8A]">change</span>
              </button>

              {history && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">History</p>
                  {history.length === 0 ? (
                    <p className="text-xs text-slate-400">Nothing recorded since it was issued.</p>
                  ) : (
                    <ul className="space-y-1.5 max-h-48 overflow-auto">
                      {history.map(h => (
                        <li key={h.id} className="text-xs text-slate-600">
                          <span className="capitalize font-medium text-slate-700">{h.action}</span>
                          {h.actor_name ? ` by ${h.actor_name}` : ""} · {new Date(h.at).toLocaleString("en-GB")}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
