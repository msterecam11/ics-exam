"use client"

import { useState } from "react"
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink } from "@react-pdf/renderer"
import { Download, Loader2 } from "lucide-react"

function fmtPts(n: number): string {
  if (Number.isInteger(n)) return String(n)
  const s2 = parseFloat(n.toFixed(2))
  return s2 === Math.round(s2 * 10) / 10 ? s2.toFixed(1) : s2.toFixed(2)
}
function fmtTime(s: number) {
  if (!s || s < 60) return s >= 1 ? `${s}s` : "—"
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Summarize the student's answer for any LMS exam question type.
function answerSummary(item: any): string {
  const q = item.question, a = item.answer
  if (!q) return "—"
  if (q.type === "open_ended") return (typeof a === "string" && a.trim()) ? a : "(no answer)"
  if (q.type === "mcq_single") return (q.options ?? []).find((o: any) => o.id === a)?.text || "(no answer)"
  if (q.type === "mcq_multiple") {
    const ids: string[] = Array.isArray(a) ? a : []
    return (q.options ?? []).filter((o: any) => ids.includes(o.id)).map((o: any) => o.text).join(", ") || "(no answer)"
  }
  if (q.type === "ordering") {
    const order: string[] = Array.isArray(a) ? a : []
    return order.map((id, i) => `${i + 1}. ${(q.items ?? []).find((it: any) => it.id === id)?.text ?? "?"}`).join("   ") || "(no answer)"
  }
  if (q.type === "match_pair") {
    const g = (a && typeof a === "object" && !Array.isArray(a)) ? a : {}
    return (q.pairs ?? []).map((p: any) => `${p.left} → ${g[p.id] ?? "—"}`).join("   |   ") || "(no answer)"
  }
  return a == null ? "(no answer)" : (typeof a === "string" ? a : JSON.stringify(a))
}

// Correct answer (for objective types) — helps the reader interpret the score.
function correctSummary(q: any): string | null {
  if (!q) return null
  if (q.type === "mcq_single" || q.type === "mcq_multiple")
    return (q.options ?? []).filter((o: any) => o.correct).map((o: any) => o.text).join(", ") || null
  if (q.type === "ordering")
    return (q.items ?? []).map((it: any, i: number) => `${i + 1}. ${it.text}`).join("   ") || null
  if (q.type === "match_pair")
    return (q.pairs ?? []).map((p: any) => `${p.left} → ${p.right}`).join("   |   ") || null
  return null
}

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
  correctText:   { lineHeight: 1.4, color: "#059669", marginTop: 2 },
  expertBox:     { backgroundColor: "#eff6ff", borderRadius: 3, padding: 5, marginTop: 5 },
  expertLabel:   { fontSize: 8, color: "#1d4ed8", fontFamily: "Helvetica-Bold", marginBottom: 2 },
  expertText:    { fontSize: 8.5, color: "#1e40af", lineHeight: 1.4 },
  footer:        { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#aaa" },
})

interface Attempt {
  attemptNo: number; pct: number | null; passed: boolean
  submittedAt: string | null; timeS: number; answers: any[]
}
interface DocProps {
  student: { name: string; email: string; company: string | null; job_title: string | null }
  courseTitle: string; examTitle: string; passMark: number; attempt: Attempt
}

function ExamResultDocument({ student, courseTitle, examTitle, passMark, attempt }: DocProps) {
  const passed = attempt.passed
  return (
    <Document title={`${student.name} — ${examTitle}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>ICS Aviation — Exam Results</Text>
          <Text style={styles.headerSub}>{courseTitle} · {examTitle} · Attempt #{attempt.attemptNo}</Text>
        </View>

        <Text style={styles.sectionTitle}>Student</Text>
        <View style={styles.row}><Text style={styles.label}>Full Name</Text><Text style={styles.value}>{student.name}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Email</Text><Text style={styles.value}>{student.email}</Text></View>
        {student.job_title ? <View style={styles.row}><Text style={styles.label}>Job Title</Text><Text style={styles.value}>{student.job_title}</Text></View> : null}
        {student.company ? <View style={styles.row}><Text style={styles.label}>Company</Text><Text style={styles.value}>{student.company}</Text></View> : null}
        <View style={styles.row}><Text style={styles.label}>Time Spent</Text><Text style={styles.value}>{fmtTime(attempt.timeS)}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Submitted</Text><Text style={styles.value}>{attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : "—"}</Text></View>

        <View style={styles.scoreBox}>
          <View style={styles.scoreCard}>
            <Text style={[styles.scoreNum, { color: passed ? "#059669" : "#dc2626" }]}>{attempt.pct ?? 0}%</Text>
            <Text style={styles.scoreLabel}>Score</Text>
          </View>
          <View style={styles.scoreCard}>
            <Text style={[styles.scoreNum, { color: "#1B4F8A" }]}>{passMark}%</Text>
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
        {attempt.answers.map((item, idx) => {
          const q = item.question
          const sc = item.earned ?? 0
          const max = Number(q?.points ?? 0)
          const scColor = sc >= max ? "#059669" : sc > 0 ? "#d97706" : "#dc2626"
          const correct = correctSummary(q)
          const wrong = sc < max
          return (
            <View key={item.id} style={styles.questionCard} wrap={false}>
              <View style={styles.questionHeader}>
                <Text style={styles.questionType}>Q{idx + 1} · {q?.type?.replace(/_/g, " ")}</Text>
                <Text style={[{ fontSize: 9, fontFamily: "Helvetica-Bold" }, { color: scColor }]}>
                  {fmtPts(sc)} / {fmtPts(max)} pts
                </Text>
              </View>
              <Text style={styles.questionText}>{q?.text}</Text>
              <Text style={styles.answerLabel}>Student&apos;s answer:</Text>
              <Text style={styles.answerText}>{answerSummary(item)}</Text>
              {correct && wrong ? (
                <>
                  <Text style={[styles.answerLabel, { marginTop: 3 }]}>Correct:</Text>
                  <Text style={styles.correctText}>{correct}</Text>
                </>
              ) : null}
              {item.aiJustification ? (
                <View style={styles.expertBox}>
                  <Text style={styles.expertLabel}>Expert Evaluation</Text>
                  <Text style={styles.expertText}>{item.aiJustification}</Text>
                </View>
              ) : null}
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

// Two-step button (matches the exam-system row button): click to prepare, then
// the PDFDownloadLink appears. Generation is fully client-side (no server/OOM).
export default function ExamResultPDFButton(props: DocProps) {
  const [ready, setReady] = useState(false)
  const fileName = `${props.student.name.replace(/\s+/g, "-")} - ${props.examTitle} - Attempt ${props.attempt.attemptNo}.pdf`

  if (!ready) {
    return (
      <button onClick={() => setReady(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 text-xs border border-border rounded-md hover:bg-muted transition-colors">
        <Download className="h-3.5 w-3.5" /> PDF
      </button>
    )
  }
  return (
    <PDFDownloadLink document={<ExamResultDocument {...props} />} fileName={fileName}
      className="inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors">
      {({ loading }) => loading
        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
        : <><Download className="h-3.5 w-3.5" /> Download</>}
    </PDFDownloadLink>
  )
}
