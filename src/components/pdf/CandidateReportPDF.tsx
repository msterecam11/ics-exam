"use client"

import { useState } from "react"
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink } from "@react-pdf/renderer"
import { Download, Loader2 } from "lucide-react"

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
    return pairs.map((p) => `${cp.find((x: any) => x.id === p.left_id)?.left_item ?? "?"} → ${cp.find((x: any) => x.id === p.right_id)?.right_item ?? "?"}`).join("  |  ") || "(no answer)"
  }
  return "—"
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page:          { fontFamily: "Helvetica", fontSize: 10, padding: 40, color: "#1a1a1a" },
  header:        { marginBottom: 20, borderBottomWidth: 2, borderBottomColor: "#1B4F8A", paddingBottom: 10 },
  headerTitle:   { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#1B4F8A", marginBottom: 3 },
  headerSub:     { fontSize: 9, color: "#666" },
  sectionTitle:  { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1B4F8A", marginBottom: 5, textTransform: "uppercase", marginTop: 14 },
  row:           { flexDirection: "row", marginBottom: 3 },
  label:         { width: 130, color: "#666" },
  value:         { flex: 1 },
  scoreBox:      { flexDirection: "row", gap: 12, marginTop: 10, marginBottom: 4 },
  scoreCard:     { flex: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 5, padding: 8, alignItems: "center" },
  scoreNum:      { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  scoreLabel:    { fontSize: 8, color: "#666" },
  badge:         { borderRadius: 3, paddingHorizontal: 8, paddingVertical: 2 },
  questionCard:  { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 5, padding: 8, marginBottom: 6 },
  questionHeader:{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  questionType:  { fontSize: 8, color: "#888" },
  questionText:  { fontFamily: "Helvetica-Bold", marginBottom: 4, lineHeight: 1.4 },
  answerLabel:   { fontSize: 8, color: "#666", marginBottom: 2 },
  answerText:    { lineHeight: 1.4, color: "#333" },
  expertBox:     { backgroundColor: "#eff6ff", borderRadius: 3, padding: 5, marginTop: 5 },
  expertLabel:   { fontSize: 8, color: "#1d4ed8", fontFamily: "Helvetica-Bold", marginBottom: 2 },
  expertText:    { fontSize: 8.5, color: "#1e40af", lineHeight: 1.4 },
  footer:        { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#aaa" },
})

// ─── Document ────────────────────────────────────────────────────────────────

function ReportDocument({ candidate, answers }: { candidate: any; answers: any[] }) {
  const exam   = candidate.exams
  const passed = candidate.passed

  return (
    <Document title={`${candidate.full_name} — ${exam?.title}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>ICS Aviation — Exam Results</Text>
          <Text style={styles.headerSub}>{exam?.courses?.groups?.name} · {exam?.courses?.name} · {exam?.title}</Text>
        </View>

        <Text style={styles.sectionTitle}>Candidate</Text>
        <View style={styles.row}><Text style={styles.label}>Full Name</Text><Text style={styles.value}>{candidate.full_name}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Email</Text><Text style={styles.value}>{candidate.email}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Job Title</Text><Text style={styles.value}>{candidate.job_title}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Company</Text><Text style={styles.value}>{candidate.company}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Experience</Text><Text style={styles.value}>{candidate.years_of_experience} year(s)</Text></View>
        <View style={styles.row}><Text style={styles.label}>Submitted</Text><Text style={styles.value}>{candidate.submitted_at ? new Date(candidate.submitted_at).toLocaleString() : "—"}</Text></View>

        <View style={styles.scoreBox}>
          <View style={styles.scoreCard}>
            <Text style={[styles.scoreNum, { color: passed ? "#059669" : "#dc2626" }]}>{candidate.total_score?.toFixed(1) ?? "—"}%</Text>
            <Text style={styles.scoreLabel}>Score</Text>
          </View>
          <View style={styles.scoreCard}>
            <Text style={[styles.scoreNum, { color: "#1B4F8A" }]}>{exam?.passing_score}%</Text>
            <Text style={styles.scoreLabel}>Passing</Text>
          </View>
          <View style={styles.scoreCard}>
            <View style={[styles.badge, { backgroundColor: passed ? "#d1fae5" : "#fee2e2" }]}>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: passed ? "#065f46" : "#991b1b" }}>
                {passed ? "PASSED" : "FAILED"}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Responses</Text>
        {answers.map((answer, idx) => {
          const q        = answer.questions
          const sc       = answer.score_achieved ?? 0
          const scColor  = sc >= q?.score ? "#059669" : sc > 0 ? "#d97706" : "#dc2626"
          return (
            <View key={answer.id} style={styles.questionCard} wrap={false}>
              <View style={styles.questionHeader}>
                <Text style={styles.questionType}>Q{idx + 1} · {q?.type?.replace(/_/g, " ")}</Text>
                <Text style={[{ fontSize: 9, fontFamily: "Helvetica-Bold" }, { color: scColor }]}>
                  {fmtPts(sc)} / {fmtPts(q?.score ?? 0)} pts
                </Text>
              </View>
              <Text style={styles.questionText}>{q?.text}</Text>
              <Text style={styles.answerLabel}>Answer:</Text>
              <Text style={styles.answerText}>{answerSummary(answer)}</Text>
              {answer.ai_justification && (
                <View style={styles.expertBox}>
                  <Text style={styles.expertLabel}>Expert Evaluation</Text>
                  <Text style={styles.expertText}>{answer.ai_justification}</Text>
                </View>
              )}
            </View>
          )
        })}

        <View style={styles.footer} fixed>
          <Text>ICS Aviation — Integrated Consulting Services</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

// ─── Download button (used in results table rows) ────────────────────────────

export function PDFDownloadButton({ candidateId, candidateName }: { candidateId: string; candidateName: string }) {
  const [data, setData]       = useState<{ candidate: any; answers: any[] } | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
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
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {loading ? "Loading…" : "PDF"}
      </button>
    )
  }

  return (
    <PDFDownloadLink
      document={<ReportDocument candidate={data.candidate} answers={data.answers} />}
      fileName={`${candidateName.replace(/\s+/g, "-")}-results.pdf`}
      className="inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors"
    >
      {({ loading: pdfLoading }) =>
        pdfLoading
          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
          : <><Download className="h-3.5 w-3.5" /> Download</>
      }
    </PDFDownloadLink>
  )
}
