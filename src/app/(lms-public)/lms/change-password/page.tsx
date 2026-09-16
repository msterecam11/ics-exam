"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Eye, EyeOff, Loader2, Lock, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Where a student is sent when an admin has required them to set a new password
// (LMS Settings -> Student Passwords). Both student layouts redirect here while
// the requirement is in place. It sits in the public route group so it is not
// wrapped by those layouts — otherwise the redirect would loop.
export default function ChangePasswordPage() {
  const [name,     setName]     = useState<string | null>(null)
  const [current,  setCurrent]  = useState("")
  const [password, setPassword] = useState("")
  const [confirm,  setConfirm]  = useState("")
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")

  // Must be signed in: the change is verified against the current password.
  useEffect(() => {
    fetch("/api/lms/profile")
      .then(async r => {
        if (r.status === 401) { window.location.href = "/lms/login"; return }
        const d = await r.json().catch(() => ({}))
        setName(d?.name ?? "")
      })
      .catch(() => setName(""))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (password.length < 8)  { setError("Password must be at least 8 characters."); return }
    if (password !== confirm) { setError("Passwords don't match."); return }
    if (password === current) { setError("Your new password must be different from your current one."); return }
    setLoading(true)
    const res = await fetch("/api/lms/profile/password", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ current, next: password }),
    }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    setLoading(false)
    if (!res || !res.ok) { setError(data.error ?? "Could not update your password. Please try again."); return }
    // Full navigation so the layouts re-read the (now cleared) requirement.
    window.location.href = "/lms/dashboard"
  }

  async function signOut() {
    await fetch("/api/lms/auth", { method: "DELETE" }).catch(() => {})
    window.location.href = "/lms/login"
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1B4F8A] via-[#1a4578] to-[#0f2d50] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-[#1B4F8A] px-8 py-8 text-center">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36}
              className="object-contain mx-auto mb-4" />
            <h1 className="text-white text-xl font-bold">Please Set a New Password</h1>
            <p className="text-white/60 text-sm mt-1">
              {name ? `${name}, your` : "Your"} administrator has asked you to update your password
            </p>
          </div>

          <form onSubmit={submit} className="px-8 py-8 space-y-5">
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                You&apos;ll be able to continue to your courses as soon as your new password is saved.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="current" className="text-slate-700 font-medium">Current password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input id="current" type={showPw ? "text" : "password"} placeholder="The password you signed in with"
                  value={current} onChange={e => setCurrent(e.target.value)}
                  className="pl-10 h-11" autoComplete="current-password" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 font-medium">New password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input id="password" type={showPw ? "text" : "password"} placeholder="At least 8 characters"
                  value={password} onChange={e => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-11" autoComplete="new-password" required />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm" className="text-slate-700 font-medium">Confirm new password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input id="confirm" type={showPw ? "text" : "password"} placeholder="Re-enter your new password"
                  value={confirm} onChange={e => setConfirm(e.target.value)}
                  className="pl-10 h-11" autoComplete="new-password" required />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
            )}

            <Button type="submit" disabled={loading || !current || !password || !confirm}
              className="w-full h-11 bg-[#1B4F8A] hover:bg-[#163f6e] text-white font-semibold text-sm rounded-xl">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : "Save New Password"}
            </Button>

            <div className="text-center">
              <button type="button" onClick={signOut} className="text-sm text-slate-400 hover:text-slate-600">
                Sign out
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
