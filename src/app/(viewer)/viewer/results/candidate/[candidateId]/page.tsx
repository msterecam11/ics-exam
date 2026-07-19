"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Loader2, AlertCircle, ArrowLeft, ShieldAlert, ShieldCheck, Monitor, MousePointerClick, Copy } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatScore } from "@/lib/utils"
import AnswerCard from "@/components/admin/AnswerCard"

// ─── Security tab (read-only, mirrors admin SecurityTab) ────────────────────
function SecurityTab({ candidate }: { candidate: any }) {
  const tabSwitches: { timestamp: string; duration: number | null }[] = candidate.tab_switches ?? []
  const fullscreenExits: number = candidate.fullscreen_exits ?? 0
  const rightClicks: number    = candidate.right_click_attempts ?? 0
  const copyPaste: number      = candidate.copy_paste_attempts ?? 0
  const total = tabSwitches.length + fullscreenExits

  const riskLevel = total === 0 ? "clean" : total <= 2 ? "medium" : "high"
  const riskBadge = {
    clean:  <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Clean</Badge>,
    medium: <Badge className="bg-amber-100  text-amber-700  border-0 gap-1"><ShieldAlert className="h-3.5 w-3.5" /> Medium Risk</Badge>,
    high:   <Badge className="bg-red-100    text-red-700    border-0 gap-1"><ShieldAlert className="h-3.5 w-3.5" /> High Risk</Badge>,
  }[riskLevel]

  function fmt(sec: number | null) {
    if (!sec || sec < 1) return "< 1 sec"
    if (sec < 60) return `${sec} sec`
    return `${Math.floor(sec / 60)}m ${sec % 60}s`
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Security Report</h3>
            {riskBadge}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Tab Switches",      value: tabSwitches.length, icon: Monitor,          color: tabSwitches.length > 2 ? "text-red-500" : tabSwitches.length > 0 ? "text-amber-600" : "text-emerald-600" },
              { label: "Fullscreen Exits",  value: fullscreenExits,    icon: Monitor,          color: fullscreenExits > 2 ? "text-red-500" : fullscreenExits > 0 ? "text-amber-600" : "text-emerald-600" },
              { label: "Right-click Attempts", value: rightClicks,     icon: MousePointerClick, color: rightClicks > 5 ? "text-red-500" : rightClicks > 0 ? "text-amber-600" : "text-emerald-600" },
              { label: "Copy/Cut Attempts", value: copyPaste,          icon: Copy,             color: copyPaste > 3 ? "text-red-500" : copyPaste > 0 ? "text-amber-600" : "text-emerald-600" },
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

      {tabSwitches.length > 0 && (
        <Card>
          <CardContent className="pt-5 pb-4">
            <h3 className="font-semibold mb-3">Tab Switch Timeline</h3>
            <div className="space-y-2">
              {tabSwitches.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <span className="text-muted-foreground">Switch #{i + 1}</span>
                  <span className="text-muted-foreground">{new Date(t.timestamp).toLocaleTimeString()}</span>
                  <span>{fmt(t.duration)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────
export default function ViewerCandidateReportPage() {
  const { candidateId } = useParams<{ candidateId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode: "original" | "manual" = searchParams.get("mode") === "manual" ? "manual" : "original"

  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [tab,     setTab]     = useState<"answers" | "security">("answers")

  useEffect(() => {
    setLoading(true)
    setError(null)
    const url = mode === "manual" ? `/api/viewer/manual-results/${candidateId}` : `/api/viewer/exam-result/${candidateId}`
    fetch(url)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d) })
      .catch(() => setError("Failed to load report"))
      .finally(() => setLoading(false))
  }, [candidateId, mode])

  function switchMode(next: "original" | "manual") {
    router.replace(next === "manual" ? "?mode=manual" : "?")
  }

  const candidate = data?.candidate
  const exam      = candidate?.exams as any
  const answers: any[] = data?.answers ?? []

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Back bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/viewer")}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#1B4F8A] transition-colors">
            <ArrowLeft className="h-4 w-4" />Back to Dashboard
          </button>
          {candidate && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-sm font-medium text-slate-700">{candidate.full_name}</span>
              <span className="text-slate-300">·</span>
              <span className="text-sm text-slate-400">{exam?.title}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => switchMode("original")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${mode === "original" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Original
          </button>
          <button
            onClick={() => switchMode("manual")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${mode === "manual" ? "bg-white shadow-sm text-purple-700" : "text-muted-foreground hover:text-foreground"}`}
          >
            Manual
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-6 w-6 animate-spin text-[#1B4F8A]" />
        </div>
      ) : error || !data ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-slate-600 text-sm">{error ?? "Report not available"}</p>
          <button onClick={() => router.push("/viewer")} className="text-sm font-medium text-[#1B4F8A] hover:underline">
            Return to Dashboard
          </button>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          {/* Candidate summary card */}
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{candidate.full_name}</h2>
                  <p className="text-sm text-muted-foreground">{candidate.email} · {candidate.company}</p>
                  <p className="text-sm text-muted-foreground">{candidate.job_title}</p>
                </div>
                <div className="text-right space-y-2">
                  <p className={`text-3xl font-bold ${candidate.passed ? "text-emerald-600" : "text-red-500"}`}>
                    {candidate.total_score != null ? formatScore(candidate.total_score) : "—"}
                  </p>
                  <Badge className={candidate.passed ? "bg-emerald-100 text-emerald-700 border-0" : "bg-red-100 text-red-700 border-0"}>
                    {candidate.passed ? "Passed" : "Failed"} · Passing: {exam?.passing_score}%
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setTab("answers")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "answers" ? "border-[#1B4F8A] text-[#1B4F8A]" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              Answers ({answers.length})
            </button>
            <button
              onClick={() => setTab("security")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${tab === "security" ? "border-[#1B4F8A] text-[#1B4F8A]" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <ShieldAlert className="h-3.5 w-3.5" />Security
            </button>
          </div>

          {/* Answers tab */}
          {tab === "answers" && (
            <div className="space-y-4">
              {answers.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground text-sm">
                    No answers recorded.
                  </CardContent>
                </Card>
              ) : (
                answers.map((answer, idx) => (
                  <AnswerCard key={answer.id} answer={answer} index={idx} readOnly />
                ))
              )}
            </div>
          )}

          {/* Security tab */}
          {tab === "security" && <SecurityTab candidate={candidate} />}
        </div>
      )}
    </div>
  )
}
