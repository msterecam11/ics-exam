import {
  Document,
  Page,
  View,
  Text,
  Image,
  Link,
  StyleSheet,
  Font,
} from "@react-pdf/renderer"

// ── Register ICS brand font (runs client-side via dynamic import) ──────────────
if (typeof window !== "undefined") {
  Font.register({
    family: "PlusJakartaSans",
    fonts: [
      { src: `${window.location.origin}/fonts/PlusJakartaSans-Light.ttf`, fontWeight: 300 },
      { src: `${window.location.origin}/fonts/PlusJakartaSans-Regular.ttf`, fontWeight: 400 },
      { src: `${window.location.origin}/fonts/PlusJakartaSans-Bold.ttf`, fontWeight: 700 },
    ],
  })
}

// ── Palette ───────────────────────────────────────────────────────────────────
const BLUE      = "#1B4F8A"
const GREEN     = "#166534"
const GREEN_BG  = "#dcfce7"
const RED       = "#991b1b"
const RED_BG    = "#fee2e2"
const AMBER     = "#92400e"
const AMBER_BG  = "#fef9c3"
const SLATE     = "#475569"
const SLATE_LT  = "#94a3b8"
const BORDER    = "#e2e8f0"

const FONT = "PlusJakartaSans"

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    backgroundColor: "#f1f5f9",
    fontFamily: FONT,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    overflow: "hidden",
    width: 370,
  },

  // Header
  header: {
    backgroundColor: BLUE,
    paddingTop: 16,
    paddingBottom: 14,
    paddingLeft: 24,
    paddingRight: 24,
    alignItems: "center",
  },
  headerLogo: {
    width: 105,
    height: 28,
    objectFit: "contain",
    marginBottom: 6,
  },
  headerSub: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 8,
    letterSpacing: 2,
    fontFamily: FONT,
  },

  // Body
  body: {
    paddingTop: 16,
    paddingBottom: 4,
    paddingLeft: 24,
    paddingRight: 24,
    alignItems: "center",
  },
  thankYou: {
    fontSize: 9.5,
    color: SLATE,
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 1.5,
    fontFamily: FONT,
  },
  name: {
    fontSize: 17,
    fontWeight: 700,
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 4,
    fontFamily: FONT,
  },
  exam: {
    fontSize: 11,
    color: BLUE,
    textAlign: "center",
    marginBottom: 4,
    fontFamily: FONT,
  },
  date: {
    fontSize: 9.5,
    color: SLATE,
    textAlign: "center",
    marginBottom: 12,
    fontFamily: FONT,
  },

  // Status badge
  badge: {
    borderRadius: 20,
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 14,
    paddingRight: 14,
    marginBottom: 14,
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: 700,
    fontFamily: FONT,
  },

  // Divider
  divRow: { flexDirection: "row", alignItems: "center", width: "100%", marginBottom: 12 },
  divLine: { flex: 1, height: 1, backgroundColor: BORDER },
  divDot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: BORDER, marginLeft: 5, marginRight: 5 },

  // QR section
  qrLabel: { fontSize: 10, color: SLATE, textAlign: "center", marginBottom: 8, fontFamily: FONT },
  qrWrap:  { padding: 6, borderWidth: 1, borderColor: BORDER, borderRadius: 8, marginBottom: 8, backgroundColor: "#fff" },
  qrImg:   { width: 120, height: 120 },

  // URL link
  urlLink:  { marginBottom: 10 },
  urlText:  { fontSize: 8.5, color: BLUE, textAlign: "center", textDecoration: "underline", fontFamily: FONT },

  // Notes
  note: { fontSize: 9, color: SLATE_LT, textAlign: "center", marginBottom: 3, lineHeight: 1.4, fontFamily: FONT },

  // Footer
  footer: {
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 9,
    paddingBottom: 9,
    alignItems: "center",
    marginTop: 12,
  },
  footerText: { fontSize: 8, color: SLATE_LT, letterSpacing: 0.5, fontFamily: FONT },
})

// ── Types ─────────────────────────────────────────────────────────────────────
export type ReceiptStatus = "pending" | "passed" | "failed"

export interface ReceiptPDFProps {
  candidateName : string
  examTitle     : string
  submittedAt   : string
  qrDataUrl     : string
  resultUrl     : string
  status        : ReceiptStatus
  score?        : number          // e.g. 87.5 — only for passed/failed
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ReceiptPDF({
  candidateName,
  examTitle,
  submittedAt,
  qrDataUrl,
  resultUrl,
  status,
  score,
}: ReceiptPDFProps) {
  // Truncate long strings
  const name  = candidateName.length > 32 ? candidateName.slice(0, 30) + "…" : candidateName
  const exam  = examTitle.length > 44     ? examTitle.slice(0, 42) + "…"     : examTitle
  const submitted = (() => {
    try { return new Date(submittedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) }
    catch { return submittedAt }
  })()

  // Badge
  const badge = {
    pending : { bg: AMBER_BG,  color: AMBER, label: "Awaiting Results Release" },
    passed  : { bg: GREEN_BG,  color: GREEN, label: score !== undefined ? `Passed — ${score.toFixed(1)}%` : "Passed" },
    failed  : { bg: RED_BG,    color: RED,   label: score !== undefined ? `Not Passed — ${score.toFixed(1)}%` : "Not Passed" },
  }[status]

  // Friendly message
  const thankYou = {
    pending : `Thank you for completing the ${exam} exam.\nYour instructor will notify you once your results are released.`,
    passed  : `Congratulations on passing the ${exam} exam!\nWe're proud of your achievement.`,
    failed  : `Thank you for taking the ${exam} exam.\nKeep practising — we believe in your progress.`,
  }[status]

  return (
    <Document title={`ICS Receipt — ${name}`}>
      <Page size={{ width: 420, height: 560 }} style={s.page}>
        <View style={s.card}>

          {/* Header */}
          <View style={s.header}>
            <Image
              src={`${typeof window !== "undefined" ? window.location.origin : ""}/logo/logo-white.png`}
              style={s.headerLogo}
            />
            <Text style={s.headerSub}>EXAM SUBMISSION RECEIPT</Text>
          </View>

          {/* Body */}
          <View style={s.body}>
            {/* Thank-you message */}
            <Text style={s.thankYou}>{thankYou}</Text>

            {/* Candidate info */}
            <Text style={s.name}>{name}</Text>
            <Text style={s.exam}>{exam}</Text>
            <Text style={s.date}>Submitted: {submitted}</Text>

            {/* Status badge */}
            <View style={[s.badge, { backgroundColor: badge.bg }]}>
              <Text style={[s.badgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>

            {/* Divider */}
            <View style={s.divRow}>
              <View style={s.divLine} />
              <View style={s.divDot} />
              <View style={s.divLine} />
            </View>

            {/* QR */}
            <Text style={s.qrLabel}>Scan to view your results anytime</Text>
            <View style={s.qrWrap}>
              <Image src={qrDataUrl} style={s.qrImg} />
            </View>

            {/* Clickable URL */}
            <Link src={resultUrl} style={s.urlLink}>
              <Text style={s.urlText}>{resultUrl}</Text>
            </Link>

            {/* Notes */}
            <Text style={s.note}>Keep this receipt as proof of exam submission.</Text>
          </View>

          {/* Footer */}
          <View style={s.footer}>
            <Text style={s.footerText}>ICS Aviation — Exam Platform</Text>
          </View>

        </View>
      </Page>
    </Document>
  )
}
