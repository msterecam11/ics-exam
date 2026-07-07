import Image from "next/image"
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react"
import type { CourseReport } from "@/lib/lms-course-report"

// ── Shared chrome (matches the exam report) ───────────────────────
function Page({ children, dark = false, first = false }: { children: React.ReactNode; dark?: boolean; first?: boolean }) {
  return (
    <div data-report-page="" className={`relative w-full flex flex-col ${dark ? "bg-[#1B4F8A]" : "bg-white"} ${first ? "overflow-hidden" : "page-break"}`}
      style={first ? { minHeight: "100vh" } : undefined}>
      {children}
    </div>
  )
}
function PageHeader({ title, subtitle, today }: { title: string; subtitle?: string; today: string }) {
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
      <p className="text-[9px] uppercase tracking-widest text-slate-300">ICS Aviation · Integrated Consulting Services · Confidential</p>
      <p className="text-[9px] text-slate-300">Page {page} of {total}</p>
    </div>
  )
}
function CoverRing({ score }: { score: number }) {
  const size = 160, sw = 12, r = (size - sw) / 2, circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(score, 100) / 100)
  const band = score >= 80 ? { label: "Strong", col: "#34d399" } : score >= 60 ? { label: "Developing", col: "#fbbf24" } : { label: "Weak", col: "#f87171" }
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={sw} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={band.col} strokeWidth={sw} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold text-white leading-none">{score}%</span>
        <span className="text-[9px] font-bold tracking-widest uppercase text-white/50 mt-1.5">Overall Mastery</span>
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: band.col }}>{band.label}</span>
      </div>
    </div>
  )
}

const SECTION = "text-[10px] font-bold uppercase tracking-widest text-slate-400"
function scoreColor(p: number | null) { return p === null ? "#94a3b8" : p >= 80 ? "#059669" : p >= 60 ? "#D97706" : "#DC2626" }
function statusLabel(s: string) {
  return ({ passed: "Completed", completed: "Completed", failed: "Completed", in_progress: "In progress", not_started: "Not started" } as Record<string, string>)[s] ?? s
}
function fmtTime(s: number) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m` }
function heat(pct: number) {
  if (pct >= 80) return { bg: "#EAF3DE", border: "#C0DD97", text: "#27500A", tag: "#3B6D11" }
  if (pct >= 60) return { bg: "#E6F1FB", border: "#B5D4F4", text: "#0C447C", tag: "#185FA5" }
  if (pct >= 40) return { bg: "#FAEEDA", border: "#FAC775", text: "#854F0B", tag: "#854F0B" }
  return { bg: "#FCEBEB", border: "#F7C1C1", text: "#A32D2D", tag: "#A32D2D" }
}

// Read-only, fully server-renderable report pages — shared by the PDF print
// page (Puppeteer) and the viewer report page, so both always match exactly.
export default function CourseReportPages({ report }: { report: CourseReport }) {
  const { student, course, enrollment, overall, modules, exam, examSections, topicScores, assignments, topicMastery, assessment, security,
          cohort, examTrajectory, feedback } = report
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  const completed = enrollment.status === "completed"
  const overallScore = overall.score ?? 0
  const totalPages = modules.length > 0 ? 3 : 2

  return (
    <>
      <style>{`
        html, body { margin: 0 !important; padding: 0 !important; }
        .page-break { break-before: page; }
        .avoid-break { break-inside: avoid; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        body { font-family: 'Plus Jakarta Sans', sans-serif; }
      `}</style>

      <div id="report-root" style={{ width: 794, margin: "0 auto", display: "flex", flexDirection: "column", background: "white" }}>

        {/* ══ PAGE 1 — COVER ══ */}
        <Page dark first>
          <div className="absolute top-0 right-0 w-80 h-80 rounded-full pointer-events-none opacity-10" style={{ background: "radial-gradient(circle, #60a5fa, transparent)", transform: "translate(35%,-35%)" }} />
          <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full pointer-events-none opacity-10" style={{ background: "radial-gradient(circle, #93c5fd, transparent)", transform: "translate(-35%,35%)" }} />
          <div className="flex items-center justify-between px-12 pt-10 shrink-0">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36} className="object-contain" />
            <p className="text-white/40 text-xs">{today}</p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-12 text-center gap-7">
            <div className="space-y-3">
              <p className="text-white/50 text-[11px] uppercase tracking-[0.4em]">Individual Course Report</p>
              <div className="flex items-center gap-3 justify-center">
                <div className="h-px w-14 bg-white/20" /><div className="w-1 h-1 rounded-full bg-white/30" /><div className="h-px w-14 bg-white/20" />
              </div>
            </div>
            <div>
              <h1 className="text-4xl font-extrabold text-white tracking-tight">{student.name}</h1>
              {(student.job_title || student.company) && (
                <p className="text-white/50 text-sm mt-2">{[student.job_title, student.company].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <CoverRing score={overallScore} />
            <div className="flex items-center gap-10">
              <div className="text-center"><p className="text-2xl font-bold text-white">{overall.completionPct}%</p><p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Completion</p></div>
              {overall.timeSpent > 0 && <><div className="h-10 w-px bg-white/15" /><div className="text-center"><p className="text-2xl font-bold text-white">{fmtTime(overall.timeSpent)}</p><p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Time Spent</p></div></>}
              {overall.attendancePct !== null && <><div className="h-10 w-px bg-white/15" /><div className="text-center"><p className="text-2xl font-bold text-white">{overall.attendancePct}%</p><p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Attendance</p></div></>}
            </div>
            <div className="px-8 py-4 rounded-2xl border border-white/10 bg-white/5 space-y-1 text-center">
              <p className="text-white/80 text-sm font-semibold">{course.title}</p>
              <div><span className="inline-block text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full" style={{ background: completed ? "rgba(52,211,153,0.18)" : "rgba(96,165,250,0.18)", color: completed ? "#6ee7b7" : "#93c5fd" }}>{completed ? "● Completed" : "● In progress"}</span></div>
              {course.delivery_mode && <p className="text-white/40 text-xs capitalize">{course.delivery_mode}</p>}
              <p className="text-white/30 text-[10px]">
                Enrolled {new Date(enrollment.enrolled_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                {enrollment.completed_at && ` · Completed ${new Date(enrollment.completed_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
              </p>
            </div>
          </div>
          <div className="px-12 py-6 border-t border-white/10 flex items-center justify-between shrink-0">
            <p className="text-white/30 text-[10px]">Generated by ICS Expert Analytics</p>
            <p className="text-white/20 text-[9px]">Page 1 of {totalPages}</p>
          </div>
        </Page>

        {/* ══ PAGE 2 — SUMMARY · EXPERT · TOPICS ══ */}
        <Page>
          <PageHeader title="Performance Summary" subtitle={course.title} today={today} />
          <div className="px-12 py-7 space-y-6">

            {/* Student summary */}
            <div className="avoid-break">
              <p className={`${SECTION} mb-3`}>Student</p>
              <div className="grid grid-cols-2 gap-x-8">
                {[
                  ["Name", student.name], ["Email", student.email],
                  ...(student.job_title ? [["Job Title", student.job_title]] : []),
                  ...(student.company ? [["Company", student.company]] : []),
                  ["Course", course.title], ["Status", enrollment.status],
                  ["Overall Score", overall.score !== null ? `${overall.score}%` : "—"],
                  ...(overall.timeSpent > 0 ? [["Time Spent", fmtTime(overall.timeSpent)]] : []),
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-center gap-3 py-2 border-b border-slate-50">
                    <p className="text-[10px] text-slate-400 w-28 shrink-0">{label}</p>
                    <p className="text-xs font-semibold text-slate-700 capitalize">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Score summary */}
            <div className="avoid-break">
              <p className={`${SECTION} mb-3`}>Score Summary</p>
              <div className="grid grid-cols-3 divide-x divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                {[
                  { label: "Overall Score", value: overall.score !== null ? `${overall.score}%` : "—", color: scoreColor(overall.score), sub: completed ? "Completed" : "In progress" },
                  { label: "Completion", value: `${overall.completionPct}%`, color: "#1B4F8A", sub: `${modules.filter(m => ["passed", "completed"].includes(m.status)).length}/${modules.length} modules completed` },
                  { label: "Final Exam", value: exam?.pct != null ? `${exam.pct}%` : "—", color: exam ? (exam.passed ? "#059669" : "#DC2626") : "#94a3b8", sub: exam ? `${exam.passed ? "Passed" : "Not passed"} · ${exam.attempts}/${exam.maxAttempts}` : "Not attempted" },
                ].map(({ label, value, color, sub }) => (
                  <div key={label} className="py-4 px-3 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                    <p className="text-xl font-bold" style={{ color }}>{value}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Cohort benchmark + improvement trajectory */}
            {(cohort || examTrajectory.length > 1) && (
              <div className="avoid-break grid grid-cols-2 gap-8">
                {cohort && (
                  <div>
                    <p className={`${SECTION} mb-3`}>Cohort Benchmark</p>
                    <div className="grid grid-cols-3 divide-x divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                      <div className="py-3 px-2 text-center"><p className="text-[9px] text-slate-400 uppercase">You</p><p className="text-lg font-bold" style={{ color: scoreColor(cohort.selfScore) }}>{cohort.selfScore}%</p></div>
                      <div className="py-3 px-2 text-center"><p className="text-[9px] text-slate-400 uppercase">Avg</p><p className="text-lg font-bold text-[#1B4F8A]">{cohort.classAvg}%</p></div>
                      <div className="py-3 px-2 text-center"><p className="text-[9px] text-slate-400 uppercase">Rank</p><p className="text-lg font-bold text-slate-700">#{cohort.rank}<span className="text-slate-300 text-xs">/{cohort.total}</span></p></div>
                    </div>
                  </div>
                )}
                {examTrajectory.length > 1 && (
                  <div>
                    <p className={`${SECTION} mb-3`}>Exam Improvement</p>
                    <div className="flex items-end gap-3 border border-slate-100 rounded-xl p-3" style={{ height: 92 }}>
                      {examTrajectory.map((a, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                          <p className="text-[10px] font-bold mb-0.5" style={{ color: scoreColor(a.pct) }}>{a.pct}%</p>
                          <div className="w-full rounded-t" style={{ height: `${Math.max(4, a.pct)}%`, background: scoreColor(a.pct) }} />
                          <p className="text-[8px] text-slate-400 mt-0.5">{i === examTrajectory.length - 1 ? "Final" : `#${a.attemptNo}`}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Expert assessment */}
            <div className="avoid-break">
              <p className={`${SECTION} mb-3`}>Expert Assessment</p>
              {assessment ? (
                <div className="space-y-3">
                  <div className="bg-[#1B4F8A]/5 border border-[#1B4F8A]/10 rounded-xl p-4">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#1B4F8A] mb-1">Executive Summary</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{assessment.executiveSummary}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 mb-1.5">Key Strengths</p>
                      {assessment.strengths.map((s, i) => <p key={i} className="text-[10px] text-emerald-800 leading-relaxed mb-1">• {s}</p>)}
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-red-600 mb-1.5">Weakness Areas</p>
                      {assessment.weaknesses.map((s, i) => <p key={i} className="text-[10px] text-red-800 leading-relaxed mb-1">• {s}</p>)}
                    </div>
                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-purple-700 mb-1.5">Development Areas</p>
                      {assessment.recommendations.map((r, i) => <p key={i} className="text-[10px] text-purple-800 leading-relaxed mb-1">• {r.action}</p>)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-400 text-center">
                  No expert assessment generated yet.
                </div>
              )}
            </div>

            {/* Topic mastery + Assessment detail */}
            <div className="avoid-break grid grid-cols-2 gap-8">
              <div>
                <p className={`${SECTION} mb-3`}>Mastery by Module</p>
                <div className="space-y-1.5">
                  {modules.filter(m => m.masteryScore !== null).sort((a, b) => (b.masteryScore ?? 0) - (a.masteryScore ?? 0)).map(m => {
                    const p = m.masteryScore as number
                    return (
                      <div key={m.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-600 truncate">{m.title}</span>
                        <span className="text-[10px] font-bold shrink-0" style={{ color: p >= 80 ? "#059669" : p >= 60 ? "#D97706" : "#DC2626" }}>
                          {p >= 80 ? "Strong" : p >= 60 ? "Developing" : "Weak"} · {p}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div>
                <p className={`${SECTION} mb-3`}>Assessment Detail</p>
                <div className="space-y-2 text-xs">
                  {exam && <div className="flex justify-between"><span className="text-slate-400">Final exam</span><span className="font-semibold text-slate-700">{exam.pct}% · {exam.passed ? "passed" : "not passed"}</span></div>}
                  {assignments.map((a, i) => <div key={i} className="flex justify-between"><span className="text-slate-400 truncate">{a.title}</span><span className="font-semibold text-slate-700">{a.score != null ? `${a.score}/${a.maxScore}` : a.status}</span></div>)}
                  {overall.sessionTotal > 0 && <div className="flex justify-between"><span className="text-slate-400">Attendance</span><span className="font-semibold text-slate-700">{overall.presentCount}/{overall.sessionTotal} · {overall.attendancePct}%</span></div>}
                </div>
              </div>
            </div>

            {/* Topic mastery heatmap — per exam topic, grouped by module */}
            {topicScores.length > 0 && (
              <div className="avoid-break">
                <p className={`${SECTION} mb-3`}>Topic Mastery — each topic tested by the exam</p>
                <div className="grid grid-cols-4 gap-2">
                  {topicScores.map((t, i) => {
                    const c = heat(t.pct)
                    return (
                      <div key={i} style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: 8 }}>
                        <p className="text-[8px] font-bold uppercase tracking-wide truncate" style={{ color: c.tag }}>{t.module.replace(/^Module\s*\d+\s*[-–:]\s*/i, "")}</p>
                        <p className="text-[10px] leading-tight mt-0.5 mb-1 text-slate-700">{t.topic}</p>
                        <p className="text-sm font-bold" style={{ color: c.text }}>{t.pct}%<span className="text-[9px] font-normal text-slate-400 ml-1">{t.correct}/{t.questionCount}</span></p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Learner feedback — only when the course collects it by name */}
            {feedback && (feedback.ratings.length > 0 || feedback.comment) && (
              <div className="avoid-break">
                <p className={`${SECTION} mb-3`}>Learner Feedback</p>
                <div className="border border-slate-100 rounded-xl p-4 space-y-2">
                  {feedback.ratings.length > 0 && (
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                      {feedback.ratings.map((r, i) => (
                        <span key={i} className="text-[11px] text-slate-600">{r.label}: <span className="font-semibold text-amber-500">{r.value}/5</span></span>
                      ))}
                    </div>
                  )}
                  {feedback.comment && <p className="text-[11px] text-slate-600 italic leading-relaxed border-l-2 border-[#1B4F8A]/30 pl-3">&ldquo;{feedback.comment}&rdquo;</p>}
                </div>
              </div>
            )}
          </div>
          <PageFooter page={2} total={totalPages} />
        </Page>

        {/* ══ PAGE 3 — MODULE BREAKDOWN ══ */}
        {modules.length > 0 && (
          <Page>
            <PageHeader title="Module Breakdown" subtitle={course.title} today={today} />
            <div className="px-12 py-7 space-y-4">
              {modules.map((m, mi) => (
                <div key={m.id} className="avoid-break border border-slate-200 rounded-xl overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                    <span className="w-5 h-5 rounded-md bg-[#1B4F8A] text-white text-[10px] font-bold flex items-center justify-center">{mi + 1}</span>
                    <span className="text-xs font-bold text-slate-800 flex-1">{m.title}</span>
                    <span className="text-sm font-bold" style={{ color: scoreColor(m.masteryScore) }}>{m.masteryScore !== null ? `${m.masteryScore}%` : "—"}</span>
                    <span className="text-[9px] font-bold uppercase" style={{ color: scoreColor(m.masteryScore) }}>{statusLabel(m.status)}</span>
                  </div>
                  {/* Overview */}
                  {(m.summary || m.topics.length > 0) && (
                    <div className="px-4 py-3 border-b border-dashed border-slate-100">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[#1B4F8A] mb-1.5">Module overview</p>
                      {m.summary && <p className="text-[11px] text-slate-500 leading-relaxed mb-2 italic">{m.summary}</p>}
                      <div className="flex flex-wrap gap-1">{m.topics.slice(0, 6).map(t => <span key={t} className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{t}</span>)}</div>
                    </div>
                  )}
                  {/* AI analysis of this module — only when there's something assessed */}
                  {m.ai && m.masteryScore !== null && (
                    <div className="px-4 py-3 border-b border-dashed border-slate-100" style={{ background: "#faf5ff" }}>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-purple-700 mb-1">Expert analysis</p>
                      {m.ai.summary && <p className="text-[11px] text-slate-600 leading-relaxed mb-1.5">{m.ai.summary}</p>}
                      <div className="grid grid-cols-3 gap-2">
                        <div><p className="text-[8px] font-bold uppercase tracking-wider text-emerald-700 mb-0.5">Strengths</p>{m.ai.strengths.length ? m.ai.strengths.map((s, i) => <p key={i} className="text-[10px] text-emerald-800 leading-snug">• {s}</p>) : <p className="text-[10px] text-emerald-800/50 italic">{(m.masteryScore ?? 0) < 40 ? "None at this level" : "—"}</p>}</div>
                        <div><p className="text-[8px] font-bold uppercase tracking-wider text-red-600 mb-0.5">Weaknesses</p>{m.ai.weaknesses.length ? m.ai.weaknesses.map((s, i) => <p key={i} className="text-[10px] text-red-800 leading-snug">• {s}</p>) : <p className="text-[10px] text-red-800/50 italic">{(m.masteryScore ?? 0) >= 80 ? "None — strong across this module" : "—"}</p>}</div>
                        <div><p className="text-[8px] font-bold uppercase tracking-wider text-purple-700 mb-0.5">Development</p>{m.ai.development.length ? m.ai.development.map((s, i) => <p key={i} className="text-[10px] text-purple-800 leading-snug">• {s}</p>) : <p className="text-[10px] text-purple-800/50 italic">{(m.masteryScore ?? 0) >= 80 ? "Maintain current level" : "—"}</p>}</div>
                      </div>
                    </div>
                  )}
                  {/* What the learner did */}
                  <div className="px-4 py-3">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-[#1B4F8A] mb-2">What the learner did{m.timeSpent > 0 ? ` · ${fmtTime(m.timeSpent)}` : ""}</p>
                    {m.items.length > 0 ? (
                      <div className="rounded-lg border border-slate-100 overflow-hidden">
                        {m.items.map((it, ii) => {
                          const ok = it.passed === true || (it.pct ?? 0) >= 70
                          const partial = !ok && (it.pct ?? 0) >= 40
                          return (
                            <div key={ii}>
                              <div className={`flex items-center gap-2 px-3 py-1.5 border-b border-slate-50 last:border-0 ${ii % 2 ? "bg-slate-50/60" : "bg-white"}`}>
                                {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> : partial ? <MinusCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                                <span className="text-[11px] text-slate-600 flex-1">{it.title}</span>
                                {it.activity_type && <span className="text-[8px] font-bold uppercase bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">{it.activity_type.replace(/_/g, " ")}</span>}
                                <span className="text-[11px] font-bold w-9 text-right" style={{ color: scoreColor(it.pct) }}>{it.pct != null ? `${it.pct}%` : "✓"}</span>
                              </div>
                              {it.ai && (
                                <div className="bg-blue-50 border-t border-blue-100 px-3 py-2">
                                  <p className="text-[8px] font-bold uppercase tracking-wider text-blue-700 mb-0.5">Expert evaluation</p>
                                  <p className="text-[10px] text-blue-800 leading-relaxed">{it.ai}</p>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-300 italic">No graded items recorded for this module.</p>
                    )}
                  </div>
                  {m.examSection && m.examSection.questions.length > 0 && (
                    <div className="px-4 py-3 border-t border-slate-100">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[#1B4F8A] mb-2">Final Exam — this module&apos;s section</p>
                      <div className="flex gap-2 flex-wrap mb-2">
                        {[
                          { label: "Questions", val: m.examSection.questions.length },
                          { label: "Correct", val: m.examSection.correct },
                          { label: "Zero", val: m.examSection.zero },
                          { label: "Points", val: `${m.examSection.earned}/${m.examSection.possible}` },
                        ].map(s => <div key={s.label} className="px-2.5 py-1 rounded-lg text-center bg-slate-100 text-slate-700"><p className="text-[11px] font-bold">{s.val}</p><p className="text-[8px] uppercase tracking-wide opacity-70">{s.label}</p></div>)}
                        <div className="px-2.5 py-1 rounded-lg text-center" style={{ background: scoreColor(m.examSection.pct), color: "#fff" }}><p className="text-[11px] font-bold">{m.examSection.pct}%</p><p className="text-[8px] uppercase tracking-wide opacity-90">Section</p></div>
                      </div>
                      <div className="rounded-lg border border-slate-100 overflow-hidden">
                        {m.examSection.questions.map((q, qi) => {
                          const full = q.scoreAchieved >= q.points && q.points > 0
                          return (
                            <div key={qi} className={`flex items-start gap-2 px-3 py-1.5 border-b border-slate-50 last:border-0 ${qi % 2 ? "bg-slate-50/60" : ""}`}>
                              {full ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" /> : <XCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />}
                              <p className="flex-1 text-[10px] text-slate-600 leading-snug">{q.text}</p>
                              <span className="text-[10px] font-bold text-slate-700 shrink-0">{q.scoreAchieved}<span className="text-slate-300 font-normal">/{q.points}</span></span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {exam && examSections.length > 0 && (
                <div className="avoid-break space-y-2 pt-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Final Exam — Performance by Section ({exam.pct}% · {exam.passed ? "passed" : "not passed"})</p>
                  <div className="rounded-lg border border-slate-100 overflow-hidden">
                    {examSections.map((s, si) => (
                      <div key={si} className={`flex items-center gap-3 px-3 py-2 border-b border-slate-50 last:border-0 ${si % 2 ? "bg-slate-50/60" : ""}`}>
                        <span className="text-[11px] text-slate-700 flex-1">{s.title}</span>
                        <span className="text-[9px] text-slate-400">{s.correct}/{s.questionCount} correct · {s.earned}/{s.possible} pts</span>
                        <span className="text-[11px] font-bold w-10 text-right" style={{ color: scoreColor(s.pct) }}>{s.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {assessment && assessment.recommendations.length > 0 && (
                <div className="avoid-break space-y-2 pt-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Recommendations based on results</p>
                  {assessment.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 border border-slate-100 rounded-xl bg-slate-50/80">
                      <div className="w-6 h-6 rounded-full bg-[#1B4F8A] flex items-center justify-center text-white text-[11px] font-bold shrink-0">{i + 1}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2"><p className="text-xs font-semibold text-slate-700">{rec.area}</p>{rec.score !== null && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: scoreColor(rec.score) }}>{rec.score}%</span>}</div>
                        <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{rec.action}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {security?.analysis && (
                <div className="avoid-break pt-2 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Security &amp; Integrity</p>
                  <div className="flex gap-2 flex-wrap">
                    <div className="px-2.5 py-1 rounded-lg text-center text-white" style={{ background: security.riskLevel === "clean" ? "#059669" : security.riskLevel === "medium" ? "#D97706" : "#DC2626" }}><p className="text-[11px] font-bold capitalize">{security.riskLevel}</p><p className="text-[8px] uppercase tracking-wide opacity-90">Risk</p></div>
                    {[["Tabs", security.tabs], ["Fullscreen", security.fs], ["Right-clicks", security.rightClicks], ["Copy", security.copyAttempts]].map(([l, v]) => (<div key={l as string} className="px-2.5 py-1 rounded-lg text-center bg-slate-100 text-slate-700"><p className="text-[11px] font-bold">{v as number}</p><p className="text-[8px] uppercase tracking-wide opacity-70">{l as string}</p></div>))}
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3"><p className="text-[9px] font-bold uppercase tracking-wider text-blue-700 mb-0.5">Expert Integrity Assessment</p><p className="text-[11px] text-blue-800 leading-relaxed">{security.analysis}</p></div>
                </div>
              )}
              <div className="avoid-break border-t border-slate-100 pt-5 flex flex-col items-center gap-2 text-center">
                <Image src="/logo/logo-dark-blue.png" alt="ICS" width={80} height={22} className="object-contain opacity-20" />
                <p className="text-[10px] text-slate-300 uppercase tracking-widest">ICS Aviation · Integrated Consulting Services</p>
                <p className="text-[10px] text-slate-300 max-w-md">This report is generated from the ICS Learning Management System and is for internal use only.</p>
              </div>
            </div>
            <PageFooter page={totalPages} total={totalPages} />
          </Page>
        )}
      </div>
    </>
  )
}
