"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState("")
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    // Endpoint always returns a generic success — we show the same screen regardless
    await fetch("/api/lms/auth/forgot", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email }),
    }).catch(() => {})
    setLoading(false)
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1B4F8A] via-[#1a4578] to-[#0f2d50] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-[#1B4F8A] px-8 py-8 text-center">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36}
              className="object-contain mx-auto mb-4" />
            <h1 className="text-white text-xl font-bold">Forgot Password</h1>
            <p className="text-white/60 text-sm mt-1">We&apos;ll email you a reset link</p>
          </div>

          <div className="px-8 py-8">
            {sent ? (
              <div className="text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800">Check your inbox</p>
                  <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                    If an account exists for <span className="font-medium text-slate-700">{email}</span>,
                    a password reset link is on its way. The link expires in 30 minutes.
                  </p>
                </div>
                <Link href="/lms/login"
                  className="inline-flex items-center gap-1.5 text-sm text-[#1B4F8A] font-medium hover:underline">
                  <ArrowLeft className="h-4 w-4" /> Back to sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5">
                <p className="text-sm text-slate-500 leading-relaxed">
                  Enter the email you use for the Learning Portal and we&apos;ll send you a link to reset your password.
                </p>
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

                <Button type="submit" disabled={loading || !email}
                  className="w-full h-11 bg-[#1B4F8A] hover:bg-[#163f6e] text-white font-semibold text-sm rounded-xl">
                  {loading
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sending…</>
                    : "Send Reset Link"}
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
