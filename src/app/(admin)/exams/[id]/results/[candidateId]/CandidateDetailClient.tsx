"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatScore, formatTimeSpent } from "@/lib/utils"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { FileText, ShieldAlert, ShieldCheck, Clock, Monitor, MousePointerClick, Copy, Download, Loader2, Sliders } from "lucide-react"
import AnswerCard from "@/components/admin/AnswerCard"
import { toast } from "sonner"

interface Props {
  candidate: any
  answers: any[]
  examId: string
  candidateId: string
  initialMode: "original" | "manual"
}

function SecurityTab({ candidate }: { candidate: any }) {
  const tabSwitches: { timestamp: string; duration: number | null }[] = candidate.tab_switches ?? []
  const fullscreenExits: number = candidate.fullscreen_exits ?? 0
  const rightClicks: number = candidate.right_click_attempts ?? 0
  const copyPaste: number = candidate.copy_paste_attempts ?? 0
  const total = tabSwitches.length + fullscreenExits

  const riskLevel = total === 0 ? "clean" : total <= 2 ? "medium" : "high"

  const riskBadge = {
    clean:  <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Clean</Badge>,
    medium: <Badge className="bg-amber-100 text-amber-700 border-0 gap-1"><ShieldAlert className="h-3.5 w-3.5" /> Medium Risk</Badge>,
    high:   <Badge className="bg-red-100 text-red-700 border-0 gap-1"><ShieldAlert className="h-3.5 w-3.5" /> High Risk</Badge>,
  }[riskLevel]

  function formatDuration(sec: number | null) {
    if (!sec || sec < 1) return "< 1 sec"
    if (sec < 60) return `${sec} sec`
    return `${Math.floor(sec / 60)}m ${sec % 60}s`
  }

  return (
    <div className="space-y-4">
      {/* Risk summary */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Security Report</h3>
            {riskBadge}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Tab Switches", value: tabSwitches.length, icon: Monitor, color: tabSwitches.length > 2 ? "text-red-500" : tabSwitches.length > 0 ? "text-amber-600" : "text-emerald-600" },
              { label: "Fullscreen Exits", value: fullscreenExits, icon: Monitor, color: fullscreenExits > 2 ? "text-red-500" : fullscreenExits > 0 ? "text-amber-600" : "text-emerald-600" },
              { label: "Right-click Attempts", value: rightClicks, icon: MousePointerClick, color: rightClicks > 5 ? "text-red-500" : rightClicks > 0 ? "text-amber-600" : "text-emerald-600" },
              { label: "Copy/Cut Attempts", value: copyPaste, icon: Copy, color: copyPaste > 3 ? "text-red-500" : copyPaste > 0 ? "text-amber-600" : "text-emerald-600" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="text-xs">{label}</span>
                </div>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tab switch timeline */}
      {tabSwitches.length > 0 && (
        <Card>
          <CardContent className="pt-5 pb-4">
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" /> Tab Switch Timeline
            </h4>
            <div className="space-y-2">
              {tabSwitches.map((sw, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs flex items-center justify-center font-medium">{i + 1}</span>
                    <span className="text-muted-foreground">
                      {new Date(sw.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>
                  <span className={`font-medium text-xs ${sw.duration && sw.duration > 30 ? "text-red-500" : "text-amber-600"}`}>
                    Away for {formatDuration(sw.duration)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {total === 0 && rightClicks === 0 && copyPaste === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            <ShieldCheck className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            No suspicious activity detected.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function CandidateDetailClient({ candidate: realCandidate, answers: realAnswers, examId, candidateId, initialMode }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<"original" | "manual">(initialMode)

  const [manualData, setManualData] = useState<{ candidate: any; answers: any[]; manualScore: any } | null>(null)
  const [manualLoading, setManualLoading] = useState(false)

  useEffect(() => {
    if (mode !== "manual") return
    setManualLoading(true)
    fetch(`/api/candidates/${candidateId}/manual-score/answers`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => setManualData(data))
      .catch(() => { toast.error("No active manual score for this candidate"); setManualData(null) })
      .finally(() => setManualLoading(false))
  }, [mode, candidateId])

  const candidate = mode === "manual" && manualData ? manualData.candidate : realCandidate
  const answers = mode === "manual" && manualData ? manualData.answers : realAnswers

  const exam = candidate.exams as any
  const [totalScore, setTotalScore] = useState<number>(realCandidate.total_score ?? 0)
  const [passed, setPassed] = useState<boolean>(realCandidate.passed ?? false)
  const [activeTab, setActiveTab] = useState<"answers" | "security">("answers")
  const [downloadingPDF, setDownloadingPDF] = useState(false)

  const displayScore = mode === "manual" && manualData ? manualData.candidate.total_score : totalScore
  const displayPassed = mode === "manual" && manualData ? manualData.candidate.passed : passed

  function handleScoreUpdate(_answerId: string, _newScore: number, newTotal: number, newPassed: boolean) {
    setTotalScore(newTotal)
    setPassed(newPassed)
  }

  function switchMode(next: "original" | "manual") {
    setMode(next)
    router.replace(next === "manual" ? "?mode=manual" : "?")
  }

  async function downloadPDF() {
    setDownloadingPDF(true)
    toast.info("Generating PDF — this may take a few seconds…")
    try {
      const res = await fetch(`/api/reports/exam-results/${candidateId}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? "PDF generation failed. Please try again.")
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      const cd   = res.headers.get("Content-Disposition") ?? ""
      const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i)
      a.download = match ? decodeURIComponent(match[1]) : `${candidate.full_name} - Results.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("PDF downloaded successfully")
    } catch {
      toast.error("Failed to download PDF. Please try again.")
    } finally {
      setDownloadingPDF(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Original / Manual toggle */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
        <button
          onClick={() => switchMode("original")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === "original" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Original
        </button>
        <button
          onClick={() => switchMode("manual")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${mode === "manual" ? "bg-white shadow-sm text-purple-700" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Sliders className="h-3 w-3" /> Manual
        </button>
      </div>

      {mode === "manual" && manualLoading && (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading manual score…</p>
      )}
      {mode === "manual" && !manualLoading && !manualData && (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">No active manual score for this candidate yet — create one from the results table.</CardContent></Card>
      )}

      {(mode === "original" || manualData) && (
      <>
      {/* Candidate summary */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">{candidate.full_name}</h2>
              <p className="text-sm text-muted-foreground">{candidate.email} · {candidate.company}</p>
              <p className="text-sm text-muted-foreground">{candidate.job_title} · {candidate.years_of_experience}yr exp</p>
              {candidate.submitted_at && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  Time spent: <span className="font-medium text-slate-700">{formatTimeSpent(candidate.started_at, candidate.submitted_at, exam?.duration_minutes)}</span>
                </p>
              )}
              {mode === "manual" && manualData?.manualScore && (
                <Badge className="bg-purple-100 text-purple-700 border-0 mt-2">
                  Manual score {!manualData.manualScore.is_exact_match ? "(closest achievable)" : ""}
                </Badge>
              )}
            </div>
            <div className="text-right space-y-2">
              <p className={`text-3xl font-bold ${displayPassed ? "text-emerald-600" : "text-red-500"}`}>
                {formatScore(displayScore)}
              </p>
              <Badge className={displayPassed ? "bg-emerald-100 text-emerald-700 border-0" : "bg-red-100 text-red-700 border-0"}>
                {displayPassed ? "Passed" : "Failed"} · Passing: {exam?.passing_score}%
              </Badge>
              <div className="flex gap-2">
                {mode === "original" && (
                  <Button
                    size="sm" variant="outline" className="gap-2"
                    onClick={downloadPDF} disabled={downloadingPDF}
                  >
                    {downloadingPDF
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                      : <><Download className="h-4 w-4" /> Download Results</>
                    }
                  </Button>
                )}
                <Link href={`/reports/candidate/${candidateId}${mode === "manual" ? "?mode=manual" : ""}`} target="_blank">
                  <Button size="sm" className="gap-2 bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
                    <FileText className="h-4 w-4" /> View Results
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab("answers")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "answers" ? "border-[#1B4F8A] text-[#1B4F8A]" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Answers ({answers.length})
        </button>
        <button
          onClick={() => setActiveTab("security")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === "security" ? "border-[#1B4F8A] text-[#1B4F8A]" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <ShieldAlert className="h-3.5 w-3.5" /> Security
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "answers" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Answers ({answers.length} questions)
            </h3>
            <p className="text-xs text-muted-foreground">
              {mode === "manual" ? "Manual (client) view — scores are not editable here" : "Click the pencil icon to override any score"}
            </p>
          </div>
          {answers.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No answers recorded.
              </CardContent>
            </Card>
          ) : (
            answers.map((answer, idx) => (
              <AnswerCard
                key={answer.id}
                answer={answer}
                index={idx}
                onScoreUpdate={mode === "original" ? handleScoreUpdate : undefined}
                readOnly={mode === "manual"}
              />
            ))
          )}
        </div>
      )}

      {activeTab === "security" && <SecurityTab candidate={candidate} />}
      </>
      )}
    </div>
  )
}
