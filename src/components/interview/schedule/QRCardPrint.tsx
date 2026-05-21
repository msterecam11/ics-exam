"use client"

import { useEffect, useRef, useState } from "react"
import QRCode from "qrcode"

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

const BLUE      = "#1B4F8A"
const BLUE_DARK = "#163d6e"
const BLUE_LITE = "#F1F5FB"
const BLUE_MID  = "#dbeafe"

export default function QRCardPrint({ schedule, firstSlot, lastSlot, bookingUrl, dark }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("")

  useEffect(() => {
    QRCode.toDataURL(bookingUrl, {
      width: 300, margin: 1,
      color: { dark: BLUE, light: "#ffffff" },
      errorCorrectionLevel: "H",
    }).then(setQrDataUrl)
  }, [bookingUrl])

  useEffect(() => {
    if (qrDataUrl) setTimeout(() => window.print(), 600)
  }, [qrDataUrl])

  const tz       = schedule.timezone ?? "Asia/Dubai"
  const date     = firstSlot ? fmt(firstSlot.start_utc, tz, "date")   : "—"
  const timeFrom = firstSlot ? fmt(firstSlot.start_utc, tz, "time")   : "—"
  const timeTo   = lastSlot  ? fmt(lastSlot.end_utc,    tz, "time")   : "—"
  const dur      = schedule.slot_duration_min ?? "—"
  const shortUrl = bookingUrl.replace(/^https?:\/\//, "")
  const schedId  = schedule.id?.slice(0, 8).toUpperCase() ?? ""

  const FORMAT_LABEL: Record<string, string> = {
    in_person: "In-Person",
    online:    "Online",
    hybrid:    "Hybrid",
  }
  const FORMAT_EMOJI: Record<string, string> = {
    in_person: "🏢",
    online:    "💻",
    hybrid:    "🔀",
  }
  const fmt_label = FORMAT_LABEL[schedule.interview_format] ?? schedule.interview_format ?? ""
  const fmt_emoji = FORMAT_EMOJI[schedule.interview_format] ?? "📋"

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @page { size: A5 landscape; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="no-print" style={{
        position: "fixed", top: 16, right: 16, zIndex: 99,
        display: "flex", gap: 8,
      }}>
        <button onClick={() => window.print()} style={{
          background: BLUE, color: "#fff",
          border: "none", borderRadius: 10, padding: "8px 18px",
          fontSize: 13, fontWeight: 700, cursor: "pointer",
          boxShadow: "0 4px 12px rgba(27,79,138,0.3)",
        }}>⬇ Download PDF</button>
        <button onClick={() => window.close()} style={{
          background: "#f1f5f9", color: "#475569",
          border: "none", borderRadius: 10, padding: "8px 14px",
          fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>✕ Close</button>
      </div>

      {/* ══ CARD — A5 landscape 210×148 mm ══ */}
      <div style={{
        width: "210mm", height: "148mm",
        fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
        display: "flex", flexDirection: "column",
        background: "#fff",
        overflow: "hidden",
        position: "relative",
      }}>

        {/* ── HEADER BAR ── */}
        <div style={{
          background: `linear-gradient(135deg, ${BLUE_DARK} 0%, ${BLUE} 60%, #2563eb 100%)`,
          padding: "14px 28px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
          position: "relative", overflow: "hidden",
        }}>
          {/* Decorative circle in header */}
          <div style={{
            position: "absolute", right: -30, top: -40,
            width: 140, height: 140, borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
          }} />
          <div style={{
            position: "absolute", right: 80, top: -20,
            width: 80, height: 80, borderRadius: "50%",
            background: "rgba(255,255,255,0.04)",
          }} />

          {/* Logo */}
          <img
            src="/logo/logo-white.png"
            alt="ICS Aviation"
            style={{ height: 24, objectFit: "contain", position: "relative" }}
          />

          {/* Center: title */}
          <div style={{ textAlign: "center", position: "relative" }}>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 7, fontWeight: 700,
              letterSpacing: "0.22em", textTransform: "uppercase" }}>
              Panel Interview
            </p>
            <p style={{ color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", marginTop: 1 }}>
              Interview Scheduling Card
            </p>
          </div>

          {/* Right: date */}
          <div style={{ textAlign: "right", position: "relative" }}>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 7, fontWeight: 600,
              letterSpacing: "0.15em", textTransform: "uppercase" }}>Date</p>
            <p style={{ color: "#fff", fontSize: 9, fontWeight: 700, marginTop: 2 }}>{date}</p>
          </div>
        </div>

        {/* ── BODY ── */}
        <div style={{
          flex: 1,
          display: "flex", flexDirection: "row",
          overflow: "hidden",
        }}>

          {/* ── LEFT CONTENT ── */}
          <div style={{
            flex: 1,
            padding: "18px 24px 16px 28px",
            display: "flex", flexDirection: "column", justifyContent: "space-between",
            borderRight: "2px dashed #e2e8f0",
            position: "relative",
          }}>
            {/* Accent left stripe */}
            <div style={{
              position: "absolute", left: 0, top: 16, bottom: 16,
              width: 4, borderRadius: "0 4px 4px 0",
              background: `linear-gradient(to bottom, ${BLUE}, #2563eb)`,
            }} />

            {/* Top: name + tags */}
            <div>
              <p style={{ fontSize: 8, fontWeight: 700, color: "#94a3b8",
                letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 5 }}>
                Interview Schedule
              </p>
              <h1 style={{ fontSize: 17, fontWeight: 900, color: BLUE, lineHeight: 1.15, marginBottom: 5 }}>
                {schedule.name}
              </h1>
              {/* Tags */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {schedule.assessment_groups?.name && (
                  <span style={{
                    background: BLUE_LITE, color: BLUE,
                    fontSize: 8, fontWeight: 700, borderRadius: 20,
                    padding: "2px 9px", letterSpacing: "0.05em",
                  }}>{schedule.assessment_groups.name}</span>
                )}
                {schedule.role_tracks?.name && (
                  <span style={{
                    background: BLUE_LITE, color: BLUE,
                    fontSize: 8, fontWeight: 700, borderRadius: 20,
                    padding: "2px 9px",
                  }}>{schedule.role_tracks.name}</span>
                )}
                {fmt_label && (
                  <span style={{
                    background: "#f0fdf4", color: "#166534",
                    fontSize: 8, fontWeight: 700, borderRadius: 20,
                    padding: "2px 9px",
                  }}>{fmt_emoji} {fmt_label}</span>
                )}
              </div>
            </div>

            {/* Stat boxes row */}
            <div style={{ display: "flex", gap: 8 }}>
              {/* Time */}
              <div style={{
                flex: 1, background: BLUE_LITE, borderRadius: 10, padding: "8px 10px",
              }}>
                <p style={{ fontSize: 7, color: "#94a3b8", textTransform: "uppercase",
                  letterSpacing: "0.12em", fontWeight: 700, marginBottom: 3 }}>Time Window</p>
                <p style={{ fontSize: 11, fontWeight: 800, color: BLUE }}>
                  {timeFrom} – {timeTo}
                </p>
                <p style={{ fontSize: 7, color: "#94a3b8", marginTop: 1 }}>
                  {tz.replace("_", " ")}
                </p>
              </div>

              {/* Duration */}
              <div style={{
                width: 72, background: BLUE, borderRadius: 10, padding: "8px 10px",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <p style={{ fontSize: 7, color: "rgba(255,255,255,0.6)", textTransform: "uppercase",
                  letterSpacing: "0.12em", fontWeight: 700, marginBottom: 2, textAlign: "center" }}>Slot</p>
                <p style={{ fontSize: 16, fontWeight: 900, color: "#fff", textAlign: "center", lineHeight: 1 }}>
                  {dur}
                </p>
                <p style={{ fontSize: 7, color: "rgba(255,255,255,0.6)", textAlign: "center" }}>min</p>
              </div>
            </div>

            {/* Location + description */}
            <div>
              {schedule.location && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10 }}>📍</span>
                  <span style={{ fontSize: 9, fontWeight: 600, color: "#475569" }}>{schedule.location}</span>
                </div>
              )}
              {schedule.description && (
                <p style={{ fontSize: 8, color: "#94a3b8", lineHeight: 1.5, borderTop: "1px solid #f1f5f9", paddingTop: 6 }}>
                  {schedule.description.length > 130
                    ? schedule.description.slice(0, 127) + "…"
                    : schedule.description}
                </p>
              )}
            </div>

            {/* Footer */}
            <p style={{ fontSize: 7, color: "#cbd5e1", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Confidential · ICS Aviation · Integrated Consulting Services · {new Date().getFullYear()}
            </p>
          </div>

          {/* ── NOTCH connector circles (boarding-pass effect) ── */}
          <div style={{
            position: "absolute",
            left: "calc(210mm - 185px - 1px)",
            top: -14, width: 28, height: 28, borderRadius: "50%",
            background: "#fff",
            border: "2px solid #e2e8f0",
            boxShadow: "inset 0 0 0 10px #fff",
          }} />
          <div style={{
            position: "absolute",
            left: "calc(210mm - 185px - 1px)",
            bottom: -14, width: 28, height: 28, borderRadius: "50%",
            background: "#fff",
            border: "2px solid #e2e8f0",
          }} />

          {/* ── RIGHT SECTION (QR + booking info) ── */}
          <div style={{
            width: 185,
            padding: "18px 20px",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "space-between",
          }}>

            {/* QR code */}
            <div style={{
              background: "#fff",
              border: `2px solid ${BLUE}`,
              borderRadius: 14,
              padding: 8,
              boxShadow: "0 4px 16px rgba(27,79,138,0.12)",
            }}>
              {qrDataUrl
                ? <img src={qrDataUrl} alt="QR" style={{ width: 118, height: 118, display: "block" }} />
                : <div style={{ width: 118, height: 118, display: "flex", alignItems: "center",
                    justifyContent: "center", color: "#94a3b8", fontSize: 9 }}>Loading…</div>
              }
            </div>

            {/* CTA */}
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: BLUE, marginBottom: 2 }}>
                Scan to Book
              </p>
              <p style={{ fontSize: 8, color: "#94a3b8", marginBottom: 8 }}>
                or visit the link below
              </p>
              <div style={{
                background: BLUE_LITE, borderRadius: 8,
                padding: "5px 10px",
              }}>
                <p style={{
                  fontSize: 7, fontFamily: "monospace", fontWeight: 700,
                  color: BLUE, wordBreak: "break-all", lineHeight: 1.4,
                }}>
                  {shortUrl}
                </p>
              </div>
            </div>

            {/* Schedule ID */}
            <div style={{
              background: BLUE, borderRadius: 10,
              padding: "6px 16px", textAlign: "center",
              width: "100%",
            }}>
              <p style={{ fontSize: 7, color: "rgba(255,255,255,0.55)",
                letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 2 }}>
                Schedule ID
              </p>
              <p style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 800,
                color: "#fff", letterSpacing: "0.15em" }}>
                {schedId}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
