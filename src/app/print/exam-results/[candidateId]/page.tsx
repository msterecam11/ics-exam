import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { notFound, redirect } from "next/navigation"
import Image from "next/image"
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react"

interface Props {
  params: Promise<{ candidateId: string }>
  searchParams: Promise<{ pdf_secret?: string }>
}

function fmtPts(n: number): string {
  if (Number.isInteger(n)) return String(n)
  const s2 = parseFloat(n.toFixed(2))
  return s2 === Math.round(s2 * 10) / 10 ? s2.toFixed(1) : s2.toFixed(2)
}

function AnswerRow({ answer, index }: { answer: any; index: number }) {
  const q = answer.questions
  const score: number = answer.score_achieved ?? 0
  const maxScore: number = q?.score ?? 0
  const isCorrect = score >= maxScore && maxScore > 0
  const isPartial = score > 0 && score < maxScore
  const isEmpty = score === 0 && maxScore > 0

  const scoreColor = isCorrect ? "#16a34a" : isPartial ? "#d97706" : "#dc2626"

  function renderAnswer() {
    if (q?.type === "open_ended") {
      return <p style={{ fontSize: 10, color: "#374151", marginTop: 2 }}>{answer.answer_text || "No answer"}</p>
    }
    if (q?.type === "mcq_single") {
      const choice = q.choices?.find((c: any) => c.id === answer.answer_json?.choice_id)
      if (!choice) return <p style={{ fontSize: 10, color: "#9ca3af" }}>No answer</p>
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 12 }}>{choice.is_correct ? "✓" : "✗"}</span>
          <span style={{ fontSize: 10, color: "#374151" }}>{choice.text}</span>
        </div>
      )
    }
    if (q?.type === "mcq_multi") {
      const ids: string[] = answer.answer_json?.choice_ids ?? []
      const selected = q.choices?.filter((c: any) => ids.includes(c.id)) ?? []
      if (!selected.length) return <p style={{ fontSize: 10, color: "#9ca3af" }}>No answer</p>
      return (
        <div style={{ marginTop: 2 }}>
          {selected.map((c: any) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 12 }}>{c.is_correct ? "✓" : "✗"}</span>
              <span style={{ fontSize: 10, color: "#374151" }}>{c.text}</span>
            </div>
          ))}
        </div>
      )
    }
    if (q?.type === "ordering") {
      const order: string[] = answer.answer_json?.order ?? []
      return (
        <div style={{ marginTop: 2 }}>
          {order.map((id, idx) => {
            const item = q.ordering_items?.find((i: any) => i.id === id)
            const correct = item?.correct_position === idx
            return item ? (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 10, color: "#6b7280", minWidth: 16 }}>{idx + 1}.</span>
                <span style={{ fontSize: 10, color: "#374151" }}>{item.text}</span>
                <span style={{ fontSize: 10, color: correct ? "#16a34a" : "#dc2626" }}>{correct ? "✓" : "✗"}</span>
              </div>
            ) : null
          })}
        </div>
      )
    }
    if (q?.type === "matching") {
      const pairs: { left_id: string; right_id: string }[] = answer.answer_json?.pairs ?? []
      return (
        <div style={{ marginTop: 2 }}>
          {pairs.map((p, idx) => {
            const left = q.matching_pairs?.find((mp: any) => mp.id === p.left_id)
            const right = q.matching_pairs?.find((mp: any) => mp.id === p.right_id)
            const correct = left && right && left.right_item === right.right_item
            return (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 10, color: "#374151" }}>{left?.left_item}</span>
                <span style={{ fontSize: 10, color: "#9ca3af" }}>→</span>
                <span style={{ fontSize: 10, color: "#374151" }}>{right?.right_item}</span>
                <span style={{ fontSize: 10, color: correct ? "#16a34a" : "#dc2626" }}>{correct ? "✓" : "✗"}</span>
              </div>
            )
          })}
        </div>
      )
    }
    return null
  }

  return (
    <div style={{
      padding: "10px 12px",
      marginBottom: 8,
      border: "1px solid #e5e7eb",
      borderRadius: 8,
      background: "#fafafa",
      pageBreakInside: "avoid",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{
              fontSize: 9, fontWeight: 600, background: "#e5e7eb", color: "#374151",
              padding: "1px 6px", borderRadius: 4, textTransform: "uppercase",
            }}>
              {q?.type?.replace(/_/g, " ")}
            </span>
            <span style={{ fontSize: 9, color: "#9ca3af" }}>Q{index + 1}</span>
          </div>
          <p style={{ fontSize: 11, fontWeight: 500, color: "#111827", margin: 0, lineHeight: 1.4 }}>{q?.text}</p>
        </div>
        <div style={{ textAlign: "right", minWidth: 60 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor }}>
            {fmtPts(score)}
          </span>
          <span style={{ fontSize: 10, color: "#9ca3af" }}> / {fmtPts(maxScore)}</span>
        </div>
      </div>

      <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #e5e7eb" }}>
        <p style={{ fontSize: 9, fontWeight: 600, color: "#6b7280", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Candidate&apos;s Answer
        </p>
        {renderAnswer()}
      </div>

      {answer.ai_justification && (
        <div style={{ marginTop: 6, padding: "6px 8px", background: "#eff6ff", borderRadius: 6, border: "1px solid #bfdbfe" }}>
          <p style={{ fontSize: 9, fontWeight: 600, color: "#1d4ed8", marginBottom: 2 }}>Expert Evaluation</p>
          <p style={{ fontSize: 10, color: "#1e40af", lineHeight: 1.4 }}>{answer.ai_justification}</p>
        </div>
      )}
    </div>
  )
}

export default async function PrintExamResultsPage({ params, searchParams }: Props) {
  const { pdf_secret } = await searchParams
  const validSecret = process.env.PDF_INTERNAL_SECRET && pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
  }

  const { candidateId } = await params

  const { data: candidate } = await db
    .from("candidates")
    .select("*, exams(id, title, passing_score, courses(name, groups(name)))")
    .eq("id", candidateId)
    .single()

  if (!candidate) notFound()

  const { data: answers } = await db
    .from("candidate_answers")
    .select("*, questions(*, choices(*), matching_pairs(*), ordering_items(*))")
    .eq("candidate_id", candidateId)

  const sorted = (answers ?? []).sort(
    (a, b) => (a.questions?.order_index ?? 0) - (b.questions?.order_index ?? 0)
  )

  const exam = (candidate as any).exams
  const score: number = candidate.total_score ?? 0
  const passed: boolean = candidate.passed ?? false
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
  const submittedAt = candidate.submitted_at
    ? new Date(candidate.submitted_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "—"

  const totalPossible = sorted.reduce((s, a) => s + (a.questions?.score ?? 0), 0)
  const totalEarned = sorted.reduce((s, a) => s + (a.score_achieved ?? 0), 0)

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", background: "white", maxWidth: 800, margin: "0 auto", padding: "0 24px 40px" }}>

      {/* Header */}
      <div style={{ background: "#1B4F8A", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 -24px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Image src="/logo.png" alt="ICS Aviation" width={40} height={40} style={{ filter: "brightness(0) invert(1)", objectFit: "contain" }} />
          <div>
            <p style={{ color: "white", fontSize: 16, fontWeight: 700, margin: 0 }}>ICS Aviation Institute</p>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, margin: 0 }}>Exam Results — Confidential</p>
          </div>
        </div>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 10 }}>{today}</p>
      </div>

      {/* Candidate summary card */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>{candidate.full_name}</p>
          <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 2px" }}>{candidate.email}</p>
          <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 2px" }}>{candidate.company}</p>
          <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>Submitted: {submittedAt}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 4px" }}>{exam?.courses?.groups?.name} · {exam?.courses?.name}</p>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: "0 0 4px" }}>{exam?.title}</p>
          <div style={{
            display: "inline-block", padding: "4px 14px", borderRadius: 20,
            background: passed ? "#dcfce7" : "#fee2e2",
            color: passed ? "#166534" : "#991b1b",
            fontSize: 13, fontWeight: 700,
          }}>
            {score.toFixed(1)}% — {passed ? "PASSED" : "FAILED"}
          </div>
          <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>Passing score: {exam?.passing_score}%</p>
        </div>
      </div>

      {/* Score summary bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Questions", value: sorted.length },
          { label: "Points Earned", value: fmtPts(parseFloat(totalEarned.toFixed(2))) },
          { label: "Points Possible", value: fmtPts(parseFloat(totalPossible.toFixed(2))) },
          { label: "Final Score", value: `${score.toFixed(1)}%` },
        ].map(({ label, value }) => (
          <div key={label} style={{ flex: 1, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px" }}>
            <p style={{ fontSize: 9, color: "#6b7280", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Answers */}
      <h3 style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
        Answers ({sorted.length} questions)
      </h3>

      {sorted.map((answer, idx) => (
        <AnswerRow key={answer.id} answer={answer} index={idx} />
      ))}

      {/* Footer */}
      <div style={{ marginTop: 24, paddingTop: 12, borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between" }}>
        <p style={{ fontSize: 9, color: "#9ca3af" }}>ICS Aviation Institute — Confidential Document</p>
        <p style={{ fontSize: 9, color: "#9ca3af" }}>Generated {today}</p>
      </div>
    </div>
  )
}
