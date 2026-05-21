"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"

interface Props {
  schedule:   any
  firstSlot:  any | null
  lastSlot:   any | null
  bookingUrl: string
  dark:       boolean
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

const BLUE  = "#1B4F8A"
const LIGHT = "#F1F5FB"

const FORMAT_LABEL: Record<string, string> = {
  in_person: "In-Person",
  online:    "Online",
  hybrid:    "Hybrid",
}

export default function QRCardPrint({ schedule, firstSlot, lastSlot, bookingUrl }: Props) {
  const [qr, setQr] = useState<string>("")

  useEffect(() => {
    QRCode.toDataURL(bookingUrl, {
      width: 300, margin: 1,
      color: { dark: BLUE, light: "#ffffff" },
      errorCorrectionLevel: "H",
    }).then(setQr)
  }, [bookingUrl])

  useEffect(() => {
    if (qr) setTimeout(() => window.print(), 700)
  }, [qr])

  const tz        = schedule.timezone ?? "Asia/Dubai"
  const tzShort   = tz.split("/").pop()?.replace(/_/g, " ") ?? tz
  const date      = firstSlot ? fmtDate(firstSlot.start_utc, tz) : "—"
  const timeFrom  = firstSlot ? fmtTime(firstSlot.start_utc, tz) : "—"
  const timeTo    = lastSlot  ? fmtTime(lastSlot.end_utc,    tz) : "—"
  const dur       = schedule.slot_duration_min ?? "—"
  const shortUrl  = bookingUrl.replace(/^https?:\/\//, "")
  const schedId   = schedule.id?.slice(0, 8).toUpperCase() ?? ""
  const groupName = schedule.assessment_groups?.name
  const trackName = schedule.role_tracks?.name
  const fmtLabel  = FORMAT_LABEL[schedule.interview_format] ?? ""
  const today     = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })

  const R: React.CSSProperties = { display: "flex", flexDirection: "row" }
  const C: React.CSSProperties = { display: "flex", flexDirection: "column" }

  return (
    <>
      <style>{`
        @font-face {
          font-family: 'PlusJakartaSans';
          src: url('/fonts/PlusJakartaSans-Light.ttf') format('truetype');
          font-weight: 300;
        }
        @font-face {
          font-family: 'PlusJakartaSans';
          src: url('/fonts/PlusJakartaSans-Regular.ttf') format('truetype');
          font-weight: 400;
        }
        @font-face {
          font-family: 'PlusJakartaSans';
          src: url('/fonts/PlusJakartaSans-Bold.ttf') format('truetype');
          font-weight: 700;
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { margin: 0; padding: 0; background: #f8fafc; font-family: 'PlusJakartaSans', 'Segoe UI', Arial, sans-serif; }
        @page { size: 210mm 170mm; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          html, body { background: #ffffff !important; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print" style={{ position: "fixed", top: 16, right: 16, zIndex: 99, ...R, gap: 8 }}>
        <button onClick={() => window.print()} style={{
          background: BLUE, color: "#fff", border: "none", borderRadius: 10,
          padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          fontFamily: "'PlusJakartaSans', sans-serif",
        }}>⬇ Save as PDF</button>
        <button onClick={() => window.close()} style={{
          background: "#f1f5f9", color: "#475569", border: "none",
          borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: "'PlusJakartaSans', sans-serif",
        }}>✕ Close</button>
      </div>

      {/* ══ CARD ══ */}
      <div style={{
        width: "210mm", minHeight: "170mm",
        background: "#fff",
        ...C,
        fontFamily: "'PlusJakartaSans', 'Segoe UI', Arial, sans-serif",
        overflow: "hidden",
      }}>

        {/* ── HEADER ── */}
        <div style={{
          background: BLUE,
          paddingLeft: 36, paddingRight: 36,
          paddingTop: 22, paddingBottom: 22,
          ...R, justifyContent: "space-between", alignItems: "center",
          flexShrink: 0,
        }}>
          <img src="/logo/logo-white.png" alt="ICS Aviation"
            style={{ width: 110, height: 30, objectFit: "contain" }} />
          <div style={{ ...C, alignItems: "flex-end" }}>
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 7, letterSpacing: 1.5, textTransform: "uppercase" }}>
              Interview Scheduling
            </span>
            <span style={{ color: "#fff", fontSize: 8, marginTop: 2 }}>{today}</span>
          </div>
        </div>

        {/* ── BODY ── */}
        <div style={{ padding: "24px 36px 28px", ...R, gap: 24, flex: 1 }}>

          {/* LEFT COLUMN */}
          <div style={{ flex: 1, ...C }}>

            {/* Group + track */}
            <span style={{ fontSize: 7, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 2 }}>
              {[groupName, trackName].filter(Boolean).join(" — ") || "Interview Schedule"}
            </span>
            {fmtLabel && (
              <span style={{ fontSize: 7, color: "#94A3B8", marginBottom: 0 }}>
                {fmtLabel} · {tzShort}
              </span>
            )}

            {/* Schedule name */}
            <h1 style={{ fontSize: 20, fontWeight: 700, color: BLUE, marginTop: 10, lineHeight: 1.2 }}>
              {schedule.name}
            </h1>
            {schedule.description && (
              <p style={{ fontSize: 8, color: "#64748B", marginTop: 4, lineHeight: 1.5 }}>
                {schedule.description.length > 100
                  ? schedule.description.slice(0, 97) + "…"
                  : schedule.description}
              </p>
            )}

            {/* Stat boxes */}
            <div style={{ ...R, gap: 10, marginTop: 14 }}>
              <div style={{ flex: 1, background: LIGHT, borderRadius: 10, padding: 10 }}>
                <span style={{ fontSize: 7, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1 }}>Date</span>
                <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, marginTop: 2, lineHeight: 1.2 }}>{date}</p>
              </div>
              <div style={{ flex: 1, background: LIGHT, borderRadius: 10, padding: 10 }}>
                <span style={{ fontSize: 7, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1 }}>Time Window</span>
                <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, marginTop: 2, lineHeight: 1.2 }}>{timeFrom} – {timeTo}</p>
              </div>
              <div style={{ flex: 0, background: LIGHT, borderRadius: 10, padding: 10, minWidth: 60 }}>
                <span style={{ fontSize: 7, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1 }}>Slot</span>
                <p style={{ fontSize: 18, fontWeight: 700, color: BLUE, marginTop: 2 }}>{dur}<span style={{ fontSize: 9, fontWeight: 400 }}> min</span></p>
              </div>
            </div>

            {/* Booking link box — mirrors the "password box" */}
            <div style={{
              background: BLUE, borderRadius: 10, padding: 12, marginTop: 10,
            }}>
              <span style={{ fontSize: 7, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 1.5 }}>
                Booking Link
              </span>
              <p style={{
                fontSize: 9, fontWeight: 700, color: "#fff", letterSpacing: 1, marginTop: 4,
                wordBreak: "break-all", lineHeight: 1.5,
                fontFamily: "monospace",
              }}>{shortUrl}</p>
              <p style={{ fontSize: 7, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                Scan the QR or visit this link to book your slot
              </p>
            </div>

            {/* Steps */}
            <p style={{ fontSize: 7, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1.2, marginTop: 14, marginBottom: 5 }}>
              How to book
            </p>
            <p style={{ fontSize: 8, color: "#64748B", marginBottom: 3 }}>1. Scan the QR code or open the link above</p>
            <p style={{ fontSize: 8, color: "#64748B", marginBottom: 3 }}>2. Choose your preferred interview time slot</p>
            <p style={{ fontSize: 8, color: "#64748B" }}>3. Enter your details and confirm your booking</p>
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ width: 170, ...C, alignItems: "center", gap: 10 }}>

            {/* QR code */}
            <div style={{
              borderWidth: 2, borderStyle: "solid", borderColor: BLUE,
              borderRadius: 12, padding: 10, background: "#fff",
            }}>
              {qr
                ? <img src={qr} alt="QR" style={{ width: 140, height: 140, display: "block" }} />
                : <div style={{ width: 140, height: 140, display: "flex", alignItems: "center",
                    justifyContent: "center", color: "#94a3b8", fontSize: 10 }}>Loading…</div>
              }
            </div>

            {/* Link button — mirrors InvitationPDF link btn */}
            <div style={{
              borderWidth: 1, borderStyle: "solid", borderColor: BLUE,
              borderRadius: 8, paddingLeft: 12, paddingRight: 12,
              paddingTop: 6, paddingBottom: 6, marginTop: 2,
              textAlign: "center",
            }}>
              <span style={{ fontSize: 8, color: BLUE, fontWeight: 700 }}>
                Click here to book your slot
              </span>
            </div>

            {/* Schedule ID */}
            <div style={{ marginTop: "auto", textAlign: "center" }}>
              <span style={{ fontSize: 7, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1 }}>
                Schedule ID
              </span>
              <p style={{ fontSize: 9, color: BLUE, fontWeight: 700, fontFamily: "monospace", letterSpacing: 2 }}>
                {schedId}
              </p>
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{
          ...R, justifyContent: "space-between",
          paddingTop: 14, paddingLeft: 36, paddingRight: 36, paddingBottom: 18,
          borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "#E2E8F0",
          marginTop: "auto",
        }}>
          <span style={{ fontSize: 7, color: "#94A3B8" }}>ICS Aviation — Integrated Consulting Services</span>
          <span style={{ fontSize: 7, color: "#94A3B8" }}>Good luck! 🎯</span>
        </div>
      </div>
    </>
  )
}
