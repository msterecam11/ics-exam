"use client"

import React from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import {
  BrainCircuit, Sparkles, AlertTriangle,
  LayoutDashboard, BarChart3, TableProperties, Trophy,
} from "lucide-react"
import type { CandidateReportData, GroupStatsData } from "@/lib/interview-scoring"
import { buildVerdictLabels, normaliseVerdictThresholds, buildVerdictColorMap, getVerdictTierConfig } from "@/lib/interview-scoring"

// ─── Inline SVG Charts (SSR-safe, no Recharts) ───────────────────────────────

function SVGPillarRadar({ pillars, size = 220 }: { pillars: { name: string; score: number }[]; size?: number }) {
  if (pillars.length < 3) return null
  const n = pillars.length
  const cx = size / 2, cy = size / 2, r = size * 0.28, lr = size * 0.46
  const angles = pillars.map((_, i) => (i * 2 * Math.PI) / n - Math.PI / 2)
  const pt = (ang: number, radius: number) => ({ x: cx + radius * Math.cos(ang), y: cy + radius * Math.sin(ang) })
  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0]
  const dataStr = pillars.map((p, i) => { const pos = pt(angles[i], (Math.min(p.score, 5) / 5) * r); return `${pos.x},${pos.y}` }).join(" ")
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridLevels.map(lv => (
        <polygon key={lv} points={angles.map(a => { const p = pt(a, r * lv); return `${p.x},${p.y}` }).join(" ")}
          fill="none" stroke="#e2e8f0" strokeWidth="0.8" />
      ))}
      {angles.map((ang, i) => { const end = pt(ang, r); return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#e2e8f0" strokeWidth="0.8" /> })}
      <polygon points={dataStr} fill="#1B4F8A" fillOpacity="0.22" stroke="#1B4F8A" strokeWidth="2" />
      {pillars.map((p, i) => { const pos = pt(angles[i], (Math.min(p.score, 5) / 5) * r); return <circle key={i} cx={pos.x} cy={pos.y} r={3} fill="#1B4F8A" /> })}
      {pillars.map((p, i) => {
        const pos = pt(angles[i], lr)
        const short = p.name.length > 13 ? p.name.slice(0, 12) + "…" : p.name
        return (
          <text key={i} x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="middle"
            fontSize="9" fill="#64748b" fontFamily="sans-serif">
            {short} ({p.score.toFixed(1)})
          </text>
        )
      })}
    </svg>
  )
}

const DONUT_DEFAULTS: Record<string, string> = {
  strong_yes: "#10b981",
  yes:        "#3b82f6",
  marginal:   "#f59e0b",
  no:         "#ef4444",
}

function SVGVerdictDonut({ distribution, verdictLabels, verdictColors, size = 170 }: {
  distribution: { strong_yes: number; yes: number; marginal: number; no: number }
  verdictLabels: Record<string, string>
  verdictColors: Record<string, string>
  size?: number
}) {
  const KEYS = ["strong_yes", "yes", "marginal", "no"] as const
  const SEGS = KEYS.map(key => ({
    key,
    label: verdictLabels[key] ?? key.replace("_", " "),
    color: verdictColors[key] ?? DONUT_DEFAULTS[key],
  }))
  const total = SEGS.reduce((s, sg) => s + (distribution[sg.key] ?? 0), 0)
  if (total === 0) return <p className="text-xs text-slate-400 text-center py-8">No data</p>
  const cx = size / 2, cy = size / 2, outerR = size * 0.40, innerR = size * 0.24
  let cur = -Math.PI / 2
  const segments = SEGS.map(sg => {
    const value = distribution[sg.key] ?? 0
    const sweep = (value / total) * 2 * Math.PI
    const start = cur; cur += sweep
    return { ...sg, value, start, end: cur }
  }).filter(sg => sg.value > 0)
  function arc(sa: number, ea: number, or2: number, ir2: number) {
    const large = ea - sa > Math.PI ? 1 : 0
    const sx = cx + or2 * Math.cos(sa), sy = cy + or2 * Math.sin(sa)
    const ex = cx + or2 * Math.cos(ea), ey = cy + or2 * Math.sin(ea)
    const ix = cx + ir2 * Math.cos(ea), iy = cy + ir2 * Math.sin(ea)
    const ix2 = cx + ir2 * Math.cos(sa), iy2 = cy + ir2 * Math.sin(sa)
    return `M${sx},${sy} A${or2},${or2} 0 ${large},1 ${ex},${ey} L${ix},${iy} A${ir2},${ir2} 0 ${large},0 ${ix2},${iy2} Z`
  }
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {segments.map((sg, i) => <path key={i} d={arc(sg.start, sg.end, outerR, innerR)} fill={sg.color} stroke="white" strokeWidth="2" />)}
          {segments.map((sg, i) => {
            const mid = (sg.start + sg.end) / 2
            const lr2 = (outerR + innerR) / 2
            return <text key={i} x={cx + lr2 * Math.cos(mid)} y={cy + lr2 * Math.sin(mid)}
              textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="11" fontWeight="800" fontFamily="sans-serif">{sg.value}</text>
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-black text-slate-700">{total}</span>
          <span className="text-[9px] text-slate-400 font-semibold tracking-widest uppercase">Total</span>
        </div>
      </div>
      <div className="space-y-2">
        {SEGS.filter(sg => (distribution[sg.key] ?? 0) > 0).map(sg => (
          <div key={sg.key} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: sg.color }} />
            <span className="text-[10px] font-semibold text-slate-600">{sg.label}</span>
            <span className="text-[10px] font-black text-slate-800 ml-2">{distribution[sg.key]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Candidate score ladder — replaces the broken 2-axis bubble chart
// Works correctly for multi-track groups regardless of pillar differences
function SVGReadinessLadder({ candidates, verdictColors }: {
  candidates: { name: string; overall_score: number; verdict: string; track_name?: string }[]
  verdictColors?: Record<string, string>
}) {
  const TIER: Record<string, { color: string }> = {
    strong_yes: { color: "#059669" },
    yes:        { color: "#2563eb" },
    marginal:   { color: "#d97706" },
    no:         { color: "#dc2626" },
  }
  const getColor = (verdict: string) => verdictColors?.[verdict] ?? TIER[verdict]?.color ?? "#64748b"
  const sorted  = [...candidates].sort((a, b) => b.overall_score - a.overall_score)
  const ROW_H   = 24
  const NAME_W  = 140
  const BAR_MAX = 260
  const SCORE_W = 36
  const svgH    = sorted.length * ROW_H + 8

  return (
    <svg width={NAME_W + BAR_MAX + SCORE_W + 4} height={svgH} overflow="visible">
      {/* Scale grid lines at 1,2,3,4,5 */}
      {[1,2,3,4,5].map(v => {
        const x = NAME_W + ((v - 1) / 4) * BAR_MAX
        return <line key={v} x1={x} y1={0} x2={x} y2={svgH - 8} stroke="#f1f5f9" strokeWidth="1" />
      })}
      {/* Scale labels */}
      {[1,2,3,4,5].map(v => (
        <text key={v} x={NAME_W + ((v-1)/4)*BAR_MAX} y={svgH} textAnchor="middle" fontSize="8" fill="#cbd5e1" fontFamily="sans-serif">{v}</text>
      ))}

      {sorted.map((c, i) => {
        const y     = 4 + i * ROW_H
        const color = getColor(c.verdict)
        const barW  = Math.max(6, ((c.overall_score - 1) / 4) * BAR_MAX)
        const shortName = c.name.length > 20 ? c.name.slice(0, 19) + "…" : c.name
        return (
          <g key={i}>
            {/* Name */}
            <text x={NAME_W - 8} y={y + ROW_H / 2} textAnchor="end" dominantBaseline="middle"
              fontSize="9" fill="#475569" fontFamily="sans-serif">{shortName}</text>
            {/* Track bg */}
            <rect x={NAME_W} y={y + 5} width={BAR_MAX} height={ROW_H - 10} rx={3} fill="#f8fafc" />
            {/* Score bar */}
            <rect x={NAME_W} y={y + 5} width={barW} height={ROW_H - 10} rx={3} fill={color} opacity="0.85" />
            {/* Score value */}
            <text x={NAME_W + barW + 5} y={y + ROW_H / 2} dominantBaseline="middle"
              fontSize="9" fontWeight="700" fill={color} fontFamily="sans-serif">
              {c.overall_score.toFixed(2)}
            </text>
          </g>
        )
      })}
    </svg>
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number, strongYesMin = 4.0, yesMin = 3.0) {
  if (score >= strongYesMin) return { text: "#059669", bg: "#d1fae5", border: "#a7f3d0" }
  if (score >= yesMin)       return { text: "#d97706", bg: "#fef3c7", border: "#fde68a" }
  return                            { text: "#dc2626", bg: "#fee2e2", border: "#fca5a5" }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CoverRing({ avgScore, ringColor = "#f87171", tierLabel = "" }: {
  avgScore: number; ringColor?: string; tierLabel?: string
}) {
  const size   = 200, sw = 14, r = (size - sw) / 2
  const circ   = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(avgScore / 5, 1))
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={sw} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={ringColor}
          strokeWidth={sw} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4">
        <span className="text-4xl font-extrabold text-white leading-none">{avgScore.toFixed(2)}</span>
        <span className="text-[10px] text-white/50 font-semibold tracking-widest">/ 5.00 AVG</span>
        {tierLabel && (
          <span className="text-[10px] font-black uppercase tracking-wider mt-0.5 px-2.5 py-0.5 rounded-full"
            style={{ background: ringColor + "35", color: ringColor }}>
            {tierLabel}
          </span>
        )}
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

function PageBanner({ title, icon, groupName, today, readiness, readinessBg, readinessBorder, readinessColor }: {
  title: string; icon: React.ReactNode
  groupName: string; today: string
  readiness: string; readinessBg: string; readinessBorder: string; readinessColor: string
}) {
  return (
    <div className="avoid-break flex items-center gap-4 pb-4 mb-2 border-b-2 border-[#1B4F8A]/10">
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#1B4F8A] shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <h2 className="text-xl font-extrabold text-[#1B4F8A] tracking-tight">{title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{groupName} · {today}</p>
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

interface GroupReportCanvasProps {
  group: any
  candidates: any[]
  assessors: any[]
  reports: CandidateReportData[]
  group_stats: GroupStatsData
  snapshot: any
  aiCache: Record<string, string>
  generating?: boolean
  onGenerate?: () => void
}

// ─── Main Canvas ──────────────────────────────────────────────────────────────

export default function GroupReportCanvas({
  group, candidates, assessors, reports, group_stats, snapshot,
  aiCache, generating, onGenerate,
}: GroupReportCanvasProps) {

  const candidateMap  = Object.fromEntries(candidates.map((c: any) => [c.id, c]))
  const verdictLabels = buildVerdictLabels(snapshot?.verdict_thresholds)
  const verdictColors = buildVerdictColorMap(snapshot?.verdict_thresholds)
  const hasExpert     = Object.keys(aiCache).length > 0
  const today         = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })

  // Derive score thresholds from snapshot config
  const _thresholds  = normaliseVerdictThresholds(snapshot?.verdict_thresholds ?? [])
  const strongYesMin = _thresholds.find(t => t.verdict === "strong_yes")?.min ?? 4.0
  const yesMin       = _thresholds.find(t => t.verdict === "yes")?.min       ?? 3.0
  // Full N-tier config-driven score colour — matches individual report
  const sc = (s: number) => {
    const t = getVerdictTierConfig(s, snapshot)
    const color = t.color || scoreColor(s, strongYesMin, yesMin).text
    return { text: color, bg: color + "20", border: color + "40" }
  }
  const scheduledDate = group.scheduled_date
    ? new Date(group.scheduled_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null

  const avgScore         = reports.length > 0 ? reports.reduce((s, r) => s + r.overall_score, 0) / reports.length : 0
  const readyCount       = group_stats.verdict_distribution.strong_yes ?? 0
  const conditionalCount = (group_stats.verdict_distribution.yes ?? 0) + (group_stats.verdict_distribution.marginal ?? 0)
  const devRequiredCount = group_stats.verdict_distribution.no ?? 0
  const readyPct         = candidates.length > 0 ? Math.round((readyCount / candidates.length) * 100) : 0

  // Competency cohort averages
  const compAvgMap: Record<string, { name: string; pillar: string; total: number; count: number }> = {}
  for (const r of reports) {
    for (const pr of r.pillar_results) {
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

  const radarData        = group_stats.pillar_averages.map((p: any) => ({ name: p.pillar_name, score: p.avg }))
  const ladderData       = reports.map(r => ({
    name:          candidateMap[r.candidate_id]?.full_name ?? "Unknown",
    overall_score: r.overall_score,
    verdict:       r.verdict,
    track_name:    candidateMap[r.candidate_id]?.track_name ?? undefined,
  }))

  const candidateChunks: any[][] = []
  for (let i = 0; i < candidates.length; i += 2) candidateChunks.push(candidates.slice(i, i + 2))

  // Avg score tier — drives ring, banner badge, and score box label
  const avgTier      = getVerdictTierConfig(avgScore, snapshot)
  const avgTierLabel = avgTier.label  || "—"
  const avgTierColor = avgTier.color  || "#64748b"

  // Config tiers sorted high→low — drives KPI distribution grid and cover chips
  const VERDICT_KEYS  = ["strong_yes", "yes", "marginal", "no"] as const
  const TIER_DEFAULTS = ["#10b981","#3b82f6","#f59e0b","#ef4444"]
  const configTiers = (() => {
    const raw = snapshot?.verdict_thresholds
    if (Array.isArray(raw) && raw.length > 0)
      return [...raw].filter((t: any) => typeof t.min === "number").sort((a: any, b: any) => b.min - a.min)
    return null
  })()

  // Banner badge — tier of the average score
  const readinessColor  = avgTierColor
  const readinessBg     = avgTierColor + "20"
  const readinessBorder = avgTierColor + "60"

  const bannerProps = { groupName: group.name, today, readiness: avgTierLabel, readinessBg, readinessBorder, readinessColor }
  const totalPages  = 5 + candidateChunks.length

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
              <p className="text-white/50 text-[11px] uppercase tracking-[0.4em]">Panel Interview · Group Assessment Report</p>
              <div className="flex items-center gap-3 justify-center">
                <div className="h-px w-14 bg-white/20" /><div className="w-1 h-1 rounded-full bg-white/30" /><div className="h-px w-14 bg-white/20" />
              </div>
            </div>
            <div>
              <h1 className="text-4xl font-extrabold text-white tracking-tight">{group.name}</h1>
              <p className="text-white/50 text-sm mt-2">{snapshot.name}</p>
              {(scheduledDate || group.location) && (
                <p className="text-white/30 text-xs mt-1">{[scheduledDate, group.location].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <CoverRing avgScore={avgScore} ringColor={avgTierColor} tierLabel={avgTierLabel} />
            <div className="flex items-center gap-8">
              {[
                { label: "Candidates", value: candidates.length },
                { label: "Assessors",  value: assessors.length  },
                { label: "Pillars",    value: snapshot.pillars?.length ?? 0 },
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
            {/* Tier distribution — all config tiers with counts (including zeros) */}
            <div className="flex items-center gap-3 flex-wrap justify-center">
              {(configTiers ?? VERDICT_KEYS.map((v, i) => ({
                  label: verdictLabels[v] ?? v,
                  color: verdictColors[v] ?? TIER_DEFAULTS[i],
                  _key:  v,
                } as any))
              ).map((t: any, i: number) => {
                const key   = configTiers ? VERDICT_KEYS[Math.min(i, 3)] : t._key
                const count = (group_stats.verdict_distribution as any)[key] ?? 0
                const color = t.color || TIER_DEFAULTS[i] || "#64748b"
                return (
                  <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-full border"
                    style={{ background: "rgba(255,255,255,0.08)", borderColor: color + "60" }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-white/70 text-xs font-semibold">{t.label}</span>
                    <span className="text-white font-bold text-sm">{count}</span>
                  </div>
                )
              })}
            </div>
            <div className="px-8 py-4 rounded-2xl border border-white/10 bg-white/5 space-y-1.5 text-center">
              <p className="text-white/80 text-sm font-semibold">{snapshot.name}</p>
              <p className="text-white/40 text-xs">
                {snapshot.pillars?.length ?? 0} pillars · {snapshot.pillars?.flatMap((p: any) => p.competencies ?? []).length ?? 0} competencies
              </p>
              {assessors.length > 0 && (
                <p className="text-white/30 text-[10px]">Assessed by: {assessors.map((a: any) => a.name).join(" · ")}</p>
              )}
            </div>
          </div>

          <div className="px-12 py-6 border-t border-white/10 flex items-center justify-between shrink-0">
            <p className="text-white/30 text-[10px]">ICS Aviation · Integrated Consulting Services · Confidential</p>
            <p className="text-white/20 text-[9px]">Page 1 of {totalPages}</p>
          </div>
        </Page>

        {/* ══ PAGE 2 — GROUP OVERVIEW ══ */}
        <Page>
          <PageHeader title="Group Overview" subtitle={group.name} today={today} />
          <div className="px-12 py-6 space-y-5">
            <PageBanner {...bannerProps} title="Group Overview" icon={<LayoutDashboard className="h-5 w-5 text-white" />} />
            <div className="avoid-break flex items-start justify-between gap-6 pb-5 border-b-2 border-slate-100">
              <div className="space-y-1.5">
                <h2 className="text-2xl font-extrabold text-[#1B4F8A] tracking-tight">{group.name}</h2>
                <p className="text-sm text-slate-500">{snapshot.name}</p>
                {scheduledDate && <p className="text-xs text-slate-400">Assessment date: {scheduledDate}</p>}
                {group.location && <p className="text-xs text-slate-400">Location: {group.location}</p>}
                {assessors.length > 0 && (
                  <p className="text-xs text-slate-400">Assessors: {assessors.map((a: any) => a.name).join(" · ")}</p>
                )}
              </div>
              {(() => {
                const avgCol = sc(avgScore)
                return (
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    <div className="rounded-2xl px-8 py-4 text-center border-2" style={{ background: avgCol.bg, borderColor: avgCol.border }}>
                      <p className="text-4xl font-black tabular-nums" style={{ color: avgCol.text }}>{avgScore.toFixed(2)}</p>
                      <p className="text-[10px] font-semibold mt-0.5" style={{ color: avgCol.text }}>/ 5.00 AVG</p>
                      <p className="text-xs font-black uppercase tracking-widest mt-1" style={{ color: avgTierColor }}>{avgTierLabel}</p>
                    </div>
                  </div>
                )
              })()}
            </div>
            {/* Tier distribution KPI grid — driven by config */}
            {(() => {
              const tiers = configTiers
                ? configTiers.map((t: any, i: number) => ({
                    label: t.label,
                    value: group_stats.verdict_distribution[VERDICT_KEYS[Math.min(i, 3)]] ?? 0,
                    color: t.color || TIER_DEFAULTS[i] || "#64748b",
                  }))
                : [
                    { label: verdictLabels.strong_yes ?? "Exceptional",    value: group_stats.verdict_distribution.strong_yes ?? 0, color: verdictColors.strong_yes ?? "#10b981" },
                    { label: verdictLabels.yes        ?? "Proficient",     value: group_stats.verdict_distribution.yes        ?? 0, color: verdictColors.yes        ?? "#3b82f6" },
                    { label: verdictLabels.marginal   ?? "Acceptable",     value: group_stats.verdict_distribution.marginal   ?? 0, color: verdictColors.marginal   ?? "#f59e0b" },
                    { label: verdictLabels.no         ?? "Needs Work",     value: group_stats.verdict_distribution.no         ?? 0, color: verdictColors.no         ?? "#ef4444" },
                  ]
              const allKpis = [{ label: "Total Candidates", value: candidates.length, color: "#1B4F8A" }, ...tiers]
              return (
                <div className="grid gap-3 avoid-break" style={{ gridTemplateColumns: `repeat(${allKpis.length}, 1fr)` }}>
                  {allKpis.map((kpi, i) => (
                    <div key={i} className="rounded-xl border p-3 text-center"
                      style={{ background: kpi.color + "15", borderColor: kpi.color + "40" }}>
                      <p className="text-2xl font-black" style={{ color: kpi.color }}>{kpi.value}</p>
                      <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5 leading-tight">{kpi.label}</p>
                    </div>
                  ))}
                </div>
              )
            })()}
            <div className="avoid-break">
              <SectionTitle>Pillar Performance</SectionTitle>
              <div className="space-y-2.5">
                {group_stats.pillar_averages.map((p: any) => {
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
                <SectionTitle>Top Competencies</SectionTitle>
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
                <SectionTitle>Key Concerns</SectionTitle>
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
            <GroupBulletPanel text={aiCache["group_narrative"]} label="Expert Executive Summary" color="blue" hasExpert={hasExpert} onGenerate={generating ? undefined : onGenerate} />
          </div>
          <PageFooter page={2} total={totalPages} />
        </Page>

        {/* ══ PAGE 3 — ASSESSMENT SNAPSHOT ══ */}
        <Page>
          <PageHeader title="Assessment Snapshot" subtitle={group.name} today={today} />
          <div className="px-12 py-6 space-y-6">
            <PageBanner {...bannerProps} title="Assessment Snapshot" icon={<BarChart3 className="h-5 w-5 text-white" />} />
            {/* Assessment Snapshot KPI strip — config tiers + group avg */}
            {(() => {
              const tiers = configTiers
                ? configTiers.map((t: any, i: number) => ({
                    label: t.label,
                    value: String(group_stats.verdict_distribution[VERDICT_KEYS[Math.min(i, 3)]] ?? 0),
                    color: t.color || TIER_DEFAULTS[i] || "#64748b",
                  }))
                : [
                    { label: verdictLabels.strong_yes ?? "Exceptional", value: String(group_stats.verdict_distribution.strong_yes ?? 0), color: verdictColors.strong_yes ?? "#10b981" },
                    { label: verdictLabels.yes        ?? "Proficient",  value: String(group_stats.verdict_distribution.yes        ?? 0), color: verdictColors.yes        ?? "#3b82f6" },
                    { label: verdictLabels.marginal   ?? "Acceptable",  value: String(group_stats.verdict_distribution.marginal   ?? 0), color: verdictColors.marginal   ?? "#f59e0b" },
                    { label: verdictLabels.no         ?? "Needs Work",  value: String(group_stats.verdict_distribution.no         ?? 0), color: verdictColors.no         ?? "#ef4444" },
                  ]
              const allKpis = [...tiers, { label: "Group Average", value: avgScore.toFixed(2), color: "#1B4F8A" }]
              return (
                <div className="grid gap-3 avoid-break" style={{ gridTemplateColumns: `repeat(${allKpis.length}, 1fr)` }}>
                  {allKpis.map((kpi, i) => (
                    <div key={i} className="rounded-xl border p-3 text-center"
                      style={{ background: kpi.color + "15", borderColor: kpi.color + "40" }}>
                      <p className="text-xl font-black" style={{ color: kpi.color }}>{kpi.value}</p>
                      <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5 leading-tight">{kpi.label}</p>
                    </div>
                  ))}
                </div>
              )
            })()}
            <div className="grid grid-cols-2 gap-6 avoid-break">
              <div>
                <SectionTitle>Verdict Distribution</SectionTitle>
                <SVGVerdictDonut distribution={group_stats.verdict_distribution} verdictLabels={verdictLabels} verdictColors={verdictColors} />
              </div>
              <div>
                <SectionTitle>Cohort Pillar Profile</SectionTitle>
                <SVGPillarRadar pillars={radarData} />
              </div>
            </div>
            {compAvgs.length > 0 && (
              <div className="avoid-break">
                <SectionTitle>Competency Cohort Overview</SectionTitle>
                <div className={cn("grid gap-2", compAvgs.length <= 8 ? "grid-cols-4" : compAvgs.length <= 12 ? "grid-cols-4" : "grid-cols-5")}>
                  {compAvgs.map(ca => {
                    const cc = sc(ca.avg)
                    return (
                      <div key={ca.id} className="rounded-lg border px-3 py-2" style={{ borderColor: cc.border, background: cc.bg }}>
                        <p className="text-[8px] font-bold uppercase tracking-wider mb-0.5" style={{ color: cc.text, opacity: 0.6 }}>{ca.pillar}</p>
                        <p className="text-[10px] font-semibold text-slate-700 leading-tight truncate">{ca.name}</p>
                        <p className="text-base font-black tabular-nums mt-0.5" style={{ color: cc.text }}>{ca.avg.toFixed(2)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <PageFooter page={3} total={totalPages} />
        </Page>

        {/* ══ PAGE 4 — CANDIDATE RANKINGS ══ */}
        <Page>
          <PageHeader title="Candidate Rankings" subtitle={group.name} today={today} />
          <div className="px-12 py-6 space-y-6">
            <PageBanner {...bannerProps} title="Candidate Rankings" icon={<Trophy className="h-5 w-5 text-white" />} />
            {/* Legend — config-driven */}
            <div className="flex items-center gap-4 text-[10px] flex-wrap">
              <span className="text-slate-400">Score colour scale:</span>
              {(() => {
                const raw = snapshot?.verdict_thresholds
                const TIER_DEFAULTS = ["#10b981","#3b82f6","#f59e0b","#ef4444"]
                if (Array.isArray(raw) && raw.length > 0) {
                  const sorted = [...raw]
                    .filter((t: any) => typeof t.min === "number")
                    .sort((a: any, b: any) => b.min - a.min)
                  return sorted.map((t: any, i: number) => ({
                    label: `≥ ${t.min} — ${t.label}`,
                    color: t.color || TIER_DEFAULTS[i] || "#64748b",
                    bg:   (t.color || TIER_DEFAULTS[i] || "#64748b") + "20",
                  }))
                }
                return [
                  { label: "≥ 4.0 — Strong",    color: "#059669", bg: "#d1fae5" },
                  { label: "≥ 3.0 — Acceptable", color: "#d97706", bg: "#fef3c7" },
                  { label: "< 3.0 — Needs Work", color: "#dc2626", bg: "#fee2e2" },
                ]
              })().map(l => (
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
                    <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-500 py-2.5 pl-4 pr-2 w-8">#</th>
                    <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-500 py-2.5 px-3">Candidate</th>
                    <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-500 py-2.5 px-3">Track / Role</th>
                    <th className="text-center text-[9px] font-bold uppercase tracking-wider text-[#1B4F8A] py-2.5 px-4 bg-[#1B4F8A]/5 w-20">Score</th>
                    <th className="text-center text-[9px] font-bold uppercase tracking-wider text-slate-500 py-2.5 px-3 w-36">Readiness</th>
                    <th className="text-center text-[9px] font-bold uppercase tracking-wider text-slate-500 py-2.5 px-3 w-24">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {group_stats.candidate_ranking.map((row, idx) => {
                    const c      = candidateMap[row.candidate_id]
                    const col    = sc(row.overall_score)
                    const vlabel = verdictLabels[row.verdict as keyof typeof verdictLabels] ?? row.verdict
                    const vcolor = verdictColors[row.verdict] ?? VERDICT_STYLE[row.verdict]?.color ?? "#64748b"
                    const readiness =
                      row.verdict === "strong_yes" ? { label: "Ready",               bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" } :
                      row.verdict === "yes"        ? { label: "Conditionally Ready",  bg: "bg-blue-100",    text: "text-blue-700",    border: "border-blue-200"    } :
                      row.verdict === "marginal"   ? { label: "Conditionally Ready",  bg: "bg-amber-100",   text: "text-amber-700",   border: "border-amber-200"   } :
                                                     { label: "Dev. Required",        bg: "bg-red-100",     text: "text-red-600",     border: "border-red-200"     }
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
                        <td className="py-2.5 px-3 text-[10px] text-slate-400">{c?.track_name ?? "—"}</td>
                        <td className="py-2.5 px-4 text-center bg-slate-50/60">
                          <span className="inline-block text-[12px] font-black tabular-nums px-2.5 py-0.5 rounded-md"
                            style={{ color: col.text, background: col.bg }}>{row.overall_score.toFixed(2)}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border", readiness.bg, readiness.text, readiness.border)}>
                            {readiness.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border"
                            style={{ background: vcolor + "20", color: vcolor, borderColor: vcolor + "60" }}>
                            {vlabel}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="bg-[#1B4F8A]/5 border-t-2 border-[#1B4F8A]/10">
                    <td colSpan={3} className="py-2.5 px-4 text-[10px] font-extrabold text-[#1B4F8A] uppercase tracking-wider">Group Average</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className="text-[13px] font-black tabular-nums" style={{ color: sc(avgScore).text }}>{avgScore.toFixed(2)}</span>
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
            {ladderData.length >= 2 && (
              <div className="avoid-break">
                <SectionTitle>Cohort Score Distribution</SectionTitle>
                <SVGReadinessLadder candidates={ladderData} verdictColors={verdictColors} />
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  {(["strong_yes","yes","marginal","no"] as const).map(v => {
                    const count = group_stats.verdict_distribution[v] ?? 0
                    if (count === 0) return null
                    const color = verdictColors[v] ?? VERDICT_STYLE[v]?.dot ?? "#64748b"
                    return (
                      <div key={v} className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm" style={{ background: color, opacity: 0.85 }} />
                        <span className="text-[9px] text-slate-500">{verdictLabels[v]}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <PageFooter page={4} total={totalPages} />
        </Page>

        {/* ══ PAGES 5+ — CANDIDATE SUMMARIES (2 per page) ══ */}
        {candidateChunks.map((chunk, ci) => (
          <Page key={`chunk-${ci}`}>
            <PageHeader title="Candidate Summaries" subtitle={group.name} today={today} />
            <div className="px-12 py-6 space-y-5">
              <PageBanner {...bannerProps} title="Candidate Summaries" icon={<TableProperties className="h-5 w-5 text-white" />} />
              {chunk.map((candidate: any) => {
                const report = reports.find(r => r.candidate_id === candidate.id)
                if (!report) return null
                const vlabel = verdictLabels[report.verdict as keyof typeof verdictLabels] ?? report.verdict
                const vcolor = verdictColors[report.verdict] ?? VERDICT_STYLE[report.verdict]?.color ?? "#64748b"
                const col    = sc(report.overall_score)
                const rank   = group_stats.candidate_ranking.find(r => r.candidate_id === candidate.id)?.rank
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
                        <p className="text-[10px] text-slate-400 truncate">
                          {[candidate.position, candidate.track_name].filter(Boolean).join(" · ")}
                          {candidate.years_experience ? ` · ${candidate.years_experience}y exp` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-xl font-extrabold tabular-nums" style={{ color: col.text }}>{report.overall_score.toFixed(2)}</p>
                          <p className="text-[9px] text-slate-400 uppercase tracking-wider">Overall</p>
                        </div>
                        <span className="text-[9px] font-bold px-2.5 py-1 rounded-full border"
                          style={{ background: vcolor + "20", color: vcolor, borderColor: vcolor + "60" }}>
                          {vlabel}
                        </span>
                      </div>
                    </div>
                    <div className="px-4 py-3 space-y-3">
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(report.pillar_results.length, 5)}, 1fr)` }}>
                        {report.pillar_results.map(pr => {
                          const pc = sc(pr.pillar_score)
                          return (
                            <div key={pr.pillar.id} className="rounded-lg px-3 py-2 text-center border"
                              style={{ background: pc.bg, borderColor: pc.border }}>
                              <p className="text-[8px] font-bold uppercase tracking-wide text-slate-500 truncate mb-0.5">{pr.pillar.name}</p>
                              <p className="text-base font-extrabold tabular-nums" style={{ color: pc.text }}>{pr.pillar_score.toFixed(2)}</p>
                            </div>
                          )
                        })}
                      </div>
                      {report.pillar_results.some(pr => pr.competency_results.length > 0) && (
                        <div className="grid grid-cols-2 gap-x-6">
                          {report.pillar_results.flatMap(pr =>
                            pr.competency_results.map(cr => {
                              const cc = sc(cr.weighted_avg)
                              return (
                                <div key={cr.competency.id} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0 gap-2">
                                  <span className="text-[10px] text-slate-500 truncate">{cr.competency.name}</span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {cr.is_divergent && <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />}
                                    <span className="text-[10px] font-bold tabular-nums" style={{ color: cc.text }}>{cr.weighted_avg.toFixed(2)}</span>
                                  </div>
                                </div>
                              )
                            })
                          )}
                        </div>
                      )}
                      {(remark || rec) && (
                        <div className="grid gap-2" style={{ gridTemplateColumns: remark && rec ? "1fr 1fr" : "1fr" }}>
                          {remark && (
                            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Remarks</p>
                              <p className="text-[10px] text-slate-600 leading-relaxed line-clamp-3">{remark}</p>
                            </div>
                          )}
                          {rec && (
                            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                              <p className="text-[9px] font-bold uppercase tracking-wider text-[#1B4F8A] mb-1">Recommendation</p>
                              <p className="text-[10px] text-blue-900 leading-relaxed line-clamp-3">{rec}</p>
                            </div>
                          )}
                        </div>
                      )}
                      {report.divergent_competencies.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                          <span className="text-[9px] text-amber-600 font-semibold">Divergence:</span>
                          {report.divergent_competencies.map(dc => (
                            <span key={dc.competency_name} className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">
                              {dc.competency_name} (±{dc.spread.toFixed(1)})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <PageFooter page={5 + ci} total={totalPages} />
          </Page>
        ))}

        {/* ══ EXPERT GROUP ANALYSIS ══ */}
        <Page>
          <PageHeader title="Expert Group Analysis" subtitle={group.name} today={today} />
          <div className="px-12 py-6 space-y-5">
            <PageBanner {...bannerProps} title="Expert Group Analysis" icon={<BrainCircuit className="h-5 w-5 text-white" />} />

            <div className="avoid-break">
              <SectionTitle>Phase 1 — Cohort Intelligence</SectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <GroupBulletPanel text={aiCache["talent_map_commentary"]} label="Talent Distribution Insights" color="slate"   hasExpert={hasExpert} onGenerate={generating ? undefined : onGenerate} />
                <GroupBulletPanel text={aiCache["systemic_gap"]}          label="Systemic Gap Analysis"        color="amber"   hasExpert={hasExpert} onGenerate={generating ? undefined : onGenerate} />
              </div>
            </div>

            <div className="avoid-break">
              <SectionTitle>Phase 2 — Talent Pipeline &amp; Prediction</SectionTitle>
              <GroupBulletPanel text={aiCache["cohort_prediction"]} label="Cohort Prediction" color="emerald" hasExpert={hasExpert} onGenerate={generating ? undefined : onGenerate} />
            </div>

            <div className="avoid-break">
              <SectionTitle>Phase 3 — Alternative Paths</SectionTitle>
              <div className="flex items-center gap-3 flex-wrap mb-3">
                {(["strong_yes", "yes", "marginal", "no"] as const).map(v => {
                  const count = group_stats.verdict_distribution[v] ?? 0
                  if (count === 0) return null
                  const cfg = verdictColors[v] ?? VERDICT_STYLE[v].color
                  return (
                    <div key={v} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2" style={{ background: cfg + "20", borderColor: cfg + "60" }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: cfg }} />
                      <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: cfg }}>{verdictLabels[v]}</span>
                      <span className="text-sm font-black tabular-nums ml-0.5" style={{ color: cfg }}>{count}</span>
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
                For candidates who did not fully meet the requirements of their primary track, the following analysis
                identifies their strongest assessed competencies and recommends alternative aviation career paths
                where those strengths would be genuinely valued.
              </p>
              <GroupBulletPanel text={aiCache["alternative_paths"]} label="Alternative Career Path Recommendations" color="blue" hasExpert={hasExpert} onGenerate={generating ? undefined : onGenerate} />
            </div>
          </div>

          <div className="px-12 py-5 border-t border-slate-100 flex flex-col items-center gap-1.5 text-center mt-auto">
            <Image src="/logo/logo-dark-blue.png" alt="ICS" width={70} height={20} className="object-contain opacity-20" />
            <p className="text-[9px] text-slate-300 uppercase tracking-widest">ICS Aviation · Integrated Consulting Services · Confidential</p>
          </div>
          <PageFooter page={totalPages} total={totalPages} />
        </Page>

      </div>
    </>
  )
}
