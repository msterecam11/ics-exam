import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { notFound, redirect } from "next/navigation"

interface Props {
  params: Promise<{ candidateId: string }>
  searchParams: Promise<{ pdf_secret?: string }>
}

export default async function PrintReceiptPage({ params, searchParams }: Props) {
  const { pdf_secret } = await searchParams
  const validSecret = process.env.NEXTAUTH_SECRET && pdf_secret === process.env.NEXTAUTH_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
  }

  const { candidateId } = await params
  const { data: candidate } = await db
    .from("candidates")
    .select("*, exams(title)")
    .eq("id", candidateId)
    .single()

  if (!candidate) notFound()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const examId = (candidate as any).exams ? candidate.exam_id : ""
  const resultUrl = `${appUrl}/exam/${examId}/results?candidate=${candidateId}`

  const submitted = candidate.submitted_at
    ? new Date(candidate.submitted_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : ""

  const status: "pending" | "passed" | "failed" =
    candidate.passed === true ? "passed" : candidate.passed === false ? "failed" : "pending"

  const score = candidate.total_score

  const badgeStyle = {
    pending: { bg: "#fef9c3", color: "#92400e", label: "Awaiting Results Release" },
    passed:  { bg: "#dcfce7", color: "#166534", label: score != null ? `Passed — ${Number(score).toFixed(1)}%` : "Passed" },
    failed:  { bg: "#fee2e2", color: "#991b1b", label: score != null ? `Not Passed — ${Number(score).toFixed(1)}%` : "Not Passed" },
  }[status]

  const message = {
    pending: `Thank you for completing your exam. Your instructor will notify you once your results are released.`,
    passed:  `Congratulations on passing the exam! We're proud of your achievement.`,
    failed:  `Thank you for taking the exam. Keep practising — we believe in your progress.`,
  }[status]

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(resultUrl)}&size=160x160&color=1B4F8A&bgcolor=FFFFFF&margin=4`

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div id="receipt-card" style={{ background: "white", borderRadius: 16, overflow: "hidden", width: 380 }}>

        {/* Header */}
        <div style={{ background: "#1B4F8A", padding: "20px 24px", textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${appUrl}/logo/logo-white.png`} alt="ICS Aviation" style={{ height: 36, objectFit: "contain", marginBottom: 6 }} />
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", margin: 0 }}>EXAM SUBMISSION RECEIPT</p>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", textAlign: "center" }}>
          <p style={{ fontSize: 11, color: "#475569", margin: "0 0 14px", lineHeight: 1.6 }}>{message}</p>

          <p style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>{candidate.full_name}</p>
          <p style={{ fontSize: 12, color: "#1B4F8A", margin: "0 0 4px" }}>{(candidate as any).exams?.title}</p>
          <p style={{ fontSize: 11, color: "#475569", margin: "0 0 14px" }}>Submitted: {submitted}</p>

          {/* Status badge */}
          <div style={{ display: "inline-block", background: badgeStyle.bg, borderRadius: 20, padding: "5px 16px", marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: badgeStyle.color }}>{badgeStyle.label}</span>
          </div>

          {/* Divider */}
          <div style={{ borderTop: "1px solid #e2e8f0", margin: "0 0 16px" }} />

          {/* QR */}
          <p style={{ fontSize: 11, color: "#475569", margin: "0 0 10px" }}>Scan to view your results anytime</p>
          <div style={{ display: "inline-block", border: "1px solid #e2e8f0", borderRadius: 10, padding: 8, marginBottom: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR Code" width={130} height={130} />
          </div>

          <p style={{ fontSize: 10, color: "#1B4F8A", margin: "0 0 14px", wordBreak: "break-all" }}>{resultUrl}</p>
          <p style={{ fontSize: 10, color: "#94a3b8", margin: 0 }}>Keep this receipt as proof of exam submission.</p>
        </div>

        {/* Footer */}
        <div style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0", padding: "10px 24px", textAlign: "center" }}>
          <p style={{ fontSize: 9, color: "#94a3b8", margin: 0, letterSpacing: 0.5 }}>ICS Aviation — Exam Platform</p>
        </div>
      </div>
    </div>
  )
}
