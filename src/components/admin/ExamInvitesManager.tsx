"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { UserPlus, Loader2, Copy, Mail, Ban, Trash2 } from "lucide-react"
import { toast } from "sonner"

interface CustomField {
  id: string
  label: string
  field_type: "text" | "textarea" | "number"
  required: boolean
}

interface Invite {
  id: string
  full_name: string
  email: string
  job_title: string | null
  status: "pending" | "opened" | "completed" | "revoked"
  token: string
  sent_at: string | null
  created_at: string
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-0",
  opened: "bg-blue-100 text-blue-700 border-0",
  completed: "bg-emerald-100 text-emerald-700 border-0",
  revoked: "bg-slate-100 text-slate-500 border-0",
}

export default function ExamInvitesManager({
  examId, customFields, initialInvites,
}: { examId: string; customFields: CustomField[]; initialInvites: Invite[] }) {
  const [invites, setInvites] = useState<Invite[]>(initialInvites)
  const [showForm, setShowForm] = useState(false)
  const [sending, setSending] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [form, setForm] = useState({
    full_name: "", email: "", job_title: "", years_of_experience: "", company: "",
  })
  const [customValues, setCustomValues] = useState<Record<string, string>>({})

  function set(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  function inviteLink(token: string) {
    return `${window.location.origin}/exam/${examId}/invite/${token}`
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(inviteLink(token))
    toast.success("Link copied")
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim() || !form.email.trim()) {
      toast.error("Name and email are required")
      return
    }
    setSending(true)
    try {
      const res = await fetch(`/api/exams/${examId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, custom_field_values: customValues }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to create invite")
      setInvites((list) => [data, ...list])
      if (data.warning) toast.error(data.warning)
      else toast.success("Invite sent")
      setForm({ full_name: "", email: "", job_title: "", years_of_experience: "", company: "" })
      setCustomValues({})
      setShowForm(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invite")
    } finally {
      setSending(false)
    }
  }

  async function handleResend(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/exams/${examId}/invites/${id}/resend`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to resend")
      setInvites((list) => list.map((i) => (i.id === id ? { ...i, sent_at: data.sent_at } : i)))
      toast.success("Invite resent")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend")
    } finally {
      setBusyId(null)
    }
  }

  async function handleRevoke(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/exams/${examId}/invites/${id}`, { method: "PATCH" })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed to revoke") }
      setInvites((list) => list.map((i) => (i.id === id ? { ...i, status: "revoked" } : i)))
      toast.success("Invite revoked")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke")
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete the invite for "${name}"?\n\nThis removes it from the list and retires the link. It does not affect their exam results if they already completed it.`)) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/exams/${examId}/invites/${id}`, { method: "DELETE" })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed to delete") }
      setInvites((list) => list.filter((i) => i.id !== id))
      toast.success("Invite deleted")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm((v) => !v)} className="gap-2 bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
          <UserPlus className="h-4 w-4" /> {showForm ? "Cancel" : "Invite Person"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6 pb-6">
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Job Title</Label>
                  <Input value={form.job_title} onChange={(e) => set("job_title", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Years of Experience</Label>
                  <Input type="number" min={0} value={form.years_of_experience} onChange={(e) => set("years_of_experience", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input value={form.company} onChange={(e) => set("company", e.target.value)} />
                </div>
              </div>

              {customFields.map((field) => (
                <div key={field.id} className="space-y-2">
                  <Label>{field.label}</Label>
                  {field.field_type === "textarea" ? (
                    <Textarea
                      value={customValues[field.id] ?? ""}
                      onChange={(e) => setCustomValues((v) => ({ ...v, [field.id]: e.target.value }))}
                      rows={3}
                    />
                  ) : (
                    <Input
                      type={field.field_type === "number" ? "number" : "text"}
                      value={customValues[field.id] ?? ""}
                      onChange={(e) => setCustomValues((v) => ({ ...v, [field.id]: e.target.value }))}
                    />
                  )}
                </div>
              ))}

              <div className="flex justify-end">
                <Button type="submit" disabled={sending} className="gap-2 bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {sending ? "Sending…" : "Send Invite"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {invites.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No invites sent yet.</p>
      ) : (
        <div className="space-y-2">
          {invites.map((inv) => (
            <Card key={inv.id}>
              <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{inv.full_name}</p>
                    <Badge className={STATUS_STYLES[inv.status]} variant="secondary">{inv.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {inv.email}{inv.job_title ? ` · ${inv.job_title}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => copyLink(inv.token)}>
                    <Copy className="h-3.5 w-3.5" /> Copy Link
                  </Button>
                  {(inv.status === "pending" || inv.status === "opened") && (
                    <>
                      <Button
                        variant="outline" size="sm" className="gap-1.5"
                        disabled={busyId === inv.id}
                        onClick={() => handleResend(inv.id)}
                      >
                        {busyId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                        Resend
                      </Button>
                      <Button
                        variant="outline" size="sm" className="gap-1.5 text-red-600 hover:text-red-700"
                        disabled={busyId === inv.id}
                        onClick={() => handleRevoke(inv.id)}
                      >
                        <Ban className="h-3.5 w-3.5" /> Revoke
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline" size="sm" className="gap-1.5 text-red-600 hover:text-red-700"
                    disabled={busyId === inv.id}
                    onClick={() => handleDelete(inv.id, inv.full_name)}
                  >
                    {busyId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
