"use client"

import { useEffect, useState } from "react"
import { Loader2, Search, Award } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// Issuing one by hand: training done before the LMS, a whole-program
// certificate, or a partner's that arrived on paper. The person must already
// exist as a student — a certificate has to belong to somebody.

type Student = { id: string; name: string; email: string }
type Enrolment = { id: string; title: string; program: string | null }
type Program = { id: string; name: string }
type Provider = { id: string; name: string; is_self: boolean; status: string }

export default function IssueCertificateDialog({ open, onClose, onIssued }: {
  open: boolean; onClose: () => void; onIssued: () => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Student[]>([])
  const [student, setStudent] = useState<Student | null>(null)
  const [enrolments, setEnrolments] = useState<Enrolment[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [providers, setProviders] = useState<Provider[]>([])

  const [kind, setKind] = useState<"course" | "program" | "external">("course")
  const [enrollmentId, setEnrollmentId] = useState("")
  const [programId, setProgramId] = useState("")
  const [title, setTitle] = useState("")
  const [issuer, setIssuer] = useState<"ics" | "provider">("ics")
  const [providerId, setProviderId] = useState("")
  const [providerRef, setProviderRef] = useState("")
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [expiresAt, setExpiresAt] = useState("")
  const [visible, setVisible] = useState(true)
  const [release, setRelease] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch("/api/lms/providers").then(r => r.ok ? r.json() : []).then(setProviders)
    fetch("/api/lms/programs").then(r => r.ok ? r.json() : []).then((d: any) =>
      setPrograms(Array.isArray(d) ? d.map((p: any) => ({ id: p.id, name: p.name })) : []))
  }, [open])

  // Look the person up as you type.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2 || student) { setResults([]); return }
    const t = setTimeout(() => {
      fetch(`/api/lms/students?q=${encodeURIComponent(q)}&limit=8`)
        .then(r => r.ok ? r.json() : null)
        .then(d => setResults((d?.students ?? d ?? []).slice(0, 8)))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query, student])

  // Their runs, so a course certificate lands on the right one.
  useEffect(() => {
    if (!student) { setEnrolments([]); return }
    fetch(`/api/lms/progress/${student.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const rows = (d?.courses ?? d?.enrollments ?? []) as any[]
        setEnrolments(rows.map(e => ({
          id: e.enrollment_id ?? e.id,
          title: e.course_title ?? e.title ?? e.lms_courses?.title ?? "Course",
          program: e.program_name ?? e.program ?? null,
        })).filter(e => e.id))
      })
      .catch(() => setEnrolments([]))
  }, [student])

  function reset() {
    setQuery(""); setResults([]); setStudent(null); setEnrolments([])
    setKind("course"); setEnrollmentId(""); setProgramId(""); setTitle("")
    setIssuer("ics"); setProviderId(""); setProviderRef("")
    setIssuedAt(new Date().toISOString().slice(0, 10)); setExpiresAt("")
    setVisible(true); setRelease(true)
  }

  async function submit() {
    if (!student) { toast.error("Choose who it is for"); return }
    setBusy(true)
    const res = await fetch("/api/lms/certificates", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        student_id: student.id, kind, issuer,
        enrollment_id: kind === "course" ? enrollmentId : undefined,
        program_id: kind === "program" ? programId : undefined,
        title: kind === "external" ? title : undefined,
        provider_id: issuer === "provider" ? providerId : undefined,
        provider_ref: providerRef || undefined,
        issued_at: issuedAt ? new Date(issuedAt).toISOString() : undefined,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        visible_to_student: visible, release,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast.error(data.error ?? "Could not issue it"); return }
    toast.success(`Issued — ${data.verification_code}`)
    reset(); onIssued(); onClose()
  }

  const partners = providers.filter(p => !p.is_self && p.status === "active")

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { reset(); onClose() } }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Award className="h-5 w-5 text-[#1B4F8A]" /> Issue a certificate</DialogTitle></DialogHeader>

        <div className="space-y-3">
          {/* Who */}
          <div className="space-y-1">
            <Label>For</Label>
            {student ? (
              <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                <span className="text-sm text-slate-800 flex-1 min-w-0 truncate">{student.name} <span className="text-slate-400">· {student.email}</span></span>
                <button onClick={() => { setStudent(null); setQuery("") }} className="text-xs text-[#1B4F8A] hover:underline">change</button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search a student by name or email…" className="pl-9" />
                </div>
                {results.length > 0 && (
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-auto">
                    {results.map(s => (
                      <button key={s.id} onClick={() => { setStudent(s); setResults([]) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
                        {s.name} <span className="text-xs text-slate-400">{s.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-400">They must already exist as a student — add them under Students first.</p>
              </>
            )}
          </div>

          {/* What it is for */}
          <div className="space-y-1">
            <Label>Certificate for</Label>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
              {([["course", "A course run"], ["program", "A whole program"], ["external", "Something else"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setKind(k)}
                  className={cn("flex-1 px-3 py-1.5 rounded-md", kind === k ? "bg-[#1B4F8A] text-white" : "text-slate-600 hover:bg-slate-50")}>{label}</button>
              ))}
            </div>
          </div>

          {kind === "course" && (
            <div className="space-y-1">
              <Label>Which run</Label>
              <select value={enrollmentId} onChange={e => setEnrollmentId(e.target.value)}
                className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white">
                <option value="">Choose…</option>
                {enrolments.map(e => <option key={e.id} value={e.id}>{e.title}{e.program ? ` · ${e.program}` : ""}</option>)}
              </select>
              {student && enrolments.length === 0 && <p className="text-xs text-amber-600">They have no course records — use &quot;Something else&quot; instead.</p>}
            </div>
          )}

          {kind === "program" && (
            <div className="space-y-1">
              <Label>Which program</Label>
              <select value={programId} onChange={e => setProgramId(e.target.value)}
                className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white">
                <option value="">Choose…</option>
                {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          {kind === "external" && (
            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="ICAO Training Instructors Course — Abu Dhabi, Dec 2025" />
            </div>
          )}

          {/* Who issued it */}
          <div className="space-y-1">
            <Label>Issued by</Label>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
              {([["ics", "ICS"], ["provider", "A partner"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setIssuer(k)}
                  className={cn("flex-1 px-3 py-1.5 rounded-md", issuer === k ? "bg-[#1B4F8A] text-white" : "text-slate-600 hover:bg-slate-50")}>{label}</button>
              ))}
            </div>
          </div>

          {issuer === "provider" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Which partner</Label>
                <select value={providerId} onChange={e => setProviderId(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white">
                  <option value="">Choose…</option>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Their number</Label>
                <Input value={providerRef} onChange={e => setProviderRef(e.target.value)} placeholder="As printed" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Issued</Label>
              <Input type="date" value={issuedAt} onChange={e => setIssuedAt(e.target.value)} /></div>
            <div className="space-y-1"><Label>Expires</Label>
              <Input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer bg-slate-50 rounded-lg p-3">
            <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium">The student can see it</p>
              <p className="text-xs text-slate-500 mt-0.5">Unchecked = an internal record only. Attach the document afterwards if you have it.</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer bg-slate-50 rounded-lg p-3">
            <input type="checkbox" checked={release} onChange={e => setRelease(e.target.checked)} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium">Release it now</p>
              <p className="text-xs text-slate-500 mt-0.5">Unchecked = held until someone releases it.</p>
            </div>
          </label>

          <p className="text-xs text-slate-400">
            The certificate number is generated for you. Choosing a template comes with the certificate designer.
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => { reset(); onClose() }} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || !student} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}Issue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
