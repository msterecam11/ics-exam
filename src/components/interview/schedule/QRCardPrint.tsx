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
const LIGHT = "#EEF3FA"

const FORMAT_LABEL: Record<string, string> = {
  in_person: "In-Person",
  online:    "Online",
  hybrid:    "Hybrid",
}

export default function QRCardPrint({ schedule, firstSlot, lastSlot, bookingUrl }: Props) {
  const [qr, setQr] = useState<string>("")

  useEffect(() => {
    QRCode.toDataURL(bookingUrl, {
      width: 280, margin: 1,
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

  const meta = [groupName, trackName, fmtLabel, tzShort].filter(Boolean).join(" · ")

  return (
    <>
      <style>{`
        @font-face { font-family:'PJS'; src:url('/fonts/PlusJakartaSans-Light.ttf') format('truetype'); font-weight:300; }
        @font-face { font-family:'PJS'; src:url('/fonts/PlusJakartaSans-Regular.ttf') format('truetype'); font-weight:400; }
        @font-face { font-family:'PJS'; src:url('/fonts/PlusJakartaSans-Bold.ttf') format('truetype'); font-weight:700; }
        *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
        html,body { background:#f0f4f8; font-family:'PJS','Segoe UI',Arial,sans-serif; }
        @page { size: 210mm 148mm; margin:0; }
        @media print {
          .no-print { display:none !important; }
          html,body { background:#ffffff !important; }
          * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print" style={{ position:"fixed", top:16, right:16, zIndex:99, display:"flex", gap:8 }}>
        <button onClick={() => window.print()} style={{
          background:BLUE, color:"#fff", border:"none", borderRadius:8,
          padding:"8px 18px", fontSize:13, fontWeight:700, cursor:"pointer",
          fontFamily:"'PJS',sans-serif",
        }}>⬇ Save as PDF</button>
        <button onClick={() => window.close()} style={{
          background:"#e2e8f0", color:"#475569", border:"none",
          borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:600,
          cursor:"pointer", fontFamily:"'PJS',sans-serif",
        }}>✕ Close</button>
      </div>

      {/* ══ CARD — 210 × 148 mm ══ */}
      <div style={{
        width:"210mm", height:"148mm",
        background:"#ffffff",
        display:"flex", flexDirection:"column",
        fontFamily:"'PJS','Segoe UI',Arial,sans-serif",
        overflow:"hidden",
      }}>

        {/* ── HEADER ── */}
        <div style={{
          background: BLUE,
          padding:"14px 28px",
          display:"flex", alignItems:"center", justifyContent:"space-between",
          flexShrink: 0,
        }}>
          <img src="/logo/logo-white.png" alt="ICS Aviation"
            style={{ height:26, objectFit:"contain" }} />
          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end" }}>
            <span style={{ color:"rgba(255,255,255,0.6)", fontSize:7, letterSpacing:"0.2em", textTransform:"uppercase" }}>
              Interview Scheduling
            </span>
            <span style={{ color:"#fff", fontSize:8, marginTop:2, fontWeight:600 }}>{today}</span>
          </div>
        </div>

        {/* ── BODY ── */}
        <div style={{
          flex:1,
          display:"flex", flexDirection:"row",
          padding:"16px 28px 0 28px",
          gap:20,
          overflow:"hidden",
        }}>

          {/* LEFT */}
          <div style={{ flex:1, display:"flex", flexDirection:"column", gap:10, overflow:"hidden" }}>

            {/* Label + name */}
            <div>
              <p style={{ fontSize:7, fontWeight:700, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.15em", marginBottom:4 }}>
                Interview Schedule
              </p>
              <h1 style={{ fontSize:19, fontWeight:700, color:BLUE, lineHeight:1.15, marginBottom:3 }}>
                {schedule.name}
              </h1>
              {meta && (
                <p style={{ fontSize:8, color:"#64748B" }}>{meta}</p>
              )}
            </div>

            {/* Stat boxes */}
            <div style={{ display:"flex", flexDirection:"row", gap:8 }}>
              <div style={{ flex:1, background:LIGHT, borderRadius:8, padding:"8px 10px" }}>
                <p style={{ fontSize:6.5, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:700, marginBottom:3 }}>Date</p>
                <p style={{ fontSize:10, fontWeight:700, color:BLUE, lineHeight:1.2 }}>{date}</p>
              </div>
              <div style={{ flex:1, background:LIGHT, borderRadius:8, padding:"8px 10px" }}>
                <p style={{ fontSize:6.5, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:700, marginBottom:3 }}>Time Window</p>
                <p style={{ fontSize:10, fontWeight:700, color:BLUE, lineHeight:1.2 }}>{timeFrom} – {timeTo}</p>
              </div>
              <div style={{ background:LIGHT, borderRadius:8, padding:"8px 10px", minWidth:56, textAlign:"center" }}>
                <p style={{ fontSize:6.5, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:700, marginBottom:3 }}>Slot</p>
                <p style={{ fontSize:15, fontWeight:700, color:BLUE, lineHeight:1 }}>{dur}<span style={{ fontSize:8, fontWeight:400 }}>m</span></p>
              </div>
            </div>

            {/* Booking link box */}
            <div style={{ background:BLUE, borderRadius:8, padding:"10px 12px" }}>
              <p style={{ fontSize:6.5, color:"rgba(255,255,255,0.55)", textTransform:"uppercase", letterSpacing:"0.15em", fontWeight:700, marginBottom:4 }}>
                Booking Link
              </p>
              <p style={{ fontSize:8, fontWeight:700, color:"#fff", fontFamily:"monospace", wordBreak:"break-all", lineHeight:1.5 }}>
                {shortUrl}
              </p>
              <p style={{ fontSize:7, color:"rgba(255,255,255,0.45)", marginTop:4 }}>
                Scan the QR or visit this link to reserve your slot
              </p>
            </div>

            {/* Steps */}
            <div>
              <p style={{ fontSize:6.5, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.15em", fontWeight:700, marginBottom:5 }}>
                How to Book
              </p>
              <p style={{ fontSize:7.5, color:"#64748B", marginBottom:3 }}>1. Scan the QR code or open the booking link above</p>
              <p style={{ fontSize:7.5, color:"#64748B", marginBottom:3 }}>2. Select your preferred interview time slot</p>
              <p style={{ fontSize:7.5, color:"#64748B" }}>3. Enter your details and confirm your booking</p>
            </div>
          </div>

          {/* DIVIDER */}
          <div style={{ width:1, background:"#E2E8F0", margin:"4px 0 16px" }} />

          {/* RIGHT */}
          <div style={{
            width:150,
            display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"space-between",
            paddingBottom:16,
          }}>

            {/* QR */}
            <div style={{
              border:`2px solid ${BLUE}`, borderRadius:10, padding:8,
              background:"#fff",
            }}>
              {qr
                ? <img src={qr} alt="QR" style={{ width:118, height:118, display:"block" }} />
                : <div style={{ width:118, height:118, display:"flex", alignItems:"center",
                    justifyContent:"center", color:"#94a3b8", fontSize:9 }}>Loading…</div>
              }
            </div>

            {/* CTA */}
            <p style={{ fontSize:8.5, fontWeight:700, color:BLUE, textAlign:"center", lineHeight:1.3 }}>
              Scan to book<br/>your slot
            </p>

            {/* Button */}
            <div style={{
              border:`1px solid ${BLUE}`, borderRadius:6,
              padding:"5px 10px", textAlign:"center", width:"100%",
            }}>
              <p style={{ fontSize:7.5, color:BLUE, fontWeight:700 }}>Click here to book</p>
            </div>

            {/* Schedule ID */}
            <div style={{ textAlign:"center" }}>
              <p style={{ fontSize:6.5, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.12em", fontWeight:700, marginBottom:2 }}>
                Schedule ID
              </p>
              <p style={{ fontSize:9, color:BLUE, fontWeight:700, fontFamily:"monospace", letterSpacing:"0.1em" }}>
                {schedId}
              </p>
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{
          display:"flex", flexDirection:"row", justifyContent:"space-between",
          padding:"8px 28px 10px",
          borderTop:"1px solid #E2E8F0",
          marginTop:"auto",
          flexShrink:0,
        }}>
          <span style={{ fontSize:7, color:"#94A3B8" }}>ICS Aviation — Integrated Consulting Services</span>
          <span style={{ fontSize:7, color:"#94A3B8" }}>Good luck! 🎯</span>
        </div>
      </div>
    </>
  )
}
