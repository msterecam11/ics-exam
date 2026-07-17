"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import ScoreBar from "@/components/reports/ScoreBar"
import { Button } from "@/components/ui/button"
import {
  Loader2, BrainCircuit, RefreshCw, AlertCircle,
  ArrowLeft, Printer, CheckCircle2, XCircle,
  MinusCircle, Trophy, Target, TrendingUp, Medal, Lightbulb, ShieldAlert
} from "lucide-react"
import { toast } from "sonner"
import TerminologyModal from "@/components/reports/TerminologyModal"
import { makeT, type EntityTerm, type ContentTerm } from "@/lib/reportTerms"
import { formatTimeSpent } from "@/lib/utils"

// ─── Helpers ────────────────────────────────────────────────────────────────

function scoreColor(pct: number) {
  if (pct >= 80) return { text: "#10b981", bg: "#d1fae5", border: "#a7f3d0" }
  if (pct >= 60) return { text: "#f59e0b", bg: "#fef3c7", border: "#fde68a" }
  return { text: "#ef4444", bg: "#fee2e2", border: "#fca5a5" }
}

// Manual report only — letter-grade presentation (A/B/C/D) instead of raw
// percentages/fractions, per client-report requirements: A=90-100 (green),
// B=75-89 (blue), C=55-74 (amber), D=0-54 (red).
function letterGrade(pct: number): { letter: "A" | "B" | "C" | "D"; text: string; bg: string; border: string } {
  if (pct >= 90) return { letter: "A", text: "#10b981", bg: "#d1fae5", border: "#a7f3d0" }
  if (pct >= 75) return { letter: "B", text: "#2563eb", bg: "#dbeafe", border: "#bfdbfe" }
  if (pct >= 55) return { letter: "C", text: "#f59e0b", bg: "#fef3c7", border: "#fde68a" }
  return { letter: "D", text: "#ef4444", bg: "#fee2e2", border: "#fca5a5" }
}

// ─── Cover score ring ────────────────────────────────────────────────────────

function CoverRing({ score, passed }: { score: number; passed: boolean }) {
  const size = 164, sw = 12, r = (size - sw) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(score, 100) / 100)
  const col = passed ? "#34d399" : "#f87171"
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={sw} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col}
          strokeWidth={sw} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="text-3xl font-extrabold text-white leading-none">{score.toFixed(1)}%</span>
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: col }}>
          {passed ? "● Passed" : "● Failed"}
        </span>
      </div>
    </div>
  )
}

// ─── Page wrapper ────────────────────────────────────────────────────────────

function Page({ children, dark = false, first = false }: {
  children: React.ReactNode; dark?: boolean; first?: boolean
}) {
  return (
    <div
      className={`relative w-full flex flex-col ${dark ? "bg-[#1B4F8A]" : "bg-white"} ${first ? "" : "page-break"}`}
      style={{ minHeight: first ? 1122 : undefined }}
    >
      {children}
    </div>
  )
}

function PageDivider({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 px-12 pt-8 pb-2">
      <div className="h-0.5 w-6 bg-[#1B4F8A]" />
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#1B4F8A]">{title}</p>
      <div className="h-px flex-1 bg-slate-100" />
    </div>
  )
}

function PageHeader({ light = false, title, subtitle, today, extraLogos = [] }: {
  light?: boolean; title: string; subtitle?: string; today: string; extraLogos?: string[]
}) {
  return (
    <div className={`flex items-center justify-between px-12 pt-8 pb-5 border-b shrink-0
      ${light ? "border-white/15" : "border-[#1B4F8A] border-b-2"}`}>
      <div className="flex items-center gap-4">
        <Image
          src={light ? "/logo/logo-white.png" : "/logo/logo-dark-blue.png"}
          alt="ICS Aviation" width={110} height={30} className="object-contain"
        />
        {extraLogos.length > 0 && (
          <div className="flex items-center gap-3 pl-4 border-l" style={{ borderColor: light ? "rgba(255,255,255,0.15)" : "#e2e8f0" }}>
            {extraLogos.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt="Client logo" className="h-7 max-w-[90px] object-contain" />
            ))}
          </div>
        )}
      </div>
      <div className="text-right">
        <p className={`text-[10px] font-bold uppercase tracking-widest ${light ? "text-white/70" : "text-[#1B4F8A]"}`}>{title}</p>
        {subtitle && <p className={`text-[10px] mt-0.5 ${light ? "text-white/40" : "text-slate-400"}`}>{subtitle}</p>}
        <p className={`text-[10px] mt-0.5 ${light ? "text-white/40" : "text-slate-400"}`}>{today}</p>
      </div>
    </div>
  )
}

function PageFooter({ page, total, light = false }: { page: number; total: number; light?: boolean }) {
  return (
    <div className={`px-12 py-4 border-t shrink-0 flex items-center justify-between mt-8
      ${light ? "border-white/10" : "border-slate-100"}`}>
      <p className={`text-[9px] uppercase tracking-widest ${light ? "text-white/30" : "text-slate-300"}`}>
        ICS Aviation · Integrated Consulting Services · Confidential
      </p>
      <p className={`text-[9px] ${light ? "text-white/30" : "text-slate-300"}`}>Page {page} of {total}</p>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function CandidateReportPage() {
  const { candidateId } = useParams<{ candidateId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode: "original" | "manual" = searchParams.get("mode") === "manual" ? "manual" : "original"
  const basePath = mode === "manual"
    ? `/api/reports/candidate/${candidateId}/manual`
    : `/api/reports/candidate/${candidateId}`
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generatingAI, setGeneratingAI] = useState(false)

  // ── Terminology state ──
  const [showModal, setShowModal] = useState(true)
  const [entityTerm, setEntityTerm] = useState<EntityTerm>("Group")
  const [contentTerm, setContentTerm] = useState<ContentTerm>("Course")
  const [includeSecurity, setIncludeSecurity] = useState(false)
  const t = makeT(entityTerm, contentTerm)

  useEffect(() => {
    setLoading(true)
    fetch(basePath)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [candidateId, basePath])

  function switchMode(next: "original" | "manual") {
    router.replace(next === "manual" ? "?mode=manual" : "?")
  }

  async function generateNarrative() {
    setGeneratingAI(true)
    const res = await fetch(basePath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includeSecurity }),
    })
    setGeneratingAI(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Failed to generate expert report")
      return
    }
    const result = await res.json()
    setData((prev: any) => ({ ...prev, narrative: result.narrative, narrativeGeneratedAt: result.generated_at }))
    toast.success("Expert report generated")
  }

  async function downloadPDF() {
    toast.info("Generating PDF — this may take a few seconds…")
    try {
      const hasSec = includeSecurity && !!(data?.narrative?.security_analysis)
      const res = await fetch(
        `/api/reports/candidate/${candidateId}/pdf?entity=${encodeURIComponent(entityTerm)}&content=${encodeURIComponent(contentTerm)}${hasSec ? "&security=1" : ""}${mode === "manual" ? "&mode=manual" : ""}`
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? "PDF generation failed. Please try again.")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const cd = res.headers.get("Content-Disposition") ?? ""
      const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i)
      a.download = match ? decodeURIComponent(match[1]) : "Candidate-Report.pdf"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("PDF downloaded successfully")
    } catch {
      toast.error("Failed to download PDF. Please try again.")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#1B4F8A] mx-auto" />
          <p className="text-sm text-slate-500">Loading report…</p>
        </div>
      </div>
    )
  }

  if (data?.error) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100">
        <div className="text-center space-y-4">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto" />
          <p className="text-sm text-slate-500">{data.error}</p>
          {mode === "manual" && (
            <Button size="sm" variant="outline" onClick={() => switchMode("original")}>View Original Report</Button>
          )}
        </div>
      </div>
    )
  }

  const { candidate, answers, analysis, narrative, rank, totalCandidates, classAvg } = data
  const exam = candidate?.exams as any
  // Client-branding logos, optional — only shown on the manual report.
  const groupLogos: string[] = mode === "manual" ? (exam?.courses?.groups?.manual_report_logos ?? []) : []
  const sections = ((analysis?.sections ?? []) as any[]).sort((a: any, b: any) => a.order_index - b.order_index)
  const answerMap = new Map(answers.map((a: any) => [a.question_id, a]))
  // Points shown here always sum to exactly 100 for this candidate's own
  // question set (display_possible/display_achieved, computed server-side)
  // — regardless of the raw scoring weights behind them, e.g. a mixed-bank
  // exam. Grading itself (candidate.total_score) is untouched.
  const totalPossible = Math.round(answers.reduce((s: number, a: any) => s + (a.display_possible ?? parseFloat(a.questions?.score ?? 0)), 0) * 100) / 100
  const totalEarned = Math.round(answers.reduce((s: number, a: any) => s + (a.display_achieved ?? parseFloat(a.score_achieved ?? 0)), 0) * 100) / 100
  const overallPct = candidate.total_score ?? 0

  const sectionsWithData = sections.map((section: any, si: number) => {
    const questions = (section.question_ids ?? [])
      .map((qid: string) => {
        const a = answerMap.get(qid) as any; if (!a) return null
        const q = a.questions
        return {
          id: qid, text: q?.text ?? "", type: q?.type ?? "",
          score: parseFloat(q?.score ?? 0), scoreAchieved: parseFloat(a.score_achieved ?? 0),
          scoreDisplay: a.display_possible ?? parseFloat(q?.score ?? 0),
          scoreAchievedDisplay: a.display_achieved ?? parseFloat(a.score_achieved ?? 0),
        }
      }).filter(Boolean)
    const earned = Math.round(questions.reduce((s: number, q: any) => s + q.scoreAchievedDisplay, 0) * 100) / 100
    const possible = Math.round(questions.reduce((s: number, q: any) => s + q.scoreDisplay, 0) * 100) / 100
    const pct = possible > 0 ? (earned / possible) * 100 : 0
    // Correct/partial/zero classification uses the RAW achieved-vs-possible
    // comparison — ratio-identical to the scaled values, so unaffected by
    // display scaling; kept on raw to avoid touching this logic at all.
    const correct = questions.filter((q: any) => q.scoreAchieved >= q.score).length
    const partial = questions.filter((q: any) => q.scoreAchieved > 0 && q.scoreAchieved < q.score).length
    const zero = questions.filter((q: any) => q.scoreAchieved === 0).length
    return { ...section, questions, earned, possible, pct, correct, partial, zero, idx: si }
  }).filter((s: any) => s.questions.length > 0)

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  const hasAI = !!narrative
  const hasSecurity = includeSecurity && !!narrative?.security_analysis
  const totalPages = 2 + sectionsWithData.length + (hasAI ? 1 : 0) + (hasSecurity ? 1 : 0)

  return (
    <>
      {/* ── Terminology Modal ── */}
      {showModal && (
        <TerminologyModal
          onConfirm={(e, c, sec) => {
            setEntityTerm(e)
            setContentTerm(c)
            setIncludeSecurity(sec)
            setShowModal(false)
          }}
        />
      )}

      <style>{`
        .page-break { break-before: page; }
        .avoid-break { break-inside: avoid; }
        @page { size: 794px 1122px; margin: 0; }
        @media print {
          /* ── Hide all admin chrome ── */
          .no-print { display: none !important; }
          aside  { display: none !important; }
          header { display: none !important; }

          /* ── Collapse the admin layout wrapper (flex h-screen overflow-hidden) ── */
          body { margin: 0; background: white; }
          body > div {
            display: block !important;
            height: auto !important;
            overflow: visible !important;
          }
          /* ── Collapse the content column ── */
          body > div > div:last-child {
            display: block !important;
            height: auto !important;
            overflow: visible !important;
          }
          /* ── Fix the scrollable main ── */
          main {
            display: block !important;
            height: auto !important;
            overflow: visible !important;
            padding: 0 !important;
          }
          /* ── Fix the grey outer report wrapper ── */
          main > div {
            display: flex !important;
            justify-content: flex-start !important;
            background: white !important;
            padding: 0 !important;
            min-height: auto !important;
          }
          /* ── Remove gap between page divs ── */
          #report-root {
            gap: 0 !important;
            background: white !important;
            padding: 0 !important;
          }

          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="no-print sticky top-0 z-40 bg-white border-b shadow-sm px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
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
        <div className="flex items-center gap-2">
          {!hasAI && (
            <Button size="sm" onClick={generateNarrative} disabled={generatingAI}
              className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
              {generatingAI ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
              {generatingAI ? "Generating…" : "Generate Expert Report"}
            </Button>
          )}
          {hasAI && (
            <Button size="sm" variant="outline" onClick={generateNarrative} disabled={generatingAI} className="gap-2 text-xs">
              {generatingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Regenerate Expert
            </Button>
          )}
          <Button size="sm" onClick={downloadPDF}
            className="gap-2 bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
            <Printer className="h-4 w-4" />
            Save as PDF
          </Button>
        </div>
      </div>

      {/* ── Report ── */}
      <div className="bg-slate-300 min-h-screen py-8 flex justify-center print:bg-white print:p-0">
        <div id="report-root"
          className="flex flex-col bg-slate-300 gap-5 print:gap-0 print:bg-white"
          style={{ width: 794 }}>

          {/* ══ PAGE 1 — COVER ══ */}
          <Page dark first>
            {/* Decorative circles */}
            <div className="absolute top-0 right-0 w-80 h-80 rounded-full pointer-events-none opacity-10"
              style={{ background: "radial-gradient(circle, #60a5fa, transparent)", transform: "translate(35%,-35%)" }} />
            <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full pointer-events-none opacity-10"
              style={{ background: "radial-gradient(circle, #93c5fd, transparent)", transform: "translate(-35%,35%)" }} />

            {/* Top bar */}
            <div className="flex items-center justify-between px-12 pt-10 shrink-0">
              <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36} className="object-contain" />
              <p className="text-white/40 text-xs">{today}</p>
            </div>

            {/* Center */}
            <div className="flex-1 flex flex-col items-center justify-center px-12 text-center gap-7">
              <div className="space-y-3">
                <p className="text-white/50 text-[11px] uppercase tracking-[0.4em]">Candidate Performance Report</p>
                <div className="flex items-center gap-3 justify-center">
                  <div className="h-px w-14 bg-white/20" />
                  <div className="w-1 h-1 rounded-full bg-white/30" />
                  <div className="h-px w-14 bg-white/20" />
                </div>
              </div>

              <div>
                <h1 className="text-4xl font-extrabold text-white tracking-tight">{candidate.full_name}</h1>
                {(candidate.job_title || candidate.company) && (
                  <p className="text-white/50 text-sm mt-2">{[candidate.job_title, candidate.company].filter(Boolean).join(" · ")}</p>
                )}
              </div>

              <CoverRing score={overallPct} passed={candidate.passed} />

              <div className="flex items-center gap-10">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">
                    {totalEarned.toFixed(1)}<span className="text-white/40 text-sm font-normal">/{totalPossible.toFixed(1)}</span>
                  </p>
                  <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Points</p>
                </div>
                {rank > 0 && (<>
                  <div className="h-10 w-px bg-white/15" />
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white flex items-center gap-1 justify-center">
                      <Medal className="h-5 w-5 text-amber-300" />#{rank}
                      <span className="text-white/40 text-sm font-normal">/ {totalCandidates}</span>
                    </p>
                    <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Rank</p>
                  </div>
                </>)}
                <div className="h-10 w-px bg-white/15" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{exam?.passing_score}%</p>
                  <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Pass Mark</p>
                </div>
                <div className="h-10 w-px bg-white/15" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{formatTimeSpent(candidate.started_at, candidate.submitted_at, exam?.duration_minutes)}</p>
                  <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Time Spent</p>
                </div>
              </div>

              <div className="px-8 py-4 rounded-2xl border border-white/10 bg-white/5 space-y-1 text-center">
                <p className="text-white/80 text-sm font-semibold">{exam?.title}</p>
                <p className="text-white/40 text-xs">{exam?.courses?.groups?.name} · {exam?.courses?.name}</p>
                {candidate.submitted_at && (
                  <p className="text-white/30 text-[10px]">
                    Submitted {new Date(candidate.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                )}
              </div>
            </div>

            <div className="px-12 py-6 border-t border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-3.5 w-3.5 text-purple-300/60" />
                <p className="text-white/30 text-[10px]">Generated by ICS Expert Analytics</p>
              </div>
              <p className="text-white/20 text-[9px]">Page 1 of {totalPages}</p>
            </div>
          </Page>

          {/* ══ PAGE 2 — EXAM OVERVIEW ══ */}
          <Page>
            <PageHeader title="Exam Overview" subtitle={exam?.title} today={today} extraLogos={groupLogos} />
            <div className="px-12 py-7 space-y-6">

              {/* Exam summary */}
              <div className="avoid-break">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Exam Summary</p>
                <div className="grid grid-cols-2 gap-x-8">
                  {[
                    ["Exam Title", exam?.title ?? "—"],
                    [t("Course"), exam?.courses?.name ?? "—"],
                    [t("Group"), exam?.courses?.groups?.name ?? "—"],
                    ["Total Questions", `${answers.length}`],
                    ["Total Points", `${totalPossible.toFixed(1)} pts`],
                    ["Passing Score", `${exam?.passing_score}%`],
                    ["Your Score", `${overallPct.toFixed(1)}%`],
                    ["Result", candidate.passed ? "✓ Passed" : "✗ Failed"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center gap-3 py-2 border-b border-slate-50">
                      <p className="text-[10px] text-slate-400 w-28 shrink-0">{label}</p>
                      <p className="text-xs font-semibold text-slate-700">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Score comparison */}
              <div className="avoid-break">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Score Comparison</p>
                <div className="grid grid-cols-3 divide-x divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                  {[
                    { label: "Your Score", value: `${overallPct.toFixed(1)}%`, color: scoreColor(overallPct).text, sub: candidate.passed ? "Passed" : "Failed" },
                    { label: "Class Average", value: `${classAvg.toFixed(1)}%`, color: "#1B4F8A", sub: `${totalCandidates} candidates` },
                    { label: "Pass Mark", value: `${exam?.passing_score}%`, color: "#64748b", sub: "Required" },
                  ].map(({ label, value, color, sub }) => (
                    <div key={label} className="py-4 px-3 text-center">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                      <p className="text-xl font-bold" style={{ color }}>{value}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{sub}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section bars — manual report shows letter grades only (no
                  fractions/percentages), per client-report requirements */}
              {sectionsWithData.length > 0 && (
                <div className="avoid-break space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Performance by Section</p>
                  {mode === "manual" ? (
                    <div className="grid grid-cols-3 gap-3">
                      {sectionsWithData.map((s: any) => {
                        const g = letterGrade(s.pct)
                        return (
                          <div key={s.title} className="rounded-xl border p-4 text-center"
                            style={{ background: g.bg, border: `1.5px solid ${g.border}` }}>
                            <p className="text-2xl font-extrabold" style={{ color: g.text }}>{g.letter}</p>
                            <p className="text-[10px] text-slate-600 mt-1 leading-snug">{s.title}</p>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    sectionsWithData.map((s: any) => (
                      <ScoreBar key={s.title} label={s.title} score={s.pct}
                        detail={`${s.correct}/${s.questions.length} correct · ${s.earned.toFixed(1)}/${s.possible.toFixed(1)} pts`} />
                    ))
                  )}
                </div>
              )}

              {/* Expert Executive Summary + colored panels */}
              {narrative?.executive_summary ? (
                <div className="avoid-break space-y-3">
                  {/* Executive summary */}
                  <div className="bg-[#1B4F8A]/5 border border-[#1B4F8A]/10 rounded-xl p-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A] mb-2">Expert Executive Summary</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{t(narrative.executive_summary)}</p>
                  </div>

                  {/* Three panels */}
                  <div className="grid grid-cols-3 gap-3">
                    {/* Key Strengths */}
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Trophy className="h-3.5 w-3.5 text-emerald-600" />
                        <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">Key Strengths</p>
                      </div>
                      {(narrative.strengths ?? []).map((s: string, i: number) => (
                        <div key={i} className="flex items-start gap-1.5 mb-1.5">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-emerald-800 leading-relaxed">{t(s)}</p>
                        </div>
                      ))}
                    </div>

                    {/* Weakness Areas */}
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Target className="h-3.5 w-3.5 text-red-500" />
                        <p className="text-[9px] font-bold uppercase tracking-wider text-red-600">Weakness Areas</p>
                      </div>
                      {(narrative.improvements ?? []).map((s: string, i: number) => (
                        <div key={i} className="flex items-start gap-1.5 mb-1.5">
                          <XCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-red-800 leading-relaxed">{t(s)}</p>
                        </div>
                      ))}
                    </div>

                    {/* Development Areas */}
                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Lightbulb className="h-3.5 w-3.5 text-purple-600" />
                        <p className="text-[9px] font-bold uppercase tracking-wider text-purple-700">Development Areas</p>
                      </div>
                      {(narrative.recommendations ?? []).slice(0, 3).map((r: any, i: number) => (
                        <div key={i} className="flex items-start gap-1.5 mb-1.5">
                          <TrendingUp className="h-3 w-3 text-purple-500 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-purple-800 leading-relaxed">{t(r.action)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="avoid-break no-print flex items-center gap-2 text-sm text-slate-400 bg-slate-50 rounded-xl p-4">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Click <strong className="mx-1">Generate Expert Report</strong> in the toolbar to add expert narrative.
                </div>
              )}

              {sections.length === 0 && (
                <div className="no-print avoid-break flex items-center gap-2 text-sm text-slate-500 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  Exam not analyzed yet. Go to the exam page and click <strong className="mx-1">"Analyze Exam"</strong> to enable section breakdown.
                </div>
              )}
            </div>
            <PageFooter page={2} total={totalPages} />
          </Page>

          {/* ══ PAGES 3–N — SECTIONS ══ */}
          {sectionsWithData.map((section: any) => {
            const sectionAI = narrative?.section_analyses?.[section.title]
            const col = mode === "manual" ? letterGrade(section.pct) : scoreColor(section.pct)
            return (
              <Page key={section.title}>
                <PageHeader title={`Section ${section.idx + 1} — ${section.title}`} subtitle={exam?.title} today={today} extraLogos={groupLogos} />
                <div className="px-12 py-7 space-y-5">

                  {/* Title + score badge */}
                  <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-slate-100">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A] bg-blue-50 px-2 py-0.5 rounded-full">
                        Section {section.idx + 1} of {sectionsWithData.length}
                      </span>
                      <h2 className="text-xl font-bold text-slate-800 mt-2">{section.title}</h2>
                      {section.description && <p className="text-xs text-slate-400 mt-1">{section.description}</p>}
                    </div>
                    <div className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center shrink-0"
                      style={{ background: col.bg, border: `1.5px solid ${col.border}` }}>
                      <span className="text-xl font-extrabold" style={{ color: col.text }}>
                        {mode === "manual" ? (col as ReturnType<typeof letterGrade>).letter : `${section.pct.toFixed(0)}%`}
                      </span>
                      <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: col.text }}>Score</span>
                    </div>
                  </div>

                  {/* Quick stats — manual report omits the Points chip since
                      raw point values aren't shown anywhere else on it */}
                  <div className="flex gap-2 flex-wrap avoid-break">
                    {[
                      { label: "Questions", val: section.questions.length, color: "bg-slate-100 text-slate-700" },
                      { label: "Full Marks", val: section.correct, color: "bg-emerald-50 text-emerald-700" },
                      { label: "Partial", val: section.partial, color: "bg-amber-50 text-amber-700" },
                      { label: "Zero", val: section.zero, color: "bg-red-50 text-red-600" },
                      ...(mode === "manual" ? [] : [{ label: "Points", val: `${section.earned.toFixed(1)}/${section.possible.toFixed(1)}`, color: "bg-blue-50 text-blue-700" }]),
                    ].map(({ label, val, color }) => (
                      <div key={label} className={`px-3 py-1.5 rounded-lg text-center ${color}`}>
                        <p className="text-xs font-bold">{val}</p>
                        <p className="text-[9px] uppercase tracking-wide opacity-70">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Score bar — manual report shows a letter grade instead
                      of the percentage/correct-count; question breakdown is
                      omitted entirely for the manual (client) report */}
                  {mode === "manual" ? (
                    <div className="rounded-xl p-4 flex items-center gap-3"
                      style={{ background: col.bg, border: `1.5px solid ${col.border}` }}>
                      <span className="text-2xl font-extrabold" style={{ color: col.text }}>{(col as ReturnType<typeof letterGrade>).letter}</span>
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: col.text }}>Section Grade</span>
                    </div>
                  ) : (
                    <>
                      <ScoreBar label="Section Score" score={section.pct}
                        detail={`${section.correct}/${section.questions.length} correct`} />

                      {/* Question list */}
                      <div className="avoid-break">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Question Breakdown</p>
                        <div className="rounded-xl border border-slate-100 overflow-hidden">
                          {section.questions.map((q: any, qi: number) => {
                            const full = q.scoreAchieved >= q.score
                            const part = q.scoreAchieved > 0 && !full
                            return (
                              <div key={q.id}
                                className={`flex items-start gap-3 px-4 py-2 border-b border-slate-50 last:border-0 ${qi % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                                <div className="mt-0.5 shrink-0">
                                  {full ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                    : part ? <MinusCircle className="h-3.5 w-3.5 text-amber-400" />
                                      : <XCircle className="h-3.5 w-3.5 text-red-400" />}
                                </div>
                                <p className="flex-1 text-xs text-slate-600 leading-relaxed line-clamp-2">{q.text}</p>
                                <span className="text-xs font-bold text-slate-700 shrink-0 ml-2">
                                  {q.scoreAchievedDisplay.toFixed(2)}<span className="text-slate-300 font-normal text-[10px]">/{q.scoreDisplay.toFixed(2)}</span>
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Expert Section Analysis */}
                  {sectionAI ? (
                    <div className="avoid-break space-y-3">
                      {/* Summary insight */}
                      <div className="rounded-xl overflow-hidden border border-blue-100">
                        <div className="bg-[#1B4F8A] px-4 py-2 flex items-center gap-2">
                          <BrainCircuit className="h-3.5 w-3.5 text-white/70" />
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Expert Section Analysis</p>
                        </div>
                        <div className="bg-blue-50/60 px-4 py-3">
                          <p className="text-xs text-blue-900 leading-relaxed">{t(sectionAI.summary)}</p>
                        </div>
                      </div>

                      {/* Strengths / Weaknesses / Development */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Trophy className="h-3 w-3 text-emerald-600" />
                            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">Strengths</p>
                          </div>
                          {(sectionAI.strengths ?? []).map((s: string, i: number) => (
                            <p key={i} className="text-[10px] text-emerald-800 leading-relaxed mb-1">· {t(s)}</p>
                          ))}
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Target className="h-3 w-3 text-amber-600" />
                            <p className="text-[9px] font-bold uppercase tracking-wider text-amber-700">Weaknesses</p>
                          </div>
                          {(sectionAI.weaknesses ?? []).map((s: string, i: number) => (
                            <p key={i} className="text-[10px] text-amber-800 leading-relaxed mb-1">· {t(s)}</p>
                          ))}
                        </div>
                        <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Lightbulb className="h-3 w-3 text-purple-600" />
                            <p className="text-[9px] font-bold uppercase tracking-wider text-purple-700">Development</p>
                          </div>
                          {(sectionAI.development ?? []).map((s: string, i: number) => (
                            <p key={i} className="text-[10px] text-purple-800 leading-relaxed mb-1">· {t(s)}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="no-print avoid-break flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg p-3">
                      <BrainCircuit className="h-3.5 w-3.5 shrink-0" />
                      Generate Expert Report to see section analysis with strengths, weaknesses and development areas.
                    </div>
                  )}
                </div>
                <PageFooter page={3 + section.idx} total={totalPages} />
              </Page>
            )
          })}

          {/* ══ LAST PAGE — RECOMMENDATIONS ══ */}
          {hasAI && (
            <Page>
              <PageHeader title="Personalized Recommendations" subtitle={exam?.title} today={today} extraLogos={groupLogos} />
              <div className="px-12 py-7 space-y-6">

                {/* Priority recommendations */}
                <div className="avoid-break">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="h-4 w-4 text-[#1B4F8A]" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Priority Areas to Review</p>
                  </div>
                  <div className="space-y-3">
                    {(narrative.recommendations ?? []).map((rec: any, i: number) => {
                      const col = scoreColor(rec.score ?? 50)
                      return (
                        <div key={i} className="flex items-start gap-4 p-4 border border-slate-100 rounded-xl bg-slate-50/80">
                          <div className="w-8 h-8 rounded-full bg-[#1B4F8A] flex items-center justify-center text-white text-sm font-bold shrink-0">
                            {i + 1}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-semibold text-slate-700">{t(rec.area)}</p>
                              {rec.score !== undefined && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                  style={{ background: col.bg, color: col.text, border: `1px solid ${col.border}` }}>
                                  {rec.score}%
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed">→ {t(rec.action)}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Overall strengths + improvements */}
                <div className="grid grid-cols-2 gap-4 avoid-break">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Trophy className="h-4 w-4 text-emerald-500" />
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Overall Strengths</p>
                    </div>
                    <div className="space-y-2">
                      {(narrative.strengths ?? []).map((s: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-emerald-800 leading-relaxed">{t(s)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Target className="h-4 w-4 text-amber-500" />
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Overall Improvements</p>
                    </div>
                    <div className="space-y-2">
                      {(narrative.improvements ?? []).map((s: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                          <XCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-800 leading-relaxed">{t(s)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Sign-off */}
                <div className="avoid-break border-t border-slate-100 pt-6 flex flex-col items-center gap-2 text-center">
                  <Image src="/logo/logo-dark-blue.png" alt="ICS" width={80} height={22} className="object-contain opacity-25" />
                  <p className="text-[10px] text-slate-300 uppercase tracking-widest">ICS Aviation · Integrated Consulting Services</p>
                  <p className="text-[10px] text-slate-300 max-w-md">
                    This report is expert-generated based on exam performance data and is for internal use only.
                  </p>
                </div>
              </div>
              <PageFooter page={totalPages} total={totalPages} />
            </Page>
          )}

          {/* ══ SECURITY PAGE ══ */}
          {hasSecurity && (() => {
            const sec = narrative.security_analysis
            const riskColors: Record<string, { bg: string; text: string; border: string; label: string }> = {
              clean:  { bg: "#d1fae5", text: "#065f46", border: "#a7f3d0", label: "✓ Clean" },
              medium: { bg: "#fef3c7", text: "#92400e", border: "#fde68a", label: "⚠ Medium Risk" },
              high:   { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5", label: "⚠ High Risk" },
            }
            const rc = riskColors[sec.risk_level ?? "clean"] ?? riskColors.clean
            const totalAway = sec.total_away_seconds ?? 0
            const awayFmt = totalAway < 60
              ? `${totalAway}s`
              : `${Math.floor(totalAway / 60)}m ${totalAway % 60}s`
            const chips = [
              { label: "Tab Switches",         val: sec.tab_switches ?? 0,         color: (sec.tab_switches ?? 0) > 2 ? "bg-red-50 text-red-700" : (sec.tab_switches ?? 0) > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700" },
              { label: "Fullscreen Exits",     val: sec.fullscreen_exits ?? 0,     color: (sec.fullscreen_exits ?? 0) > 2 ? "bg-red-50 text-red-700" : (sec.fullscreen_exits ?? 0) > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700" },
              { label: "Right-click Attempts", val: sec.right_click_attempts ?? 0, color: (sec.right_click_attempts ?? 0) > 5 ? "bg-red-50 text-red-700" : (sec.right_click_attempts ?? 0) > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700" },
              { label: "Copy/Cut Attempts",    val: sec.copy_paste_attempts ?? 0,  color: (sec.copy_paste_attempts ?? 0) > 3 ? "bg-red-50 text-red-700" : (sec.copy_paste_attempts ?? 0) > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700" },
              ...(totalAway > 0 ? [{ label: "Time Away", val: awayFmt, color: "bg-slate-100 text-slate-700" }] : []),
            ]
            return (
              <Page>
                <PageHeader title="Security Analysis" subtitle={exam?.title} today={today} extraLogos={groupLogos} />
                <div className="px-12 py-7 space-y-5">

                  {/* Title row — matches section page style */}
                  <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-slate-100">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A] bg-blue-50 px-2 py-0.5 rounded-full">
                        Integrity Report
                      </span>
                      <h2 className="text-xl font-bold text-slate-800 mt-2">Exam Integrity Overview</h2>
                    </div>
                    <div className="px-4 py-2 rounded-xl shrink-0 text-center"
                      style={{ background: rc.bg, border: `1.5px solid ${rc.border}` }}>
                      <span className="text-sm font-extrabold" style={{ color: rc.text }}>{rc.label}</span>
                    </div>
                  </div>

                  {/* Event chips — same style as section stat chips */}
                  <div className="flex gap-2 flex-wrap avoid-break">
                    {chips.map(({ label, val, color }) => (
                      <div key={label} className={`px-3 py-1.5 rounded-lg text-center ${color}`}>
                        <p className="text-xs font-bold">{val}</p>
                        <p className="text-[9px] uppercase tracking-wide opacity-70">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* AI Behavioral Assessment — same style as Expert Section Analysis */}
                  <div className="avoid-break space-y-3">
                    <div className="rounded-xl overflow-hidden border border-blue-100">
                      <div className="bg-[#1B4F8A] px-4 py-2 flex items-center gap-2">
                        <ShieldAlert className="h-3.5 w-3.5 text-white/70" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">AI Behavioral Assessment</p>
                      </div>
                      <div className="bg-blue-50/60 px-4 py-4">
                        <p className="text-sm text-blue-900 leading-relaxed">{sec.behavioral_assessment}</p>
                      </div>
                    </div>
                  </div>

                  {/* Disclaimer */}
                  <div className="avoid-break border border-slate-100 rounded-xl p-4 bg-slate-50/40 text-center">
                    <p className="text-[10px] text-slate-400 leading-relaxed max-w-lg mx-auto">
                      This assessment is AI-generated based on behavioral signals recorded during the exam. It is intended as an investigative aid only and should not be used as the sole basis for any disciplinary action. All findings should be reviewed in context by a qualified supervisor.
                    </p>
                  </div>
                </div>
                <PageFooter page={totalPages} total={totalPages} />
              </Page>
            )
          })()}

        </div>
      </div>
    </>
  )
}
