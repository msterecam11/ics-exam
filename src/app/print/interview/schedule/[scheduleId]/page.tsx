import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import Image from "next/image"

interface Props {
  params:       Promise<{ scheduleId: string }>
  searchParams: Promise<{ pdf_secret?: string }>
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

export default async function ScheduleQRCardPage({ params, searchParams }: Props) {
  const { pdf_secret } = await searchParams
  const validSecret = process.env.PDF_INTERNAL_SECRET && pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
  }

  const { scheduleId } = await params

  const { data: schedule, error } = await db
    .from("schedules")
    .select(`
      id, name, description, location, timezone,
      slot_duration_min, buffer_min, interview_format, status,
      assessment_groups ( name ),
      role_tracks       ( name )
    `)
    .eq("id", scheduleId)
    .single()

  if (error || !schedule) notFound()

  const { data: firstSlot } = await db
    .from("schedule_slots")
    .select("start_utc, end_utc")
    .eq("schedule_id", scheduleId)
    .order("start_utc", { ascending: true })
    .limit(1)
    .single()

  const { data: lastSlot } = await db
    .from("schedule_slots")
    .select("end_utc")
    .eq("schedule_id", scheduleId)
    .order("end_utc", { ascending: false })
    .limit(1)
    .single()

  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const bookingUrl = `${appUrl}/book/${scheduleId}`

  const tz      = (schedule as any).timezone ?? "Asia/Dubai"
  const tzShort = tz.split("/").pop()?.replace(/_/g, " ") ?? tz
  const date    = firstSlot ? fmtDate(firstSlot.start_utc, tz) : "—"
  const tFrom   = firstSlot ? fmtTime(firstSlot.start_utc, tz) : "—"
  const tTo     = lastSlot  ? fmtTime((lastSlot as any).end_utc, tz) : "—"
  const dur     = (schedule as any).slot_duration_min ?? "—"
  const group   = (schedule as any).assessment_groups?.name
  const track   = (schedule as any).role_tracks?.name
  const fmt     = FORMAT_LABEL[(schedule as any).interview_format ?? ""] ?? ""
  const today   = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  const sub     = [group, track].filter(Boolean).join(" — ")
  const qrSrc   = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(bookingUrl)}&size=180x180&color=1B4F8A&bgcolor=FFFFFF&margin=4`

  return (
    <div style={{ background: "white", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px",
      fontFamily: "'PlusJakartaSans','Segoe UI',Arial,sans-serif" }}>

      <style>{`
        @font-face { font-family:'PlusJakartaSans'; src:url('/fonts/PlusJakartaSans-Light.ttf') format('truetype'); font-weight:300; }
        @font-face { font-family:'PlusJakartaSans'; src:url('/fonts/PlusJakartaSans-Regular.ttf') format('truetype'); font-weight:400; }
        @font-face { font-family:'PlusJakartaSans'; src:url('/fonts/PlusJakartaSans-Bold.ttf') format('truetype'); font-weight:700; }
        * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
      `}</style>

      <div id="qr-card" style={{ width: 700, border: "2px solid #1B4F8A", borderRadius: 16,
        overflow: "hidden", background: "white", fontFamily: "'PlusJakartaSans','Segoe UI',Arial,sans-serif" }}>

        {/* ── HEADER ── */}
        <div style={{ background: "#1B4F8A", padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Image src="/logo/logo-white.png" alt="ICS Aviation" width={150} height={40} style={{ objectFit: "contain" }} />
          <div style={{ textAlign: "right" }}>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 9, textTransform: "uppercase", letterSpacing: 2, margin: 0 }}>
              Interview Scheduling
            </p>
            <p style={{ color: "white", fontSize: 10, fontWeight: 700, margin: "4px 0 0" }}>{today}</p>
          </div>
        </div>

        {/* ── BODY ── */}
        <div style={{ padding: "24px 32px 28px" }}>

          {/* Group / Track */}
          {sub && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 2, margin: "0 0 2px" }}>Group / Track</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#334155", margin: 0 }}>{sub}</p>
            </div>
          )}

          {/* Schedule name */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 2, margin: "0 0 3px" }}>Interview Schedule</p>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#1B4F8A", margin: "0 0 4px", lineHeight: 1.15 }}>{(schedule as any).name}</h1>
            {(schedule as any).description && (
              <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>{(schedule as any).description}</p>
            )}
          </div>

          <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>

            {/* ── LEFT ── */}
            <div style={{ flex: 1 }}>

              {/* Stat boxes */}
              <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1, background: "#f1f5fb", borderRadius: 10, padding: "10px 12px" }}>
                  <p style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 3px" }}>Date</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#1B4F8A", margin: 0, lineHeight: 1.2 }}>{date}</p>
                </div>
                <div style={{ flex: 1, background: "#f1f5fb", borderRadius: 10, padding: "10px 12px" }}>
                  <p style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 3px" }}>Time Window</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#1B4F8A", margin: "0 0 1px", lineHeight: 1.2 }}>{tFrom} – {tTo}</p>
                  <p style={{ fontSize: 9, color: "#94a3b8", margin: 0 }}>{tzShort}</p>
                </div>
                <div style={{ background: "#1B4F8A", borderRadius: 10, padding: "10px 14px", textAlign: "center", minWidth: 66 }}>
                  <p style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 3px" }}>
                    {fmt || "Slot"}
                  </p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: "white", margin: 0, lineHeight: 1 }}>{dur}</p>
                  <p style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", margin: "2px 0 0" }}>min</p>
                </div>
              </div>

              {/* Location */}
              {(schedule as any).location && (
                <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 14px" }}>📍 {(schedule as any).location}</p>
              )}

              {/* Booking link — same as password box */}
              <div style={{ background: "#1B4F8A", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 9, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 4px" }}>
                  Booking Link
                </p>
                <p style={{ color: "white", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, margin: "0 0 3px", wordBreak: "break-all", lineHeight: 1.6, fontFamily: "monospace" }}>
                  {bookingUrl.replace(/^https?:\/\//, "")}
                </p>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, margin: 0 }}>
                  Scan the QR code or visit this link to reserve your slot
                </p>
              </div>

              {/* Steps */}
              <p style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 2, margin: "0 0 6px" }}>How to Book</p>
              <ol style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "#64748b", lineHeight: 1.8 }}>
                <li>Scan the QR code or visit the link above</li>
                <li>Select your preferred interview time slot</li>
                <li>Enter your details and confirm your booking</li>
              </ol>
            </div>

            {/* ── RIGHT: QR ── */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: 4, flexShrink: 0 }}>
              <div style={{ border: "2px solid #1B4F8A", borderRadius: 14, padding: 12, background: "white" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrSrc} alt="QR Code" width={160} height={160} />
              </div>
              <span style={{ border: "1px solid #1B4F8A", borderRadius: 8, padding: "5px 14px",
                fontSize: 10, color: "#1B4F8A", fontWeight: 700, textAlign: "center" }}>
                Click here to book
              </span>
            </div>
          </div>

          {/* ── FOOTER ── */}
          <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 20, paddingTop: 12,
            display: "flex", justifyContent: "space-between" }}>
            <p style={{ fontSize: 10, color: "#94a3b8", margin: 0 }}>ICS Aviation — Integrated Consulting Services</p>
            <p style={{ fontSize: 10, color: "#94a3b8", margin: 0 }}>Good luck!</p>
          </div>
        </div>
      </div>
    </div>
  )
}
