"use client"

import { useState, useEffect, Suspense } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import Script from "next/script"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Lock, Mail } from "lucide-react"

// Extend window to hold the Turnstile callback
declare global {
  interface Window {
    onTurnstileSuccess: (token: string) => void
  }
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [email,           setEmail]           = useState("")
  const [password,        setPassword]        = useState("")
  const [error,           setError]           = useState("")
  const [info,            setInfo]            = useState("")
  const [loading,         setLoading]         = useState(false)
  const [turnstileToken,  setTurnstileToken]  = useState<string | null>(null)
  const [turnstileReady,  setTurnstileReady]  = useState(false)

  // Show friendly message if redirected due to inactivity
  useEffect(() => {
    if (searchParams.get("reason") === "inactivity") {
      setInfo("You were signed out due to 30 minutes of inactivity. Please sign in again.")
    }
  }, [searchParams])

  // Register the global callback that Turnstile calls when verified
  useEffect(() => {
    window.onTurnstileSuccess = (token: string) => {
      setTurnstileToken(token)
    }
    return () => {
      // cleanup
      window.onTurnstileSuccess = () => {}
    }
  }, [])

  // In development, bypass the Turnstile requirement
  const isDev = process.env.NODE_ENV === "development"
  const canSubmit = isDev || !!turnstileToken

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError("")
    setLoading(true)

    const result = await signIn("credentials", {
      email,
      password,
      turnstileToken: turnstileToken ?? "",
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      // Ask the status endpoint why the login failed so we can show the right message
      try {
        const statusRes = await fetch(
          `/api/auth/login-status?email=${encodeURIComponent(email)}`
        )
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          if (statusData.status === "rate_limited" || statusData.status === "locked") {
            setError(statusData.message)
          } else {
            setError("Invalid email or password. Please try again.")
          }
        } else {
          setError("Invalid email or password. Please try again.")
        }
      } catch {
        setError("Invalid email or password. Please try again.")
      }

      // Reset Turnstile so a fresh token is required on next attempt
      if (typeof (window as any).turnstile !== "undefined") {
        ;(window as any).turnstile.reset()
      }
      setTurnstileToken(null)
    } else {
      router.push("/dashboard")
    }
  }

  return (
    <>
      {/* Load Turnstile script — async so it doesn't block render */}
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
        onLoad={() => setTurnstileReady(true)}
      />

      <div className="min-h-screen bg-gradient-to-br from-[#1B4F8A] to-[#4B7EC8] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <Image
              src="/logo/logo-white.png"
              alt="ICS Aviation"
              width={220}
              height={60}
              priority
              className="object-contain"
            />
          </div>

          <Card className="shadow-2xl border-0">
            <CardContent className="pt-8 pb-8 px-8">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-[#1B4F8A]">Admin Portal</h1>
                <p className="text-muted-foreground text-sm mt-1">Sign in to manage exams</p>
              </div>

              {info && (
                <Alert className="mb-4 border-amber-300 bg-amber-50 text-amber-800">
                  <AlertDescription>{info}</AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@ics-aviation.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9"
                      required
                      autoComplete="email"
                      maxLength={255}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9"
                      required
                      autoComplete="current-password"
                      maxLength={128}
                    />
                  </div>
                </div>

                {/* Cloudflare Turnstile widget — renders automatically via data-* attrs */}
                {!isDev && (
                  <div className="flex justify-center pt-1">
                    <div
                      className="cf-turnstile"
                      data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                      data-callback="onTurnstileSuccess"
                      data-theme="light"
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full bg-[#1B4F8A] hover:bg-[#163f6e] text-white font-semibold h-11"
                  disabled={loading || !canSubmit}
                >
                  {loading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…</>
                  ) : !canSubmit ? (
                    <>Verifying…</>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-center text-white/60 text-xs mt-6">
            ICS Aviation — Integrated Consulting Services
          </p>
        </div>
      </div>
    </>
  )
}
