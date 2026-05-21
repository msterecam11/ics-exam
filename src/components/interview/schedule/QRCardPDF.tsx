"use client"

import { useEffect, useState } from "react"
import { Document, Page, View, Text, Image, Font, StyleSheet, pdf } from "@react-pdf/renderer"
import QRCode from "qrcode"

// ─── Fonts ───────────────────────────────────────────────────────────────────
let fontsRegistered = false
function ensureFonts() {
  if (fontsRegistered) return
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  Font.register({
    family: "PlusJakartaSans",
    fonts: [
      { src: `${origin}/fonts/PlusJakartaSans-Light.ttf`,   fontWeight: 300 },
      { src: `${origin}/fonts/PlusJakartaSans-Regular.ttf`, fontWeight: 400 },
      { src: `${origin}/fonts/PlusJakartaSans-Bold.ttf`,    fontWeight: 700 },
    ],
  })
  fontsRegistered = true
}

// ─── Colors ──────────────────────────────────────────────────────────────────
const BLUE  = "#1B4F8A"
const BLUE2 = "#163f70"
const LIGHT = "#EEF3FA"
const GREY  = "#94A3B8"
const DARK  = "#475569"

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page:        { fontFamily: "PlusJakartaSans", backgroundColor: "#fff", padding: 0 },

  // Header
  header:      { backgroundColor: BLUE, paddingHorizontal: 28, paddingVertical: 14,
                  flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo:        { width: 100, height: 26, objectFit: "contain" },
  headerRight: { alignItems: "flex-end" },
  headerLabel: { color: "rgba(255,255,255,0.55)", fontSize: 6.5, letterSpacing: 1.8,
                  textTransform: "uppercase" },
  headerDate:  { color: "#fff", fontSize: 8, fontWeight: 700, marginTop: 2 },

  // Body
  body:        { flexDirection: "row", flex: 1 },

  // Left column
  left:        { flex: 1, paddingLeft: 28, paddingRight: 20, paddingTop: 20, paddingBottom: 18,
                  flexDirection: "column", gap: 13 },

  label:       { fontSize: 6.5, fontWeight: 700, color: GREY,
                  textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 5 },
  name:        { fontSize: 20, fontWeight: 700, color: BLUE, lineHeight: 1.15, marginBottom: 3 },
  meta:        { fontSize: 7.5, color: DARK },

  divider:     { height: 1, backgroundColor: "#E2E8F0" },

  // Stat boxes
  statsRow:    { flexDirection: "row", gap: 8 },
  statBox:     { flex: 1, backgroundColor: LIGHT, borderRadius: 8, padding: 10 },
  statBoxBlue: { backgroundColor: BLUE, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10,
                  alignItems: "center", minWidth: 62 },
  statLabel:   { fontSize: 6.5, color: GREY, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontWeight: 700 },
  statLabelW:  { fontSize: 6.5, color: "rgba(255,255,255,0.55)", textTransform: "uppercase",
                  letterSpacing: 1, marginBottom: 4, fontWeight: 700, textAlign: "center" },
  statVal:     { fontSize: 12, fontWeight: 700, color: BLUE, lineHeight: 1.2 },
  statValW:    { fontSize: 18, fontWeight: 700, color: "#fff", lineHeight: 1, textAlign: "center" },
  statUnit:    { fontSize: 7.5, color: "rgba(255,255,255,0.55)", textAlign: "center", marginTop: 2 },

  // Link box
  linkBox:     { backgroundColor: BLUE, borderRadius: 8, padding: 12 },
  linkLabel:   { fontSize: 6.5, color: "rgba(255,255,255,0.5)", textTransform: "uppercase",
                  letterSpacing: 1.5, fontWeight: 700, marginBottom: 5 },
  linkUrl:     { fontSize: 8.5, fontWeight: 700, color: "#fff", lineHeight: 1.6 },
  linkHint:    { fontSize: 7, color: "rgba(255,255,255,0.4)", marginTop: 5 },

  // Steps
  stepsTitle:  { fontSize: 6.5, fontWeight: 700, color: GREY, textTransform: "uppercase",
                  letterSpacing: 1.5, marginBottom: 7 },
  stepRow:     { flexDirection: "row", alignItems: "flex-start", gap: 7, marginBottom: 4 },
  stepBubble:  { width: 14, height: 14, borderRadius: 7, backgroundColor: LIGHT,
                  alignItems: "center", justifyContent: "center" },
  stepNum:     { fontSize: 6.5, fontWeight: 700, color: BLUE },
  stepText:    { fontSize: 7.5, color: DARK, lineHeight: 1.5, flex: 1 },

  // Right column
  right:       { width: 186, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 18,
                  flexDirection: "column", alignItems: "center", gap: 12 },
  qrBox:       { borderWidth: 2, borderColor: BLUE, borderRadius: 10, padding: 8,
                  backgroundColor: "#fff" },
  qrImg:       { width: 126, height: 126 },
  scanTitle:   { fontSize: 9.5, fontWeight: 700, color: BLUE, textAlign: "center" },
  scanSub:     { fontSize: 7, color: GREY, textAlign: "center", marginTop: 1 },
  dividerH:    { height: 1, backgroundColor: "#E2E8F0", width: "100%" },
  btnOutline:  { borderWidth: 1.5, borderColor: BLUE, borderRadius: 7,
                  paddingVertical: 6, width: "100%", alignItems: "center" },
  btnText:     { fontSize: 7.5, color: BLUE, fontWeight: 700 },
  idLabel:     { fontSize: 6, color: GREY, textTransform: "uppercase", letterSpacing: 1.2,
                  fontWeight: 700, textAlign: "center", marginBottom: 3 },
  idChip:      { backgroundColor: LIGHT, borderRadius: 5, paddingHorizontal: 10, paddingVertical: 3 },
  idText:      { fontSize: 10, fontWeight: 700, color: BLUE, letterSpacing: 1 },

  // Divider vertical
  vDivider:    { width: 1, backgroundColor: "#E2E8F0", marginVertical: 16 },

  // Footer
  footer:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                  paddingHorizontal: 28, paddingVertical: 8,
                  borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  footerText:  { fontSize: 6.5, color: GREY },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────
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
  in_person: "In-Person", online: "Online", hybrid: "Hybrid",
}

// ─── PDF Document ─────────────────────────────────────────────────────────────
function QRCardDocument({ schedule, firstSlot, lastSlot, bookingUrl, qrDataUrl }: {
  schedule: any; firstSlot: any; lastSlot: any; bookingUrl: string; qrDataUrl: string
}) {
  ensureFonts()
  const origin = typeof window !== "undefined" ? window.location.origin : ""

  const tz      = schedule.timezone ?? "Asia/Dubai"
  const tzShort = tz.split("/").pop()?.replace(/_/g, " ") ?? tz
  const date    = firstSlot ? fmtDate(firstSlot.start_utc, tz) : "—"
  const tFrom   = firstSlot ? fmtTime(firstSlot.start_utc, tz) : "—"
  const tTo     = lastSlot  ? fmtTime(lastSlot.end_utc,    tz) : "—"
  const dur     = schedule.slot_duration_min ?? "—"
  const shortUrl = bookingUrl.replace(/^https?:\/\//, "")
  const schedId  = schedule.id?.slice(0, 8).toUpperCase() ?? ""
  const group    = schedule.assessment_groups?.name
  const track    = schedule.role_tracks?.name
  const fmt      = FORMAT_LABEL[schedule.interview_format] ?? ""
  const today    = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  const meta     = [fmt, tzShort].filter(Boolean).join(" · ")
  const sub      = [group, track].filter(Boolean).join(" — ")
  const subMeta  = [sub, meta].filter(Boolean).join("  ·  ")

  const steps = [
    "Scan the QR code or open the booking link above",
    "Choose your preferred interview time slot",
    "Enter your details and confirm your booking",
  ]

  return (
    <Document>
      <Page size={{ width: 760, height: 440 }} style={s.page}>

        {/* HEADER */}
        <View style={s.header}>
          <Image src={`${origin}/logo/logo-white.png`} style={s.logo} />
          <View style={s.headerRight}>
            <Text style={s.headerLabel}>Interview Scheduling</Text>
            <Text style={s.headerDate}>{today}</Text>
          </View>
        </View>

        {/* BODY */}
        <View style={[s.body, { flex: 1 }]}>

          {/* LEFT */}
          <View style={s.left}>

            {/* Title */}
            <View>
              <Text style={s.label}>Interview Schedule</Text>
              <Text style={s.name}>{schedule.name}</Text>
              {subMeta ? <Text style={s.meta}>{subMeta}</Text> : null}
            </View>

            <View style={s.divider} />

            {/* Stats */}
            <View style={s.statsRow}>
              <View style={s.statBox}>
                <Text style={s.statLabel}>Date</Text>
                <Text style={s.statVal}>{date}</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statLabel}>Time Window</Text>
                <Text style={s.statVal}>{tFrom} – {tTo}</Text>
              </View>
              <View style={s.statBoxBlue}>
                <Text style={s.statLabelW}>Slot</Text>
                <Text style={s.statValW}>{dur}</Text>
                <Text style={s.statUnit}>min</Text>
              </View>
            </View>

            {/* Booking link */}
            <View style={s.linkBox}>
              <Text style={s.linkLabel}>Booking Link</Text>
              <Text style={s.linkUrl}>{shortUrl}</Text>
              <Text style={s.linkHint}>Scan the QR code or visit this link to reserve your slot</Text>
            </View>

            {/* Steps */}
            <View>
              <Text style={s.stepsTitle}>How to Book</Text>
              {steps.map((step, i) => (
                <View key={i} style={s.stepRow}>
                  <View style={s.stepBubble}><Text style={s.stepNum}>{i + 1}</Text></View>
                  <Text style={s.stepText}>{step}</Text>
                </View>
              ))}
            </View>

          </View>

          {/* VERTICAL DIVIDER */}
          <View style={s.vDivider} />

          {/* RIGHT */}
          <View style={s.right}>
            <View style={s.qrBox}>
              <Image src={qrDataUrl} style={s.qrImg} />
            </View>
            <View>
              <Text style={s.scanTitle}>Scan to Book</Text>
              <Text style={s.scanSub}>Point your camera at the QR code</Text>
            </View>
            <View style={s.dividerH} />
            <View style={s.btnOutline}>
              <Text style={s.btnText}>Click here to book</Text>
            </View>
            <View style={s.dividerH} />
            <View style={{ alignItems: "center" }}>
              <Text style={s.idLabel}>Schedule ID</Text>
              <View style={s.idChip}><Text style={s.idText}>{schedId}</Text></View>
            </View>
          </View>
        </View>

        {/* FOOTER */}
        <View style={s.footer}>
          <Text style={s.footerText}>ICS Aviation — Integrated Consulting Services</Text>
          <Text style={s.footerText}>Good luck!</Text>
        </View>

      </Page>
    </Document>
  )
}

// ─── Hook: generate + download PDF ───────────────────────────────────────────
export function useQRCardPDF(schedule: any, firstSlot: any, lastSlot: any, bookingUrl: string) {
  const [downloading, setDownloading] = useState(false)

  async function downloadPDF() {
    setDownloading(true)
    try {
      // 1. Generate QR as data URL (PNG, high-res)
      const qrDataUrl = await QRCode.toDataURL(bookingUrl, {
        width: 400, margin: 1,
        color: { dark: "#1B4F8A", light: "#ffffff" },
        errorCorrectionLevel: "H",
      })

      // 2. Render PDF blob
      const blob = await pdf(
        <QRCardDocument
          schedule={schedule}
          firstSlot={firstSlot}
          lastSlot={lastSlot}
          bookingUrl={bookingUrl}
          qrDataUrl={qrDataUrl}
        />
      ).toBlob()

      // 3. Trigger download
      const url = URL.createObjectURL(blob)
      const a   = document.createElement("a")
      a.href     = url
      a.download = `${schedule?.name ?? "interview"}-qr-card.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  return { downloading, downloadPDF }
}
