"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { CheckCircle2, XCircle, Loader2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// Two jobs on one page: confirm the address when arriving with a link, and ask
// for a fresh link when arriving without one (or when the old one expired).

function VerifyBody() {
  const params = useSearchParams()
  const token = params.get("token")
  const [state, setState] = useState<"checking" | "done" | "failed" | "ask">(token ? "checking" : "ask")
  const [error, setError] = useState("")
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const confirm = useCallback(async () => {
    const res = await fetch("/api/lms/signup/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setState("done"); return }
    setError(data.error ?? "That link isn't valid")
    setState("failed")
  }, [token])

  useEffect(() => { if (token) confirm() }, [token, confirm])

  async function resend(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    await fetch("/api/lms/signup/verify", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {})
    setSending(false); setSent(true)
  }

  return (
    <div className="px-8 py-10 text-center">
      {state === "checking" && (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-slate-300 mx-auto" />
          <p className="text-sm text-slate-500 mt-4">Confirming your email…</p>
        </>
      )}

      {state === "done" && (
        <>
          <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mt-4">Your email is confirmed</h2>
          <p className="text-sm text-slate-600 mt-2">Your account is active. You can sign in now.</p>
          <Link href="/lms/login">
            <Button className="mt-6 h-11 px-6 bg-[#1B4F8A] hover:bg-[#163f6e] text-white rounded-xl">Sign in</Button>
          </Link>
        </>
      )}

      {(state === "failed" || state === "ask") && !sent && (
        <>
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
            {state === "failed" ? <XCircle className="h-7 w-7 text-red-500" /> : <Mail className="h-7 w-7 text-slate-400" />}
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mt-4">
            {state === "failed" ? "That link didn't work" : "Send me the link again"}
          </h2>
          <p className="text-sm text-slate-600 mt-2">{error || "Enter your email and we'll send a fresh confirmation link."}</p>

          <form onSubmit={resend} className="mt-5 space-y-3 text-left">
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" className="h-11" required />
            <Button type="submit" disabled={sending || !email}
              className="w-full h-11 bg-[#1B4F8A] hover:bg-[#163f6e] text-white rounded-xl">
              {sending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sending…</> : "Send a new link"}
            </Button>
          </form>

          <Link href="/lms/login" className="inline-block text-sm text-[#1B4F8A] font-medium hover:underline mt-6">
            Back to sign in
          </Link>
        </>
      )}

      {sent && (
        <>
          <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
            <Mail className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mt-4">Check your email</h2>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            If that address needs confirming, a new link is on its way. It lasts 24 hours.
          </p>
          <Link href="/lms/login" className="inline-block text-sm text-[#1B4F8A] font-medium hover:underline mt-6">
            Back to sign in
          </Link>
        </>
      )}
    </div>
  )
}

export default function VerifyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1B4F8A] via-[#1a4578] to-[#0f2d50] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-[#1B4F8A] px-8 py-8 text-center">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36} className="object-contain mx-auto mb-4" />
            <h1 className="text-white text-xl font-bold">Learning Portal</h1>
          </div>
          <Suspense fallback={<div className="px-8 py-10 text-center"><Loader2 className="h-8 w-8 animate-spin text-slate-300 mx-auto" /></div>}>
            <VerifyBody />
          </Suspense>
        </div>
        <p className="text-center text-white/30 text-xs mt-6">ICS Aviation — Integrated Consulting Services</p>
      </div>
    </div>
  )
}
