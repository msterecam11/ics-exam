import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Image from "next/image"
import { Separator } from "@/components/ui/separator"
import { ExternalLink } from "lucide-react"

interface Props {
  params: Promise<{ examId: string }>
  searchParams: Promise<{ pdf_secret?: string }>
}

export default async function PrintInvitationPage({ params, searchParams }: Props) {
  const { pdf_secret } = await searchParams
  const validSecret = process.env.PDF_INTERNAL_SECRET && pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
  }

  const { examId } = await params
  const { data: exam } = await db
    .from("exams")
    .select("*, courses(name, groups(name))")
    .eq("id", examId)
    .single()

  if (!exam) notFound()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const examUrl = `${appUrl}/exam/${examId}`
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })

  return (
    <div style={{ background: "white", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px" }}>
      <div id="invitation-card" style={{ width: 680, border: "2px solid #1B4F8A", borderRadius: 16, overflow: "hidden", background: "white" }}>

        {/* Header */}
        <div style={{ background: "#1B4F8A", padding: "24px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Image src="/logo/logo-white.png" alt="ICS Aviation" width={160} height={44} style={{ objectFit: "contain" }} />
          <div style={{ textAlign: "right" }}>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, textTransform: "uppercase", letterSpacing: 2, margin: 0 }}>Examination Notice</p>
            <p style={{ color: "white", fontSize: 11, margin: "4px 0 0" }}>{today}</p>
          </div>
        </div>

        <div style={{ padding: "28px 32px" }}>
          <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>

            {/* Left */}
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 2, margin: "0 0 3px" }}>Course</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#334155", margin: "0 0 16px" }}>
                {(exam as any).courses?.groups?.name} — {(exam as any).courses?.name}
              </p>

              <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 2, margin: "0 0 3px" }}>Examination</p>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: "#1B4F8A", margin: "0 0 4px" }}>{exam.title}</h2>
              {exam.description && (
                <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 16px" }}>{exam.description}</p>
              )}

              {/* Stats */}
              <div style={{ display: "flex", gap: 12, margin: "16px 0" }}>
                <div style={{ flex: 1, background: "#f1f5fb", borderRadius: 10, padding: "10px 14px" }}>
                  <p style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 2px" }}>Duration</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: "#1B4F8A", margin: 0 }}>{exam.duration_minutes} min</p>
                </div>
                <div style={{ flex: 1, background: "#f1f5fb", borderRadius: 10, padding: "10px 14px" }}>
                  <p style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 2px" }}>Pass Score</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: "#1B4F8A", margin: 0 }}>{exam.passing_score}%</p>
                </div>
              </div>

              {/* Password */}
              <div style={{ background: "#1B4F8A", borderRadius: 10, padding: "14px 18px", margin: "0 0 16px" }}>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 9, textTransform: "uppercase", letterSpacing: 2, margin: "0 0 4px" }}>Access Password</p>
                <p style={{ color: "white", fontSize: 28, fontWeight: 800, letterSpacing: 8, margin: "0 0 2px" }}>{exam.password}</p>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, margin: 0 }}>Enter this when prompted</p>
              </div>

              {/* Steps */}
              <p style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 2, margin: "0 0 6px" }}>How to start</p>
              <ol style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "#64748b", lineHeight: 1.8 }}>
                <li>Scan the QR code or click the link</li>
                <li>Enter the password shown above</li>
                <li>Fill in your details and begin the exam</li>
              </ol>
            </div>

            {/* Right: QR */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: 8 }}>
              <div style={{ border: "2px solid #1B4F8A", borderRadius: 14, padding: 12, background: "white" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(examUrl)}&size=160x160&color=1B4F8A&bgcolor=FFFFFF&margin=4`}
                  alt="QR Code"
                  width={160}
                  height={160}
                />
              </div>
              <a href={examUrl} target="_blank" rel="noopener noreferrer"
                style={{ border: "1px solid #1B4F8A", borderRadius: 8, padding: "6px 14px", fontSize: 10, color: "#1B4F8A", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                Open Exam Link
              </a>
            </div>
          </div>

          {/* Footer */}
          <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 20, paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
            <p style={{ fontSize: 10, color: "#94a3b8", margin: 0 }}>ICS Aviation — Integrated Consulting Services</p>
            <p style={{ fontSize: 10, color: "#94a3b8", margin: 0 }}>Good luck!</p>
          </div>
        </div>
      </div>
    </div>
  )
}
