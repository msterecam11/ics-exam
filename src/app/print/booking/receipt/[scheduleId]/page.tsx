import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Props {
  params:       Promise<{ scheduleId: string }>
  searchParams: Promise<{ code?: string; pdf_secret?: string }>
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

export default async function BookingReceiptPage({ params, searchParams }: Props) {
  const { pdf_secret, code } = await searchParams

  // Auth: either pdf_secret (Puppeteer) or session
  const validSecret = process.env.NEXTAUTH_SECRET && pdf_secret === process.env.NEXTAUTH_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
  }

  if (!code) notFound()

  const { scheduleId } = await params

  // Load booking
  const { data: booking, error: bErr } = await db
    .from("schedule_bookings")
    .select(`
      id, candidate_name, candidate_email, candidate_phone,
      confirmation_code, status, ms_teams_url,
      schedule_slots ( start_utc, end_utc )
    `)
    .eq("schedule_id", scheduleId)
    .eq("confirmation_code", code.toUpperCase())
    .single()

  if (bErr || !booking) notFound()

  // Load schedule
  const { data: schedule, error: sErr } = await db
    .from("schedules")
    .select("name, location, timezone, interview_format, slot_duration_min, assessment_groups(name), role_tracks(name)")
    .eq("id", scheduleId)
    .single()

  if (sErr || !schedule) notFound()

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const manageUrl = `${appUrl}/book/${scheduleId}/manage?code=${booking.confirmation_code}`
  const tz        = (schedule as any).timezone ?? "Asia/Dubai"
  const tzShort   = tz.split("/").pop()?.replace(/_/g, " ") ?? tz
  const slot      = (booking as any).schedule_slots
  const date      = slot ? fmtDate(slot.start_utc, tz) : "—"
  const timeFrom  = slot ? fmtTime(slot.start_utc, tz) : "—"
  const timeTo    = slot ? fmtTime(slot.end_utc,   tz) : "—"
  const today     = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  const group     = (schedule as any).assessment_groups?.name
  const track     = (schedule as any).role_tracks?.name
  const sub       = [group, track].filter(Boolean).join(" — ")

  const FORMAT_LABEL: Record<string, string> = {
    in_person: "In-Person", online: "Online", hybrid: "Hybrid",
  }
  const fmt = FORMAT_LABEL[(schedule as any).interview_format ?? ""] ?? ""

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(manageUrl)}&size=160x160&color=1B4F8A&bgcolor=FFFFFF&margin=4`

  return (
    <div style={{
      background: "white", minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "32px", fontFamily: "'PlusJakartaSans','Segoe UI',Arial,sans-serif",
    }}>
      <style>{`
        @font-face { font-family:'PlusJakartaSans'; src:url('/fonts/PlusJakartaSans-Light.ttf') format('truetype'); font-weight:300; }
        @font-face { font-family:'PlusJakartaSans'; src:url('/fonts/PlusJakartaSans-Regular.ttf') format('truetype'); font-weight:400; }
        @font-face { font-family:'PlusJakartaSans'; src:url('/fonts/PlusJakartaSans-Bold.ttf') format('truetype'); font-weight:700; }
        * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
      `}</style>

      <div id="receipt-card" style={{
        width: 620, border: "2px solid #1B4F8A", borderRadius: 16,
        overflow: "hidden", background: "white",
        fontFamily: "'PlusJakartaSans','Segoe UI',Arial,sans-serif",
      }}>

        {/* ── HEADER ── */}
        <div style={{ background: "#1B4F8A", padding: "20px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/logo-white.png" alt="ICS Aviation" height={36} style={{ objectFit: "contain" }} />
          <div style={{ textAlign: "right" }}>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 9, textTransform: "uppercase", letterSpacing: 2, margin: 0 }}>
              Booking Receipt
            </p>
            <p style={{ color: "white", fontSize: 10, fontWeight: 700, margin: "3px 0 0" }}>{today}</p>
          </div>
        </div>

        {/* ── BODY ── */}
        <div style={{ padding: "22px 28px 26px" }}>

          {/* Candidate name */}
          <div style={{ marginBottom: 18 }}>
            {sub && (
              <p style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 2, margin: "0 0 3px" }}>{sub}</p>
            )}
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1B4F8A", margin: "0 0 2px", lineHeight: 1.2 }}>
              {booking.candidate_name}
            </h1>
            <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>{booking.candidate_email}</p>
          </div>

          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

            {/* ── LEFT ── */}
            <div style={{ flex: 1 }}>

              {/* Schedule name */}
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 2, margin: "0 0 2px" }}>Interview Schedule</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#334155", margin: 0 }}>{(schedule as any).name}</p>
              </div>

              {/* Stat boxes */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <div style={{ flex: 1, background: "#f1f5fb", borderRadius: 10, padding: "10px 12px" }}>
                  <p style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 3px" }}>Date</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#1B4F8A", margin: 0, lineHeight: 1.3 }}>{date}</p>
                </div>
                <div style={{ flex: 1, background: "#f1f5fb", borderRadius: 10, padding: "10px 12px" }}>
                  <p style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 3px" }}>Time</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#1B4F8A", margin: "0 0 2px", lineHeight: 1.3 }}>{timeFrom} – {timeTo}</p>
                  <p style={{ fontSize: 9, color: "#94a3b8", margin: 0 }}>{tzShort}</p>
                </div>
                <div style={{ background: "#1B4F8A", borderRadius: 10, padding: "10px 12px", textAlign: "center", minWidth: 54 }}>
                  <p style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 2px" }}>
                    {fmt || "Slot"}
                  </p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: "white", margin: 0, lineHeight: 1 }}>
                    {(schedule as any).slot_duration_min}
                  </p>
                  <p style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", margin: "2px 0 0" }}>min</p>
                </div>
              </div>

              {/* Location */}
              {(schedule as any).location && (
                <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 14px" }}>
                  📍 {(schedule as any).location}
                </p>
              )}

              {/* Teams link */}
              {(booking as any).ms_teams_url && (
                <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 14px" }}>
                  🔗 <a href={(booking as any).ms_teams_url} style={{ color: "#1B4F8A", fontWeight: 700 }}>Join Teams Meeting</a>
                </p>
              )}

              {/* Confirmation code box */}
              <div style={{ background: "#1B4F8A", borderRadius: 10, padding: "14px 16px" }}>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 9, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 5px" }}>
                  Confirmation Code
                </p>
                <p style={{ color: "white", fontSize: 26, fontWeight: 800, fontFamily: "monospace", letterSpacing: 6, margin: "0 0 3px", lineHeight: 1 }}>
                  {booking.confirmation_code}
                </p>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, margin: 0 }}>
                  Keep this code — needed to manage your booking
                </p>
              </div>
            </div>

            {/* ── RIGHT: QR ── */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 2, flexShrink: 0 }}>
              <div style={{ border: "2px solid #1B4F8A", borderRadius: 14, padding: 10, background: "white" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrSrc} alt="Manage Booking QR" width={140} height={140} />
              </div>
              <p style={{ fontSize: 9, color: "#1B4F8A", fontWeight: 700, textAlign: "center", margin: 0, maxWidth: 120, lineHeight: 1.4 }}>
                Scan to reschedule<br />or cancel
              </p>
            </div>
          </div>

          {/* ── FOOTER ── */}
          <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 18, paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
            <p style={{ fontSize: 10, color: "#94a3b8", margin: 0 }}>ICS Aviation — Integrated Consulting Services</p>
            <p style={{ fontSize: 10, color: "#94a3b8", margin: 0 }}>Good luck! 🎯</p>
          </div>
        </div>
      </div>
    </div>
  )
}
