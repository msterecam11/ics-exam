"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import QRCode from "qrcode"
import { MapPin, Clock, Calendar, Wifi, Users } from "lucide-react"

interface Props {
  schedule:   any
  firstSlot:  any | null
  lastSlot:   any | null
  bookingUrl: string
  dark:       boolean
}

function fmt(utc: string, tz: string, type: "date" | "time") {
  if (!utc) return "—"
  const opts: Intl.DateTimeFormatOptions = type === "date"
    ? { timeZone: tz, day: "numeric", month: "long", year: "numeric" }
    : { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }
  return new Date(utc).toLocaleString("en-GB", opts)
}

export default function QRCardPrint({ schedule, firstSlot, lastSlot, bookingUrl, dark }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("")
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    QRCode.toDataURL(bookingUrl, {
      width:  260,
      margin: 1,
      color:  { dark: dark ? "#1B4F8A" : "#1B4F8A", light: dark ? "#ffffff" : "#ffffff" },
      errorCorrectionLevel: "H",
    }).then(setQrDataUrl)
  }, [bookingUrl, dark])

  useEffect(() => {
    // Auto-trigger print dialog after QR is ready
    if (qrDataUrl) {
      setTimeout(() => window.print(), 600)
    }
  }, [qrDataUrl])

  const tz       = schedule.timezone ?? "Asia/Dubai"
  const tzShort  = tz.split("/")[1]?.replace("_"," ") ?? tz
  const date     = firstSlot ? fmt(firstSlot.start_utc, tz, "date") : "—"
  const timeFrom = firstSlot ? fmt(firstSlot.start_utc, tz, "time") : "—"
  const timeTo   = lastSlot  ? fmt(lastSlot.end_utc,   tz, "time") : "—"
  const dur      = schedule.slot_duration_min
  const shortUrl = bookingUrl.replace(/^https?:\/\//, "")

  const FORMAT_ICON: Record<string, React.ReactNode> = {
    in_person: <MapPin className="h-4 w-4" />,
    online:    <Wifi   className="h-4 w-4" />,
    hybrid:    <Users  className="h-4 w-4" />,
  }
  const FORMAT_LABEL: Record<string, string> = {
    in_person: "In-Person",
    online:    "Online",
    hybrid:    "Hybrid",
  }

  // Dark theme colors
  const bg       = dark ? "#1B4F8A"   : "#ffffff"
  const text      = dark ? "#ffffff"   : "#1B4F8A"
  const textMuted = dark ? "#93c5fd"   : "#64748b"
  const accent    = dark ? "#60a5fa"   : "#1B4F8A"
  const cardBg    = dark ? "#ffffff"   : "#1B4F8A"
  const divider   = dark ? "rgba(255,255,255,0.15)" : "rgba(27,79,138,0.15)"
  const qrBg      = dark ? "#ffffff"   : "#f8fafc"

  return (
    <>
      <style>{`
        @page { size: A5 landscape; margin: 0; }
        body   { margin: 0; padding: 0; background: ${bg}; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      {/* Print button (hidden in print) */}
      <div className="no-print fixed top-4 right-4 z-50 flex gap-2">
        <button onClick={() => window.print()}
          style={{ background: accent, color: dark ? "#fff" : "#fff" }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold shadow-lg hover:opacity-90 transition-opacity">
          ⬇ Download PDF
        </button>
        <button onClick={() => window.close()}
          className="px-4 py-2 rounded-xl text-sm font-bold bg-white/20 hover:bg-white/30 transition-opacity"
          style={{ color: text }}>
          ✕ Close
        </button>
      </div>

      {/* The card — A5 landscape 210×148mm */}
      <div ref={printRef} style={{
        width: "210mm", height: "148mm",
        background: bg,
        display: "flex", flexDirection: "row",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        position: "relative", overflow: "hidden",
      }}>

        {/* Background decorative circles */}
        <div style={{ position: "absolute", top: -60, right: 320, width: 200, height: 200, borderRadius: "50%",
          background: dark ? "rgba(255,255,255,0.04)" : "rgba(27,79,138,0.05)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -40, left: 60, width: 150, height: 150, borderRadius: "50%",
          background: dark ? "rgba(255,255,255,0.04)" : "rgba(27,79,138,0.05)", pointerEvents: "none" }} />

        {/* ── LEFT SECTION ── */}
        <div style={{ flex: 1, padding: "28px 32px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>

          {/* Logo + label */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <img
              src={dark ? "/logo/logo-white.png" : "/logo/logo-dark-blue.png"}
              alt="ICS Aviation"
              style={{ height: 28, objectFit: "contain" }}
            />
            <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.2em", color: textMuted, textTransform: "uppercase" }}>
              Panel Interview · Scheduling
            </span>
          </div>

          {/* Schedule name */}
          <div>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", color: textMuted, textTransform: "uppercase", marginBottom: 6 }}>
              Interview Schedule
            </p>
            <h1 style={{ fontSize: 18, fontWeight: 900, color: text, lineHeight: 1.2, margin: 0, marginBottom: 4 }}>
              {schedule.name}
            </h1>
            {(schedule.assessment_groups?.name || schedule.role_tracks?.name) && (
              <p style={{ fontSize: 10, color: textMuted, margin: 0 }}>
                {[schedule.assessment_groups?.name, schedule.role_tracks?.name].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          {/* Details grid */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: textMuted }}>📅</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: text }}>{date}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: textMuted }}>🕐</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: text }}>
                {timeFrom} – {timeTo}
                <span style={{ fontSize: 9, color: textMuted, marginLeft: 6 }}>({tzShort} · {tz.replace("/","/")})</span>
              </span>
            </div>
            {schedule.location && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: textMuted }}>📍</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: text }}>{schedule.location}</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: textMuted }}>⏱</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: text }}>
                {dur} min per slot · {FORMAT_LABEL[schedule.interview_format] ?? schedule.interview_format}
              </span>
            </div>
          </div>

          {/* Description */}
          {schedule.description && (
            <p style={{ fontSize: 9, color: textMuted, lineHeight: 1.5, borderTop: `1px solid ${divider}`, paddingTop: 8, margin: 0 }}>
              {schedule.description}
            </p>
          )}

          {/* Footer */}
          <p style={{ fontSize: 8, color: textMuted, margin: 0, borderTop: `1px solid ${divider}`, paddingTop: 8 }}>
            CONFIDENTIAL · ICS Aviation · Integrated Consulting Services · {new Date().getFullYear()}
          </p>
        </div>

        {/* ── DIVIDER ── */}
        <div style={{ width: 1, background: divider, margin: "24px 0" }} />

        {/* ── RIGHT SECTION ── */}
        <div style={{ width: 185, padding: "28px 24px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>

          {/* QR code */}
          <div style={{ background: qrBg, padding: 10, borderRadius: 12, border: `1px solid ${divider}` }}>
            {qrDataUrl
              ? <img src={qrDataUrl} alt="QR Code" style={{ width: 120, height: 120, display: "block" }} />
              : <div style={{ width: 120, height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: textMuted, fontSize: 10 }}>Loading…</div>
            }
          </div>

          {/* CTA */}
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: text, margin: 0, marginBottom: 4 }}>
              Scan to book your slot
            </p>
            <p style={{ fontSize: 8, color: textMuted, margin: 0, marginBottom: 8 }}>or visit the link below</p>
            <div style={{ background: dark ? "rgba(255,255,255,0.1)" : "rgba(27,79,138,0.08)", borderRadius: 8, padding: "5px 8px" }}>
              <p style={{ fontSize: 8, fontFamily: "monospace", fontWeight: 700, color: accent, margin: 0, wordBreak: "break-all" }}>
                {shortUrl}
              </p>
            </div>
          </div>

          {/* Schedule ID chip */}
          <div style={{ background: dark ? "rgba(255,255,255,0.08)" : "rgba(27,79,138,0.06)", borderRadius: 8, padding: "4px 10px", textAlign: "center" }}>
            <p style={{ fontSize: 7, color: textMuted, margin: 0, letterSpacing: "0.1em", textTransform: "uppercase" }}>Schedule ID</p>
            <p style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: text, margin: 0 }}>
              {schedule.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
