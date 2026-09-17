"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, Copy, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { type ProgramDetail, postJson } from "./shared"

type Staff = { id: string; name: string; email: string; role: string }

export default function ProgramSettingsTab({ detail, onChanged }: { detail: ProgramDetail; onChanged: () => void }) {
  const router = useRouter()
  const p = detail.program
  const [companies, setCompanies] = useState<{ id: string; name: string; code: string }[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [form, setForm] = useState({
    name: p.name, client: p.is_individual ? "individual" : (p.company_id ?? ""), reference: p.reference ?? "",
    description: p.description ?? "", start_date: p.start_date ?? "", end_date: p.end_date ?? "",
    capacity: p.capacity ? String(p.capacity) : "", after_end_access: p.after_end_access,
    certificate_enabled: p.certificate_enabled, certificate_auto_release: p.certificate_auto_release,
    feedback_enabled: p.feedback_enabled, feedback_mandatory: p.feedback_mandatory, progress_enforcement: p.progress_enforcement,
  })
  const [instructorIds, setInstructorIds] = useState<Set<string>>(new Set(detail.instructors.map(i => i.id)))
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))
  const locked = p.status === "archived"

  useEffect(() => {
    fetch("/api/lms/companies?status=active").then(r => r.ok ? r.json() : []).then(d => setCompanies(Array.isArray(d) ? d : []))
    fetch(`/api/lms/programs/${p.id}/instructors`).then(r => r.ok ? r.json() : []).then(d => setStaff(Array.isArray(d) ? d : []))
  }, [p.id])

  async function save() {
    setSaving(true)
    const { ok, data } = await postJson(`/api/lms/programs/${p.id}`, "PATCH", {
      name: form.name, reference: form.reference || null, description: form.description || null,
      start_date: form.start_date || null, end_date: form.end_date || null,
      capacity: form.capacity ? Number(form.capacity) : null, after_end_access: form.after_end_access,
      certificate_enabled: form.certificate_enabled, certificate_auto_release: form.certificate_auto_release,
      feedback_enabled: form.feedback_enabled, feedback_mandatory: form.feedback_mandatory, progress_enforcement: form.progress_enforcement,
      ...(form.client === "individual" ? { is_individual: true } : { company_id: form.client }),
    })
    if (ok) {
      const inst = await postJson(`/api/lms/programs/${p.id}/instructors`, "PUT", { user_ids: [...instructorIds] })
      if (!inst.ok) toast.error(inst.data.error ?? "Could not save instructors")
    }
    setSaving(false)
    if (!ok) { toast.error(data.error ?? "Could not save"); return }
    toast.success("Settings saved"); onChanged()
  }

  async function duplicate() {
    const name = prompt("Name for the copy (students and dates are not copied):", `${p.name} (copy)`)
    if (name === null) return
    const { ok, data } = await postJson(`/api/lms/programs/${p.id}/duplicate`, "POST", { name })
    if (!ok) { toast.error(data.error ?? "Could not duplicate"); return }
    toast.success("Program duplicated as a draft")
    router.push(`/lms-admin/programs/${data.id}`)
  }

  async function remove() {
    if (!confirm(`Delete "${p.name}"? Only possible while it has no students.`)) return
    const res = await fetch(`/api/lms/programs/${p.id}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? "Could not delete"); return }
    toast.success("Program deleted"); router.push("/lms-admin/programs")
  }

  const Toggle = ({ k, label, hint, indent }: { k: keyof typeof form; label: string; hint: string; indent?: boolean }) => (
    <label className={`flex items-start gap-3 cursor-pointer bg-slate-50 rounded-lg p-3 ${indent ? "ml-6" : ""}`}>
      <input type="checkbox" checked={!!form[k]} disabled={locked} onChange={e => set(k, e.target.checked)} className="mt-0.5" />
      <span><span className="text-sm font-medium text-slate-800">{label}</span><span className="block text-xs text-slate-500 mt-0.5">{hint}</span></span>
    </label>
  )

  return (
    <div className="max-w-2xl space-y-5 pb-10">
      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <p className="text-sm font-semibold text-slate-800">Details</p>
        <div className="space-y-1"><Label>Name</Label><Input value={form.name} disabled={locked} onChange={e => set("name", e.target.value)} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Client</Label>
            <select value={form.client} disabled={locked} onChange={e => set("client", e.target.value)} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white">
              <option value="individual">Individual learners</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
              {p.lms_companies && !companies.some(c => c.id === p.company_id) && <option value={p.company_id!}>{p.lms_companies.name} (inactive)</option>}
            </select>
          </div>
          <div className="space-y-1"><Label>Reference / PO</Label><Input value={form.reference} disabled={locked} onChange={e => set("reference", e.target.value)} /></div>
        </div>
        <div className="space-y-1">
          <Label>Description</Label>
          <textarea value={form.description} disabled={locked} onChange={e => set("description", e.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1"><Label>Start date</Label><Input type="date" value={form.start_date} disabled={locked} onChange={e => set("start_date", e.target.value)} /></div>
          <div className="space-y-1"><Label>End date</Label><Input type="date" value={form.end_date} disabled={locked} onChange={e => set("end_date", e.target.value)} /></div>
          <div className="space-y-1"><Label>Capacity</Label><Input type="number" min={1} value={form.capacity} disabled={locked} onChange={e => set("capacity", e.target.value)} placeholder="Unlimited" /></div>
        </div>
        <div className="space-y-1">
          <Label>After the end date, students…</Label>
          <select value={form.after_end_access} disabled={locked} onChange={e => set("after_end_access", e.target.value)} className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white">
            <option value="read_only">Can review material and results (no exams, nothing recorded)</option>
            <option value="full">Keep full access</option>
            <option value="locked">Lose access</option>
          </select>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-800">Learning &amp; completion</p>
        <Toggle k="progress_enforcement" label="Sequential courses" hint="Students complete each course before the next one opens (in the order set on the Structure tab)" />
        <Toggle k="certificate_enabled" label="Issue course certificates" hint="When a student passes a course's final exam in this program" />
        {form.certificate_enabled && <Toggle k="certificate_auto_release" indent label="Release certificates automatically" hint="Unchecked = held until an admin releases them" />}
        <Toggle k="feedback_enabled" label="Course feedback survey" hint="Asked when a student completes a course" />
        {form.feedback_enabled && <Toggle k="feedback_mandatory" indent label="Feedback is mandatory" hint="Students must answer it" />}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-800">Instructors</p>
        {staff.length === 0 ? <p className="text-sm text-slate-400">No instructor accounts yet.</p> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {staff.map(s => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" disabled={locked} checked={instructorIds.has(s.id)}
                  onChange={e => setInstructorIds(prev => { const n = new Set(prev); e.target.checked ? n.add(s.id) : n.delete(s.id); return n })} />
                {s.name} <span className="text-xs text-slate-400">({s.role})</span>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-400">What instructors can do is decided when instructor accounts are set up.</p>
      </section>

      {!locked && (
        <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
        </Button>
      )}

      <section className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">Duplicate program</p>
          <p className="text-xs text-slate-500 mt-0.5">Copies structure, pass marks, settings and instructors — not students or dates.</p>
        </div>
        <Button variant="outline" onClick={duplicate} className="gap-2 shrink-0"><Copy className="h-4 w-4" /> Duplicate</Button>
      </section>

      <section className="bg-white rounded-xl border border-red-100 p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-red-700">Delete program</p>
          <p className="text-xs text-slate-500 mt-0.5">Only while it has no students. Otherwise complete and archive it.</p>
        </div>
        <Button variant="outline" onClick={remove} disabled={detail.members.length > 0} className="gap-2 text-red-600 border-red-200 hover:bg-red-50 shrink-0">
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </section>
    </div>
  )
}
