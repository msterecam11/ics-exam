"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Clock, AlertTriangle, Loader2, QrCode, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

type CheckInStatus = "idle" | "loading" | "success_present" | "success_late" | "already" | "closed" | "error"

export default function StudentCheckInPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const router = useRouter()
  const [status, setStatus]   = useState<CheckInStatus>("idle")
  const [message, setMessage] = useState("")
  const [checking, setChecking] = useState(false)

  async function checkIn() {
    setChecking(true)
    setStatus("loading")

    try {
      const res  = await fetch("/api/lms/attendance", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ session_id: sessionId }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/lms/login")
          return
        }
        if (data.error?.includes("closed")) {
          setStatus("closed"); return
        }
        setStatus("error")
        setMessage(data.error ?? "Check-in failed. Please try again.")
        return
      }

      if (data.alreadyCheckedIn) {
        setStatus("already")
        setMessage(data.status)
        return
      }

      if (data.status === "late") {
        setStatus("success_late")
      } else {
        setStatus("success_present")
      }
    } catch {
      setStatus("error")
      setMessage("Network error. Please check your connection.")
    } finally {
      setChecking(false)
    }
  }

  // Auto check-in on page load
  useEffect(() => {
    checkIn()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-[#1B4F8A] text-white px-4 py-4">
        <div className="max-w-sm mx-auto flex items-center gap-3">
          <Link href="/lms/dashboard">
            <button className="p-1 rounded-lg hover:bg-white/10 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <h1 className="text-lg font-bold">Session Check-In</h1>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Loading */}
          {(status === "idle" || status === "loading") && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
              <Loader2 className="h-14 w-14 animate-spin text-[#1B4F8A] mx-auto mb-5" />
              <h2 className="font-bold text-slate-900 text-lg">Checking You In…</h2>
              <p className="text-sm text-slate-500 mt-2">Please wait</p>
            </div>
          )}

          {/* Success — Present */}
          {status === "success_present" && (
            <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-10 text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </div>
              <h2 className="font-bold text-emerald-700 text-2xl">You're In!</h2>
              <p className="text-slate-600 mt-2">Attendance marked as</p>
              <span className="inline-block mt-2 px-4 py-1.5 bg-emerald-100 text-emerald-700 font-bold rounded-full text-lg">
                Present ✓
              </span>
              <p className="text-sm text-slate-400 mt-5">
                {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </p>
              <Link href="/lms/dashboard" className="block mt-6">
                <Button className="w-full bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          )}

          {/* Success — Late */}
          {status === "success_late" && (
            <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-10 text-center">
              <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
                <Clock className="h-10 w-10 text-amber-600" />
              </div>
              <h2 className="font-bold text-amber-700 text-2xl">Checked In Late</h2>
              <p className="text-slate-600 mt-2">Attendance marked as</p>
              <span className="inline-block mt-2 px-4 py-1.5 bg-amber-100 text-amber-700 font-bold rounded-full text-lg">
                Late
              </span>
              <p className="text-sm text-slate-400 mt-5">
                {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </p>
              <Link href="/lms/dashboard" className="block mt-6">
                <Button className="w-full bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          )}

          {/* Already checked in */}
          {status === "already" && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
              <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="h-10 w-10 text-blue-500" />
              </div>
              <h2 className="font-bold text-slate-900 text-xl">Already Checked In</h2>
              <p className="text-slate-500 mt-2">
                Your attendance was already recorded as{" "}
                <strong className="capitalize">{message}</strong>.
              </p>
              <Link href="/lms/dashboard" className="block mt-6">
                <Button variant="outline" className="w-full">
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          )}

          {/* Session closed */}
          {status === "closed" && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
              <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-5">
                <AlertTriangle className="h-10 w-10 text-slate-400" />
              </div>
              <h2 className="font-bold text-slate-900 text-xl">Session Closed</h2>
              <p className="text-slate-500 mt-2">
                This session is no longer accepting check-ins. Please contact your instructor.
              </p>
              <Link href="/lms/dashboard" className="block mt-6">
                <Button variant="outline" className="w-full">
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-10 text-center">
              <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
                <AlertTriangle className="h-10 w-10 text-red-500" />
              </div>
              <h2 className="font-bold text-red-700 text-xl">Check-In Failed</h2>
              <p className="text-slate-500 mt-2 text-sm">{message}</p>
              <div className="mt-6 flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={checkIn}
                  disabled={checking}
                >
                  {checking
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : "Retry"}
                </Button>
                <Link href="/lms/dashboard" className="flex-1">
                  <Button className="w-full bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
                    Dashboard
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
