"use client"

import { useParams, useSearchParams } from "next/navigation"
import Image from "next/image"
import { CheckCircle2, Calendar, Clock, Copy, ThumbsUp, ThumbsDown, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Suspense, useState } from "react"
import { cn } from "@/lib/utils"

function ConfirmedContent() {
  const { scheduleId } = useParams() as { scheduleId: string }
  const searchParams   = useSearchParams()
  const code    = searchParams.get("code") ?? ""
  const slotUtc = searchParams.get("slot") ?? ""

  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const slotDate = slotUtc ? new Date(slotUtc).toLocaleDateString("en-GB", {
    timeZone: userTz, weekday: "long", day: "numeric", month: "long", year: "numeric",
  }) : "—"

  const slotTime = slotUtc ? new Date(slotUtc).toLocaleTimeString("en-GB", {
    timeZone: userTz, hour: "2-digit", minute: "2-digit", hour12: false,
  }) : "—"

  // RSVP state
  const [rsvp,    setRsvp]    = useState<"pending" | "accepted" | "declined">("pending")
  const [loading, setLoading] = useState<"accepted" | "declined" | null>(null)

  async function handleRsvp(choice: "accepted" | "declined") {
    if (rsvp !== "pending") return
    setLoading(choice)
    const res = await fetch(`/api/book/${scheduleId}/rsvp`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ confirmation_code: code, rsvp_status: choice }),
    })
    setLoading(null)
    if (!res.ok) { toast.error("Could not update — please try again"); return }
    setRsvp(choice)
    toast.success(choice === "accepted" ? "Great! See you there 👋" : "Got it — we've noted your response")
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center space-y-6">

      <Image src="/logo/logo-dark-blue.png" alt="ICS Aviation" width={100} height={28} className="object-contain mx-auto" />

      {/* Success icon */}
      <div className="flex items-center justify-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-extrabold text-[#1B4F8A]">Booking Confirmed!</h1>
        <p className="text-slate-500 text-sm mt-1">Your interview slot has been successfully reserved.</p>
      </div>

      {/* Confirmation code */}
      <div className="bg-[#1B4F8A] rounded-2xl px-8 py-5 space-y-1">
        <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">Confirmation Code</p>
        <p className="text-4xl font-black text-white tracking-widest font-mono">{code}</p>
        <p className="text-white/50 text-xs">Keep this code — you&apos;ll need it on interview day</p>
        <button
          onClick={() => { navigator.clipboard.writeText(code); toast.success("Code copied!") }}
          className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs font-semibold mx-auto mt-2 transition-colors">
          <Copy className="h-3 w-3" /> Copy code
        </button>
      </div>

      {/* Slot details */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 space-y-3 text-left shadow-sm">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Appointment</p>
        <div className="flex items-center gap-3 text-slate-700">
          <Calendar className="h-4 w-4 text-[#1B4F8A] shrink-0" />
          <span className="text-sm font-semibold">{slotDate}</span>
        </div>
        <div className="flex items-center gap-3 text-slate-700">
          <Clock className="h-4 w-4 text-[#1B4F8A] shrink-0" />
          <span className="text-sm font-semibold">{slotTime} <span className="text-slate-400 font-normal text-xs">(your local time)</span></span>
        </div>
      </div>

      {/* ── RSVP ── */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 shadow-sm space-y-3">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Confirm Your Attendance</p>

        {rsvp === "pending" ? (
          <>
            <p className="text-sm text-slate-500">Will you be attending this interview?</p>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                disabled={!!loading}
                onClick={() => handleRsvp("accepted")}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 text-emerald-700 font-bold text-sm hover:bg-emerald-100 transition-all disabled:opacity-60">
                {loading === "accepted"
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <ThumbsUp className="h-4 w-4" />}
                Yes, I&apos;ll attend
              </button>
              <button
                disabled={!!loading}
                onClick={() => handleRsvp("declined")}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-200 bg-red-50 text-red-600 font-bold text-sm hover:bg-red-100 transition-all disabled:opacity-60">
                {loading === "declined"
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <ThumbsDown className="h-4 w-4" />}
                Can&apos;t make it
              </button>
            </div>
          </>
        ) : rsvp === "accepted" ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
              <ThumbsUp className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="text-sm font-bold text-emerald-700">You confirmed your attendance</p>
            <p className="text-xs text-slate-400">We look forward to seeing you!</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <ThumbsDown className="h-6 w-6 text-red-500" />
            </div>
            <p className="text-sm font-bold text-red-600">You declined this appointment</p>
            <p className="text-xs text-slate-400">If you change your mind, contact ICS Aviation directly.</p>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        A calendar event has been created for the interviewer.<br />
        Please arrive on time. If you need to reschedule, contact ICS Aviation directly.
      </p>

      <p className="text-[10px] text-slate-300 uppercase tracking-widest">
        ICS Aviation · Integrated Consulting Services
      </p>
    </div>
  )
}

export default function ConfirmedPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin h-6 w-6 border-2 border-[#1B4F8A] border-t-transparent rounded-full" /></div>}>
      <ConfirmedContent />
    </Suspense>
  )
}
