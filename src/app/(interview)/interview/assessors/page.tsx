"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Plus, Pencil, Trash2, KeyRound, Check, X,
  Loader2, UserCheck, Users, Eye, EyeOff,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type Assessor = {
  id: string
  name: string
  email: string
  role: string
  created_at: string
  group_count: number
}

// ── Small modal shell ─────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function PasswordInput({ value, onChange, placeholder = "Password", disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ── Create assessor modal ─────────────────────────────────────────────────────
function CreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (a: Assessor) => void }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (form.password !== form.confirm) { setError("Passwords do not match"); return }
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return }
    setLoading(true)

    const res = await fetch("/api/interview/assessors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error ?? "Failed to create assessor"); return }
    toast.success(`${data.name} created`)
    onCreate(data)
    onClose()
  }

  return (
    <Modal title="New Assessor" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label>Full Name <span className="text-red-500">*</span></Label>
          <Input
            placeholder="e.g. Ahmed Al-Rashidi"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Email <span className="text-red-500">*</span></Label>
          <Input
            type="email"
            placeholder="assessor@ics-aviation.com"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Password <span className="text-red-500">*</span></Label>
          <PasswordInput value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} />
        </div>
        <div className="space-y-2">
          <Label>Confirm Password <span className="text-red-500">*</span></Label>
          <PasswordInput value={form.confirm} onChange={v => setForm(f => ({ ...f, confirm: v }))} placeholder="Confirm password" />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            type="submit"
            disabled={loading || !form.name || !form.email || !form.password}
            className="flex-1 bg-[#1B4F8A] hover:bg-[#163f6e] text-white"
          >
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : "Create Assessor"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Edit assessor modal ───────────────────────────────────────────────────────
function EditModal({ assessor, onClose, onUpdate }: { assessor: Assessor; onClose: () => void; onUpdate: (a: Assessor) => void }) {
  const [form, setForm] = useState({ name: assessor.name, email: assessor.email })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const res = await fetch("/api/interview/assessors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: assessor.id, name: form.name, email: form.email }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error ?? "Failed to update"); return }
    toast.success("Assessor updated")
    onUpdate({ ...assessor, ...data })
    onClose()
  }

  return (
    <Modal title="Edit Assessor" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label>Full Name</Label>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" disabled={loading} className="flex-1 bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Save Changes"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Reset password modal ──────────────────────────────────────────────────────
function ResetPasswordModal({ assessor, onClose }: { assessor: Assessor; onClose: () => void }) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (password !== confirm) { setError("Passwords do not match"); return }
    if (password.length < 8)  { setError("Password must be at least 8 characters"); return }
    setLoading(true)

    const res = await fetch("/api/interview/assessors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: assessor.id, password }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error ?? "Failed to reset password"); return }
    toast.success(`Password reset for ${assessor.name}`)
    onClose()
  }

  return (
    <Modal title={`Reset Password — ${assessor.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500">Enter a new password for this assessor. They will use it on their next login.</p>
        <div className="space-y-2">
          <Label>New Password</Label>
          <PasswordInput value={password} onChange={setPassword} placeholder="Min. 8 characters" />
        </div>
        <div className="space-y-2">
          <Label>Confirm Password</Label>
          <PasswordInput value={confirm} onChange={setConfirm} placeholder="Confirm new password" />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" disabled={loading || !password} className="flex-1 bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resetting…</> : "Reset Password"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AssessorsPage() {
  const [assessors, setAssessors] = useState<Assessor[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Assessor | null>(null)
  const [resetTarget, setResetTarget] = useState<Assessor | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/interview/assessors")
      .then(r => r.json())
      .then(d => { setAssessors(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function deleteAssessor(a: Assessor) {
    if (!confirm(`Delete ${a.name}?\n\nThis cannot be undone. If they have submitted scores, deletion will be blocked.`)) return
    setDeletingId(a.id)
    const res = await fetch(`/api/interview/assessors?id=${a.id}`, { method: "DELETE" })
    const data = await res.json()
    setDeletingId(null)
    if (!res.ok) { toast.error(data.error); return }
    setAssessors(list => list.filter(x => x.id !== a.id))
    toast.success(`${a.name} deleted`)
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Assessors</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Manage assessor accounts. Assessors log in and score candidates during interviews.
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2"
        >
          <Plus className="h-4 w-4" /> New Assessor
        </Button>
      </div>

      {/* Credential tip */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>Sharing credentials:</strong> After creating an assessor, share their email and password with them directly.
        They log in at <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">/auth/login</code> and are taken straight to the scoring interface.
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      )}

      {/* Empty */}
      {!loading && assessors.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-slate-100 p-4 rounded-2xl mb-4">
              <UserCheck className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-base font-semibold text-slate-700">No assessors yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              Create assessor accounts so they can log in and score candidates.
            </p>
            <Button onClick={() => setShowCreate(true)} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
              <Plus className="h-4 w-4" /> Create First Assessor
            </Button>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {!loading && assessors.length > 0 && (
        <div className="space-y-3">
          {assessors.map(a => (
            <div
              key={a.id}
              className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 group hover:shadow-sm transition-shadow"
            >
              {/* Avatar */}
              <div className="w-11 h-11 rounded-full bg-indigo-100 flex items-center justify-center text-base font-bold text-indigo-600 shrink-0">
                {a.name[0]?.toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-800">{a.name}</p>
                  <Badge className="bg-indigo-100 text-indigo-700 border-0 text-xs">Assessor</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{a.email}</p>
              </div>

              {/* Stats */}
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                <Users className="h-3.5 w-3.5" />
                <span>{a.group_count} group{a.group_count !== 1 ? "s" : ""}</span>
              </div>

              {/* Date */}
              <div className="hidden md:block text-xs text-muted-foreground shrink-0">
                Added {new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </div>

              {/* Actions */}
              <div className={cn(
                "flex items-center gap-1 transition-opacity shrink-0",
                "opacity-0 group-hover:opacity-100"
              )}>
                <button
                  onClick={() => setEditTarget(a)}
                  title="Edit"
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setResetTarget(a)}
                  title="Reset password"
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-amber-600 transition-colors"
                >
                  <KeyRound className="h-4 w-4" />
                </button>
                <button
                  onClick={() => deleteAssessor(a)}
                  disabled={deletingId === a.id}
                  title="Delete"
                  className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                >
                  {deletingId === a.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />
                  }
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreate={a => setAssessors(list => [a, ...list])}
        />
      )}
      {editTarget && (
        <EditModal
          assessor={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdate={updated => setAssessors(list => list.map(a => a.id === updated.id ? { ...a, ...updated } : a))}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          assessor={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}
    </div>
  )
}
