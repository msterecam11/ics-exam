"use client"

import React from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import {
  BrainCircuit, Sparkles, AlertTriangle,
  LayoutDashboard, Trophy, GitCompare, Target,
} from "lucide-react"
import type { CandidateReportData, GroupStatsData } from "@/lib/interview-scoring"
import { normaliseVerdictThresholds } from "@/lib/interview-scoring"

// ─── Inline SVG Chart (SSR-safe, no Recharts) ────────────────────────────────

const OVERLAY_COLORS = ["#1B4F8A","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#f97316","#ec4899"]

function SVGRadarOverlay({ pillars, candidates, size = 270 }: {
  pillars: string[]
  candidates: { name: string; scores: number[] }[]
  size?: number
}) {
  if (pillars.length < 3 || candidates.length === 0) return null
  const n = pillars.length
  const cx = size / 2, cy = size / 2, r = size * 0.28, lr = size * 0.46
  const angles = pillars.map((_, i) => (i * 2 * Math.PI) / n - Math.PI / 2)
  const pt = (ang: number, radius: number) => ({ x: cx + radius * Math.cos(ang), y: cy + radius * Math.sin(ang) })
  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0]
  return (
    <div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {gridLevels.map(lv => (
          <polygon key={lv}
            points={angles.map(a => { const p = pt(a, r * lv); return `${p.x},${p.y}` }).join(" ")}
            fill="none" stroke="#e2e8f0" strokeWidth="0.8" />
        ))}
        {angles.map((ang, i) => { const end = pt(ang, r); return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#e2e8f0" strokeWidth="0.8" /> })}
        {candidates.map((c, ci) => {
          const col = OVERLAY_COLORS[ci % OVERLAY_COLORS.length]
          const dataStr = c.scores.map((s, i) => { const pos = pt(angles[i], (Math.min(s, 5) / 5) * r); return `${pos.x},${pos.y}` }).join(" ")
          return <polygon key={ci} points={dataStr} fill={col} fillOpacity="0.12" stroke={col} strokeWidth="1.8" />
        })}
        {pillars.map((p, i) => {
          const pos = pt(angles[i], lr)
          const short = p.length > 13 ? p.slice(0, 12) + "…" : p
          return (
            <text key={i} x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="middle"
              fontSize="9" fill="#64748b" fontFamily="sans-serif">{short}</text>
          )
        })}
      </svg>
      <div className="flex items-center gap-3 flex-wrap justify-center mt-2">
        {candidates.map((c, ci) => (
          <div key={ci} className="flex items-center gap-1.5">
            <div className="w-3 h-2 rounded" style={{ background: OVERLAY_COLORS[ci % OVERLAY_COLORS.length], opacity: 0.8 }} />
            <span className="text-[9px] text-slate-500">{c.name.split(" ")[0]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VERDICT_STYLE: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  strong_yes: { color: "#059669", bg: "#d1fae5", border: "#a7f3d0", dot: "#10b981" },
  yes:        { color: "#2563eb", bg: "#dbeafe", border: "#bfdbfe", dot: "#3b82f6" },
  marginal:   { color: "#d97706", bg: "#fef3c7", border: "#fde68a", dot: "#f59e0b" },
  no:         { color: "#dc2626", bg: "#fee2e2", border: "#fca5a5", dot: "#ef4444" },
}

const VERDICT_BADGE: Record<string, string> = {
  strong_yes: "bg-emerald-100 text-emerald-700 border-emerald-200",
  yes:        "bg-blue-100 text-blue-700 border-blue-200",
  marginal:   "bg-amber-100 text-amber-700 border-amber-200",
  no:         "bg-red-100 text-red-600 border-red-200",
}

const READINESS_LABEL: Record<string, string> = {
  strong_yes: "Ready",
  yes:        "Conditionally Ready",
  marginal:   "Conditionally Ready",
  no:         "Dev. Required",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number, strongYesMin = 4.0, yesMin = 3.0) {
  if (score >= strongYesMin) return { text: "#059669", bg: "#d1fae5", border: "#a7f3d0" }
  if (score >= yesMin)       return { text: "#d97706", bg: "#fef3c7", border: "#fde68a" }
  return                            { text: "#dc2626", bg: "#fee2e2", border: "#fca5a5" }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CoverRing({ avgScore, readyCount, conditionalCount, total, strongYesMin = 4.0, yesMin = 3.0 }: {
  avgScore: number; readyCount: number; conditionalCount: number; total: number
  strongYesMin?: number; yesMin?: number
}) {
  const size        = 200, sw = 14, r = (size - sw) / 2
  const circ        = 2 * Math.PI * r
  const offset      = circ * (1 - Math.min(avgScore / 5, 1))
  const col         = avgScore >= strongYesMin ? "#34d399" : avgScore >= yesMin ? "#fbbf24" : "#f87171"
  const readyPct    = total > 0 ? Math.round((readyCount / total) * 100) : 0
  const positivePct = total > 0 ? Math.round(((readyCount + conditionalCount) / total) * 100) : 0
  const labelCol    = positivePct >= 70 ? "#34d399" : positivePct >= 40 ? "#fbbf24" : "#f87171"
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={sw} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col}
          strokeWidth={sw} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-4">
        <span className="text-4xl font-extrabold text-white leading-none">{avgScore.toFixed(2)}</span>
        <span className="text-[11px] text-white/50 font-semibold tracking-widest">/ 5.00 AVG</span>
        <span className="font-black tracking-wider uppercase mt-1 text-[11px]" style={{ color: labelCol }}>{readyPct}% READY</span>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#1B4F8A] shrink-0 whitespace-nowrap">{children}</p>
      <div className="flex-1 h-[1.5px] bg-[#1B4F8A]/15" />
    </div>
  )
}

function Page({ children, dark = false, first = false }: { children: React.ReactNode; dark?: boolean; first?: boolean }) {
  return (
    <div data-report-page=""
      className={`relative w-full flex flex-col ${dark ? "bg-[#1B4F8A]" : "bg-white"} ${first ? "overflow-hidden" : "page-break"}`}
      style={first ? { height: 1122 } : { minHeight: 1122 }}>
      {children}
    </div>
  )
}

function PageHeader({ light = false, title, subtitle, today }: { light?: boolean; title: string; subtitle?: string; today: string }) {
  return (
    <div className={`flex items-center justify-between px-12 pt-8 pb-5 border-b shrink-0 ${light ? "border-white/15" : "border-[#1B4F8A] border-b-2"}`}>
      <Image src={light ? "/logo/logo-white.png" : "/logo/logo-dark-blue.png"} alt="ICS Aviation" width={110} height={30} className="object-contain" />
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
    <div className={`px-12 py-4 border-t shrink-0 flex items-center justify-between mt-auto ${light ? "border-white/10" : "border-slate-100"}`}>
      <p className={`text-[9px] uppercase tracking-widest ${light ? "text-white/30" : "text-slate-300"}`}>ICS Aviation · Integrated Consulting Services · Confidential</p>
      <p className={`text-[9px] ${light ? "text-white/30" : "text-slate-300"}`}>Page {page} of {total}</p>
    </div>
  )
}

function PageBanner({ title, icon, trackName, groupName, today, readiness, readinessBg, readinessBorder, readinessColor }: {
  title: string; icon: React.ReactNode
  trackName: string; groupName: string; today: string
  readiness: string; readinessBg: string; readinessBorder: string; readinessColor: string
}) {
  return (
    <div className="avoid-break flex items-center gap-4 pb-4 mb-2 border-b-2 border-[#1B4F8A]/10">
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#1B4F8A] shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <h2 className="text-xl font-extrabold text-[#1B4F8A] tracking-tight">{title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{trackName} · {groupName} · {today}</p>
      </div>
      <div className="rounded-lg px-3 py-1.5 border shrink-0" style={{ background: readinessBg, borderColor: readinessBorder }}>
        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: readinessColor }}>{readiness}</p>
      </div>
    </div>
  )
}

function GroupBulletPanel({ text, label, color = "blue", hasExpert = false, onGenerate }: {
  text?: string | null; label: string
  color?: "blue" | "amber" | "purple" | "emerald" | "slate"
  hasExpert?: boolean; onGenerate?: () => void
}) {
  const palette = {
    blue:    { header: "bg-[#1B4F8A]",   body: "bg-blue-50/70 border-blue-100",       dot: "#1B4F8A"  },
    amber:   { header: "bg-amber-500",   body: "bg-amber-50/70 border-amber-100",     dot: "#d97706"  },
    purple:  { header: "bg-purple-600",  body: "bg-purple-50/70 border-purple-100",   dot: "#9333ea"  },
    emerald: { header: "bg-emerald-600", body: "bg-emerald-50/70 border-emerald-100", dot: "#059669"  },
    slate:   { header: "bg-slate-700",   body: "bg-slate-50 border-slate-200",        dot: "#475569"  },
  }[color]

  if (!text) {
    if (hasExpert) return null
    return (
      <div className={cn("no-print avoid-break flex items-center gap-2.5 text-sm text-slate-400 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 transition-colors",
          onGenerate && "cursor-pointer hover:bg-purple-50 hover:border-purple-200 hover:text-slate-500")}
        onClick={onGenerate}>
        <Sparkles className="h-4 w-4 shrink-0 text-purple-400" />
        <span>Click <strong className="text-purple-600 font-semibold">Generate Expert Report</strong> to add <em className="not-italic text-slate-500 font-medium">{label}</em> here.</span>
      </div>
    )
  }

  const nlLines = text.split("\n").map(l => l.replace(/^[•\-\*\d\.]\s*/, "").trim()).filter(Boolean)
  const lines   = nlLines.length > 1 ? nlLines : (text.match(/[^.!?]+[.!?]+/g) ?? [text]).map(s => s.trim()).filter(Boolean)

  return (
    <div className="avoid-break rounded-xl overflow-hidden border">
      <div className={`${palette.header} px-4 py-2 flex items-center gap-2`}>
        <BrainCircuit className="h-3.5 w-3.5 text-white/70" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/90">{label}</p>
      </div>
      <div className={`${palette.body} border px-4 py-3`}>
        <ul className="space-y-2">
          {lines.map((line, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: palette.dot }} />
              <span className="text-xs text-slate-700 leading-relaxed">{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ─── Canvas Props ─────────────────────────────────────────────────────────────

interface TrackReportCanvasProps {
  group: any
  track: { id: string; name: string }
  candidates: any[]
  reports: CandidateReportData[]
  track_stats: GroupStatsData
  snapshot: any
  aiCache: Record<string, string>
  generating?: boolean
  onGenerate?: () => void
}

// ─── Main Canvas ──────────────────────────────────────────────────────────────

export default function TrackReportCanvas({
  group, track, candidates, reports, track_stats, snapshot,
  aiCache, generating, onGenerate,
}: TrackReportCanvasProps) {

  const candidateMap = Object.fromEntries(candidates.map((c: any) => [c.id, c]))
  const hasExpert    = Object.keys(aiCache).length > 0
  const today        = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })

  // Derive score thresholds from snapshot config
  const _thresholds  = normaliseVerdictThresholds(snapshot?.verdict_thresholds ?? [])
  const strongYesMin = _thresholds.find(t => t.verdict === "strong_yes")?.min ?? 4.0
  const yesMin       = _thresholds.find(t => t.verdict === "yes")?.min       ?? 3.0
  // Bound scoreColor using config thresholds
  const sc = (s: number) => scoreColor(s, strongYesMin, yesMin)
  const scheduledDate = group.scheduled_date
    ? new Date(group.scheduled_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null

  const sortedReports    = [...reports].sort((a, b) => b.overall_score - a.overall_score)
  const avgScore         = reports.length > 0 ? reports.reduce((s, r) => s + r.overall_score, 0) / reports.length : 0
  const readyCount       = track_stats.verdict_distribution.strong_yes ?? 0
  const conditionalCount = (track_stats.verdict_distribution.yes ?? 0) + (track_stats.verdict_distribution.marginal ?? 0)
  const devRequiredCount = track_stats.verdict_distribution.no ?? 0
  const readyPct         = candidates.length > 0 ? Math.round((readyCount / candidates.length) * 100) : 0
  const hasDiv           = track_stats.divergent_competencies.length > 0

  // Active pillars — only those with at least one score > 0
  const activePillarIds = new Set<string>()
  for (const r of reports) {
    for (const pr of r.pillar_results) {
      if (pr.pillar_score > 0) activePillarIds.add(pr.pillar.id)
    }
  }
  const activePillars        = (snapshot.pillars ?? []).filter((p: any) => activePillarIds.has(p.id))
  const activePillarAverages = track_stats.pillar_averages.filter((p: any) => p.avg > 0)

  // Competency cohort averages (active pillars only)
  const compAvgMap: Record<string, { name: string; pillar: string; total: number; count: number }> = {}
  for (const r of reports) {
    for (const pr of r.pillar_results) {
      if (!activePillarIds.has(pr.pillar.id)) continue
      for (const cr of pr.competency_results) {
        if (!compAvgMap[cr.competency.id])
          compAvgMap[cr.competency.id] = { name: cr.competency.name, pillar: pr.pillar.name, total: 0, count: 0 }
        compAvgMap[cr.competency.id].total += cr.weighted_avg
        compAvgMap[cr.competency.id].count++
      }
    }
  }
  const compAvgs           = Object.entries(compAvgMap).map(([id, v]) => ({ id, name: v.name, pillar: v.pillar, avg: v.count > 0 ? v.total / v.count : 0 })).sort((a, b) => b.avg - a.avg)
  const topCompetencies    = compAvgs.slice(0, 3)
  const bottomCompetencies = [...compAvgs].sort((a, b) => a.avg - b.avg).slice(0, 3)

  // Competency table grouped by active pillar
  const pillarCompTable = activePillars.map((p: any) => ({
    pillar: p,
    rows: (p.competencies ?? []).map((c: any) => {
      const scores = sortedReports.map(r => {
        const pr = r.pillar_results.find((x: any) => x.pillar.id === p.id)
        const cr = pr?.competency_results.find((x: any) => x.competency.id === c.id)
        return (cr?.weighted_avg ?? 0) > 0 ? (cr?.weighted_avg ?? null) : null
      })
      const valid = scores.filter((s): s is number => s !== null)
      const avg   = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0
      return { competency: c, scores, avg }
    }),
  }))

  // Radar overlay (active pillars only)
  const pillarNames     = activePillars.map((p: any) => p.name) as string[]
  const radarCandidates = sortedReports.map(r => ({
    name:   candidateMap[r.candidate_id]?.full_name ?? "Unknown",
    scores: activePillars.map((p: any) => {
      const pr = r.pillar_results.find((x: any) => x.pillar.id === p.id)
      return pr?.pillar_score ?? 0
    }),
  }))

  // Color reflects combined positive outcomes (Ready + Conditionally Ready)
  const positivePct     = candidates.length > 0 ? Math.round(((readyCount + conditionalCount) / candidates.length) * 100) : 0
  const readinessColor  = positivePct >= 70 ? "#059669" : positivePct >= 40 ? "#d97706" : "#dc2626"
  const readinessBg     = positivePct >= 70 ? "#d1fae5" : positivePct >= 40 ? "#fef3c7" : "#fee2e2"
  const readinessBorder = positivePct >= 70 ? "#a7f3d0" : positivePct >= 40 ? "#fde68a" : "#fca5a5"

  const bannerProps = { trackName: track.name, groupName: group.name, today, readiness: `${readyCount} Ready`, readinessBg, readinessBorder, readinessColor }
  const candidateChunks: any[][] = []
  for (let i = 0; i < candidates.length; i += 2) candidateChunks.push(candidates.slice(i, i + 2))
  const totalPages = 4 + candidateChunks.length

  return (
    <>
      <style>{`
        .page-break  { break-before: page; }
        .avoid-break { break-inside: avoid; }
        @media print {
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div id="report-root" className="flex flex-col gap-5 print:gap-0 print:bg-white" style={{ width: 794 }}>

        {/* ══ PAGE 1 — COVER ══ */}
        <Page dark first>
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full pointer-events-none opacity-10"
            style={{ background: "radial-gradient(circle, #60a5fa, transparent)", transform: "translate(35%,-35%)" }} />
          <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full pointer-events-none opacity-10"
            style={{ background: "radial-gradient(circle, #93c5fd, transparent)", transform: "translate(-35%,35%)" }} />
          <div className="flex items-center justify-between px-12 pt-10 shrink-0">
            <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36} className="object-contain" />
            <p className="text-white/40 text-xs">{today}</p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-12 text-center gap-8">
            <div className="space-y-3">
              <p className="text-white/50 text-[11px] uppercase tracking-[0.4em]">Panel Interview · Role Assessment Report</p>
              <div className="flex items-center gap-3 justify-center">
                <div className="h-px w-14 bg-white/20" /><div className="w-1 h-1 rounded-full bg-white/30" /><div className="h-px w-14 bg-white/20" />
              </div>
            </div>
            <div>
              <h1 className="text-4xl font-extrabold text-white tracking-tight">{track.name}</h1>
              <p className="text-white/50 text-sm mt-2">{group.name}</p>
              <p className="text-white/30 text-xs mt-1">{snapshot.name}</p>
              {scheduledDate && <p className="text-white/25 text-xs mt-1">{scheduledDate}</p>}
            </div>
            <CoverRing avgScore={avgScore} readyCount={readyCount} conditionalCount={conditionalCount} total={candidates.length} strongYesMin={strongYesMin} yesMin={yesMin} />
            <div className="flex items-center gap-8">
              {[
                { label: "Candidates", value: candidates.length },
                { label: "Ready",      value: readyCount },
                { label: "Pillars",    value: activePillars.length },
              ].map((kpi, i, arr) => (
                <div key={kpi.label} className="flex items-center gap-8">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white">{kpi.value}</p>
                    <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">{kpi.label}</p>
                  </div>
                  {i < arr.length - 1 && <div className="h-10 w-px bg-white/15" />}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 flex-wrap justify-center">
              {(["strong_yes", "yes", "marginal", "no"] as const).map(v => {
                const count = track_stats.verdict_distribution[v] ?? 0
                if (count === 0) return null
                return (
                  <div key={v} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/15">
                    <div className="w-2 h-2 rounded-full" style={{ background: VERDICT_STYLE[v].dot }} />
                    <span className="text-white/80 text-xs font-semibold">{READINESS_LABEL[v]}</span>
                    <span className="text-white font-bold text-sm">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="px-12 py-6 border-t border-white/10 flex items-center justify-between shrink-0">
            <p className="text-white/30 text-[10px]">ICS Aviation · Integrated Consulting Services · Confidential</p>
            <p className="text-white/20 text-[9px]">Page 1 of {totalPages}</p>
          </div>
        </Page>

        {/* ══ PAGE 2 — ROLE OVERVIEW ══ */}
        <Page>
          <PageHeader title="Role Overview" subtitle={`${track.name} · ${group.name}`} today={today} />
          <div className="px-12 py-6 space-y-5">
            <PageBanner {...bannerProps} title="Role Overview" icon={<LayoutDashboard className="h-5 w-5 text-white" />} />
            <div className="avoid-break flex items-start justify-between gap-6 pb-5 border-b-2 border-slate-100">
              <div className="space-y-1.5">
                <h2 className="text-2xl font-extrabold text-[#1B4F8A] tracking-tight">{track.name}</h2>
                <p className="text-sm text-slate-500">{group.name} · {snapshot.name}</p>
                {scheduledDate && <p className="text-xs text-slate-400">Assessment date: {scheduledDate}</p>}
                <p className="text-xs text-slate-400">{candidates.length} candidate{candidates.length !== 1 ? "s" : ""} assessed in this role</p>
              </div>
              <div className="rounded-2xl px-8 py-4 text-center border-2 shrink-0" style={{ background: readinessBg, borderColor: readinessBorder }}>
                <p className="text-4xl font-black tabular-nums" style={{ color: readinessColor }}>{avgScore.toFixed(2)}</p>
                <p className="text-[10px] font-semibold mt-0.5" style={{ color: readinessColor }}>/ 5.00 ROLE AVG</p>
                <p className="text-xs font-black uppercase tracking-widest mt-1" style={{ color: readinessColor }}>{readyPct}% Ready</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 avoid-break">
              {[
                { label: "Total Candidates",   value: candidates.length,   color: "text-[#1B4F8A]",  bg: "bg-[#1B4F8A]/5 border-[#1B4F8A]/20" },
                { label: "Ready",              value: readyCount,          color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200"   },
                { label: "Conditionally Ready",value: conditionalCount,    color: "text-blue-600",    bg: "bg-blue-50 border-blue-200"         },
                { label: "Dev. Required",      value: devRequiredCount,    color: "text-red-600",     bg: "bg-red-50 border-red-200"           },
              ].map(kpi => (
                <div key={kpi.label} className={cn("rounded-xl border p-3 text-center", kpi.bg)}>
                  <p className={cn("text-2xl font-black", kpi.color)}>{kpi.value}</p>
                  <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5 leading-tight">{kpi.label}</p>
                </div>
              ))}
            </div>
            <div className="avoid-break">
              <SectionTitle>Pillar Performance — Role Average</SectionTitle>
              <div className="space-y-2.5">
                {activePillarAverages.map((p: any) => {
                  const pc = sc(p.avg)
                  return (
                    <div key={p.pillar_id ?? p.pillar_name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-700">{p.pillar_name}</span>
                        <span className="text-sm font-black tabular-nums" style={{ color: pc.text }}>{p.avg.toFixed(2)}</span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(p.avg / 5) * 100}%`, background: pc.text }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="avoid-break grid grid-cols-2 gap-4">
              <div>
                <SectionTitle>Role Strengths</SectionTitle>
                <div className="space-y-2">
                  {topCompetencies.map(ca => {
                    const cc = sc(ca.avg)
                    return (
                      <div key={ca.id} className="flex items-center justify-between rounded-lg px-3 py-2 border" style={{ background: cc.bg, borderColor: cc.border }}>
                        <p className="text-xs font-semibold text-slate-700">{ca.name}</p>
                        <span className="text-sm font-black tabular-nums" style={{ color: cc.text }}>{ca.avg.toFixed(2)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div>
                <SectionTitle>Key Gaps</SectionTitle>
                <div className="space-y-2">
                  {bottomCompetencies.map(ca => {
                    const cc = sc(ca.avg)
                    return (
                      <div key={ca.id} className="flex items-center justify-between rounded-lg px-3 py-2 border" style={{ background: cc.bg, borderColor: cc.border }}>
                        <p className="text-xs font-semibold text-slate-700">{ca.name}</p>
                        <span className="text-sm font-black tabular-nums" style={{ color: cc.text }}>{ca.avg.toFixed(2)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <GroupBulletPanel text={aiCache["track_summary"]} label="Expert Role Summary" color="blue" hasExpert={hasExpert} onGenerate={generating ? undefined : onGenerate} />
          </div>
          <PageFooter page={2} total={totalPages} />
        </Page>

        {/* ══ PAGE 3 — CANDIDATE RANKINGS ══ */}
        <Page>
          <PageHeader title="Candidate Rankings" subtitle={`${track.name} · ${group.name}`} today={today} />
          <div className="px-12 py-6 space-y-6">
            <PageBanner {...bannerProps} title="Candidate Rankings" icon={<Trophy className="h-5 w-5 text-white" />} />
            <div className="flex items-center gap-4 text-[10px]">
              <span className="text-slate-400">Score colour scale:</span>
              {[
                { label: "≥ 4.0 Strong",     color: "#059669", bg: "#d1fae5" },
                { label: "≥ 3.0 Acceptable",  color: "#d97706", bg: "#fef3c7" },
                { label: "< 3.0 Needs Work",  color: "#dc2626", bg: "#fee2e2" },
              ].map(l => (
                <span key={l.label} className="flex items-center gap-1.5 font-semibold" style={{ color: l.color }}>
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: l.bg, border: `1px solid ${l.color}` }} />
                  {l.label}
                </span>
              ))}
            </div>
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#1B4F8A]/5 border-b border-slate-100">
                    <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-500 py-2.5 pl-4 pr-2">#</th>
                    <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-500 py-2.5 px-3">Candidate</th>
                    <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-500 py-2.5 px-3">Position</th>
                    {activePillars.map((p: any) => (
                      <th key={p.id} className="text-center text-[9px] font-bold uppercase tracking-wider text-slate-500 py-2.5 px-2 whitespace-nowrap">
                        {p.name.length > 8 ? p.name.slice(0, 7) + "…" : p.name}
                      </th>
                    ))}
                    <th className="text-center text-[9px] font-bold uppercase tracking-wider text-[#1B4F8A] py-2.5 px-4 bg-[#1B4F8A]/5">Score</th>
                    <th className="text-center text-[9px] font-bold uppercase tracking-wider text-slate-500 py-2.5 px-3">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {track_stats.candidate_ranking.map((row, idx) => {
                    const c      = candidateMap[row.candidate_id]
                    const vbadge = VERDICT_BADGE[row.verdict] ?? VERDICT_BADGE.no
                    const vlabel = READINESS_LABEL[row.verdict] ?? row.verdict
                    const col    = sc(row.overall_score)
                    return (
                      <tr key={row.candidate_id} className={cn("border-b border-slate-50 last:border-0", idx % 2 === 0 ? "bg-white" : "bg-slate-50/40")}>
                        <td className="py-2.5 pl-4 pr-2 text-slate-400 font-bold text-[11px]">#{row.rank}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-[#1B4F8A]/10 flex items-center justify-center text-[9px] font-bold text-[#1B4F8A] shrink-0">
                              {c?.full_name?.[0]?.toUpperCase()}
                            </div>
                            <span className="font-medium text-slate-700 text-[11px]">{c?.full_name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[10px] text-slate-400">{c?.position ?? "—"}</td>
                        {activePillars.map((p: any) => {
                          const s  = row.pillar_scores[p.id] ?? null
                          const pc = s ? sc(s) : null
                          return (
                            <td key={p.id} className="py-2.5 px-2 text-center">
                              {s ? (
                                <span className="inline-block text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-md"
                                  style={{ color: pc?.text, background: pc?.bg }}>{s.toFixed(2)}</span>
                              ) : <span className="text-slate-200 text-[11px]">—</span>}
                            </td>
                          )
                        })}
                        <td className="py-2.5 px-4 text-center bg-slate-50/60">
                          <span className="inline-block text-[12px] font-black tabular-nums px-2.5 py-0.5 rounded-md"
                            style={{ color: col.text, background: col.bg }}>{row.overall_score.toFixed(2)}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border", vbadge)}>{vlabel}</span>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="bg-[#1B4F8A]/5 border-t-2 border-[#1B4F8A]/10">
                    <td colSpan={3} className="py-2.5 px-4 text-[10px] font-extrabold text-[#1B4F8A] uppercase tracking-wider">Role Average</td>
                    {activePillars.map((p: any) => {
                      const pa = activePillarAverages.find((x: any) => x.pillar_name === p.name)
                      const pc = pa ? sc(pa.avg) : null
                      return (
                        <td key={p.id} className="py-2.5 px-2 text-center">
                          {pa ? <span className="text-[11px] font-bold tabular-nums" style={{ color: pc?.text }}>{pa.avg.toFixed(2)}</span>
                            : <span className="text-slate-200 text-[10px]">—</span>}
                        </td>
                      )
                    })}
                    <td className="py-2.5 px-4 text-center">
                      <span className="text-[13px] font-black tabular-nums" style={{ color: sc(avgScore).text }}>{avgScore.toFixed(2)}</span>
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3 flex-wrap avoid-break">
              {(["strong_yes", "yes", "marginal", "no"] as const).map(v => {
                const count = track_stats.verdict_distribution[v] ?? 0
                if (count === 0) return null
                const vs = VERDICT_STYLE[v]
                return (
                  <div key={v} className="flex items-center gap-2 px-4 py-2 rounded-xl border-2" style={{ background: vs.bg, borderColor: vs.border }}>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: vs.dot }} />
                    <span className="text-xs font-black uppercase tracking-wider" style={{ color: vs.color }}>{READINESS_LABEL[v]}</span>
                    <span className="text-lg font-black tabular-nums ml-1" style={{ color: vs.color }}>{count}</span>
                  </div>
                )
              })}
            </div>
            {hasDiv && (
              <div className="avoid-break">
                <SectionTitle><AlertTriangle className="h-3 w-3 inline mr-1.5 text-amber-500" />Assessor Divergence</SectionTitle>
                <div className="space-y-1.5">
                  {track_stats.divergent_competencies.map((dc: any) => (
                    <div key={dc.competency_name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                        <span className="text-xs font-semibold text-slate-700">{dc.competency_name}</span>
                      </div>
                      <span className="text-[10px] font-bold text-amber-600">±{(dc.avg_spread ?? dc.spread ?? 0).toFixed(2)} spread</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <PageFooter page={3} total={totalPages} />
        </Page>

        {/* ══ PAGE 4 — CANDIDATE COMPARISON ══ */}
        <Page>
          <PageHeader title="Candidate Comparison" subtitle={`${track.name} · ${group.name}`} today={today} />
          <div className="px-12 py-6 space-y-6">
            <PageBanner {...bannerProps} title="Candidate Comparison" icon={<GitCompare className="h-5 w-5 text-white" />} />
            {radarCandidates.length > 0 && pillarNames.length > 0 && (
              <div className="avoid-break">
                <SectionTitle>Profile Overlay — All Candidates</SectionTitle>
                <p className="text-[10px] text-slate-400 mb-3">Each line = one candidate — reveals who is balanced vs asymmetric across role pillars</p>
                <SVGRadarOverlay pillars={pillarNames} candidates={radarCandidates} />
              </div>
            )}
            {pillarCompTable.length > 0 && (
              <div className="avoid-break">
                <SectionTitle>Competency Scores by Pillar</SectionTitle>
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#1B4F8A]/5 border-b border-slate-100">
                        <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-500 py-2 pl-4 pr-3" style={{ minWidth: 160 }}>Competency</th>
                        {sortedReports.map(r => (
                          <th key={r.candidate_id} className="text-center text-[9px] font-bold text-slate-500 py-2 px-2">
                            {(candidateMap[r.candidate_id]?.full_name ?? "").split(" ")[0]}
                          </th>
                        ))}
                        <th className="text-center text-[9px] font-bold uppercase tracking-wider text-[#1B4F8A] py-2 px-3 bg-[#1B4F8A]/5">Role Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pillarCompTable.map(({ pillar, rows }) => (
                        <React.Fragment key={pillar.id}>
                          <tr>
                            <td colSpan={sortedReports.length + 2} className="py-1.5 pl-4 bg-[#1B4F8A]">
                              <span className="text-[9px] font-extrabold uppercase tracking-widest text-white/90">{pillar.name}</span>
                            </td>
                          </tr>
                          {rows.map(({ competency, scores, avg }) => (
                            <tr key={competency.id} className="border-b border-slate-50 last:border-0">
                              <td className="py-1.5 pl-4 pr-3 text-[10px] font-medium text-slate-600">{competency.name}</td>
                              {scores.map((s, si) => {
                                const cc = s ? sc(s) : null
                                return (
                                  <td key={si} className="py-1.5 px-2 text-center">
                                    {s ? (
                                      <span className="inline-block text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded"
                                        style={{ color: cc?.text, background: cc?.bg }}>{s.toFixed(2)}</span>
                                    ) : <span className="text-slate-200 text-[10px]">—</span>}
                                  </td>
                                )
                              })}
                              <td className="py-1.5 px-3 text-center bg-slate-50/50">
                                {avg > 0 ? (
                                  <span className="inline-block text-[11px] font-black tabular-nums px-2 py-0.5 rounded"
                                    style={{ color: sc(avg).text, background: sc(avg).bg }}>{avg.toFixed(2)}</span>
                                ) : <span className="text-slate-200 text-[10px]">—</span>}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <GroupBulletPanel text={aiCache["common_strengths_gaps"]} label="Expert Common Strengths &amp; Gaps" color="emerald" hasExpert={hasExpert} onGenerate={generating ? undefined : onGenerate} />
          </div>
          <PageFooter page={4} total={totalPages} />
        </Page>

        {/* ══ PAGES 5+ — ROLE FIT ANALYSIS (2 per page) ══ */}
        {candidateChunks.map((chunk, ci) => (
          <Page key={`fit-${ci}`}>
            <PageHeader title="Role Fit Analysis" subtitle={`${track.name} · ${group.name}`} today={today} />
            <div className="px-12 py-6 space-y-5">
              <PageBanner {...bannerProps} title="Role Fit Analysis" icon={<Target className="h-5 w-5 text-white" />} />
              {chunk.map((candidate: any) => {
                const report = reports.find(r => r.candidate_id === candidate.id)
                if (!report) return null
                const vbadge = VERDICT_BADGE[report.verdict] ?? VERDICT_BADGE.no
                const vlabel = READINESS_LABEL[report.verdict] ?? report.verdict
                const col    = sc(report.overall_score)
                const rank   = track_stats.candidate_ranking.find(r => r.candidate_id === candidate.id)?.rank
                const pillarDeltas = report.pillar_results
                  .filter(pr => activePillarIds.has(pr.pillar.id) && pr.pillar_score > 0)
                  .map(pr => {
                    const roleAvg = activePillarAverages.find((p: any) => p.pillar_name === pr.pillar.name)?.avg ?? 0
                    return { name: pr.pillar.name, score: pr.pillar_score, roleAvg, delta: pr.pillar_score - roleAvg }
                  })
                const activeComps = report.pillar_results
                  .filter(pr => activePillarIds.has(pr.pillar.id))
                  .flatMap(pr => pr.competency_results.filter(cr => cr.weighted_avg > 0).map(cr => ({ ...cr, pillarName: pr.pillar.name })))
                const topComps = [...activeComps].sort((a, b) => b.weighted_avg - a.weighted_avg).slice(0, 3)
                const gapComps = [...activeComps].sort((a, b) => a.weighted_avg - b.weighted_avg).slice(0, 3)
                const qual   = report.qualitative ?? []
                const remark = qual.find((q: any) => q.remarks)?.remarks
                const rec    = qual.find((q: any) => q.recommendation)?.recommendation
                return (
                  <div key={candidate.id} className="avoid-break border border-slate-100 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-[#1B4F8A]/5 border-b border-slate-100">
                      {rank && <span className="text-[10px] font-black text-slate-400">#{rank}</span>}
                      <div className="w-8 h-8 rounded-full bg-[#1B4F8A] flex items-center justify-center text-sm font-bold text-white shrink-0">
                        {candidate.full_name?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-sm">{candidate.full_name}</p>
                        <p className="text-[10px] text-slate-400">
                          {[candidate.position, candidate.years_experience ? `${candidate.years_experience}y exp` : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-xl font-extrabold tabular-nums" style={{ color: col.text }}>{report.overall_score.toFixed(2)}</p>
                          <p className="text-[9px] text-slate-400 uppercase tracking-wider">Overall</p>
                        </div>
                        <span className={cn("text-[9px] font-bold px-2.5 py-1 rounded-full border", vbadge)}>{vlabel}</span>
                      </div>
                    </div>
                    <div className="px-4 py-3 grid grid-cols-2 gap-5">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2.5">Pillar vs Role Average</p>
                        <div className="space-y-2">
                          {pillarDeltas.map(pd => {
                            const isAbove = pd.delta >= 0.1
                            const isBelow = pd.delta <= -0.1
                            const pc = sc(pd.score)
                            return (
                              <div key={pd.name} className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-50 last:border-0">
                                <span className="text-[9px] font-medium text-slate-600 truncate flex-1">{pd.name}</span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[10px] font-black tabular-nums" style={{ color: pc.text }}>{pd.score.toFixed(2)}</span>
                                  <span className="text-[8px] text-slate-300">/ {pd.roleAvg.toFixed(2)}</span>
                                  <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded text-white min-w-[36px] text-center",
                                    isAbove ? "bg-emerald-500" : isBelow ? "bg-red-400" : "bg-slate-300")}>
                                    {pd.delta >= 0 ? "+" : ""}{pd.delta.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      <div className="space-y-3">
                        {topComps.length > 0 && (
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 mb-1.5">Role Strengths</p>
                            <div className="space-y-1">
                              {topComps.map(cr => {
                                const cc = sc(cr.weighted_avg)
                                return (
                                  <div key={cr.competency.id} className="flex items-center justify-between gap-2">
                                    <span className="text-[9px] text-slate-600 truncate">{cr.competency.name}</span>
                                    <span className="text-[10px] font-black tabular-nums shrink-0" style={{ color: cc.text }}>{cr.weighted_avg.toFixed(2)}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        {gapComps.length > 0 && (
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-red-500 mb-1.5">Development Priority</p>
                            <div className="space-y-1">
                              {gapComps.map(cr => {
                                const cc = sc(cr.weighted_avg)
                                return (
                                  <div key={cr.competency.id} className="flex items-center justify-between gap-2">
                                    <span className="text-[9px] text-slate-600 truncate">{cr.competency.name}</span>
                                    <span className="text-[10px] font-black tabular-nums shrink-0" style={{ color: cc.text }}>{cr.weighted_avg.toFixed(2)}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        {(remark || rec) && (
                          <div className="space-y-1.5">
                            {remark && (
                              <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                                <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Remarks</p>
                                <p className="text-[9px] text-slate-600 leading-relaxed line-clamp-2">{remark}</p>
                              </div>
                            )}
                            {rec && (
                              <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
                                <p className="text-[8px] font-bold uppercase tracking-wider text-[#1B4F8A] mb-0.5">Recommendation</p>
                                <p className="text-[9px] text-blue-900 leading-relaxed line-clamp-2">{rec}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              {ci === candidateChunks.length - 1 && (
                <div className="flex flex-col items-center gap-1.5 text-center pt-4 border-t border-slate-100 mt-auto">
                  <Image src="/logo/logo-dark-blue.png" alt="ICS" width={70} height={20} className="object-contain opacity-20" />
                  <p className="text-[9px] text-slate-300 uppercase tracking-widest">ICS Aviation · Integrated Consulting Services · Confidential</p>
                </div>
              )}
            </div>
            <PageFooter page={5 + ci} total={totalPages} />
          </Page>
        ))}

      </div>
    </>
  )
}
