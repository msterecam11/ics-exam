"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, Clock, Loader2, Trophy, Lock, Download, QrCode } from "lucide-react"
import { Suspense } from "react"
import QRCode from "qrcode"
import type { ReceiptStatus } from "@/components/ReceiptPDF"

// ── Shared receipt download helper ────────────────────────────────────────────

async function downloadReceipt({
  candidateName,
  examTitle,
  submittedAt,
  resultUrl,
  status,
  score,
}: {
  candidateName : string
  examTitle     : string
  submittedAt   : string
  resultUrl     : string
  status        : ReceiptStatus
  score?        : number
}) {
  const qrDataUrl = await QRCode.toDataURL(resultUrl, {
    width: 220,
    margin: 1,
    color: { dark: "#1B4F8A", light: "#ffffff" },
  })

  const [{ pdf }, { ReceiptPDF }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/ReceiptPDF"),
  ])

  const blob = await pdf(
    React.createElement(ReceiptPDF, {
      candidateName,
      examTitle,
      submittedAt,
      qrDataUrl,
      resultUrl,
      status,
      score,
    })
  ).toBlob()

  const url = URL.createObjectURL(blob)
  const a   = document.createElement("a")
  a.href     = url
  a.download = `ICS-Receipt-${candidateName.replace(/\s+/g, "-")}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Pending screen ────────────────────────────────────────────────────────────

function PendingScreen({
  candidate,
  examId,
  candidateId,
}: {
  candidate   : any
  examId      : string
  candidateId : string
}) {
  const [qrDataUrl,  setQrDataUrl]  = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const resultUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/exam/${examId}/results?candidate=${candidateId}`
      : ""

  useEffect(() => {
    if (!resultUrl) return
    QRCode.toDataURL(resultUrl, {
      width: 220,
      margin: 1,
      color: { dark: "#1B4F8A", light: "#ffffff" },
    }).then(setQrDataUrl)
  }, [resultUrl])

  async function handleDownload() {
    if (!qrDataUrl) return
    setDownloading(true)
    try {
      await downloadReceipt({
        candidateName : candidate.full_name ?? "Candidate",
        examTitle     : candidate?.exams?.title ?? "Exam",
        submittedAt   : candidate.submitted_at ?? new Date().toISOString(),
        resultUrl,
        status        : "pending",
      })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Status card */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-8 text-center">
          <Lock className="h-11 w-11 text-amber-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-amber-800">Results Pending</h3>
          <p className="text-amber-700 text-sm mt-2 max-w-xs mx-auto leading-relaxed">
            Thank you for completing your exam! Your results will be released by
            your instructor — you&apos;ll be notified when they&apos;re ready.
          </p>
          {candidate?.submitted_at && (
            <p className="text-xs text-amber-600 mt-3 font-medium">
              Submitted:{" "}
              {new Date(candidate.submitted_at).toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* QR + Receipt card */}
      <Card className="border-[#1B4F8A]/20">
        <CardContent className="py-6 flex flex-col items-center text-center gap-4">
          <div className="flex items-center gap-2 text-[#1B4F8A]">
            <QrCode className="h-5 w-5" />
            <span className="font-semibold text-sm">Check your results anytime</span>
          </div>

          <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
            Scan this QR code or tap the link below — no need to remember the
            URL. Bookmark this page or save the receipt.
          </p>

          {/* QR code */}
          <div className="p-3 border border-slate-200 rounded-xl bg-white shadow-sm">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Results QR code"
                width={180}
                height={180}
                className="rounded"
              />
            ) : (
              <div className="w-[180px] h-[180px] flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#1B4F8A]" />
              </div>
            )}
          </div>

          {/* Clickable link */}
          {resultUrl && (
            <a
              href={resultUrl}
              className="text-xs text-[#1B4F8A] underline underline-offset-2 break-all max-w-xs"
            >
              {resultUrl}
            </a>
          )}

          {/* Download button */}
          <Button
            onClick={handleDownload}
            disabled={downloading || !qrDataUrl}
            className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2 w-full max-w-xs"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {downloading ? "Generating receipt…" : "Download PDF Receipt"}
          </Button>

          <p className="text-[11px] text-muted-foreground max-w-xs">
            The receipt includes the QR code and serves as proof of submission.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Results receipt button (score released) ───────────────────────────────────

function ScoreReceiptButton({
  candidate,
  examId,
  candidateId,
}: {
  candidate   : any
  examId      : string
  candidateId : string
}) {
  const [downloading, setDownloading] = useState(false)

  const resultUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/exam/${examId}/results?candidate=${candidateId}`
      : ""

  async function handleDownload() {
    setDownloading(true)
    try {
      await downloadReceipt({
        candidateName : candidate.full_name ?? "Candidate",
        examTitle     : candidate?.exams?.title ?? "Exam",
        submittedAt   : candidate.submitted_at ?? new Date().toISOString(),
        resultUrl,
        status        : candidate.passed ? "passed" : "failed",
        score         : candidate.total_score ?? undefined,
      })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Button
      onClick={handleDownload}
      disabled={downloading}
      variant="outline"
      className="gap-2 border-[#1B4F8A]/30 text-[#1B4F8A] hover:bg-[#1B4F8A]/5"
    >
      {downloading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {downloading ? "Generating…" : "Download Receipt"}
    </Button>
  )
}

// ── Main result content ───────────────────────────────────────────────────────

function ResultContent({ examId }: { examId: string }) {
  const searchParams = useSearchParams()
  const candidateId  = searchParams.get("candidate")
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!candidateId) return
    fetch(`/api/candidates/${candidateId}/answers`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
  }, [candidateId])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#1B4F8A]" />
      </div>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Result not found.</p>
        </CardContent>
      </Card>
    )
  }

  if (!data.visible) {
    return (
      <PendingScreen
        candidate={data.candidate}
        examId={examId}
        candidateId={candidateId!}
      />
    )
  }

  const { candidate, answers } = data
  const passed = candidate.passed
  const score  = candidate.total_score

  return (
    <div className="space-y-5">
      {/* Score card */}
      <Card className={`border-2 ${passed ? "border-emerald-300 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
        <CardContent className="py-8 text-center">
          <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-4 ${passed ? "bg-emerald-100" : "bg-red-100"}`}>
            {passed
              ? <Trophy className="h-10 w-10 text-emerald-600" />
              : <XCircle className="h-10 w-10 text-red-500" />
            }
          </div>
          <h2 className={`text-4xl font-bold ${passed ? "text-emerald-700" : "text-red-600"}`}>
            {score?.toFixed(1)}%
          </h2>
          <p className={`text-lg font-semibold mt-1 ${passed ? "text-emerald-700" : "text-red-600"}`}>
            {passed ? "Passed" : "Not Passed"}
          </p>
          <p className="text-sm text-muted-foreground mt-2">{candidate.full_name}</p>

          {/* Receipt download */}
          <div className="mt-5">
            <ScoreReceiptButton
              candidate={candidate}
              examId={examId}
              candidateId={candidateId!}
            />
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label : "Correct",
            value : answers?.filter((a: any) => a.score_achieved > 0).length ?? 0,
            icon  : CheckCircle2,
            color : "text-emerald-600",
          },
          {
            label : "Incorrect",
            value : answers?.filter((a: any) => a.score_achieved === 0).length ?? 0,
            icon  : XCircle,
            color : "text-red-500",
          },
          {
            label : "Total",
            value : answers?.length ?? 0,
            icon  : Clock,
            color : "text-[#1B4F8A]",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="py-4 text-center">
              <Icon className={`h-5 w-5 mx-auto mb-1 ${color}`} />
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Answer review */}
      <div>
        <h3 className="font-semibold text-base mb-3">Answer Review</h3>
        <div className="space-y-3">
          {answers?.map((answer: any, i: number) => {
            const q       = answer.questions
            const correct = (answer.score_achieved ?? 0) >= q.score
            const partial = (answer.score_achieved ?? 0) > 0 && !correct

            return (
              <Card
                key={answer.id}
                className={`border-l-4 ${correct ? "border-l-emerald-400" : partial ? "border-l-amber-400" : "border-l-red-400"}`}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground font-medium">Q{i + 1}</span>
                        <Badge variant="outline" className="text-xs">{q.type.replace("_", " ")}</Badge>
                      </div>
                      <p className="text-sm font-medium">{q.text}</p>

                      {q.type === "open_ended" && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs text-muted-foreground">Your answer:</p>
                          <p className="text-sm bg-slate-50 p-2 rounded">{answer.answer_text || "(no answer)"}</p>
                          {answer.ai_justification && (
                            <p className="text-xs text-purple-600 italic">AI: {answer.ai_justification}</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-bold text-sm ${correct ? "text-emerald-600" : partial ? "text-amber-600" : "text-red-500"}`}>
                        {answer.score_achieved ?? 0}/{q.score}
                      </p>
                      <p className="text-xs text-muted-foreground">pts</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Page shell ────────────────────────────────────────────────────────────────

export default function CandidateResultsPage({ params }: { params: Promise<{ examId: string }> }) {
  const [examId, setExamId] = useState("")
  useEffect(() => { params.then(({ examId: id }) => setExamId(id)) }, [params])

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="bg-[#1B4F8A] text-white py-4 px-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Image src="/logo/logo-white.png" alt="ICS Aviation" width={120} height={33} className="object-contain" />
          <span className="text-sm opacity-70 border-l border-white/20 pl-3">Exam Results</span>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-[#1B4F8A]" /></div>}>
          <ResultContent examId={examId} />
        </Suspense>
      </div>
    </div>
  )
}
