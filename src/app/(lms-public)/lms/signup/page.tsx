"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import Script from "next/script"
import { Eye, EyeOff, Loader2, Lock, Mail, User, Phone, Building2, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Registering creates an account that can do nothing until the address is
// confirmed. The answer is the same whether the address was free or already
// taken, so the form never reveals who is registered.

declare global {
  interface Window { onLmsSignupTurnstile?: (token: string) => void }
}

const MIN_PASSWORD = 8

export default function LmsSignupPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", company: "", job_title: "" })
  const [consent, setConsent] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [sent, setSent] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  const isDev = process.env.NODE_ENV === "development"
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))
  const canSubmit = (isDev || !!turnstileToken) && !!form.name && !!form.email
    && form.password.length >= MIN_PASSWORD && consent

  useEffect(() => {
    window.onLmsSignupTurnstile = (token: string) => setTurnstileToken(token)
    return () => { window.onLmsSignupTurnstile = undefined }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(""); setLoading(true)

    const res = await fetch("/api/lms/signup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, consent, turnstileToken: turnstileToken ?? "" }),
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? "Could not create your account")
      if (typeof (window as any).turnstile !== "undefined") (window as any).turnstile.reset()
      setTurnstileToken(null)
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1B4F8A] via-[#1a4578] to-[#0f2d50] flex items-center justify-center p-4">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #60a5fa, transparent)", transform: "translate(30%, -30%)" }} />
      <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #93c5fd, transparent)", transform: "translate(-30%, 30%)" }} />

      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-[#1B4F8A] px-8 py-8 text-center">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36} className="object-contain mx-auto mb-4" />
            <h1 className="text-white text-xl font-bold">Create your account</h1>
            <p className="text-white/60 text-sm mt-1">To browse our courses and ask to join one</p>
          </div>

          {sent ? (
            <div className="px-8 py-10 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
                <MailCheck className="h-7 w-7 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mt-4">Check your email</h2>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                We&apos;ve sent a link to <span className="font-medium text-slate-800">{form.email}</span>.
                Click it to confirm your address — until then the account stays inactive.
              </p>
              <p className="text-xs text-slate-400 mt-4">
                The link lasts 24 hours. Nothing in your inbox? Check spam, or{" "}
                <Link href="/lms/verify" className="text-[#1B4F8A] hover:underline">ask for a new one</Link>.
              </p>
              <Link href="/lms/login" className="inline-block text-sm text-[#1B4F8A] font-medium hover:underline mt-6">
                Back to sign in
              </Link>
            </div>
          ) : (
            <div className="px-8 py-8">
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-slate-700 font-medium">Full name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input id="name" value={form.name} onChange={e => set("name", e.target.value)}
                      placeholder="Your full name" className="pl-10 h-11" autoComplete="name" required />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-700 font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input id="email" type="email" value={form.email} onChange={e => set("email", e.target.value)}
                      placeholder="you@example.com" className="pl-10 h-11" autoComplete="email" required />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-700 font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input id="password" type={showPw ? "text" : "password"} value={form.password}
                      onChange={e => set("password", e.target.value)} placeholder={`At least ${MIN_PASSWORD} characters`}
                      className="pl-10 pr-10 h-11" autoComplete="new-password" required />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="company" className="text-slate-700 font-medium text-xs">Where you work</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input id="company" value={form.company} onChange={e => set("company", e.target.value)}
                        placeholder="Optional" className="pl-10 h-11" autoComplete="organization" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-slate-700 font-medium text-xs">Phone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input id="phone" value={form.phone} onChange={e => set("phone", e.target.value)}
                        placeholder="Optional" className="pl-10 h-11" autoComplete="tel" />
                    </div>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                    className="mt-0.5 accent-[#1B4F8A]" />
                  <span className="text-xs text-slate-600 leading-relaxed">
                    I agree to the{" "}
                    <Link href="/privacy" target="_blank" className="text-[#1B4F8A] font-medium hover:underline">Privacy Policy</Link>
                    {" "}and to ICS holding my details for training purposes.
                  </span>
                </label>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
                )}

                {!isDev && (
                  <div className="flex justify-center">
                    <div className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                      data-callback="onLmsSignupTurnstile" data-theme="light" />
                  </div>
                )}

                <Button type="submit" disabled={loading || !canSubmit}
                  className="w-full h-11 bg-[#1B4F8A] hover:bg-[#163f6e] text-white font-semibold text-sm rounded-xl">
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating…</> : "Create account"}
                </Button>
              </form>

              <p className="text-center text-xs text-slate-400 mt-6">
                Already have an account?{" "}
                <Link href="/lms/login" className="text-[#1B4F8A] font-medium hover:underline">Sign in</Link>
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          ICS Aviation — Integrated Consulting Services
        </p>
      </div>
    </div>
  )
}
