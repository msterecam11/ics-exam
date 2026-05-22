import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Image from "next/image"
import ScoreBar from "@/components/reports/ScoreBar"
import {
  BrainCircuit, CheckCircle2, XCircle, MinusCircle,
  Trophy, Target, TrendingUp, Medal, Lightbulb, ShieldAlert,
} from "lucide-react"
import { makeT, type EntityTerm, type ContentTerm } from "@/lib/reportTerms"

// ─── Helpers ────────────────────────────────────────────────────────────────

function scoreColor(pct: number) {
  if (pct >= 80) return { text: "#10b981", bg: "#d1fae5", border: "#a7f3d0" }
  if (pct >= 60) return { text: "#f59e0b", bg: "#fef3c7", border: "#fde68a" }
  return { text: "#ef4444", bg: "#fee2e2", border: "#fca5a5" }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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

function Page({ children, dark = false, first = false }: {
  children: React.ReactNode; dark?: boolean; first?: boolean
}) {
  return (
    <div
      data-report-page=""
      className={`relative w-full flex flex-col ${dark ? "bg-[#1B4F8A]" : "bg-white"} ${first ? "overflow-hidden" : "page-break"}`}
      style={first ? { minHeight: "100vh" } : undefined}
    >
      {children}
    </div>
  )
}

function PageHeader({ light = false, title, subtitle, today }: {
  light?: boolean; title: string; subtitle?: string; today: string
}) {
  return (
    <div className={`flex items-center justify-between px-12 pt-8 pb-5 border-b shrink-0
      ${light ? "border-white/15" : "border-[#1B4F8A] border-b-2"}`}>
      <Image
        src={light ? "/logo/logo-white.png" : "/logo/logo-dark-blue.png"}
        alt="ICS Aviation" width={110} height={30} className="object-contain"
      />
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
    <div className={`px-12 py-4 border-t shrink-0 flex items-center justify-between mt-auto
      ${light ? "border-white/10" : "border-slate-100"}`}>
      <p className={`text-[9px] uppercase tracking-widest ${light ? "text-white/30" : "text-slate-300"}`}>
        ICS Aviation · Integrated Consulting Services · Confidential
      </p>
      <p className={`text-[9px] ${light ? "text-white/30" : "text-slate-300"}`}>Page {page} of {total}</p>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ candidateId: string }>
  searchParams: Promise<{ entity?: string; content?: string; pdf_secret?: string; security?: string }>
}

export default async function PrintCandidatePage({ params, searchParams }: Props) {
  const { pdf_secret } = await searchParams
  const validSecret = process.env.PDF_INTERNAL_SECRET && pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
  }

  const { candidateId } = await params
  const { entity = "Group", content = "Course", security } = await searchParams
  const showSecurity = security === "1"
  const t = makeT(entity as EntityTerm, content as ContentTerm)

  const { data: candidate } = await db
    .from("candidates")
    .select("*, exams(id, title, passing_score, courses(name, groups(name)))")
    .eq("id", candidateId)
    .single()

  if (!candidate) notFound()

  const examId = (candidate as any).exams?.id

  const [answersRes, analysisRes, cachedRes, allCandidatesRes] = await Promise.all([
    db.from("candidate_answers")
      .select("*, questions(id, text, type, score, order_index)")
      .eq("candidate_id", candidateId),
    db.from("exam_analyses")
      .select("sections, generated_at")
      .eq("exam_id", examId)
      .single(),
    db.from("report_cache")
      .select("narrative, generated_at")
      .eq("type", "candidate")
      .eq("reference_id", candidateId)
      .eq("exam_id", examId)
      .single(),
    db.from("candidates")
      .select("id, total_score")
      .eq("exam_id", examId)
      .not("submitted_at", "is", null),
  ])

  const answers = answersRes.data ?? []
  const analysis = analysisRes.data ?? null

  const allCandidates = ((allCandidatesRes.data ?? []) as any[])
    .sort((a: any, b: any) => (b.total_score ?? 0) - (a.total_score ?? 0))
  const rank = allCandidates.findIndex((c: any) => c.id === candidateId) + 1
  const totalCandidates = allCandidates.length
  const classAvg = totalCandidates > 0
    ? allCandidates.reduce((s: number, c: any) => s + (c.total_score ?? 0), 0) / totalCandidates
    : 0

  let narrative: any = null
  if (cachedRes.data?.narrative) {
    try { narrative = JSON.parse(cachedRes.data.narrative) } catch { narrative = null }
  }

  // ─── Derived data ──────────────────────────────────────────────────────────

  const exam = (candidate as any).exams as any
  const sections = (((analysis?.sections ?? []) as any[])).sort((a: any, b: any) => a.order_index - b.order_index)
  const answerMap = new Map(answers.map((a: any) => [a.question_id, a]))
  const totalPossible = answers.reduce((s: number, a: any) => s + ((a.questions as any)?.score ?? 0), 0)
  const totalEarned = answers.reduce((s: number, a: any) => s + (a.score_achieved ?? 0), 0)
  const overallPct = (candidate as any).total_score ?? 0

  const sectionsWithData = sections.map((section: any, si: number) => {
    const questions = (section.question_ids ?? [])
      .map((qid: string) => {
        const a = answerMap.get(qid); if (!a) return null
        const q = (a as any).questions
        return { id: qid, text: q?.text ?? "", type: q?.type ?? "", score: q?.score ?? 0, scoreAchieved: (a as any).score_achieved ?? 0 }
      }).filter(Boolean)
    const earned = questions.reduce((s: number, q: any) => s + q.scoreAchieved, 0)
    const possible = questions.reduce((s: number, q: any) => s + q.score, 0)
    const pct = possible > 0 ? (earned / possible) * 100 : 0
    const correct = questions.filter((q: any) => q.scoreAchieved >= q.score).length
    const partial = questions.filter((q: any) => q.scoreAchieved > 0 && q.scoreAchieved < q.score).length
    const zero = questions.filter((q: any) => q.scoreAchieved === 0).length
    return { ...section, questions, earned, possible, pct, correct, partial, zero, idx: si }
  }).filter((s: any) => s.questions.length > 0)

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  const hasAI = !!narrative
  const hasSecurity = showSecurity && !!narrative?.security_analysis
  const totalPages = 2 + sectionsWithData.length + (hasAI ? 1 : 0) + (hasSecurity ? 1 : 0)

  return (
    <>
      <style>{`
        html, body { margin: 0 !important; padding: 0 !important; }
        .page-break { break-before: page; }
        .avoid-break { break-inside: avoid; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      `}</style>

      <div id="report-root" style={{ width: 794, margin: "0 auto", display: "flex", flexDirection: "column", background: "white" }}>

        {/* ══ PAGE 1 — COVER ══ */}
        <Page dark first>
          <div className="absolute top-0 right-0 w-80 h-80 rounded-full pointer-events-none opacity-10"
            style={{ background: "radial-gradient(circle, #60a5fa, transparent)", transform: "translate(35%,-35%)" }} />
          <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full pointer-events-none opacity-10"
            style={{ background: "radial-gradient(circle, #93c5fd, transparent)", transform: "translate(-35%,35%)" }} />

          <div className="flex items-center justify-between px-12 pt-10 shrink-0">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36} className="object-contain" />
            <p className="text-white/40 text-xs">{today}</p>
          </div>

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
              <h1 className="text-4xl font-extrabold text-white tracking-tight">{(candidate as any).full_name}</h1>
              {((candidate as any).job_title || (candidate as any).company) && (
                <p className="text-white/50 text-sm mt-2">
                  {[(candidate as any).job_title, (candidate as any).company].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            <CoverRing score={overallPct} passed={(candidate as any).passed} />

            <div className="flex items-center gap-10">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">
                  {totalEarned.toFixed(1)}<span className="text-white/40 text-sm font-normal">/{totalPossible}</span>
                </p>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Points</p>
              </div>
              {rank > 0 && (
                <>
                  <div className="h-10 w-px bg-white/15" />
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white flex items-center gap-1 justify-center">
                      <Medal className="h-5 w-5 text-amber-300" />#{rank}
                      <span className="text-white/40 text-sm font-normal">/ {totalCandidates}</span>
                    </p>
                    <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Rank</p>
                  </div>
                </>
              )}
              <div className="h-10 w-px bg-white/15" />
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{exam?.passing_score}%</p>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Pass Mark</p>
              </div>
            </div>

            <div className="px-8 py-4 rounded-2xl border border-white/10 bg-white/5 space-y-1 text-center">
              <p className="text-white/80 text-sm font-semibold">{exam?.title}</p>
              <p className="text-white/40 text-xs">{exam?.courses?.groups?.name} · {exam?.courses?.name}</p>
              {(candidate as any).submitted_at && (
                <p className="text-white/30 text-[10px]">
                  Submitted {new Date((candidate as any).submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
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
          <PageHeader title="Exam Overview" subtitle={exam?.title} today={today} />
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
                  ["Total Points", `${totalPossible} pts`],
                  ["Passing Score", `${exam?.passing_score}%`],
                  ["Your Score", `${overallPct.toFixed(1)}%`],
                  ["Result", (candidate as any).passed ? "✓ Passed" : "✗ Failed"],
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
                  { label: "Your Score", value: `${overallPct.toFixed(1)}%`, color: scoreColor(overallPct).text, sub: (candidate as any).passed ? "Passed" : "Failed" },
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

            {/* Section bars */}
            {sectionsWithData.length > 0 && (
              <div className="avoid-break space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Performance by Section</p>
                {sectionsWithData.map((s: any) => (
                  <ScoreBar key={s.title} label={s.title} score={s.pct}
                    detail={`${s.correct}/${s.questions.length} correct · ${s.earned.toFixed(1)}/${s.possible} pts`} />
                ))}
              </div>
            )}

            {/* AI Executive Summary + colored panels */}
            {narrative?.executive_summary && (
              <div className="avoid-break space-y-3">
                <div className="bg-[#1B4F8A]/5 border border-[#1B4F8A]/10 rounded-xl p-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A] mb-2">Expert Executive Summary</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{t(narrative.executive_summary)}</p>
                </div>

                <div className="grid grid-cols-3 gap-3">
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
            )}
          </div>
          <PageFooter page={2} total={totalPages} />
        </Page>

        {/* ══ PAGES 3–N — SECTIONS ══ */}
        {sectionsWithData.map((section: any) => {
          const sectionAI = narrative?.section_analyses?.[section.title]
          const col = scoreColor(section.pct)
          return (
            <Page key={section.title}>
              <PageHeader title={`Section ${section.idx + 1} — ${section.title}`} subtitle={exam?.title} today={today} />
              <div className="px-12 py-7 space-y-5">

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
                    <span className="text-xl font-extrabold" style={{ color: col.text }}>{section.pct.toFixed(0)}%</span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: col.text }}>Score</span>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap avoid-break">
                  {[
                    { label: "Questions", val: section.questions.length, color: "bg-slate-100 text-slate-700" },
                    { label: "Full Marks", val: section.correct, color: "bg-emerald-50 text-emerald-700" },
                    { label: "Partial", val: section.partial, color: "bg-amber-50 text-amber-700" },
                    { label: "Zero", val: section.zero, color: "bg-red-50 text-red-600" },
                    { label: "Points", val: `${section.earned.toFixed(1)}/${section.possible}`, color: "bg-blue-50 text-blue-700" },
                  ].map(({ label, val, color }) => (
                    <div key={label} className={`px-3 py-1.5 rounded-lg text-center ${color}`}>
                      <p className="text-xs font-bold">{val}</p>
                      <p className="text-[9px] uppercase tracking-wide opacity-70">{label}</p>
                    </div>
                  ))}
                </div>

                <ScoreBar label="Section Score" score={section.pct}
                  detail={`${section.correct}/${section.questions.length} correct`} />

                <div className="avoid-break">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Question Breakdown</p>
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
                          <p className="flex-1 text-xs text-slate-600 leading-relaxed">{q.text}</p>
                          <span className="text-xs font-bold text-slate-700 shrink-0 ml-2">
                            {q.scoreAchieved.toFixed(1)}<span className="text-slate-300 font-normal text-[10px]">/{q.score}</span>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {sectionAI && (
                  <div className="avoid-break space-y-3">
                    <div className="rounded-xl overflow-hidden border border-blue-100">
                      <div className="bg-[#1B4F8A] px-4 py-2 flex items-center gap-2">
                        <BrainCircuit className="h-3.5 w-3.5 text-white/70" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Expert Section Analysis</p>
                      </div>
                      <div className="bg-blue-50/60 px-4 py-3">
                        <p className="text-xs text-blue-900 leading-relaxed">{t(sectionAI.summary)}</p>
                      </div>
                    </div>

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
                )}
              </div>
              <PageFooter page={3 + section.idx} total={totalPages} />
            </Page>
          )
        })}

        {/* ══ LAST PAGE — RECOMMENDATIONS ══ */}
        {hasAI && (
          <Page>
            <PageHeader title="Personalized Recommendations" subtitle={exam?.title} today={today} />
            <div className="px-12 py-7 space-y-6">

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
              <PageHeader title="Security Analysis" subtitle={exam?.title} today={today} />
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
    </>
  )
}
