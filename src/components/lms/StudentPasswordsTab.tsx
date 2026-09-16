"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Search, KeyRound, ShieldAlert, CheckCircle2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// LMS Settings -> Student Passwords (admin only).
// Select students and require them to set a new password. They are signed out
// immediately; after signing back in they can't reach any portal page until the
// new password is saved.

type StudentRow = {
  id: string; name: string; email: string; company: string | null
  last_login: string | null; created_at: string
  must_change_password: boolean; password_changed_at: string | null
}

type Filter = "all" | "required" | "never"

function fmtDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export default function StudentPasswordsTab() {
  const [rows,     setRows]     = useState<StudentRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState("")
  const [filter,   setFilter]   = useState<Filter>("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm,  setConfirm]  = useState<null | "require" | "cancel">(null)
  const [saving,   setSaving]   = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch("/api/lms/settings/student-passwords").catch(() => null)
    if (res?.ok) setRows(await res.json())
    else toast.error("Could not load students")
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const counts = useMemo(() => ({
    required: rows.filter(r => r.must_change_password).length,
    never:    rows.filter(r => !r.password_changed_at).length,
  }), [rows])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter === "required" && !r.must_change_password) return false
      if (filter === "never"    && r.password_changed_at)   return false
      if (!q) return true
      return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || (r.company ?? "").toLowerCase().includes(q)
    })
  }, [rows, search, filter])

  const allVisibleSelected = visible.length > 0 && visible.every(r => selected.has(r.id))

  function toggle(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAllVisible() {
    setSelected(s => {
      const n = new Set(s)
      if (allVisibleSelected) visible.forEach(r => n.delete(r.id))
      else visible.forEach(r => n.add(r.id))
      return n
    })
  }

  async function apply(require: boolean) {
    setSaving(true)
    const res = await fetch("/api/lms/settings/student-passwords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_ids: [...selected], require }),
    }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    setSaving(false)
    setConfirm(null)
    if (!res?.ok) { toast.error(data.error ?? "Could not update students"); return }
    toast.success(require
      ? `${data.updated} student${data.updated === 1 ? "" : "s"} must now set a new password`
      : `Requirement cancelled for ${data.updated} student${data.updated === 1 ? "" : "s"}`)
    setSelected(new Set())
    load()
  }

  const selectedCount = selected.size

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-[#1B4F8A]" /> Student Passwords
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          Require selected students to choose a new password. They are signed out straight away, and after
          signing back in they can&apos;t open any page until the new password is saved.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          {[
            { label: "Students",               value: rows.length,     tone: "text-slate-900" },
            { label: "Change required",        value: counts.required, tone: "text-amber-700" },
            { label: "Never set own password", value: counts.never,    tone: "text-slate-700" },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={cn("text-2xl font-bold mt-0.5", s.tone)}>{loading ? "—" : s.value}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          &ldquo;Never set own password&rdquo; counts students who haven&apos;t changed or reset their password since this
          tracking began. For imported or admin-created accounts, that usually means they still use the password they were sent.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-slate-100">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email or company…" className="pl-9" />
          </div>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            {([["all", "All"], ["required", "Change required"], ["never", "Never set"]] as [Filter, string][]).map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn("px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
          <span className="text-sm text-slate-600 mr-auto">
            {selectedCount === 0 ? "Select students to update" : `${selectedCount} selected`}
          </span>
          <Button size="sm" variant="outline" disabled={selectedCount === 0 || saving} onClick={() => setConfirm("cancel")}>
            Cancel requirement
          </Button>
          <Button size="sm" disabled={selectedCount === 0 || saving} onClick={() => setConfirm("require")}
            className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> Require password change
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-4 py-2.5 w-10">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible}
                    aria-label="Select all shown" className="h-4 w-4 accent-[#1B4F8A]" />
                </th>
                <th className="px-2 py-2.5 font-medium">Student</th>
                <th className="px-2 py-2.5 font-medium hidden md:table-cell">Company</th>
                <th className="px-2 py-2.5 font-medium hidden sm:table-cell">Last login</th>
                <th className="px-4 py-2.5 font-medium">Password</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-10 text-center text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                </td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-slate-400">No students match</td></tr>
              ) : visible.map(r => (
                <tr key={r.id} onClick={() => toggle(r.id)}
                  className={cn("border-b border-slate-50 last:border-0 cursor-pointer transition-colors",
                    selected.has(r.id) ? "bg-[#1B4F8A]/5" : "hover:bg-slate-50")}>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)}
                      aria-label={`Select ${r.name}`} className="h-4 w-4 accent-[#1B4F8A]" />
                  </td>
                  <td className="px-2 py-3">
                    <p className="font-medium text-slate-900">{r.name}</p>
                    <p className="text-xs text-slate-500">{r.email}</p>
                  </td>
                  <td className="px-2 py-3 text-slate-600 hidden md:table-cell">{r.company ?? "—"}</td>
                  <td className="px-2 py-3 text-slate-500 hidden sm:table-cell">{fmtDate(r.last_login)}</td>
                  <td className="px-4 py-3">
                    {r.must_change_password ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                        <AlertTriangle className="h-3 w-3" /> Change required
                      </span>
                    ) : r.password_changed_at ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5">
                        <CheckCircle2 className="h-3 w-3" /> Set {fmtDate(r.password_changed_at)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Never set by student</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={confirm !== null} onOpenChange={v => { if (!v && !saving) setConfirm(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirm === "require" ? "Require a password change?" : "Cancel the requirement?"}
            </DialogTitle>
          </DialogHeader>
          {confirm === "require" ? (
            <div className="space-y-2 text-sm text-slate-600">
              <p>
                <strong className="text-slate-900">{selectedCount} student{selectedCount === 1 ? "" : "s"}</strong>{" "}
                will be signed out of every device now.
              </p>
              <p>
                When they sign back in with their current password, they&apos;ll have to choose a new one before they can
                continue. No email is sent. It&apos;s worth telling them first so it doesn&apos;t come as a surprise.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              {selectedCount} student{selectedCount === 1 ? "" : "s"} will no longer be asked to set a new password.
              Anyone already signed out stays signed out until they sign in again.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setConfirm(null)}>Back</Button>
            <Button disabled={saving} onClick={() => apply(confirm === "require")}
              className={confirm === "require" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : confirm === "require" ? "Require change" : "Cancel requirement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
