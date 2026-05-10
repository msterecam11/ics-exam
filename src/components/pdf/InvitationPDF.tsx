import React from "react"
import {
  Document, Page, View, Text, Image, Link, Font, StyleSheet,
} from "@react-pdf/renderer"

// Register fonts lazily with absolute URLs (required by @react-pdf/renderer)
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

const BLUE  = "#1B4F8A"
const LIGHT = "#F1F5FB"

const s = StyleSheet.create({
  page       : { fontFamily: "PlusJakartaSans", backgroundColor: "#fff", padding: 0 },
  header     : { backgroundColor: BLUE, paddingHorizontal: 36, paddingVertical: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo       : { width: 110, height: 30, objectFit: "contain" },
  headerRight: { alignItems: "flex-end" },
  headerLabel: { color: "#ffffff99", fontSize: 7, letterSpacing: 1.5, textTransform: "uppercase" },
  headerDate : { color: "#fff", fontSize: 8, marginTop: 2 },
  body       : { paddingHorizontal: 36, paddingTop: 24, paddingBottom: 28 },
  divider    : { height: 1, backgroundColor: "#E2E8F0", marginVertical: 18 },
  grid       : { flexDirection: "row", gap: 24 },
  left       : { flex: 1 },
  right      : { width: 170, alignItems: "center", gap: 10 },
  label      : { fontSize: 7, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 2 },
  courseText : { fontSize: 9, fontWeight: 700, color: "#334155" },
  examTitle  : { fontSize: 20, fontWeight: 700, color: BLUE, marginTop: 10, lineHeight: 1.2 },
  description: { fontSize: 8, color: "#64748B", marginTop: 4 },
  statsRow   : { flexDirection: "row", gap: 10, marginTop: 14 },
  statBox    : { flex: 1, backgroundColor: LIGHT, borderRadius: 10, padding: 10 },
  statLabel  : { fontSize: 7, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1 },
  statValue  : { fontSize: 18, fontWeight: 700, color: BLUE, marginTop: 2 },
  passBox    : { backgroundColor: BLUE, borderRadius: 10, padding: 12, marginTop: 10 },
  passLabel  : { fontSize: 7, color: "#ffffff99", textTransform: "uppercase", letterSpacing: 1.5 },
  passCode   : { fontSize: 26, fontWeight: 700, color: "#fff", letterSpacing: 6, marginTop: 4 },
  passHint   : { fontSize: 7, color: "#ffffff80", marginTop: 4 },
  stepsTitle : { fontSize: 7, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1.2, marginTop: 14, marginBottom: 5 },
  step       : { fontSize: 8, color: "#64748B", marginBottom: 3 },
  qrBox      : { borderWidth: 2, borderColor: BLUE, borderRadius: 12, padding: 10, backgroundColor: "#fff" },
  qrImg      : { width: 140, height: 140 },
  linkBtn    : { borderWidth: 1, borderColor: BLUE, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginTop: 2 },
  linkText   : { fontSize: 8, color: BLUE, fontWeight: 700, textAlign: "center" },
  footer     : { flexDirection: "row", justifyContent: "space-between", paddingTop: 14, borderTopWidth: 1, borderTopColor: "#E2E8F0", marginTop: 18 },
  footerText : { fontSize: 7, color: "#94A3B8" },
})

export interface InvitationPDFProps {
  examTitle   : string
  description : string
  courseName  : string
  groupName   : string
  password    : string
  duration    : number
  passingScore: number
  examUrl     : string
  date        : string
}

export function InvitationPDF({
  examTitle, description, courseName, groupName,
  password, duration, passingScore, examUrl, date,
}: InvitationPDFProps) {
  ensureFonts()
  const origin = typeof window !== "undefined" ? window.location.origin : ""

  return (
    <Document>
      <Page size={{ width: 595, height: 480 }} style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Image src={`${origin}/logo/logo-white.png`} style={s.logo} />
          <View style={s.headerRight}>
            <Text style={s.headerLabel}>Examination Notice</Text>
            <Text style={s.headerDate}>{date}</Text>
          </View>
        </View>

        <View style={s.body}>
          <View style={s.grid}>
            {/* Left */}
            <View style={s.left}>
              <Text style={s.label}>Course</Text>
              <Text style={s.courseText}>{groupName} — {courseName}</Text>

              <Text style={s.examTitle}>{examTitle}</Text>
              {description ? <Text style={s.description}>{description}</Text> : null}

              <View style={s.statsRow}>
                <View style={s.statBox}>
                  <Text style={s.statLabel}>Duration</Text>
                  <Text style={s.statValue}>{duration} min</Text>
                </View>
                <View style={s.statBox}>
                  <Text style={s.statLabel}>Pass Score</Text>
                  <Text style={s.statValue}>{passingScore}%</Text>
                </View>
              </View>

              <View style={s.passBox}>
                <Text style={s.passLabel}>Access Password</Text>
                <Text style={s.passCode}>{password}</Text>
                <Text style={s.passHint}>Enter this when prompted</Text>
              </View>

              <Text style={s.stepsTitle}>How to start</Text>
              <Text style={s.step}>1. Scan the QR code or click the link below</Text>
              <Text style={s.step}>2. Enter the password shown above</Text>
              <Text style={s.step}>3. Fill in your details and begin the exam</Text>
            </View>

            {/* Right: QR */}
            <View style={s.right}>
              <View style={s.qrBox}>
                <Image src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(examUrl)}`} style={s.qrImg} />
              </View>
              <Link src={examUrl} style={s.linkBtn}>
                <Text style={s.linkText}>Click here to open exam</Text>
              </Link>
            </View>
          </View>

          {/* Footer */}
          <View style={s.footer}>
            <Text style={s.footerText}>ICS Aviation — Integrated Consulting Services</Text>
            <Text style={s.footerText}>Good luck!</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
