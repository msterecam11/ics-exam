"use client"

import { useState, useTransition } from "react"
import { UserCircle, Building2, Globe, Briefcase, Save, Check, Key } from "lucide-react"
import { cn } from "@/lib/utils"

// This page is client-rendered; it fetches its own data via the profile API
// and submits changes via the same endpoint.

export default function ProfilePage() {
  const [data, setData]     = useState<any>(null)
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [saving, startSave] = useTransition()

  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" })
  const [pwError, setPwError] = useState("")
  const [pwSaved, setPwSaved] = useState(false)
  const [pwSaving, startPwSave] = useTransition()

  // Fetch on first render
  if (!loaded) {
    setLoaded(true)
    fetch("/api/lms/profile")
      .then(r => r.json())
      .then(d => setData(d))
  }

  function save() {
    startSave(async () => {
      await fetch("/api/lms/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:      data.name,
          job_title: data.job_title,
          company:   data.company,
          language:  data.language,
        }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    })
  }

  function changePassword() {
    setPwError("")
    if (pwForm.next !== pwForm.confirm) {
      setPwError("New passwords do not match")
      return
    }
    if (pwForm.next.length < 6) {
      setPwError("Password must be at least 6 characters")
      return
    }
    startPwSave(async () => {
      const res = await fetch("/api/lms/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current: pwForm.current, next: pwForm.next }),
      })
      if (!res.ok) {
        const j = await res.json()
        setPwError(j.error ?? "Failed to change password")
      } else {
        setPwSaved(true)
        setPwForm({ current: "", next: "", confirm: "" })
        setTimeout(() => setPwSaved(false), 3000)
      }
    })
  }

  if (!data) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-24 bg-slate-200 rounded-xl" />
          <div className="h-48 bg-slate-200 rounded-xl" />
        </div>
      </div>
    )
  }

  function Field({
    label, icon: Icon, value, onChange, type = "text", disabled = false,
  }: {
    label: string; icon: any; value: string; onChange?: (v: string) => void
    type?: string; disabled?: boolean
  }) {
    return (
      <div>
        <label className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-slate-400" />
          {label}
        </label>
        <input
          type={type}
          value={value}
          disabled={disabled}
          onChange={e => onChange?.(e.target.value)}
          className={cn(
            "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white",
            "focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30 focus:border-[#1B4F8A] transition-all",
            disabled && "bg-slate-50 text-slate-400 cursor-not-allowed"
          )}
        />
      </div>
    )
  }

  const initials = (data.name ?? "?")
    .split(" ").slice(0, 2).map((w: string) => w[0] ?? "").join("").toUpperCase()

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">

      {/* Avatar + name */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-[#1B4F8A] flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
          {initials}
        </div>
        <div>
          <p className="font-semibold text-slate-900 text-base">{data.name}</p>
          <p className="text-sm text-slate-500">{data.email}</p>
          {data.job_title && <p className="text-xs text-slate-400 mt-0.5">{data.job_title}</p>}
        </div>
      </div>

      {/* Edit profile */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <UserCircle className="h-4 w-4 text-[#1B4F8A]" /> Profile Information
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Full Name"
            icon={UserCircle}
            value={data.name ?? ""}
            onChange={v => setData((d: any) => ({ ...d, name: v }))}
          />
          <Field
            label="Email"
            icon={UserCircle}
            value={data.email ?? ""}
            disabled
          />
          <Field
            label="Job Title"
            icon={Briefcase}
            value={data.job_title ?? ""}
            onChange={v => setData((d: any) => ({ ...d, job_title: v }))}
          />
          <Field
            label="Company"
            icon={Building2}
            value={data.company ?? ""}
            onChange={v => setData((d: any) => ({ ...d, company: v }))}
          />
          <Field
            label="Language"
            icon={Globe}
            value={data.language ?? ""}
            onChange={v => setData((d: any) => ({ ...d, language: v }))}
          />
        </div>

        <button
          onClick={save}
          disabled={saving}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            saved
              ? "bg-emerald-100 text-emerald-700"
              : "bg-[#1B4F8A] text-white hover:bg-[#163f6e]",
            saving && "opacity-60 cursor-not-allowed"
          )}
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? "Saved!" : saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {/* Change password */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Key className="h-4 w-4 text-[#1B4F8A]" /> Change Password
        </h2>

        <div className="space-y-3">
          <Field
            label="Current Password"
            icon={Key}
            type="password"
            value={pwForm.current}
            onChange={v => setPwForm(f => ({ ...f, current: v }))}
          />
          <Field
            label="New Password"
            icon={Key}
            type="password"
            value={pwForm.next}
            onChange={v => setPwForm(f => ({ ...f, next: v }))}
          />
          <Field
            label="Confirm New Password"
            icon={Key}
            type="password"
            value={pwForm.confirm}
            onChange={v => setPwForm(f => ({ ...f, confirm: v }))}
          />
        </div>

        {pwError && <p className="text-xs text-red-600">{pwError}</p>}

        <button
          onClick={changePassword}
          disabled={pwSaving || !pwForm.current || !pwForm.next || !pwForm.confirm}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            pwSaved
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-800 text-white hover:bg-slate-900",
            (pwSaving || !pwForm.current || !pwForm.next || !pwForm.confirm) && "opacity-50 cursor-not-allowed"
          )}
        >
          {pwSaved ? <Check className="h-4 w-4" /> : <Key className="h-4 w-4" />}
          {pwSaved ? "Password changed!" : pwSaving ? "Updating…" : "Change Password"}
        </button>
      </div>
    </div>
  )
}
