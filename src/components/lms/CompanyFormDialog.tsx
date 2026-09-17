"use client"

import { useEffect, useState } from "react"
import { Loader2, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"

export interface CompanyRow {
  id: string
  name: string
  name_ar: string | null
  code: string
  logo_url: string | null
  sector: string | null
  country: string | null
  city: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  notes: string | null
  status: "active" | "inactive"
  show_catalogue: boolean
  student_count?: number
  created_at: string
}

const EMPTY = {
  name: "", name_ar: "", code: "", logo_url: "", sector: "", country: "", city: "",
  contact_name: "", contact_email: "", contact_phone: "", notes: "",
}

export default function CompanyFormDialog({ open, editing, onClose, onSaved }: {
  open: boolean
  editing: CompanyRow | null
  onClose: () => void
  onSaved: (c: CompanyRow) => void
}) {
  const [form, setForm] = useState(EMPTY)
  const [showCatalogue, setShowCatalogue] = useState(true)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof EMPTY, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!open) return
    setForm(editing
      ? Object.fromEntries(Object.keys(EMPTY).map(k => [k, (editing as any)[k] ?? ""])) as typeof EMPTY
      : EMPTY)
    setShowCatalogue(editing?.show_catalogue ?? true)
  }, [open, editing])

  async function save() {
    if (!form.name.trim()) { toast.error("Company name is required"); return }
    if (!form.code.trim()) { toast.error("Code is required (e.g. RAC)"); return }
    setSaving(true)
    try {
      const res = await fetch(editing ? `/api/lms/companies/${editing.id}` : "/api/lms/companies", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, show_catalogue: showCatalogue }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? "Could not save"); return }
      toast.success(editing ? "Company updated" : "Company created")
      onSaved({ ...data, student_count: editing?.student_count ?? data.student_count ?? 0 })
      onClose()
    } finally { setSaving(false) }
  }

  const field = (k: keyof typeof EMPTY, label: string, placeholder = "", props: Record<string, unknown> = {}) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder} {...props} />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit Company" : "New Company"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">{field("name", "Company name *", "Riyadh Air")}</div>
            <div className="space-y-1">
              <Label>Code *</Label>
              <Input value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} placeholder="RAC" maxLength={20} />
            </div>
          </div>
          <div dir="rtl">{field("name_ar", "الاسم بالعربية", "", { dir: "rtl" })}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {field("sector", "Sector", "Airline")}
            {field("country", "Country", "Saudi Arabia")}
            {field("city", "City", "Riyadh")}
          </div>
          {field("logo_url", "Logo URL", "https://…")}

          <div className="rounded-lg border border-slate-200 p-3 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Main contact</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {field("contact_name", "Name")}
              {field("contact_email", "Email", "", { type: "email" })}
              {field("contact_phone", "Phone")}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Contract / notes</Label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none" />
          </div>

          <label className="flex items-start gap-3 cursor-pointer bg-slate-50 rounded-lg p-3">
            <input type="checkbox" checked={showCatalogue} onChange={e => setShowCatalogue(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="text-sm font-medium text-slate-800">Show course catalogue to this company&apos;s participants</span>
              <span className="block text-xs text-slate-500 mt-0.5">Turn off if the client doesn&apos;t want its staff browsing other courses.</span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            {saving ? "Saving…" : editing ? "Save Changes" : "Create Company"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
