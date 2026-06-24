"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import {
  Users, UserPlus, Search, Loader2, MoreVertical,
  Shield, GraduationCap, KeyRound, Ban, CheckCircle2,
  Trash2, Edit2, Eye, EyeOff, Settings, User,
  Lock, Phone, Building2, AlertTriangle, X,
  Bell, Send, CalendarDays, Mail,
} from "lucide-react"
import { Button }  from "@/components/ui/button"
import { Badge }   from "@/components/ui/badge"
import { Input }   from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast }   from "sonner"
import { cn }      from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────
type Role = "admin" | "instructor" | "assessor"

interface AdminUser {
  id:              string
  name:            string
  email:           string
  role:            Role
  is_active:       boolean
  department:      string | null
  phone:           string | null
  created_at:      string
  last_login_at:   string | null
  locked_until:    string | null
  failed_attempts: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ROLE_CONFIG: Record<Role, { label: string; bg: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
  admin:      { label: "Admin",      bg: "bg-[#1B4F8A]/10", text: "text-[#1B4F8A]",   icon: Shield       },
  instructor: { label: "Instructor", bg: "bg-emerald-50",   text: "text-emerald-700",  icon: GraduationCap },
  assessor:   { label: "Assessor",   bg: "bg-purple-50",    text: "text-purple-700",   icon: User          },
}

const TAB_NAV = [
  { id: "users",         label: "User Management",  icon: Users   },
  { id: "notifications", label: "Notifications",    icon: Bell    },
  { id: "profile",       label: "My Profile",       icon: User    },
]

function relative(date: string | null) {
  if (!date) return "Never"
  const d = new Date(date)
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60)   return "Just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

// ─── Password input ───────────────────────────────────────────────────────────
function PasswordInput({ value, onChange, placeholder = "Password" }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10"
      />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ─── Add / Edit User modal ────────────────────────────────────────────────────
interface UserFormData {
  name: string; email: string; role: Role
  password: string; department: string; phone: string
}
const EMPTY_FORM: UserFormData = { name: "", email: "", role: "instructor", password: "", department: "", phone: "" }

function UserModal({
  open, onClose, user, onSaved,
}: {
  open: boolean
  onClose: () => void
  user: AdminUser | null   // null = create
  onSaved: (u: AdminUser) => void
}) {
  const [form, setForm] = useState<UserFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(user ? {
        name:       user.name,
        email:      user.email,
        role:       user.role,
        password:   "",
        department: user.department ?? "",
        phone:      user.phone ?? "",
      } : EMPTY_FORM)
    }
  }, [open, user])

  function set<K extends keyof UserFormData>(k: K, v: UserFormData[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function save() {
    if (!form.name.trim()) return toast.error("Name is required")
    if (!form.email.trim()) return toast.error("Email is required")
    if (!user && !form.password) return toast.error("Password is required for new users")
    if (form.password && form.password.length < 8) return toast.error("Password must be at least 8 characters")

    setSaving(true)
    try {
      const method = user ? "PATCH" : "POST"
      const body: Record<string, unknown> = {
        name:       form.name.trim(),
        email:      form.email.trim().toLowerCase(),
        role:       form.role,
        department: form.department.trim() || undefined,
        phone:      form.phone.trim() || undefined,
      }
      if (user) body.id = user.id
      if (form.password) body.password = form.password

      const res = await fetch("/api/lms/settings/users", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed to save"); return }
      toast.success(user ? "User updated" : "User created")
      onSaved(data)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? "Edit User" : "Add New User"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Full Name *</label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Jane Smith" />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Email *</label>
            <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="jane@ics-aviation.com" />
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Role *</label>
            <div className="grid grid-cols-3 gap-2">
              {(["admin", "instructor", "assessor"] as Role[]).map(r => {
                const cfg = ROLE_CONFIG[r]
                const Icon = cfg.icon
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => set("role", r)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-medium transition-all",
                      form.role === r
                        ? `${cfg.bg} ${cfg.text} border-current`
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              {user ? "New Password (leave blank to keep)" : "Password *"}
            </label>
            <PasswordInput
              value={form.password}
              onChange={v => set("password", v)}
              placeholder={user ? "Leave blank to keep current" : "Min 8 characters"}
            />
          </div>

          {/* Department + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Department</label>
              <Input value={form.department} onChange={e => set("department", e.target.value)} placeholder="Training" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Phone</label>
              <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+971 xx xxx xxxx" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : (user ? "Save Changes" : "Create User")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Reset Password modal ─────────────────────────────────────────────────────
function ResetPasswordModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [password, setPassword] = useState("")
  const [saving, setSaving]     = useState(false)

  async function save() {
    if (password.length < 8) return toast.error("Password must be at least 8 characters")
    setSaving(true)
    const res = await fetch("/api/lms/settings/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, password }),
    })
    setSaving(false)
    if (!res.ok) { toast.error("Failed to reset password"); return }
    toast.success(`Password reset for ${user.name}`)
    onClose()
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-slate-600">Set a new password for <span className="font-semibold">{user.name}</span>.</p>
          <PasswordInput value={password} onChange={setPassword} placeholder="New password (min 8 chars)" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {saving ? "Saving…" : "Reset Password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Users tab ────────────────────────────────────────────────────────────────
function UsersTab({ currentUserId, isAdmin }: { currentUserId: string; isAdmin: boolean }) {
  const [users,   setUsers]   = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState("")
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all")
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const [addOpen,   setAddOpen]   = useState(false)
  const [editUser,  setEditUser]  = useState<AdminUser | null>(null)
  const [resetUser, setResetUser] = useState<AdminUser | null>(null)

  const menuRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search)           params.set("search", search)
    if (roleFilter !== "all") params.set("role", roleFilter)
    const res  = await fetch(`/api/lms/settings/users?${params}`)
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }, [search, roleFilter])

  useEffect(() => { load() }, [load])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpenMenu(null)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  async function toggleActive(user: AdminUser) {
    if (user.id === currentUserId) return toast.error("You cannot deactivate your own account")
    const res = await fetch("/api/lms/settings/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, is_active: !user.is_active }),
    })
    if (!res.ok) return toast.error("Failed")
    toast.success(user.is_active ? `${user.name} deactivated` : `${user.name} activated`)
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u))
    setOpenMenu(null)
  }

  async function deleteUser(user: AdminUser) {
    if (!confirm(`Permanently delete ${user.name}? This cannot be undone.`)) return
    const res = await fetch(`/api/lms/settings/users?id=${user.id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Failed to delete"); return }
    toast.success(`${user.name} deleted`)
    setUsers(prev => prev.filter(u => u.id !== user.id))
    setOpenMenu(null)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">User Management</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage admins, instructors and assessors</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setAddOpen(true)} className="gap-2 bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
            <UserPlus className="h-4 w-4" /> Add User
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search by name or email…" className="pl-9" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {(["all", "admin", "instructor", "assessor"] as const).map(r => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors",
                roleFilter === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}>
              {r === "all" ? "All" : ROLE_CONFIG[r].label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : users.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Users className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500">No users found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" ref={menuRef}>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider">User</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider hidden md:table-cell">Role</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider hidden lg:table-cell">Department</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider hidden xl:table-cell">Last Login</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider">Status</th>
                {isAdmin && <th className="px-4 py-3 text-right font-medium text-slate-500 text-xs uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(user => {
                const cfg  = ROLE_CONFIG[user.role]
                const Icon = cfg.icon
                const isLocked = user.locked_until && new Date(user.locked_until) > new Date()
                const isMe = user.id === currentUserId
                return (
                  <tr key={user.id} className={cn("hover:bg-slate-50 transition-colors", !user.is_active && "opacity-50")}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0",
                          cfg.bg, cfg.text
                        )}>
                          {user.name[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-semibold text-slate-900">{user.name}</p>
                            {isMe && <Badge className="text-[10px] bg-slate-100 text-slate-500 border-0 px-1.5 py-0">You</Badge>}
                            {isLocked && <span title="Account locked"><Lock className="h-3 w-3 text-red-400" /></span>}
                          </div>
                          <p className="text-xs text-slate-500 truncate">{user.email}</p>
                          {user.phone && <p className="text-xs text-slate-400">{user.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full", cfg.bg, cfg.text)}>
                        <Icon className="h-3 w-3" /> {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell text-sm text-slate-600">
                      {user.department ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 hidden xl:table-cell text-xs text-slate-500">
                      {relative(user.last_login_at)}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={cn(
                        "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full",
                        user.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-400"
                      )}>
                        {user.is_active ? <><CheckCircle2 className="h-3 w-3" /> Active</> : <><X className="h-3 w-3" />Inactive</>}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3.5 text-right relative">
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setOpenMenu(prev => prev === user.id ? null : user.id)}>
                          <MoreVertical className="h-4 w-4 text-slate-400" />
                        </Button>
                        {openMenu === user.id && (
                          <div className="absolute right-4 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 text-left">
                            <button onClick={() => { setEditUser(user); setOpenMenu(null) }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-slate-700">
                              <Edit2 className="h-3.5 w-3.5 text-slate-400" /> Edit Details
                            </button>
                            <button onClick={() => { setResetUser(user); setOpenMenu(null) }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-slate-700">
                              <KeyRound className="h-3.5 w-3.5 text-slate-400" /> Reset Password
                            </button>
                            {!isMe && (
                              <>
                                <div className="border-t border-slate-100 my-1" />
                                <button onClick={() => toggleActive(user)}
                                  className={cn("w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50",
                                    user.is_active ? "text-amber-600" : "text-emerald-600")}>
                                  {user.is_active
                                    ? <><Ban className="h-3.5 w-3.5" /> Deactivate</>
                                    : <><CheckCircle2 className="h-3.5 w-3.5" /> Activate</>}
                                </button>
                                <button onClick={() => deleteUser(user)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 text-red-600">
                                  <Trash2 className="h-3.5 w-3.5" /> Delete
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      <UserModal open={addOpen}          onClose={() => setAddOpen(false)}
        user={null} onSaved={u => setUsers(prev => [u, ...prev])} />
      <UserModal open={!!editUser}        onClose={() => setEditUser(null)}
        user={editUser} onSaved={u => setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ...u } : x))} />
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
    </div>
  )
}

// ─── Notifications tab ───────────────────────────────────────────────────────
interface EmailLogRow {
  id:         string
  type:       string
  to_email:   string
  subject:    string
  status:     string
  sent_at:    string
  error:      string | null
}

function NotificationsTab() {
  const [logs,      setLogs]      = useState<EmailLogRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [sending,   setSending]   = useState(false)
  const [result,    setResult]    = useState<string>("")

  useEffect(() => { loadLogs() }, [])

  async function loadLogs() {
    setLoading(true)
    const res = await fetch("/api/lms/email-logs")
    if (res.ok) setLogs(await res.json())
    setLoading(false)
  }

  async function triggerReminders() {
    setSending(true); setResult("")
    try {
      const secret = process.env.NEXT_PUBLIC_CRON_SECRET ?? ""
      const res  = await fetch("/api/cron/session-reminders", {
        headers: secret ? { authorization: `Bearer ${secret}` } : {},
      })
      const data = await res.json()
      if (!res.ok) { setResult(`Error: ${data.error ?? "Failed"}`); return }
      setResult(`✓ Sent ${data.sent} reminder${data.sent !== 1 ? "s" : ""} for ${data.sessions} session${data.sessions !== 1 ? "s" : ""} (${data.skipped} skipped)`)
      loadLogs()
    } finally { setSending(false) }
  }

  const typeConfig: Record<string, { label: string; color: string }> = {
    enrollment:       { label: "Enrollment",        color: "bg-blue-100 text-blue-700"    },
    session_reminder: { label: "Session Reminder",  color: "bg-amber-100 text-amber-700"  },
    completion:       { label: "Completion",        color: "bg-emerald-100 text-emerald-700" },
  }

  return (
    <div className="space-y-6">
      {/* Manual trigger card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-amber-500" />
              Session Reminders
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Automatically runs daily at 6:00 AM (Vercel cron). Sends reminder emails to all enrolled students for sessions happening tomorrow.
            </p>
          </div>
          <Button onClick={triggerReminders} disabled={sending} variant="outline" className="shrink-0 gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Sending…" : "Run Now"}
          </Button>
        </div>
        {result && (
          <p className={cn("text-sm mt-3 font-medium", result.startsWith("✓") ? "text-emerald-600" : "text-red-500")}>
            {result}
          </p>
        )}
      </div>

      {/* Email types info */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Mail,         label: "Enrollment",       desc: "Sent when a student is enrolled in a course",      color: "text-blue-600 bg-blue-50" },
          { icon: CalendarDays, label: "Session Reminder", desc: "Sent the day before each live session",            color: "text-amber-600 bg-amber-50" },
          { icon: CheckCircle2, label: "Completion",       desc: "Sent when a student finishes all mandatory content", color: "text-emerald-600 bg-emerald-50" },
        ].map(t => (
          <div key={t.label} className="bg-white rounded-xl border border-slate-200 p-4 flex gap-3">
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", t.color)}>
              <t.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium text-slate-800 text-sm">{t.label}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{t.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Email log table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Recent Email Log</h3>
          <button onClick={loadLogs} className="text-xs text-slate-400 hover:text-slate-700">Refresh</button>
        </div>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">No emails sent yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-5 py-2.5 font-medium text-slate-500 text-xs">Type</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs">To</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs">Subject</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map(log => {
                const type = typeConfig[log.type] ?? { label: log.type, color: "bg-slate-100 text-slate-600" }
                return (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", type.color)}>
                        {type.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate">{log.to_email}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-[240px] truncate text-xs">{log.subject}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "text-xs font-semibold px-2 py-0.5 rounded-full",
                        log.status === "sent" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                      )}>
                        {log.status === "sent" ? "✓ Sent" : "✗ Failed"}
                      </span>
                      {log.error && (
                        <span className="ml-1.5 text-xs text-red-400" title={log.error}>!</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(log.sent_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Profile tab ──────────────────────────────────────────────────────────────
function ProfileTab({ currentUser }: { currentUser: { id: string; name?: string | null; email?: string | null; role?: string } }) {
  const { update } = useSession()

  const [form, setForm] = useState({
    name:             currentUser.name ?? "",
    email:            currentUser.email ?? "",
    current_password: "",
    new_password:     "",
    confirm_password: "",
  })
  const [saving, setSaving] = useState(false)

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function save() {
    if (!form.name.trim())  return toast.error("Name is required")
    if (!form.email.trim()) return toast.error("Email is required")
    if (form.new_password) {
      if (!form.current_password) return toast.error("Enter your current password to change it")
      if (form.new_password !== form.confirm_password) return toast.error("Passwords do not match")
      if (form.new_password.length < 8) return toast.error("Password must be at least 8 characters")
    }

    setSaving(true)
    try {
      const body: Record<string, string> = { name: form.name.trim(), email: form.email.trim() }
      if (form.new_password) {
        body.current_password = form.current_password
        body.new_password     = form.new_password
      }

      const res = await fetch("/api/admin/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed to save"); return }

      // Update NextAuth session so header reflects new name immediately
      await update({ name: data.name, email: data.email })
      toast.success("Profile updated")
      setForm(f => ({ ...f, current_password: "", new_password: "", confirm_password: "" }))
    } finally {
      setSaving(false)
    }
  }

  const roleInfo = ROLE_CONFIG[currentUser.role as Role] ?? ROLE_CONFIG.instructor

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">My Profile</h2>
        <p className="text-sm text-slate-500 mt-0.5">Update your name, email and password</p>
      </div>

      {/* Avatar + role card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
        <div className={cn("w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold shrink-0", roleInfo.bg, roleInfo.text)}>
          {(currentUser.name ?? "A")[0].toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-slate-900">{currentUser.name}</p>
          <p className="text-sm text-slate-500">{currentUser.email}</p>
          <span className={cn("inline-flex items-center gap-1 text-xs font-semibold mt-1 px-2 py-0.5 rounded-full", roleInfo.bg, roleInfo.text)}>
            <roleInfo.icon className="h-3 w-3" /> {roleInfo.label}
          </span>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        <div className="p-5 space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Account Info</p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-slate-400" /> Full Name</label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Your name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-slate-400" /> Email</label>
            <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="you@ics-aviation.com" />
          </div>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Change Password</p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-slate-400" /> Current Password</label>
            <PasswordInput value={form.current_password} onChange={v => set("current_password", v)} placeholder="Your current password" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">New Password</label>
            <PasswordInput value={form.new_password} onChange={v => set("new_password", v)} placeholder="Min 8 characters" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Confirm New Password</label>
            <PasswordInput value={form.confirm_password} onChange={v => set("confirm_password", v)} placeholder="Repeat new password" />
          </div>
          {form.new_password && form.confirm_password && form.new_password !== form.confirm_password && (
            <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Passwords do not match</p>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}

// ─── Main settings page ───────────────────────────────────────────────────────
export default function LmsSettingsPage() {
  const { data: session } = useSession()
  const [tab, setTab] = useState<"users" | "notifications" | "profile">("users")

  const isAdmin  = session?.user.role === "admin"
  const user     = session?.user

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Manage users and your account</p>
      </div>

      {/* Tab navigation */}
      <div className="flex border-b border-slate-200 gap-1">
        {TAB_NAV.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "border-[#1B4F8A] text-[#1B4F8A]"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === "users"         && <UsersTab currentUserId={user?.id ?? ""} isAdmin={isAdmin} />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "profile"       && <ProfileTab currentUser={{ id: user?.id ?? "", name: user?.name, email: user?.email, role: user?.role }} />}
    </div>
  )
}
