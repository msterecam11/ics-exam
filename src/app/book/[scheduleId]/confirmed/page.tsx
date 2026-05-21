"use client"

import { useSearchParams, useParams } from "next/navigation"
import Image from "next/image"
import { CheckCircle2, Calendar, Clock, Copy, Settings, Download } from "lucide-react"
import { toast } from "sonner"
import { Suspense } from "react"
import Link from "next/link"

function ConfirmedContent() {
  const searchParams = useSearchParams()
  const { scheduleId } = useParams() as { scheduleId: string }
  const code    = searchParams.get("code") ?? ""
  const slotUtc = searchParams.get("slot") ?? ""

  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const slotDate = slotUtc ? new Date(slotUtc).toLocaleDateString("en-GB", {
    timeZone: userTz, weekday: "long", day: "numeric", month: "long", year: "numeric",
  }) : "—"

  const slotTime = slotUtc ? new Date(slotUtc).toLocaleTimeString("en-GB", {
    timeZone: userTz, hour: "2-digit", minute: "2-digit", hour12: false,
  }) : "—"


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


      {/* Download receipt */}
      <a href={`/api/book/${scheduleId}/receipt?code=${code}`}
        className="flex items-center justify-center gap-2 w-full bg-[#1B4F8A] text-white rounded-xl py-3 text-sm font-bold hover:bg-[#1B4F8A]/90 transition-colors">
        <Download className="h-4 w-4" /> Download Receipt (PDF)
      </a>

      <Link href={`/book/${scheduleId}/manage?code=${code}`}
        className="flex items-center justify-center gap-2 w-full border border-slate-200 rounded-xl py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
        <Settings className="h-4 w-4" /> Reschedule or Cancel
      </Link>

      <p className="text-xs text-slate-400 leading-relaxed">
        A confirmation email has been sent to you.<br />
        Please arrive on time and keep your confirmation code handy.
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
