"use client"

import { useEffect, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import {
  Users, UserPlus, Search, Loader2, Shield,
  GraduationCap, User, Eye, Ban, CheckCircle2,
  Trash2, Edit2, EyeOff, X, ChevronDown,
  ChevronUp, Plus, ArrowLeft, LogOut,
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { signOut } from "next-auth/react"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast }    from "sonner"
import { cn }       from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────
type Role = "admin" | "instructor" | "assessor" | "viewer"

interface AdminUser {
  id: string; name: string; email: string; role: Role
  is_active: boolean; department: string | null; phone: string | null
  created_at: string; last_login_at: string | null
  locked_until: string | null; failed_attempts: number
}

interface AccessRow {
  id: string; system: string; resource_type: string
  resource_id: string; label: string | null
  permissions: Record<string, boolean>; created_at: string
}

interface Resource { id: string; label: string }

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLE_CONFIG: Record<Role, {
  label: string; bg: string; text: string
  icon: React.ComponentType<{ className?: string }>
}> = {
  admin:      { label: "Admin",      bg: "bg-[#1B4F8A]/10", text: "text-[#1B4F8A]",  icon: Shield        },
  instructor: { label: "Instructor", bg: "bg-emerald-50",   text: "text-emerald-700", icon: GraduationCap },
  assessor:   { label: "Assessor",   bg: "bg-purple-50",    text: "text-purple-700",  icon: User          },
  viewer:     { label: "Viewer",     bg: "bg-amber-50",     text: "text-amber-700",   icon: Eye           },
}

const EXAM_SCOPES = [
  { id: "group",  label: "Group",  api: "/api/groups",           labelField: "name"  },
  { id: "course", label: "Course", api: "/api/courses",          labelField: "name"  },
  { id: "exam",   label: "Exam",   api: "/api/exams",            labelField: "title" },
]
const INTERVIEW_SCOPES = [
  { id: "group",  label: "Group",  api: "/api/interview/groups", labelField: "name"  },
  { id: "config", label: "Config", api: "/api/interview/configs",labelField: "name"  },
]
const LMS_SCOPES = [
  { id: "course", label: "Course", api: "/api/lms/courses",      labelField: "title" },
  { id: "cohort", label: "Cohort", api: "/api/lms/cohorts",      labelField: "name"  },
]

const EXAM_PERMISSIONS: { key: string; label: string; desc: string }[] = [
  { key: "scores",  label: "Scores",            desc: "Total score and pass/fail result" },
  { key: "results", label: "Candidate Results", desc: "Full answer breakdown per candidate" },
  { key: "reports", label: "Results",            desc: "Full candidate result view with answers and scores" },
]
const INTERVIEW_PERMISSIONS: { key: string; label: string; desc: string }[] = [
  { key: "progress", label: "Progress",  desc: "Scoring status per assessor" },
  { key: "scores",   label: "Scores",    desc: "Competency scores per candidate" },
  { key: "verdicts", label: "Verdicts",  desc: "Final recommendation/verdict" },
  { key: "reports",  label: "Reports",   desc: "AI-generated panel reports" },
]
const LMS_PERMISSIONS: { key: string; label: string; desc: string }[] = [
  { key: "progress",     label: "Progress",     desc: "Module completion % and last activity" },
  { key: "scores",       label: "Scores",       desc: "Quiz and exam scores" },
  { key: "attendance",   label: "Attendance",   desc: "Session attendance records" },
  { key: "assignments",  label: "Assignments",  desc: "Submission status and grades" },
  { key: "certificates", label: "Certificates", desc: "Certificate issuance status" },
  { key: "reports",      label: "Reports",      desc: "Full individual course report with mastery, exam breakdown, and AI analysis" },
  { key: "last_login",   label: "Last Login",   desc: "When the student last logged in to the LMS" },
]

type SystemId = "exam" | "interview" | "lms"

const SYSTEM_SCOPES: Record<SystemId, typeof EXAM_SCOPES> = {
  exam:      EXAM_SCOPES,
  interview: INTERVIEW_SCOPES,
  lms:       LMS_SCOPES,
}
const SYSTEM_PERMISSIONS: Record<SystemId, typeof EXAM_PERMISSIONS> = {
  exam:      EXAM_PERMISSIONS,
  interview: INTERVIEW_PERMISSIONS,
  lms:       LMS_PERMISSIONS,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relative(date: string | null) {
  if (!date) return "Never"
  const d = new Date(date)
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60)    return "Just now"
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function PasswordInput({ value, onChange, placeholder = "Password" }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} value={value}
        onChange={e => onChange(e.target.value)} placeholder={placeholder} className="pr-10" />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ─── Viewer Access Panel ──────────────────────────────────────────────────────
function ViewerAccessPanel({ userId }: { userId: string }) {
  const [access, setAccess]           = useState<AccessRow[]>([])
  const [loadingAccess, setLoadingA]  = useState(true)

  // Assignment state
  const [activeSystem, setActiveSystem] = useState<SystemId>("exam")
  const [scopeType, setScopeType]       = useState("group")
  const [resources, setResources]       = useState<Resource[]>([])
  const [loadingRes, setLoadingRes]     = useState(false)
  const [resSearch, setResSearch]       = useState("")
  const [selected, setSelected]         = useState<Resource | null>(null)
  const [permissions, setPerms]         = useState<Record<string, boolean>>({})
  const [saving, setSaving]             = useState(false)

  const scopes   = SYSTEM_SCOPES[activeSystem]
  const permDefs = SYSTEM_PERMISSIONS[activeSystem]

  const fetchAccess = useCallback(() => {
    setLoadingA(true)
    fetch(`/api/hub/viewer-access?user_id=${userId}`)
      .then(r => r.json())
      .then((rows: AccessRow[]) => { setAccess(rows); setLoadingA(false) })
  }, [userId])

  useEffect(() => { fetchAccess() }, [fetchAccess])

  // Reset scope + selection when system changes
  useEffect(() => {
    const firstScope = SYSTEM_SCOPES[activeSystem][0].id
    setScopeType(firstScope)
    setSelected(null)
    setResSearch("")
    setPerms({})
  }, [activeSystem])

  // Reset selection when scope changes
  useEffect(() => {
    setSelected(null)
    setResSearch("")
  }, [scopeType])

  // Load resources when system or scope changes
  useEffect(() => {
    const scopeDef = scopes.find(s => s.id === scopeType)
    if (!scopeDef) return
    setLoadingRes(true)
    setResources([])
    fetch(scopeDef.api)
      .then(r => r.ok ? r.json() : [])
      .then((d: any) => {
        const arr: any[] = Array.isArray(d) ? d : (d.data ?? [])
        setResources(arr.map((i: any) => ({
          id: i.id,
          label: i[scopeDef.labelField] ?? i.name ?? i.title ?? i.id,
        })))
        setLoadingRes(false)
      })
  }, [activeSystem, scopeType])

  const togglePerm = (key: string) =>
    setPerms(p => ({ ...p, [key]: !p[key] }))

  const assign = async () => {
    if (!selected) return toast.error("Select a resource first")
    const anyPerm = permDefs.some(p => permissions[p.key])
    if (!anyPerm) return toast.error("Enable at least one permission")

    setSaving(true)
    const res = await fetch("/api/hub/viewer-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id:       userId,
        system:        activeSystem,
        resource_type: scopeType,
        resource_id:   selected.id,
        label:         selected.label,
        permissions,
      }),
    })
    setSaving(false)
    if (res.ok) {
      fetchAccess()
      setSelected(null)
      setPerms({})
      toast.success("Access granted")
    } else {
      const e = await res.json()
      toast.error(e.error ?? "Failed to assign access")
    }
  }

  const revoke = async (id: string) => {
    const res = await fetch(`/api/hub/viewer-access?id=${id}`, { method: "DELETE" })
    if (res.ok) { fetchAccess(); toast.success("Access revoked") }
    else toast.error("Failed to revoke access")
  }

  const filtered = resources.filter(r =>
    r.label.toLowerCase().includes(resSearch.toLowerCase())
  )

  const bySys = access.reduce<Record<string, AccessRow[]>>((acc, row) => {
    acc[row.system] = [...(acc[row.system] ?? []), row]
    return acc
  }, {})

  const alreadyAssigned = (id: string) =>
    access.some(a => a.system === activeSystem && a.resource_id === id)

  return (
    <div className="border-t border-slate-100 bg-slate-50/50">
      <div className="p-5 grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* ── Left: Assign ── */}
        <div className="space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assign Access</p>

          {/* System tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {([
              { id: "exam",      label: "Exam"      },
              { id: "interview", label: "Interview"  },
              { id: "lms",       label: "LMS"       },
            ] as { id: SystemId; label: string }[]).map(sys => (
              <button key={sys.id} onClick={() => setActiveSystem(sys.id)}
                className={cn(
                  "flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors",
                  activeSystem === sys.id
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}>
                {sys.label}
              </button>
            ))}
          </div>

          {/* Scope type */}
          <div>
            <p className="text-xs text-slate-400 mb-1.5">Scope</p>
            <div className="flex gap-2">
              {scopes.map(s => (
                <button key={s.id} onClick={() => setScopeType(s.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    scopeType === s.id
                      ? "bg-[#1B4F8A] text-white border-[#1B4F8A]"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  )}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Resource picker */}
          <div>
            <p className="text-xs text-slate-400 mb-1.5">
              {selected ? (
                <span className="text-slate-700 font-medium">Selected: {selected.label}</span>
              ) : (
                `Choose a ${scopeType}`
              )}
            </p>
            <div className="relative mb-1.5">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input value={resSearch} onChange={e => setResSearch(e.target.value)}
                placeholder={`Search ${scopeType}s…`} className="pl-8 h-8 text-sm" />
            </div>
            <div className="border border-slate-200 rounded-lg bg-white max-h-40 overflow-y-auto">
              {loadingRes ? (
                <div className="flex justify-center py-5">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-5">No {scopeType}s found</p>
              ) : filtered.map(r => {
                const isSelected = selected?.id === r.id
                const already    = alreadyAssigned(r.id)
                return (
                  <button key={r.id} onClick={() => !already && setSelected(isSelected ? null : r)}
                    disabled={already}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 text-left text-sm border-b last:border-0 border-slate-50 transition-colors",
                      isSelected   ? "bg-[#1B4F8A]/5 text-[#1B4F8A]" :
                      already      ? "opacity-40 cursor-default" :
                                     "hover:bg-slate-50 text-slate-700"
                    )}>
                    <span className="truncate">{r.label}</span>
                    {already && <span className="text-xs text-slate-400 shrink-0 ml-2">Already added</span>}
                    {isSelected && !already && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 ml-2 text-[#1B4F8A]" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Permissions */}
          <div>
            <p className="text-xs text-slate-400 mb-2">Permissions</p>
            <div className="space-y-2">
              {permDefs.map(p => (
                <label key={p.key}
                  className="flex items-start gap-3 cursor-pointer group">
                  <div className={cn(
                    "mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                    permissions[p.key]
                      ? "bg-[#1B4F8A] border-[#1B4F8A]"
                      : "border-slate-300 group-hover:border-slate-400"
                  )} onClick={() => togglePerm(p.key)}>
                    {permissions[p.key] && (
                      <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 text-white fill-current">
                        <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                      </svg>
                    )}
                  </div>
                  <div onClick={() => togglePerm(p.key)}>
                    <p className="text-sm font-medium text-slate-700">{p.label}</p>
                    <p className="text-xs text-slate-400">{p.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={assign} disabled={!selected || saving}
            className="w-full bg-[#1B4F8A] hover:bg-[#1B4F8A]/90">
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</>
              : <><Plus className="h-4 w-4 mr-2" />Add Access</>
            }
          </Button>
        </div>

        {/* ── Right: Current access ── */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Current Access {access.length > 0 && `(${access.length})`}
          </p>

          {loadingAccess ? (
            <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-slate-300" /></div>
          ) : access.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No access assigned yet.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(bySys).map(([sys, rows]) => (
                <div key={sys}>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                    {sys === "exam" ? "Exam System" : sys === "interview" ? "Interview" : sys === "lms" ? "LMS" : sys}
                  </p>
                  <div className="space-y-2">
                    {rows.map(row => {
                      const perms = Object.entries(row.permissions ?? {})
                        .filter(([, v]) => v).map(([k]) => k)
                      return (
                        <div key={row.id}
                          className="bg-white border border-slate-200 rounded-xl p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">
                                {row.label ?? row.resource_id}
                              </p>
                              <p className="text-xs text-slate-400 mt-0.5 capitalize">
                                {row.resource_type} scope
                              </p>
                            </div>
                            <button onClick={() => revoke(row.id)}
                              className="shrink-0 text-slate-300 hover:text-red-500 transition-colors mt-0.5">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          {perms.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {perms.map(k => (
                                <span key={k}
                                  className="text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                                  {k}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── User Row ─────────────────────────────────────────────────────────────────
function UserRow({ user, currentUserId, isAdmin, onEdit, onDelete, onToggleActive }: {
  user: AdminUser; currentUserId: string; isAdmin: boolean
  onEdit: (u: AdminUser) => void; onDelete: (u: AdminUser) => void
  onToggleActive: (u: AdminUser) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const cfg   = ROLE_CONFIG[user.role]
  const Icon  = cfg.icon
  const isSelf = user.id === currentUserId

  return (
    <>
      <tr className="hover:bg-slate-50/60 transition-colors">
        <td className="px-5 py-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
              user.is_active ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-300"
            )}>
              {user.name[0]?.toUpperCase()}
            </div>
            <div>
              <p className={cn("text-sm font-medium", user.is_active ? "text-slate-800" : "text-slate-400")}>
                {user.name}{isSelf && <span className="text-xs text-slate-400 ml-1">(you)</span>}
              </p>
              <p className="text-xs text-slate-400">{user.email}</p>
            </div>
          </div>
        </td>
        <td className="px-5 py-4">
          <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full", cfg.bg, cfg.text)}>
            <Icon className="h-3 w-3" />{cfg.label}
          </span>
        </td>
        <td className="px-5 py-4 text-sm text-slate-500 hidden md:table-cell">
          {user.department ?? <span className="text-slate-300">—</span>}
        </td>
        <td className="px-5 py-4 hidden sm:table-cell">
          <span className={cn(
            "inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full",
            user.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
          )}>
            {user.is_active ? "Active" : "Inactive"}
          </span>
        </td>
        <td className="px-5 py-4 text-xs text-slate-400 hidden lg:table-cell">
          {relative(user.last_login_at ?? null)}
        </td>
        <td className="px-5 py-4">
          <div className="flex items-center gap-1">
            {user.role === "viewer" && isAdmin && (
              <button onClick={() => setExpanded(e => !e)}
                className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                title="Manage access">
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
            {isAdmin && !isSelf && (
              <>
                <button onClick={() => onEdit(user)}
                  className="p-1.5 text-slate-400 hover:text-[#1B4F8A] hover:bg-[#1B4F8A]/10 rounded-lg transition-colors">
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => onToggleActive(user)}
                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                  {user.is_active ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => onDelete(user)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {expanded && user.role === "viewer" && (
        <tr>
          <td colSpan={6} className="p-0">
            <ViewerAccessPanel userId={user.id} />
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Create/Edit Modal ────────────────────────────────────────────────────────
function UserModal({ open, onClose, onSaved, editing }: {
  open: boolean; onClose: () => void; onSaved: () => void; editing: AdminUser | null
}) {
  const [name, setName]       = useState("")
  const [email, setEmail]     = useState("")
  const [role, setRole]       = useState<Role>("instructor")
  const [password, setPass]   = useState("")
  const [dept, setDept]       = useState("")
  const [phone, setPhone]     = useState("")
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    if (editing) {
      setName(editing.name); setEmail(editing.email); setRole(editing.role)
      setPass(""); setDept(editing.department ?? ""); setPhone(editing.phone ?? "")
    } else {
      setName(""); setEmail(""); setRole("instructor"); setPass(""); setDept(""); setPhone("")
    }
  }, [editing, open])

  const save = async () => {
    if (!name.trim() || !email.trim()) return toast.error("Name and email are required")
    if (!editing && password.length < 8)  return toast.error("Password must be at least 8 characters")
    setSaving(true)
    const body = editing
      ? { id: editing.id, name: name.trim(), email: email.trim(), role, department: dept || null, phone: phone || null, ...(password ? { password } : {}) }
      : { name: name.trim(), email: email.trim(), role, password, department: dept || null, phone: phone || null }
    const res  = await fetch("/api/lms/settings/users", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) return toast.error(data.error ?? "Failed")
    toast.success(editing ? "User updated" : "User created")
    onSaved(); onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit User" : "New User"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Full Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="John Smith" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Email</label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@ics-aviation.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Role</label>
              <select value={role} onChange={e => setRole(e.target.value as Role)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="admin">Admin</option>
                <option value="instructor">Instructor</option>
                <option value="assessor">Assessor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Department</label>
              <Input value={dept} onChange={e => setDept(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Phone</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">
              {editing ? "New Password (leave blank to keep)" : "Password"}
            </label>
            <PasswordInput value={password} onChange={setPass}
              placeholder={editing ? "Leave blank to keep" : "Min 8 characters"} />
          </div>
          {role === "viewer" && !editing && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              After creating, expand the viewer row to assign system access and permissions.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {editing ? "Save Changes" : "Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────
function DeleteModal({ user, onClose, onDeleted }: {
  user: AdminUser | null; onClose: () => void; onDeleted: () => void
}) {
  const [loading, setLoading] = useState(false)
  const confirm = async () => {
    if (!user) return
    setLoading(true)
    const res = await fetch(`/api/lms/settings/users?id=${user.id}`, { method: "DELETE" })
    setLoading(false)
    if (res.ok) { toast.success("User deleted"); onDeleted(); onClose() }
    else { const e = await res.json(); toast.error(e.error ?? "Failed") }
  }
  return (
    <Dialog open={!!user} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Delete User</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">
          Delete <strong>{user?.name}</strong>? This cannot be undone.
          {user?.role === "viewer" && " All their viewer access will also be removed."}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={confirm} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HubUsersPage() {
  const { data: session }   = useSession()
  const isAdmin             = session?.user?.role === "admin"
  const [users, setUsers]   = useState<AdminUser[]>([])
  const [loading, setLoad]  = useState(true)
  const [search, setSearch] = useState("")
  const [roleFilter, setRF] = useState("all")
  const [modalOpen, setMO]  = useState(false)
  const [editing, setEdit]  = useState<AdminUser | null>(null)
  const [deleting, setDel]  = useState<AdminUser | null>(null)

  const fetchUsers = useCallback(() => {
    setLoad(true)
    const p = new URLSearchParams()
    if (search)          p.set("search", search)
    if (roleFilter !== "all") p.set("role", roleFilter)
    fetch(`/api/lms/settings/users?${p}`)
      .then(r => r.json())
      .then((d: AdminUser[]) => { setUsers(d); setLoad(false) })
  }, [search, roleFilter])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const toggleActive = async (user: AdminUser) => {
    const res = await fetch("/api/lms/settings/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, is_active: !user.is_active }),
    })
    if (res.ok) { fetchUsers(); toast.success(user.is_active ? "Deactivated" : "Activated") }
    else { const e = await res.json(); toast.error(e.error ?? "Failed") }
  }

  const counts = users.reduce<Record<string, number>>((a, u) => ({ ...a, [u.role]: (a[u.role] ?? 0) + 1 }), {})

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Image src="/logo/logo-dark-blue.png" alt="ICS Aviation" width={140} height={38} className="object-contain" priority />
          <div className="h-5 w-px bg-slate-200 mx-1" />
          <span className="text-sm font-semibold text-[#1B4F8A] tracking-wide">HUB</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/hub"
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />Back to Hub
          </Link>
          <button onClick={() => signOut({ callbackUrl: "/auth/login" })}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">User Management</h1>
            <p className="text-slate-500 text-sm mt-1">All platform users across ICS Hub systems.</p>
          </div>
          {isAdmin && (
            <Button onClick={() => { setEdit(null); setMO(true) }}
              className="bg-[#1B4F8A] hover:bg-[#1B4F8A]/90">
              <UserPlus className="h-4 w-4 mr-2" />New User
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {(Object.entries(ROLE_CONFIG) as [Role, typeof ROLE_CONFIG[Role]][]).map(([role, cfg]) => {
            const Icon = cfg.icon
            return (
              <div key={role} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", cfg.bg)}>
                  <Icon className={cn("h-4 w-4", cfg.text)} />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-800">{counts[role] ?? 0}</p>
                  <p className="text-xs text-slate-400">{cfg.label}s</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email…" className="pl-9" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {["all", "admin", "instructor", "assessor", "viewer"].map(r => (
              <button key={r} onClick={() => setRF(r)}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-medium border transition-colors",
                  roleFilter === r
                    ? "bg-[#1B4F8A] text-white border-[#1B4F8A]"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}>
                {r === "all" ? "All" : ROLE_CONFIG[r as Role]?.label ?? r}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center py-16">
              <Users className="h-8 w-8 text-slate-200 mb-3" />
              <p className="text-slate-500 font-medium">No users found</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  {["User", "Role", "Department", "Status", "Last Login", ""].map((h, i) => (
                    <th key={i} className={cn(
                      "px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide",
                      i === 2 && "hidden md:table-cell",
                      i === 3 && "hidden sm:table-cell",
                      i === 4 && "hidden lg:table-cell",
                    )}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map(user => (
                  <UserRow key={user.id} user={user}
                    currentUserId={session?.user?.id ?? ""}
                    isAdmin={isAdmin}
                    onEdit={u => { setEdit(u); setMO(true) }}
                    onDelete={setDel}
                    onToggleActive={toggleActive}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      <UserModal open={modalOpen} onClose={() => { setMO(false); setEdit(null) }}
        onSaved={fetchUsers} editing={editing} />
      <DeleteModal user={deleting} onClose={() => setDel(null)} onDeleted={fetchUsers} />
    </div>
  )
}
