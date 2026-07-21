import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Image from "next/image"
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react"
import { scaleToTarget } from "@/lib/scoreDisplay"

interface Props {
  params: Promise<{ candidateId: string }>
  searchParams: Promise<{ pdf_secret?: string; mode?: string }>
}

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
    return order.map((id, i) => `${i + 1}. ${q.ordering_items?.find((it: any) => it.id === id)?.text ?? "?"}`).join("  ").trim() || "(no answer)"
  }
  if (q.type === "matching") {
    const pairs: any[] = answer.answer_json?.pairs ?? []
    const cp = q.matching_pairs ?? []
    return pairs.map((p) =>
      `${cp.find((x: any) => x.id === p.left_id)?.left_item ?? "?"}  →  ${cp.find((x: any) => x.id === p.right_id)?.right_item ?? "?"}`
    ).join("   |   ") || "(no answer)"
  }
  return "—"
}

function CoverRing({ score, passed }: { score: number; passed: boolean }) {
  const size = 160, sw = 12, r = (size - sw) / 2
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
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
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

function PageHeader({ title, subtitle, today }: {
  title: string; subtitle?: string; today: string
}) {
  return (
    <div className="flex items-center justify-between px-12 pt-8 pb-5 border-b-2 border-[#1B4F8A] shrink-0">
      <Image src="/logo/logo-dark-blue.png" alt="ICS Aviation" width={110} height={30} className="object-contain" />
      <div className="text-right">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A]">{title}</p>
        {subtitle && <p className="text-[10px] mt-0.5 text-slate-400">{subtitle}</p>}
        <p className="text-[10px] mt-0.5 text-slate-400">{today}</p>
      </div>
    </div>
  )
}

function PageFooter({ page, total }: { page: number; total: number }) {
  return (
    <div className="px-12 py-4 border-t border-slate-100 flex items-center justify-between mt-auto shrink-0">
      <p className="text-[9px] uppercase tracking-widest text-slate-300">
        ICS Aviation · Integrated Consulting Services · Confidential
      </p>
      <p className="text-[9px] text-slate-300">Page {page} of {total}</p>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default async function PrintExamResultsPage({ params, searchParams }: Props) {
  const { pdf_secret, mode } = await searchParams
  const validSecret = process.env.PDF_INTERNAL_SECRET && pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
  }

  const { candidateId } = await params
  const isManual = mode === "manual"

  const { data: candidate } = await db
    .from("candidates")
    .select("*, exams(id, title, passing_score, courses(name, groups(name)))")
    .eq("id", candidateId)
    .single()

  if (!candidate) notFound()

  const { data: manualScore } = isManual
    ? await db
        .from("manual_scores")
        .select("*")
        .eq("candidate_id", candidateId)
        .in("status", ["draft", "confirmed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }
  const useManual = isManual && !!manualScore

  const { data: rawAnswers } = await db
    .from("candidate_answers")
    .select("*, questions(*, choices(*), matching_pairs(*), ordering_items(*))")
    .eq("candidate_id", candidateId)

  const { data: overrides } = useManual
    ? await db.from("manual_score_answer_overrides").select("candidate_answer_id, manual_score_achieved").eq("manual_score_id", manualScore!.id)
    : { data: null }
  const overrideMap = new Map((overrides ?? []).map((o: any) => [o.candidate_answer_id, o.manual_score_achieved]))

  const sorted = (rawAnswers ?? [])
    .map((a: any) => {
      if (!useManual) return a
      const override = overrideMap.get(a.id)
      return override === undefined ? a : { ...a, score_achieved: override }
    })
    .sort((a, b) => (a.questions?.order_index ?? 0) - (b.questions?.order_index ?? 0))

  const exam        = (candidate as any).exams
  const score       = useManual ? manualScore!.achieved_score : ((candidate as any).total_score ?? 0)
  const passed      = useManual ? score >= (exam?.passing_score ?? 60) : ((candidate as any).passed ?? false)
  const today       = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  const submittedAt = (candidate as any).submitted_at
    ? new Date((candidate as any).submitted_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "—"

  // Question Bank exams draw a random subset per candidate, so raw question
  // weights don't sum to 100 for any given draw — scale for display only,
  // same as every other candidate-facing/report page. Grading untouched.
  const rawPossible   = sorted.map((a) => a.questions?.score ?? 0)
  const displayPossible = scaleToTarget(rawPossible)
  const totalPossible = displayPossible.reduce((s, v) => s + v, 0)
  const totalEarned   = sorted.reduce((s, a, i) => {
    const raw = rawPossible[i]
    const ratio = raw > 0 ? displayPossible[i] / raw : 0
    return s + Math.round((a.score_achieved ?? 0) * ratio * 100) / 100
  }, 0)
  const correctCount  = sorted.filter(a => (a.score_achieved ?? 0) >= (a.questions?.score ?? 0) && (a.questions?.score ?? 0) > 0).length

  // 1 cover + answer pages (roughly 6 questions per page)
  const answerPages = Math.max(1, Math.ceil(sorted.length / 6))
  const totalPages  = 1 + answerPages

  return (
    <>
      <style>{`
        html, body { margin: 0 !important; padding: 0 !important; }
        .page-break { break-before: page; }
        .avoid-break { break-inside: avoid; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;600;700&display=swap');
        body { font-family: 'Plus Jakarta Sans', sans-serif; }
      `}</style>

      <div id="report-root" style={{ width: 794, margin: "0 auto", display: "flex", flexDirection: "column", background: "white" }}>

        {/* ══ PAGE 1 — COVER ══ */}
        <Page dark first>
          {/* Decorative blobs */}
          <div className="absolute top-0 right-0 w-80 h-80 rounded-full pointer-events-none opacity-10"
            style={{ background: "radial-gradient(circle, #60a5fa, transparent)", transform: "translate(35%,-35%)" }} />
          <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full pointer-events-none opacity-10"
            style={{ background: "radial-gradient(circle, #93c5fd, transparent)", transform: "translate(-35%,35%)" }} />

          {/* Top bar */}
          <div className="flex items-center justify-between px-12 pt-10 shrink-0">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36} className="object-contain" />
            <p className="text-white/40 text-xs">{today}</p>
          </div>

          {/* Centre content */}
          <div className="flex-1 flex flex-col items-center justify-center px-12 text-center gap-7">

            <div className="space-y-3">
              <p className="text-white/50 text-[11px] uppercase tracking-[0.4em]">Candidate Exam Results</p>
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

            <CoverRing score={score} passed={passed} />

            {/* Stats row */}
            <div className="flex items-center gap-10">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">
                  {fmtPts(parseFloat(totalEarned.toFixed(2)))}
                  <span className="text-white/40 text-sm font-normal">/{fmtPts(parseFloat(totalPossible.toFixed(2)))}</span>
                </p>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Points</p>
              </div>
              <div className="h-10 w-px bg-white/15" />
              <div className="text-center">
                <p className="text-2xl font-bold text-white">
                  {correctCount}
                  <span className="text-white/40 text-sm font-normal">/{sorted.length}</span>
                </p>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Correct</p>
              </div>
              <div className="h-10 w-px bg-white/15" />
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{exam?.passing_score}%</p>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Pass Mark</p>
              </div>
            </div>

            {/* Exam info box */}
            <div className="px-8 py-4 rounded-2xl border border-white/10 bg-white/5 space-y-1 text-center">
              <p className="text-white/80 text-sm font-semibold">{exam?.title}</p>
              <p className="text-white/40 text-xs">{exam?.courses?.groups?.name} · {exam?.courses?.name}</p>
              {(candidate as any).submitted_at && (
                <p className="text-white/30 text-[10px]">Submitted {submittedAt}</p>
              )}
            </div>
          </div>

          {/* Cover footer */}
          <div className="px-12 py-6 border-t border-white/10 flex items-center justify-between shrink-0">
            <p className="text-white/30 text-[10px]">Generated by ICS Expert Analytics</p>
            <p className="text-white/20 text-[9px]">Page 1 of {totalPages}</p>
          </div>
        </Page>

        {/* ══ PAGE 2 — ANSWERS ══ */}
        <Page>
          <PageHeader title="Exam Responses" subtitle={exam?.title} today={today} />

          <div className="px-12 py-7 space-y-6">

            {/* Candidate info */}
            <div className="avoid-break">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Candidate</p>
              <div className="grid grid-cols-2 gap-x-8">
                {[
                  ["Full Name",   (candidate as any).full_name],
                  ["Email",       (candidate as any).email],
                  ["Company",     (candidate as any).company],
                  ["Job Title",   (candidate as any).job_title],
                  ["Experience",  (candidate as any).years_of_experience ? `${(candidate as any).years_of_experience} yr(s)` : "—"],
                  ["Submitted",   submittedAt],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-center gap-3 py-2 border-b border-slate-50">
                    <p className="text-[10px] text-slate-400 w-28 shrink-0">{label}</p>
                    <p className="text-xs font-semibold text-slate-700">{value || "—"}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Score summary */}
            <div className="avoid-break">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Score Summary</p>
              <div className="grid grid-cols-3 divide-x divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                {[
                  { label: "Score",      value: `${score.toFixed(1)}%`, color: passed ? "#059669" : "#DC2626", sub: passed ? "Passed" : "Failed" },
                  { label: "Pass Mark",  value: `${exam?.passing_score}%`, color: "#1B4F8A", sub: "Required to pass" },
                  { label: "Points",     value: `${fmtPts(parseFloat(totalEarned.toFixed(2)))} / ${fmtPts(parseFloat(totalPossible.toFixed(2)))}`, color: "#1B4F8A", sub: `${correctCount} of ${sorted.length} correct` },
                ].map(({ label, value, color, sub }) => (
                  <div key={label} className="py-4 px-3 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                    <p className="text-xl font-bold" style={{ color }}>{value}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Answers */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                Responses ({sorted.length} questions)
              </p>

              <div className="space-y-3">
                {sorted.map((answer, idx) => {
                  const q          = answer.questions
                  const sc: number = answer.score_achieved ?? 0
                  const maxSc      = q?.score ?? 0
                  const full       = sc >= maxSc && maxSc > 0
                  const partial    = sc > 0 && !full
                  const scColor    = full ? "#059669" : partial ? "#D97706" : "#DC2626"
                  const summary    = answerSummary(answer)
                  const rawMax     = rawPossible[idx]
                  const dispMax    = displayPossible[idx]
                  const dispRatio  = rawMax > 0 ? dispMax / rawMax : 0
                  const dispScore  = Math.round(sc * dispRatio * 100) / 100

                  return (
                    <div key={answer.id} className="avoid-break rounded-xl border border-slate-100 overflow-hidden">
                      {/* Card header */}
                      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600 px-2 py-0.5 rounded">
                            {q?.type?.replace(/_/g, " ")}
                          </span>
                          <span className="text-[10px] text-slate-400">Q{idx + 1}</span>
                        </div>
                        <span className="text-xs font-bold" style={{ color: scColor }}>
                          {fmtPts(dispScore)} / {fmtPts(dispMax)} pts
                        </span>
                      </div>

                      {/* Card body */}
                      <div className="px-4 py-3 space-y-2">
                        <p className="text-xs font-semibold text-slate-800 leading-relaxed">{q?.text}</p>

                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Candidate&apos;s Answer</p>
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5 shrink-0">
                              {full    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                : partial ? <MinusCircle  className="h-3.5 w-3.5 text-amber-400" />
                                          : <XCircle      className="h-3.5 w-3.5 text-red-400" />}
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed">{summary}</p>
                          </div>
                        </div>

                        {answer.ai_justification && (
                          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-blue-700 mb-1">Expert Evaluation</p>
                            <p className="text-xs text-blue-800 leading-relaxed">{answer.ai_justification}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* End note */}
            <div className="avoid-break border-t border-slate-100 pt-6 flex flex-col items-center gap-2 text-center">
              <Image src="/logo/logo-dark-blue.png" alt="ICS" width={80} height={22} className="object-contain opacity-25" />
              <p className="text-[10px] text-slate-300 uppercase tracking-widest">ICS Aviation · Integrated Consulting Services</p>
              <p className="text-[10px] text-slate-300 max-w-md">
                This document is confidential and intended for internal use only.
              </p>
            </div>
          </div>

          <PageFooter page={2} total={totalPages} />
        </Page>

      </div>
    </>
  )
}
