"use client"

import { useState } from "react"
import {
  Document, Page, Text, View, StyleSheet,
  PDFDownloadLink, Font, Image,
} from "@react-pdf/renderer"
import { Download, Loader2 } from "lucide-react"

// ─── Font registration ──────────────────────────────────────────────────────
// Called lazily at click-time so window.location is available
let fontsRegistered = false
function ensureFonts(base: string) {
  if (fontsRegistered) return
  Font.register({
    family: "Jakarta",
    fonts: [
      { src: `${base}/fonts/PlusJakartaSans-Light.ttf`,   fontWeight: 300 },
      { src: `${base}/fonts/PlusJakartaSans-Regular.ttf`, fontWeight: 400 },
      { src: `${base}/fonts/PlusJakartaSans-Bold.ttf`,    fontWeight: 700 },
    ],
  })
  // Disable automatic hyphenation — prevents weird mid-word breaks
  Font.registerHyphenationCallback((word) => [word])
  fontsRegistered = true
}

// ─── Design tokens ──────────────────────────────────────────────────────────
const C = {
  blue:        "#1B4F8A",
  blueBg:      "#EFF6FF",
  blueBorder:  "#BFDBFE",
  green:       "#059669",
  greenBg:     "#D1FAE5",
  red:         "#DC2626",
  redBg:       "#FEE2E2",
  amber:       "#D97706",
  amberBg:     "#FEF3C7",
  slate:       "#64748B",
  slateLight:  "#F8FAFC",
  slateBorder: "#E2E8F0",
  text:        "#1E293B",
  muted:       "#94A3B8",
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  // ── COVER PAGE ────────────────────────────────────────────────────────────
  coverPage: {
    fontFamily: "Jakarta",
    backgroundColor: C.blue,
    flexDirection: "column",
    paddingBottom: 0,
  },
  coverTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 44,
    paddingTop: 38,
    paddingBottom: 0,
  },
  coverLogo: { width: 120, height: 30 },
  coverTopDate: { fontSize: 9, fontWeight: 300, color: "rgba(255,255,255,0.35)" },

  coverBody: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 44,
    paddingVertical: 32,
  },

  coverEyebrow: {
    fontSize: 8,
    fontWeight: 300,
    color: "rgba(255,255,255,0.45)",
    textTransform: "uppercase",
    letterSpacing: 4,
    textAlign: "center",
    marginBottom: 24,
  },

  coverName: {
    fontSize: 30,
    fontWeight: 700,
    color: "white",
    textAlign: "center",
    marginBottom: 4,
  },
  coverJobLine: {
    fontSize: 11,
    fontWeight: 300,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    marginBottom: 26,
  },

  coverScoreCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 28,
    paddingVertical: 18,
    marginBottom: 22,
  },
  coverScoreBlock: { alignItems: "center" },
  coverScoreNum: { fontSize: 34, fontWeight: 700, marginBottom: 2 },
  coverScoreLabel: {
    fontSize: 7,
    fontWeight: 300,
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  coverDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginHorizontal: 24,
  },
  coverBadge: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  coverBadgeText: { fontSize: 13, fontWeight: 700 },

  coverExamBox: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    paddingHorizontal: 28,
    paddingVertical: 14,
    alignItems: "center",
  },
  coverExamTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: "rgba(255,255,255,0.80)",
    textAlign: "center",
    marginBottom: 3,
  },
  coverExamMeta: {
    fontSize: 9,
    fontWeight: 300,
    color: "rgba(255,255,255,0.30)",
    textAlign: "center",
  },

  coverFooter: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 44,
    paddingVertical: 13,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  coverFooterText: { fontSize: 8, fontWeight: 300, color: "rgba(255,255,255,0.20)" },

  // ── CONTENT PAGE ──────────────────────────────────────────────────────────
  contentPage: {
    fontFamily: "Jakarta",
    backgroundColor: "white",
    flexDirection: "column",
    paddingBottom: 56,
  },

  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingTop: 26,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: C.blue,
  },
  pageHeaderLogo: { width: 90, height: 22 },
  pageHeaderRight: { alignItems: "flex-end" },
  pageHeaderTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: C.blue,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  pageHeaderSub: { fontSize: 8, fontWeight: 300, color: C.slate },

  pageContent: { paddingHorizontal: 40, paddingTop: 18 },

  pageFooter: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: C.slateBorder,
  },
  pageFooterText: { fontSize: 7, fontWeight: 300, color: C.muted },

  // ── CANDIDATE INFO ────────────────────────────────────────────────────────
  infoSection: {
    borderBottomWidth: 1,
    borderBottomColor: C.slateBorder,
    paddingBottom: 14,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: C.blue,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  infoGrid: { flexDirection: "row" },
  infoCol: { flex: 1 },
  infoRow: { flexDirection: "row", marginBottom: 4 },
  infoKey: { fontSize: 8, fontWeight: 300, color: C.slate, width: 65 },
  infoVal: { fontSize: 8, fontWeight: 400, color: C.text, flex: 1 },

  // ── SCORE SUMMARY ─────────────────────────────────────────────────────────
  summaryRow: {
    flexDirection: "row",
    marginBottom: 18,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: C.slateLight,
    borderWidth: 1,
    borderColor: C.slateBorder,
    borderRadius: 7,
    padding: 9,
    alignItems: "center",
    marginRight: 6,
  },
  summaryCardLast: { marginRight: 0 },
  summaryVal: { fontSize: 17, fontWeight: 700, marginBottom: 2 },
  summaryKey: {
    fontSize: 6,
    fontWeight: 300,
    color: C.slate,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  // ── QUESTION CARDS ────────────────────────────────────────────────────────
  qCard: {
    borderWidth: 1,
    borderColor: C.slateBorder,
    borderRadius: 7,
    marginBottom: 7,
    overflow: "hidden",
  },
  qCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: C.slateLight,
    borderBottomWidth: 1,
    borderBottomColor: C.slateBorder,
  },
  qCardTopLeft: { flexDirection: "row", alignItems: "center" },
  qBadge: {
    backgroundColor: "#e2e8f0",
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginRight: 6,
  },
  qBadgeText: { fontSize: 7, fontWeight: 700, color: "#475569", textTransform: "uppercase" },
  qNum: { fontSize: 8, fontWeight: 300, color: C.slate },
  qScore: { fontSize: 9, fontWeight: 700 },

  qBody: { padding: 10 },
  qText: {
    fontSize: 9,
    fontWeight: 700,
    color: C.text,
    lineHeight: 1.5,
    marginBottom: 8,
  },
  answerLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: C.slate,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  answerRow: { flexDirection: "row" },
  answerMark: { fontSize: 9, fontWeight: 700, width: 14, marginTop: 1 },
  answerText: {
    fontSize: 9,
    fontWeight: 300,
    color: "#374151",
    flex: 1,
    lineHeight: 1.5,
  },

  expertBox: {
    backgroundColor: C.blueBg,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: C.blueBorder,
    padding: 8,
    marginTop: 8,
  },
  expertLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: "#1d4ed8",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 3,
  },
  expertText: {
    fontSize: 8,
    fontWeight: 300,
    color: "#1e40af",
    lineHeight: 1.5,
  },

  // ── END NOTE ──────────────────────────────────────────────────────────────
  endNote: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: C.slateBorder,
    paddingTop: 12,
    alignItems: "center",
  },
  endNoteLogo: { width: 70, height: 18, marginBottom: 5, opacity: 0.18 },
  endNoteText: {
    fontSize: 7,
    fontWeight: 300,
    color: C.muted,
    textAlign: "center",
    lineHeight: 1.5,
  },
})

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtPts(n: number): string {
  if (Number.isInteger(n)) return String(n)
  const s2 = parseFloat(n.toFixed(2))
  return s2 === Math.round(s2 * 10) / 10 ? s2.toFixed(1) : s2.toFixed(2)
}

function answerSummary(answer: any): string {
  const q = answer.questions
  if (!q) return "—"
  if (q.type === "open_ended") return answer.answer_text || "(no answer)"
  if (q.type === "mcq_single") {
    const c = q.choices?.find((ch: any) => ch.id === answer.answer_json?.choice_id)
    return c?.text || "(no answer)"
  }
  if (q.type === "mcq_multi") {
    const ids: string[] = answer.answer_json?.choice_ids ?? []
    return q.choices?.filter((ch: any) => ids.includes(ch.id)).map((ch: any) => ch.text).join(", ") || "(no answer)"
  }
  if (q.type === "ordering") {
    const order: string[] = answer.answer_json?.order ?? []
    return order.map((id, i) => `${i + 1}. ${q.ordering_items?.find((it: any) => it.id === id)?.text ?? "?"}`).join("  ") || "(no answer)"
  }
  if (q.type === "matching") {
    const pairs: any[] = answer.answer_json?.pairs ?? []
    const cp = q.matching_pairs ?? []
    return pairs.map((p) =>
      `${cp.find((x: any) => x.id === p.left_id)?.left_item ?? "?"}  →  ${cp.find((x: any) => x.id === p.right_id)?.right_item ?? "?"}`
    ).join("   |   ") || "(no answer)"
  }
  return "—"
}

// ─── Document ────────────────────────────────────────────────────────────────
function ResultsDocument({ candidate, answers, base }: {
  candidate: any; answers: any[]; base: string
}) {
  const exam          = candidate.exams
  const passed        = candidate.passed ?? false
  const score: number = candidate.total_score ?? 0
  const today         = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  const submittedAt   = candidate.submitted_at
    ? new Date(candidate.submitted_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "—"

  const totalPossible = answers.reduce((s, a) => s + (a.questions?.score ?? 0), 0)
  const totalEarned   = answers.reduce((s, a) => s + (a.score_achieved ?? 0), 0)
  const correctCount  = answers.filter(a => (a.score_achieved ?? 0) >= (a.questions?.score ?? 0) && (a.questions?.score ?? 0) > 0).length

  const passColor = passed ? "#34d399" : "#f87171"
  const scoreColor = passed ? C.green : C.red

  return (
    <Document title={`${candidate.full_name} — Exam Results`}>

      {/* ══ COVER PAGE ══ */}
      <Page size="A4" style={S.coverPage}>
        <View style={S.coverTopBar}>
          <Image src={`${base}/logo/logo-white.png`} style={S.coverLogo} />
          <Text style={S.coverTopDate}>{today}</Text>
        </View>

        <View style={S.coverBody}>
          <Text style={S.coverEyebrow}>Exam Results · Confidential</Text>

          <Text style={S.coverName}>{candidate.full_name}</Text>
          {(candidate.job_title || candidate.company) && (
            <Text style={S.coverJobLine}>
              {[candidate.job_title, candidate.company].filter(Boolean).join("  ·  ")}
            </Text>
          )}

          <View style={S.coverScoreCard}>
            <View style={S.coverScoreBlock}>
              <Text style={[S.coverScoreNum, { color: passColor }]}>{score.toFixed(1)}%</Text>
              <Text style={S.coverScoreLabel}>Score</Text>
            </View>
            <View style={S.coverDivider} />
            <View style={S.coverScoreBlock}>
              <Text style={[S.coverScoreNum, { color: "rgba(255,255,255,0.7)", fontSize: 20, marginTop: 4 }]}>
                {exam?.passing_score}%
              </Text>
              <Text style={S.coverScoreLabel}>Pass Mark</Text>
            </View>
            <View style={S.coverDivider} />
            <View style={S.coverScoreBlock}>
              <View style={[S.coverBadge, { backgroundColor: passed ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)" }]}>
                <Text style={[S.coverBadgeText, { color: passColor }]}>
                  {passed ? "PASSED" : "FAILED"}
                </Text>
              </View>
            </View>
          </View>

          <View style={S.coverExamBox}>
            <Text style={S.coverExamTitle}>{exam?.title}</Text>
            <Text style={[S.coverExamMeta, { marginBottom: 2 }]}>
              {[exam?.courses?.groups?.name, exam?.courses?.name].filter(Boolean).join("  ·  ")}
            </Text>
            <Text style={S.coverExamMeta}>Submitted: {submittedAt}</Text>
          </View>
        </View>

        <View style={S.coverFooter}>
          <Text style={S.coverFooterText}>ICS Aviation · Integrated Consulting Services · Confidential</Text>
          <Text style={S.coverFooterText}>Page 1</Text>
        </View>
      </Page>

      {/* ══ RESULTS PAGE(S) ══ */}
      <Page size="A4" style={S.contentPage} wrap>

        {/* Header — repeats on every page */}
        <View style={S.pageHeader} fixed>
          <Image src={`${base}/logo/logo-dark-blue.png`} style={S.pageHeaderLogo} />
          <View style={S.pageHeaderRight}>
            <Text style={S.pageHeaderTitle}>Exam Results</Text>
            <Text style={S.pageHeaderSub}>{exam?.title} · {today}</Text>
          </View>
        </View>

        <View style={S.pageContent}>

          {/* Candidate info */}
          <View style={S.infoSection}>
            <Text style={S.sectionLabel}>Candidate Information</Text>
            <View style={S.infoGrid}>
              <View style={S.infoCol}>
                {[
                  ["Name",    candidate.full_name],
                  ["Email",   candidate.email],
                  ["Company", candidate.company],
                ].map(([k, v]) => (
                  <View key={k} style={S.infoRow}>
                    <Text style={S.infoKey}>{k}</Text>
                    <Text style={S.infoVal}>{v || "—"}</Text>
                  </View>
                ))}
              </View>
              <View style={S.infoCol}>
                {[
                  ["Job Title",   candidate.job_title],
                  ["Experience",  candidate.years_of_experience ? `${candidate.years_of_experience} yr(s)` : "—"],
                  ["Submitted",   submittedAt],
                ].map(([k, v]) => (
                  <View key={k} style={S.infoRow}>
                    <Text style={S.infoKey}>{k}</Text>
                    <Text style={S.infoVal}>{v || "—"}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Score summary */}
          <View style={S.summaryRow}>
            {[
              { label: "Score",     val: `${score.toFixed(1)}%`,                                                color: scoreColor },
              { label: "Pass Mark", val: `${exam?.passing_score}%`,                                             color: C.blue    },
              { label: "Result",    val: passed ? "PASSED" : "FAILED",                                          color: scoreColor },
              { label: "Questions", val: `${answers.length}`,                                                   color: C.blue    },
              { label: "Correct",   val: `${correctCount}`,                                                     color: C.green   },
              { label: "Points",    val: `${fmtPts(parseFloat(totalEarned.toFixed(2)))} / ${fmtPts(parseFloat(totalPossible.toFixed(2)))}`, color: C.blue, small: true },
            ].map(({ label, val, color, small }, i, arr) => (
              <View key={label} style={[S.summaryCard, i === arr.length - 1 ? S.summaryCardLast : {}]}>
                <Text style={[S.summaryVal, { color, fontSize: small ? 11 : 17 }]}>{val}</Text>
                <Text style={S.summaryKey}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Answers heading */}
          <Text style={[S.sectionLabel, { marginBottom: 10 }]}>
            Responses ({answers.length} questions)
          </Text>

          {/* Question cards */}
          {answers.map((answer, idx) => {
            const q          = answer.questions
            const sc: number = answer.score_achieved ?? 0
            const max: number = q?.score ?? 0
            const full    = sc >= max && max > 0
            const partial = sc > 0 && !full
            const scColor = full ? C.green : partial ? C.amber : C.red
            const mark    = full ? "✓" : partial ? "~" : "✗"

            return (
              <View key={answer.id} style={S.qCard} wrap={false}>
                <View style={S.qCardTop}>
                  <View style={S.qCardTopLeft}>
                    <View style={S.qBadge}>
                      <Text style={S.qBadgeText}>{q?.type?.replace(/_/g, " ")}</Text>
                    </View>
                    <Text style={S.qNum}>Q{idx + 1}</Text>
                  </View>
                  <Text style={[S.qScore, { color: scColor }]}>
                    {fmtPts(sc)} / {fmtPts(max)} pts
                  </Text>
                </View>

                <View style={S.qBody}>
                  <Text style={S.qText}>{q?.text}</Text>
                  <Text style={S.answerLabel}>Candidate's Answer</Text>
                  <View style={S.answerRow}>
                    <Text style={[S.answerMark, { color: scColor }]}>{mark}</Text>
                    <Text style={S.answerText}>{answerSummary(answer)}</Text>
                  </View>

                  {answer.ai_justification && (
                    <View style={S.expertBox}>
                      <Text style={S.expertLabel}>Expert Evaluation</Text>
                      <Text style={S.expertText}>{answer.ai_justification}</Text>
                    </View>
                  )}
                </View>
              </View>
            )
          })}

          {/* End note */}
          <View style={S.endNote}>
            <Image src={`${base}/logo/logo-dark-blue.png`} style={S.endNoteLogo} />
            <Text style={S.endNoteText}>ICS Aviation · Integrated Consulting Services</Text>
            <Text style={S.endNoteText}>
              This document is confidential and for internal use only.
            </Text>
          </View>
        </View>

        {/* Footer — repeats on every page */}
        <View style={S.pageFooter} fixed>
          <Text style={S.pageFooterText}>ICS Aviation · Integrated Consulting Services · Confidential</Text>
          <Text
            style={S.pageFooterText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}

// ─── Download button ─────────────────────────────────────────────────────────
export function PDFDownloadButton({
  candidateId,
  candidateName,
}: {
  candidateId: string
  candidateName: string
}) {
  const [data, setData]       = useState<{ candidate: any; answers: any[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [base, setBase]       = useState("")

  async function load() {
    setLoading(true)
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    setBase(origin)
    ensureFonts(origin)
    const res  = await fetch(`/api/admin/candidates/${candidateId}/pdf`)
    const json = await res.json()
    setData(json)
    setLoading(false)
  }

  if (!data) {
    return (
      <button
        onClick={load}
        disabled={loading}
        className="inline-flex items-center gap-1.5 h-8 px-3 text-xs border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Download className="h-3.5 w-3.5" />}
        {loading ? "Loading…" : "PDF Results"}
      </button>
    )
  }

  return (
    <PDFDownloadLink
      document={<ResultsDocument candidate={data.candidate} answers={data.answers} base={base} />}
      fileName={`${candidateName.replace(/\s+/g, "-")}-exam-results.pdf`}
      className="inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors"
    >
      {({ loading: pdfLoading }) =>
        pdfLoading
          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
          : <><Download className="h-3.5 w-3.5" /> Download PDF</>
      }
    </PDFDownloadLink>
  )
}
