"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LmsLoginPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const res = await fetch("/api/lms/auth", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error ?? "Login failed"); return }
    window.location.href = "/lms/dashboard"
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1B4F8A] via-[#1a4578] to-[#0f2d50] flex items-center justify-center p-4">
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #60a5fa, transparent)", transform: "translate(30%, -30%)" }} />
      <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #93c5fd, transparent)", transform: "translate(-30%, 30%)" }} />

      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-[#1B4F8A] px-8 py-8 text-center">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36}
              className="object-contain mx-auto mb-4" />
            <h1 className="text-white text-xl font-bold">Learning Portal</h1>
            <p className="text-white/60 text-sm mt-1">Sign in to access your courses</p>
          </div>

          <div className="px-8 py-8">
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700 font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="pl-10 h-11"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700 font-medium">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    placeholder="Your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-11"
                    autoComplete="current-password"
                    required
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={loading || !email || !password}
                className="w-full h-11 bg-[#1B4F8A] hover:bg-[#163f6e] text-white font-semibold text-sm rounded-xl">
                {loading
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Signing in…</>
                  : "Sign In"}
              </Button>
            </form>

            <p className="text-center text-xs text-slate-400 mt-6">
              Don&apos;t have an account? Contact your instructor or admin.
            </p>
          </div>
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          ICS Aviation — Integrated Consulting Services
        </p>
      </div>
    </div>
  )
}
