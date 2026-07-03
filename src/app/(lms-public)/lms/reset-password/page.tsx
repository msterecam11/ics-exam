"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Eye, EyeOff, Loader2, Lock, ArrowLeft, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ResetPasswordPage() {
  const [token,    setToken]    = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [confirm,  setConfirm]  = useState("")
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")
  const [done,     setDone]     = useState(false)

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token")
    setToken(t)
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (password.length < 8) { setError("Password must be at least 8 characters."); return }
    if (password !== confirm) { setError("Passwords don't match."); return }
    setLoading(true)
    const res = await fetch("/api/lms/auth/reset", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token, password }),
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setError(data.error ?? "Could not reset password."); return }
    setDone(true)
  }

  const noToken = token === null

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1B4F8A] via-[#1a4578] to-[#0f2d50] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-[#1B4F8A] px-8 py-8 text-center">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36}
              className="object-contain mx-auto mb-4" />
            <h1 className="text-white text-xl font-bold">Set a New Password</h1>
            <p className="text-white/60 text-sm mt-1">Choose a password you&apos;ll remember</p>
          </div>

          <div className="px-8 py-8">
            {done ? (
              <div className="text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800">Password updated</p>
                  <p className="text-sm text-slate-500 mt-1">You can now sign in with your new password.</p>
                </div>
                <Link href="/lms/login"
                  className="inline-block w-full h-11 leading-[2.75rem] bg-[#1B4F8A] hover:bg-[#163f6e] text-white font-semibold text-sm rounded-xl">
                  Go to Sign In
                </Link>
              </div>
            ) : noToken ? (
              <div className="text-center space-y-4">
                <p className="text-sm text-slate-500">
                  This reset link is missing or invalid. Please request a new one.
                </p>
                <Link href="/lms/forgot-password"
                  className="inline-flex items-center gap-1.5 text-sm text-[#1B4F8A] font-medium hover:underline">
                  Request a new link
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-700 font-medium">New password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="password"
                      type={showPw ? "text" : "password"}
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-11"
                      autoComplete="new-password"
                      required
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm" className="text-slate-700 font-medium">Confirm password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="confirm"
                      type={showPw ? "text" : "password"}
                      placeholder="Re-enter your password"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      className="pl-10 h-11"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                    {error}
                  </div>
                )}

                <Button type="submit" disabled={loading || !password || !confirm}
                  className="w-full h-11 bg-[#1B4F8A] hover:bg-[#163f6e] text-white font-semibold text-sm rounded-xl">
                  {loading
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Updating…</>
                    : "Update Password"}
                </Button>

                <div className="text-center">
                  <Link href="/lms/login"
                    className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600">
                    <ArrowLeft className="h-4 w-4" /> Back to sign in
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          ICS Aviation — Integrated Consulting Services
        </p>
      </div>
    </div>
  )
}
