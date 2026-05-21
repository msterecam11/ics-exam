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
    timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
}
function fmtTime(utc: string, tz: string) {
  return new Date(utc).toLocaleTimeString("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  })
}

const NAVY   = "#0D2444"
const BLUE   = "#1B4F8A"
const ACCENT = "#3B82F6"
const GOLD   = "#F0B429"

const FORMAT_LABEL: Record<string, string> = {
  in_person: "In-Person Interview",
  online:    "Online Interview",
  hybrid:    "Hybrid Interview",
}

export default function QRCardPrint({ schedule, firstSlot, lastSlot, bookingUrl }: Props) {
  const [qr, setQr] = useState<string>("")

  useEffect(() => {
    QRCode.toDataURL(bookingUrl, {
      width: 400, margin: 1,
      color: { dark: NAVY, light: "#ffffff" },
      errorCorrectionLevel: "H",
    }).then(setQr)
  }, [bookingUrl])

  useEffect(() => {
    if (qr) setTimeout(() => window.print(), 700)
  }, [qr])

  const tz        = schedule.timezone ?? "Asia/Dubai"
  const tzLabel   = tz.split("/").pop()?.replace(/_/g, " ") ?? tz
  const date      = firstSlot ? fmtDate(firstSlot.start_utc, tz) : "—"
  const timeFrom  = firstSlot ? fmtTime(firstSlot.start_utc, tz) : "—"
  const timeTo    = lastSlot  ? fmtTime(lastSlot.end_utc,    tz) : "—"
  const dur       = schedule.slot_duration_min
  const shortUrl  = bookingUrl.replace(/^https?:\/\//, "")
  const schedId   = schedule.id?.slice(0, 8).toUpperCase() ?? ""
  const fmtLabel  = FORMAT_LABEL[schedule.interview_format] ?? (schedule.interview_format ?? "")
  const groupName = schedule.assessment_groups?.name
  const trackName = schedule.role_tracks?.name

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
        html, body {
          margin: 0; padding: 0;
          background: ${NAVY};
          font-family: 'PlusJakartaSans', 'Segoe UI', Arial, sans-serif;
        }
        @page { size: A4 portrait; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          html, body { background: ${NAVY} !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="no-print" style={{
        position: "fixed", top: 16, right: 16, zIndex: 99, display: "flex", gap: 8,
      }}>
        <button onClick={() => window.print()} style={{
          background: ACCENT, color: "#fff", border: "none", borderRadius: 10,
          padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          fontFamily: "'PlusJakartaSans', sans-serif",
          boxShadow: "0 4px 14px rgba(59,130,246,0.4)",
        }}>⬇ Save as PDF</button>
        <button onClick={() => window.close()} style={{
          background: "rgba(255,255,255,0.1)", color: "#fff", border: "none",
          borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: "'PlusJakartaSans', sans-serif",
        }}>✕ Close</button>
      </div>

      {/* ══ CARD ══ */}
      <div style={{
        width: "210mm",
        minHeight: "297mm",
        background: NAVY,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: "'PlusJakartaSans', 'Segoe UI', Arial, sans-serif",
      }}>

        {/* ── Background geometry ── */}
        {/* Top-right large circle */}
        <div style={{
          position: "absolute", top: -120, right: -120,
          width: 420, height: 420, borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.06)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", top: -80, right: -80,
          width: 300, height: 300, borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.04)",
          pointerEvents: "none",
        }} />
        {/* Bottom-left circle */}
        <div style={{
          position: "absolute", bottom: -100, left: -100,
          width: 360, height: 360, borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.05)",
          pointerEvents: "none",
        }} />
        {/* Top gold accent bar */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0,
          height: 3,
          background: `linear-gradient(90deg, transparent, ${GOLD}, ${ACCENT}, transparent)`,
        }} />

        {/* ── HEADER ── */}
        <div style={{
          width: "100%",
          padding: "48px 52px 32px",
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 16,
          position: "relative",
        }}>
          {/* Logo */}
          <img
            src="/logo/logo-white.png"
            alt="ICS Aviation"
            style={{ height: 36, objectFit: "contain" }}
          />

          {/* Thin line */}
          <div style={{
            width: 48, height: 1,
            background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
          }} />

          {/* Label */}
          <p style={{
            fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.45)",
            letterSpacing: "0.3em", textTransform: "uppercase",
          }}>
            Panel Interview · {new Date().getFullYear()}
          </p>
        </div>

        {/* ── HERO: Schedule name ── */}
        <div style={{
          width: "100%", padding: "0 52px 36px",
          display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
          gap: 12,
        }}>
          <p style={{
            fontSize: 10, fontWeight: 700, color: GOLD,
            letterSpacing: "0.2em", textTransform: "uppercase",
          }}>
            You are invited to
          </p>
          <h1 style={{
            fontSize: 32, fontWeight: 700, color: "#ffffff",
            lineHeight: 1.2, letterSpacing: "-0.01em",
          }}>
            {schedule.name}
          </h1>

          {/* Tags */}
          {(groupName || trackName || fmtLabel) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
              {groupName && (
                <span style={{
                  background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)",
                  fontSize: 9, fontWeight: 600, borderRadius: 20, padding: "4px 12px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  letterSpacing: "0.04em",
                }}>{groupName}</span>
              )}
              {trackName && (
                <span style={{
                  background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)",
                  fontSize: 9, fontWeight: 600, borderRadius: 20, padding: "4px 12px",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}>{trackName}</span>
              )}
              {fmtLabel && (
                <span style={{
                  background: `rgba(240,180,41,0.15)`, color: GOLD,
                  fontSize: 9, fontWeight: 700, borderRadius: 20, padding: "4px 12px",
                  border: `1px solid rgba(240,180,41,0.3)`,
                }}>{fmtLabel}</span>
              )}
            </div>
          )}
        </div>

        {/* ── DETAILS CARD ── */}
        <div style={{
          width: "calc(100% - 80px)",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20,
          padding: "24px 28px",
          display: "flex", flexDirection: "column", gap: 14,
          backdropFilter: "blur(4px)",
        }}>
          {/* Date */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "rgba(59,130,246,0.15)",
              border: "1px solid rgba(59,130,246,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, flexShrink: 0,
            }}>📅</div>
            <div>
              <p style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", fontWeight: 600,
                letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 2 }}>Date</p>
              <p style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>{date}</p>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />

          {/* Time */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "rgba(59,130,246,0.15)",
              border: "1px solid rgba(59,130,246,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, flexShrink: 0,
            }}>🕐</div>
            <div>
              <p style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", fontWeight: 600,
                letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 2 }}>Time Window</p>
              <p style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>
                {timeFrom} – {timeTo}
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 400, marginLeft: 8 }}>
                  {tzLabel}
                </span>
              </p>
            </div>
          </div>

          {/* Location (if present) */}
          {schedule.location && (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: "rgba(59,130,246,0.15)",
                  border: "1px solid rgba(59,130,246,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, flexShrink: 0,
                }}>📍</div>
                <div>
                  <p style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", fontWeight: 600,
                    letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 2 }}>Location</p>
                  <p style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>{schedule.location}</p>
                </div>
              </div>
            </>
          )}

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />

          {/* Slot duration */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "rgba(59,130,246,0.15)",
              border: "1px solid rgba(59,130,246,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, flexShrink: 0,
            }}>⏱</div>
            <div>
              <p style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", fontWeight: 600,
                letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 2 }}>Slot Duration</p>
              <p style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>{dur} minutes per interview</p>
            </div>
          </div>
        </div>

        {/* ── QR SECTION ── */}
        <div style={{
          width: "calc(100% - 80px)",
          marginTop: 28,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
        }}>
          {/* Heading */}
          <div style={{ textAlign: "center" }}>
            <p style={{
              fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)",
              letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 6,
            }}>Book Your Interview Slot</p>
            <div style={{
              width: 40, height: 2, borderRadius: 2, margin: "0 auto",
              background: `linear-gradient(90deg, ${ACCENT}, ${GOLD})`,
            }} />
          </div>

          {/* QR Box */}
          <div style={{
            background: "#ffffff",
            borderRadius: 24,
            padding: 20,
            boxShadow: "0 0 0 1px rgba(255,255,255,0.1), 0 24px 48px rgba(0,0,0,0.4)",
            position: "relative",
          }}>
            {/* Corner accents */}
            <div style={{ position: "absolute", top: -2, left: -2, width: 20, height: 20,
              borderTop: `3px solid ${GOLD}`, borderLeft: `3px solid ${GOLD}`, borderRadius: "4px 0 0 0" }} />
            <div style={{ position: "absolute", top: -2, right: -2, width: 20, height: 20,
              borderTop: `3px solid ${GOLD}`, borderRight: `3px solid ${GOLD}`, borderRadius: "0 4px 0 0" }} />
            <div style={{ position: "absolute", bottom: -2, left: -2, width: 20, height: 20,
              borderBottom: `3px solid ${GOLD}`, borderLeft: `3px solid ${GOLD}`, borderRadius: "0 0 0 4px" }} />
            <div style={{ position: "absolute", bottom: -2, right: -2, width: 20, height: 20,
              borderBottom: `3px solid ${GOLD}`, borderRight: `3px solid ${GOLD}`, borderRadius: "0 0 4px 0" }} />

            {qr
              ? <img src={qr} alt="Booking QR" style={{ width: 180, height: 180, display: "block" }} />
              : <div style={{ width: 180, height: 180, display: "flex", alignItems: "center",
                  justifyContent: "center", color: "#94a3b8", fontSize: 12 }}>Loading…</div>
            }
          </div>

          {/* Scan CTA */}
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
              Scan the QR code to reserve your slot
            </p>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
              or visit the link below on your browser
            </p>
            <div style={{
              marginTop: 4,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10, padding: "8px 18px",
            }}>
              <p style={{
                fontFamily: "monospace", fontSize: 10, color: ACCENT,
                fontWeight: 700, letterSpacing: "0.02em",
              }}>{shortUrl}</p>
            </div>
          </div>
        </div>

        {/* ── DESCRIPTION ── */}
        {schedule.description && (
          <div style={{
            width: "calc(100% - 80px)",
            marginTop: 24,
            textAlign: "center",
          }}>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.7, fontWeight: 300 }}>
              {schedule.description}
            </p>
          </div>
        )}

        {/* ── FOOTER ── */}
        <div style={{
          width: "100%",
          marginTop: "auto",
          padding: "32px 52px 40px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        }}>
          {/* Divider line */}
          <div style={{
            width: "100%", height: 1,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
            marginBottom: 8,
          }} />

          {/* Logo small */}
          <img
            src="/logo/logo-white.png"
            alt="ICS Aviation"
            style={{ height: 20, objectFit: "contain", opacity: 0.4 }}
          />

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <p style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              ICS Aviation · Integrated Consulting Services
            </p>
            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 8 }}>·</span>
            <p style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", fontFamily: "monospace", letterSpacing: "0.08em" }}>
              ID: {schedId}
            </p>
          </div>

          <p style={{ fontSize: 7, color: "rgba(255,255,255,0.15)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Confidential · Do not share outside of authorized recipients
          </p>
        </div>
      </div>
    </>
  )
}
