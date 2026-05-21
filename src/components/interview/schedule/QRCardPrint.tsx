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
const BLUE2 = "#163f70"
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
      width: 300, margin: 1,
      color: { dark: BLUE, light: "#ffffff" },
      errorCorrectionLevel: "H",
    }).then(setQr)
  }, [bookingUrl])

  useEffect(() => {
    if (qr) setTimeout(() => window.print(), 700)
  }, [qr])

  const tz       = schedule.timezone ?? "Asia/Dubai"
  const tzShort  = tz.split("/").pop()?.replace(/_/g, " ") ?? tz
  const date     = firstSlot ? fmtDate(firstSlot.start_utc, tz) : "—"
  const timeFrom = firstSlot ? fmtTime(firstSlot.start_utc, tz) : "—"
  const timeTo   = lastSlot  ? fmtTime(lastSlot.end_utc,    tz) : "—"
  const dur      = schedule.slot_duration_min ?? "—"
  const shortUrl = bookingUrl.replace(/^https?:\/\//, "")
  const schedId  = schedule.id?.slice(0, 8).toUpperCase() ?? ""
  const group    = schedule.assessment_groups?.name
  const track    = schedule.role_tracks?.name
  const fmt      = FORMAT_LABEL[schedule.interview_format] ?? ""
  const today    = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  const meta     = [fmt, tzShort].filter(Boolean).join(" · ")
  const sub      = [group, track].filter(Boolean).join(" — ")

  return (
    <>
      <style>{`
        @font-face { font-family:'PJS'; src:url('/fonts/PlusJakartaSans-Light.ttf') format('truetype'); font-weight:300; }
        @font-face { font-family:'PJS'; src:url('/fonts/PlusJakartaSans-Regular.ttf') format('truetype'); font-weight:400; }
        @font-face { font-family:'PJS'; src:url('/fonts/PlusJakartaSans-Bold.ttf') format('truetype'); font-weight:700; }
        *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
        html,body { background:#dde3ea; font-family:'PJS','Segoe UI',Arial,sans-serif; }
        @page { size: auto; margin:0; }
        @media print {
          .no-print { display:none !important; }
          html,body { background:#fff !important; }
          * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print" style={{ position:"fixed", top:16, right:16, zIndex:99, display:"flex", gap:8 }}>
        <button onClick={() => window.print()} style={{
          background:BLUE, color:"#fff", border:"none", borderRadius:8,
          padding:"8px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'PJS',sans-serif",
        }}>⬇ Save as PDF</button>
        <button onClick={() => window.close()} style={{
          background:"#e2e8f0", color:"#475569", border:"none", borderRadius:8,
          padding:"8px 14px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'PJS',sans-serif",
        }}>✕ Close</button>
      </div>

      {/* ══ CARD ══ */}
      <div style={{
        width: 760,
        background: "#ffffff",
        borderRadius: 0,
        overflow: "hidden",
        fontFamily: "'PJS','Segoe UI',Arial,sans-serif",
        boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
      }}>

        {/* ── HEADER ── */}
        <div style={{
          background: `linear-gradient(135deg, ${BLUE2} 0%, ${BLUE} 100%)`,
          padding: "16px 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <img src="/logo/logo-white.png" alt="ICS Aviation" style={{ height:28, objectFit:"contain" }} />
          <div style={{ textAlign:"right" }}>
            <div style={{ color:"rgba(255,255,255,0.55)", fontSize:7, letterSpacing:"0.22em", textTransform:"uppercase", marginBottom:2 }}>
              Interview Scheduling
            </div>
            <div style={{ color:"#fff", fontSize:9, fontWeight:700 }}>{today}</div>
          </div>
        </div>

        {/* ── BODY ── */}
        <div style={{ display:"flex", flexDirection:"row" }}>

          {/* LEFT */}
          <div style={{ flex:1, padding:"24px 24px 24px 32px", display:"flex", flexDirection:"column", gap:16 }}>

            {/* Title block */}
            <div>
              <div style={{ fontSize:7, fontWeight:700, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.18em", marginBottom:6 }}>
                Interview Schedule
              </div>
              <div style={{ fontSize:22, fontWeight:700, color:BLUE, lineHeight:1.15, marginBottom:4 }}>
                {schedule.name}
              </div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {sub && (
                  <span style={{ fontSize:8, color:"#475569", fontWeight:600 }}>{sub}</span>
                )}
                {sub && meta && <span style={{ fontSize:8, color:"#CBD5E1" }}>·</span>}
                {meta && (
                  <span style={{ fontSize:8, color:"#64748B" }}>{meta}</span>
                )}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height:1, background:"#E2E8F0" }} />

            {/* Stats */}
            <div style={{ display:"flex", gap:10 }}>
              <div style={{ flex:1, background:LIGHT, borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:7, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.12em", fontWeight:700, marginBottom:5 }}>Date</div>
                <div style={{ fontSize:13, fontWeight:700, color:BLUE, lineHeight:1.2 }}>{date}</div>
              </div>
              <div style={{ flex:1, background:LIGHT, borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:7, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.12em", fontWeight:700, marginBottom:5 }}>Time Window</div>
                <div style={{ fontSize:13, fontWeight:700, color:BLUE, lineHeight:1.2 }}>{timeFrom} – {timeTo}</div>
              </div>
              <div style={{ background:BLUE, borderRadius:10, padding:"12px 16px", textAlign:"center", minWidth:72 }}>
                <div style={{ fontSize:7, color:"rgba(255,255,255,0.6)", textTransform:"uppercase", letterSpacing:"0.12em", fontWeight:700, marginBottom:5 }}>Slot</div>
                <div style={{ fontSize:20, fontWeight:700, color:"#fff", lineHeight:1 }}>{dur}</div>
                <div style={{ fontSize:8, color:"rgba(255,255,255,0.6)", marginTop:2 }}>min</div>
              </div>
            </div>

            {/* Booking link */}
            <div style={{ background:BLUE, borderRadius:10, padding:"14px 16px" }}>
              <div style={{ fontSize:7, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:"0.18em", fontWeight:700, marginBottom:6 }}>Booking Link</div>
              <div style={{ fontSize:9, fontWeight:700, color:"#fff", fontFamily:"monospace", wordBreak:"break-all", lineHeight:1.6 }}>{shortUrl}</div>
              <div style={{ fontSize:7.5, color:"rgba(255,255,255,0.4)", marginTop:6 }}>Scan the QR code or visit this link to reserve your slot</div>
            </div>

            {/* Steps */}
            <div>
              <div style={{ fontSize:7, fontWeight:700, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.18em", marginBottom:8 }}>How to Book</div>
              {["Scan the QR code or open the booking link above","Choose your preferred interview time slot","Enter your details and confirm your booking"].map((s,i) => (
                <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom: i<2 ? 5 : 0 }}>
                  <div style={{ width:16, height:16, borderRadius:"50%", background:LIGHT, color:BLUE,
                    fontSize:7, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>
                    {i+1}
                  </div>
                  <div style={{ fontSize:8, color:"#64748B", lineHeight:1.5 }}>{s}</div>
                </div>
              ))}
            </div>
          </div>

          {/* DIVIDER */}
          <div style={{ width:1, background:"#E2E8F0", margin:"20px 0" }} />

          {/* RIGHT */}
          <div style={{ width:196, padding:"24px 20px", display:"flex", flexDirection:"column", alignItems:"center", gap:14 }}>

            {/* QR */}
            <div style={{ border:`2px solid ${BLUE}`, borderRadius:12, padding:10, background:"#fff",
              boxShadow:"0 2px 12px rgba(27,79,138,0.12)" }}>
              {qr
                ? <img src={qr} alt="QR" style={{ width:132, height:132, display:"block" }} />
                : <div style={{ width:132, height:132, display:"flex", alignItems:"center",
                    justifyContent:"center", color:"#94a3b8", fontSize:9 }}>Loading…</div>
              }
            </div>

            {/* Scan label */}
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:10, fontWeight:700, color:BLUE, marginBottom:2 }}>Scan to Book</div>
              <div style={{ fontSize:7.5, color:"#94A3B8" }}>Point your camera at the QR code</div>
            </div>

            {/* Divider */}
            <div style={{ width:"100%", height:1, background:"#E2E8F0" }} />

            {/* Button */}
            <div style={{ border:`1.5px solid ${BLUE}`, borderRadius:8, padding:"7px 0",
              textAlign:"center", width:"100%", cursor:"pointer" }}>
              <div style={{ fontSize:8, color:BLUE, fontWeight:700 }}>Click here to book</div>
            </div>

            {/* Divider */}
            <div style={{ width:"100%", height:1, background:"#E2E8F0" }} />

            {/* Schedule ID */}
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:6.5, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.15em", fontWeight:700, marginBottom:4 }}>Schedule ID</div>
              <div style={{ fontSize:11, color:BLUE, fontWeight:700, fontFamily:"monospace", letterSpacing:"0.1em",
                background:LIGHT, borderRadius:6, padding:"4px 10px" }}>{schedId}</div>
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{
          display:"flex", justifyContent:"space-between", alignItems:"center",
          padding:"9px 32px 11px",
          borderTop:"1px solid #E2E8F0",
        }}>
          <span style={{ fontSize:7, color:"#94A3B8" }}>ICS Aviation — Integrated Consulting Services</span>
          <span style={{ fontSize:7, color:"#94A3B8" }}>Good luck! 🎯</span>
        </div>
      </div>
    </>
  )
}
