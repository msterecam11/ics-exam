"use client"

import { useEffect, useState } from "react"
import { Clock, LogIn } from "lucide-react"

/**
 * Portal-wide "session expired" guard.
 *
 * Wraps window.fetch so that any same-origin request answered with 401
 * (an expired auth cookie) surfaces a friendly modal instead of the page
 * silently failing or showing a cryptic "Unauthorized". The current page
 * stays intact — the user signs in again in a new tab and comes back, so
 * nothing they were doing is lost.
 *
 * Mount once per portal layout with the portal's own login URL.
 */
export default function SessionExpiredGuard({
  loginUrl,
  reason = "For security, you're signed out after a period of inactivity.",
}: {
  loginUrl: string
  reason?: string
}) {
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    const original = window.fetch

    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original(...args)
      try {
        if (res.status === 401) {
          // Ignore the login/auth calls themselves — a 401 there is a normal
          // "wrong credentials" response, not an expired session.
          const url = typeof args[0] === "string"
            ? args[0]
            : args[0] instanceof URL
              ? args[0].href
              : (args[0] as Request).url
          const isAuthCall = /\/(auth|login|signin|session)/i.test(url ?? "")
          const isSameOrigin = !url || url.startsWith("/") || url.startsWith(window.location.origin)
          if (isSameOrigin && !isAuthCall) setExpired(true)
        }
      } catch { /* never let the guard break a real request */ }
      return res
    }

    return () => { window.fetch = original }
  }, [])

  if (!expired) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-slate-800 text-base mb-1">Your session expired</p>
            <p className="text-sm text-slate-500 leading-relaxed mb-4">
              {reason} Sign in again in a new tab, then come back to this page and continue.
              <span className="block mt-1 font-medium text-slate-600">Don&apos;t refresh or close this page.</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => window.open(loginUrl, "_blank", "noopener")}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1B4F8A] text-white text-sm font-semibold hover:bg-[#163f6f] transition-colors">
                <LogIn className="h-4 w-4" /> Sign in again
              </button>
              <button
                onClick={() => setExpired(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
