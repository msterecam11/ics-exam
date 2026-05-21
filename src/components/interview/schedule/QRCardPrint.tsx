"use client"

import { useEffect, useState, forwardRef } from "react"
import Image from "next/image"
import QRCode from "@/components/shared/QRCode"

interface Props {
  schedule:   any
  firstSlot:  any | null
  lastSlot:   any | null
  bookingUrl: string
  dark?:      boolean
}

function fmtDate(utc: string, tz: string) {
  return new Date(utc).toLocaleDateString("en-GB", {
    timeZone: tz, day: "numeric", month: "long", year: "numeric",
  })
}
function fmtTime(utc: string, tz: string) {
  return new Date(utc).toLocaleTimeString("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  })
}

const FORMAT_LABEL: Record<string, string> = {
  in_person: "In-Person",
  online:    "Online",
  hybrid:    "Hybrid",
}

const QRCardPrint = forwardRef<HTMLDivElement, Props>(function QRCardPrint(
  { schedule, firstSlot, lastSlot, bookingUrl }, ref
) {
  const tz       = schedule?.timezone ?? "Asia/Dubai"
  const tzShort  = tz.split("/").pop()?.replace(/_/g, " ") ?? tz
  const date     = firstSlot ? fmtDate(firstSlot.start_utc, tz) : "—"
  const timeFrom = firstSlot ? fmtTime(firstSlot.start_utc, tz) : "—"
  const timeTo   = lastSlot  ? fmtTime(lastSlot.end_utc,    tz) : "—"
  const dur      = schedule?.slot_duration_min ?? "—"
  const shortUrl = bookingUrl.replace(/^https?:\/\//, "")
  const group    = schedule?.assessment_groups?.name
  const track    = schedule?.role_tracks?.name
  const fmt      = FORMAT_LABEL[schedule?.interview_format ?? ""] ?? ""
  const today    = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  const sub      = [group, track].filter(Boolean).join(" — ")

  return (
    <div id="qr-card" ref={ref} style={{ fontFamily: "'PlusJakartaSans', 'Segoe UI', Arial, sans-serif" }}
      className="bg-white border-2 border-[#1B4F8A] rounded-2xl overflow-hidden w-[720px]">

      {/* ── HEADER ── */}
      <div className="bg-[#1B4F8A] px-8 py-5 flex items-center justify-between">
        <Image src="/logo/logo-white.png" alt="ICS Aviation" width={120} height={32} className="object-contain" />
        <div className="text-right">
          <p className="text-[10px] text-white/60 uppercase tracking-widest">Interview Scheduling</p>
          <p className="text-[11px] text-white font-bold mt-0.5">{today}</p>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="px-8 pt-6 pb-7">

        {/* Group / track */}
        {sub && (
          <div className="mb-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Group / Track</p>
            <p className="text-sm font-semibold text-slate-700">{sub}</p>
          </div>
        )}

        {/* Schedule name */}
        <div className="mt-3 mb-5">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Interview Schedule</p>
          <h1 className="text-[26px] font-bold text-[#1B4F8A] leading-tight">{schedule?.name}</h1>
          {schedule?.description && (
            <p className="text-sm text-slate-500 mt-1">{schedule.description}</p>
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-8 items-start">

          {/* ── LEFT ── */}
          <div className="space-y-4">

            {/* Stat boxes */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Date</p>
                <p className="text-[13px] font-bold text-[#1B4F8A] leading-snug">{date}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Time Window</p>
                <p className="text-[13px] font-bold text-[#1B4F8A] leading-snug">{timeFrom} – {timeTo}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{tzShort}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Slot · {fmt}</p>
                <p className="text-[22px] font-bold text-[#1B4F8A] leading-none">{dur}<span className="text-[12px] font-normal ml-0.5">min</span></p>
              </div>
            </div>

            {/* Location */}
            {schedule?.location && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="text-base">📍</span> {schedule.location}
              </div>
            )}

            {/* Booking link box — same style as password box in exam card */}
            <div className="bg-[#1B4F8A] text-white rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-widest opacity-70 mb-1">Booking Link</p>
              <p className="text-[13px] font-bold tracking-wide break-all font-mono">{shortUrl}</p>
              <p className="text-[10px] opacity-60 mt-1">Scan the QR code or visit this link to reserve your slot</p>
            </div>

            {/* Steps */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">How to Book</p>
              <ol className="text-[12px] space-y-1.5 text-slate-500 list-decimal list-inside">
                <li>Scan the QR code with your phone, or visit the link above</li>
                <li>Select your preferred interview time slot</li>
                <li>Enter your details and confirm your booking</li>
              </ol>
            </div>
          </div>

          {/* ── RIGHT: QR ── */}
          <div className="flex flex-col items-center gap-3">
            <div className="bg-white border-2 border-[#1B4F8A] rounded-2xl p-4">
              <QRCode url={bookingUrl} size={160} />
            </div>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-[#1B4F8A] border border-[#1B4F8A] rounded-lg px-3 py-1.5">
              Click here to book
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-6 pt-4 border-t border-slate-100">
          <p>ICS Aviation — Integrated Consulting Services</p>
          <p>Good luck! 🎯</p>
        </div>
      </div>
    </div>
  )
})

export default QRCardPrint
