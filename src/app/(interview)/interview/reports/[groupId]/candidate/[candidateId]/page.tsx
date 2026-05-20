"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import {
  Loader2, FileDown, ArrowLeft, AlertTriangle,
  BrainCircuit, Sparkles, RefreshCw, BookOpen,
  LayoutDashboard, TableProperties, BarChart3, MessageSquareText,
  TrendingUp, TrendingDown, Star, Trophy, Target, Zap,
  CheckCircle, ShieldAlert, XCircle, Flame, Award, BarChart2, Lightbulb,
  ThumbsUp, ThumbsDown,
} from "lucide-react"

// ── Icon resolver ─────────────────────────────────────────────────────────────
const LUCIDE_ICON_MAP: Record<string, any> = {
  TrendingUp, TrendingDown, Star, Trophy, Target, Zap,
  CheckCircle, AlertTriangle, ShieldAlert, XCircle, Flame,
  Award, BarChart2, Lightbulb, ThumbsUp, ThumbsDown,
}
function resolveIcon(name?: string): any {
  return LUCIDE_ICON_MAP[name ?? ""] ?? BarChart2
}
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import dynamic from "next/dynamic"
import type { CandidateReportData, InsightLabel } from "@/lib/interview-scoring"
import { getVerdictTierConfig, getInsightTierConfig, buildVerdictColorMap } from "@/lib/interview-scoring"
import { downloadPdf } from "@/lib/downloadPdf"

const PillarRadarChart = dynamic(() => import("@/components/interview/charts/PillarRadarChart"), { ssr: false })

// ─── Constants ────────────────────────────────────────────────────────────────

const VERDICT_STYLE: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  strong_yes: { color: "#059669", bg: "#d1fae5", border: "#a7f3d0", dot: "#10b981" },
  yes:        { color: "#2563eb", bg: "#dbeafe", border: "#bfdbfe", dot: "#3b82f6" },
  marginal:   { color: "#d97706", bg: "#fef3c7", border: "#fde68a", dot: "#f59e0b" },
  no:         { color: "#dc2626", bg: "#fee2e2", border: "#fca5a5", dot: "#ef4444" },
}

function verdictConfig(verdict: string, displayLabel: string, configColor?: string) {
  const s      = VERDICT_STYLE[verdict] ?? VERDICT_STYLE.no
  const color  = configColor ?? s.color
  const dot    = configColor ?? s.dot
  const bg     = configColor ? configColor + "20" : s.bg
  const border = configColor ? configColor + "60" : s.border
  return { color, dot, bg, border, label: displayLabel.toUpperCase() }
}

const INSIGHT_CONFIG: Record<InsightLabel, { badge: string; label: string }> = {
  top_strength: { badge: "bg-emerald-100 text-emerald-700", label: "Top Strength"      },
  watch_list:   { badge: "bg-amber-100 text-amber-700",     label: "Watch List"        },
  development:  { badge: "bg-red-100 text-red-600",         label: "Development Area"  },
  none:         { badge: "bg-slate-100 text-slate-500",     label: ""                  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number, snapshot?: any) {
  if (snapshot) {
    const hex = getVerdictTierConfig(score, snapshot).color
    return { text: hex, bg: hex + "20", border: hex + "40" }
  }
  if (score >= 4) return { text: "#059669", bg: "#d1fae5", border: "#a7f3d0" }
  if (score >= 3) return { text: "#d97706", bg: "#fef3c7", border: "#fde68a" }
  return { text: "#dc2626", bg: "#fee2e2", border: "#fca5a5" }
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function CoverRing({ score, verdict, verdictTier }: { score: number; verdict: string; verdictTier: { label: string; color: string } }) {
  const vc   = verdictConfig(verdict, verdictTier.label, verdictTier.color)
  const size = 200, sw = 14, r = (size - sw) / 2
  const circ   = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(score / 5, 1))
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={sw} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={vc.dot}
          strokeWidth={sw} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-4">
        <span className="text-4xl font-extrabold text-white leading-none">{score.toFixed(2)}</span>
        <span className="text-[11px] text-white/50 font-semibold tracking-widest">/ 5.00</span>
        <span
          className="font-black tracking-wider uppercase mt-1 text-center leading-tight"
          style={{ color: vc.dot, fontSize: vc.label.length > 12 ? "9px" : vc.label.length > 8 ? "11px" : "13px" }}
        >
          {vc.label}
        </span>
      </div>
    </div>
  )
}

// ─── Section title ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#1B4F8A] shrink-0 whitespace-nowrap">{children}</p>
      <div className="flex-1 h-[1.5px] bg-[#1B4F8A]/15" />
    </div>
  )
}

// ─── Page layout components ───────────────────────────────────────────────────

function Page({ children, dark = false, first = false }: {
  children: React.ReactNode; dark?: boolean; first?: boolean
}) {
  return (
    <div className={`relative w-full flex flex-col ${dark ? "bg-[#1B4F8A]" : "bg-white"} ${first ? "" : "page-break"}`}
      style={{ minHeight: first ? 1122 : undefined }}>
      {children}
    </div>
  )
}

function PageHeader({ light = false, title, subtitle, today }: {
  light?: boolean; title: string; subtitle?: string; today: string
}) {
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

// ─── Page content banner (appears at top of every content page) ──────────────

const PAGE_ICONS: Record<string, React.ReactNode> = {}  // populated inline

function PageBanner({
  title, icon, candidateName, today, verdictLabel, verdictBg, verdictBorder, verdictColor,
}: {
  title: string
  icon: React.ReactNode
  candidateName: string
  today: string
  verdictLabel: string
  verdictBg: string
  verdictBorder: string
  verdictColor: string
}) {
  return (
    <div className="avoid-break flex items-center gap-4 pb-4 mb-2 border-b-2 border-[#1B4F8A]/10">
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#1B4F8A] shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-xl font-extrabold text-[#1B4F8A] tracking-tight">{title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{candidateName} · {today}</p>
      </div>
      <div className="rounded-lg px-3 py-1.5 border shrink-0" style={{ background: verdictBg, borderColor: verdictBorder }}>
        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: verdictColor }}>{verdictLabel}</p>
      </div>
    </div>
  )
}

// Expert insight panel
function ExpertPanel({
  text, label, color = "blue", hasExpert = false, onGenerate,
}: {
  text?: string; label: string; color?: "blue" | "amber" | "purple" | "emerald" | "slate"
  hasExpert?: boolean; onGenerate?: () => void
}) {
  const styles = {
    blue:    { header: "bg-[#1B4F8A]",   body: "bg-blue-50/70 border-blue-100",     text: "text-blue-900"    },
    amber:   { header: "bg-amber-500",   body: "bg-amber-50/70 border-amber-100",   text: "text-amber-900"  },
    purple:  { header: "bg-purple-600",  body: "bg-purple-50/70 border-purple-100", text: "text-purple-900" },
    emerald: { header: "bg-emerald-600", body: "bg-emerald-50/70 border-emerald-100", text: "text-emerald-900" },
    slate:   { header: "bg-slate-700",   body: "bg-slate-50 border-slate-200",      text: "text-slate-700"  },
  }[color]

  // Not generated yet — show a clickable screen-only placeholder
  if (!text) {
    if (hasExpert) return null // generated but this section was empty — hide
    return (
      <div
        className={cn(
          "no-print avoid-break flex items-center gap-2.5 text-sm text-slate-400 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 transition-colors",
          onGenerate && "cursor-pointer hover:bg-purple-50 hover:border-purple-200 hover:text-slate-500",
        )}
        onClick={onGenerate}
      >
        <Sparkles className="h-4 w-4 shrink-0 text-purple-400" />
        <span>
          Click <strong className="text-purple-600 font-semibold">Generate Expert Report</strong> to add <em className="not-italic text-slate-500 font-medium">{label}</em> here.
        </span>
      </div>
    )
  }

  return (
    <div className="avoid-break rounded-xl overflow-hidden border">
      <div className={`${styles.header} px-4 py-2 flex items-center gap-2`}>
        <BrainCircuit className="h-3.5 w-3.5 text-white/70" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/90">{label}</p>
      </div>
      <div className={`${styles.body} border px-4 py-3`}>
        <p className={`text-xs ${styles.text} leading-relaxed`}>{text}</p>
      </div>
    </div>
  )
}

// ─── Development Roadmap (visual map) ────────────────────────────────────────

type DevItem = { area?: string; intervention?: string; timeline?: string; owner?: string; priority?: number }

function DevelopmentRoadmap({
  raw, hasExpert = false, onGenerate,
}: { raw?: string; hasExpert?: boolean; onGenerate?: () => void }) {
  if (!raw) {
    if (hasExpert) return null
    return (
      <div
        className={cn(
          "no-print avoid-break flex items-center gap-2.5 text-sm text-slate-400 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 transition-colors",
          onGenerate && "cursor-pointer hover:bg-purple-50 hover:border-purple-200 hover:text-slate-500",
        )}
        onClick={onGenerate}
      >
        <Sparkles className="h-4 w-4 shrink-0 text-purple-400" />
        <span>Click <strong className="text-purple-600 font-semibold">Generate Expert Report</strong> to add the Development Roadmap here.</span>
      </div>
    )
  }

  // Try to parse as JSON array
  let items: DevItem[] = []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) items = parsed
    else if (parsed && typeof parsed === "object") items = [parsed]
  } catch {
    // plain text fallback
    return <ExpertPanel text={raw} label="Expert Development Plan" color="amber" hasExpert={hasExpert} onGenerate={onGenerate} />
  }

  if (items.length === 0) return null

  // Color by timeline length
  function itemColor(tl?: string) {
    const months = parseInt(tl ?? "0")
    if (months <= 3)  return { bg: "bg-emerald-50", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700", circle: "bg-emerald-500", line: "bg-emerald-300" }
    if (months <= 6)  return { bg: "bg-amber-50",   border: "border-amber-200",   badge: "bg-amber-100 text-amber-700",     circle: "bg-amber-500",   line: "bg-amber-300"   }
    return              { bg: "bg-red-50",     border: "border-red-200",     badge: "bg-red-100 text-red-700",         circle: "bg-red-500",     line: "bg-red-300"     }
  }

  return (
    <div className="avoid-break rounded-xl overflow-hidden border border-amber-100">
      {/* Header */}
      <div className="bg-amber-500 px-4 py-2 flex items-center gap-2">
        <BrainCircuit className="h-3.5 w-3.5 text-white/70" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/90">Expert Development Roadmap</p>
      </div>

      {/* Vertical timeline */}
      <div className="bg-amber-50/50 px-5 py-4">
        <div className="space-y-0">
          {items.map((item, idx) => {
            const c      = itemColor(item.timeline)
            const label  = item.area || item.intervention || `Priority ${idx + 1}`
            const action = item.intervention && item.area ? item.intervention : undefined
            const isLast = idx === items.length - 1

            return (
              <div key={idx} className="flex gap-4">
                {/* Left — circle + vertical line */}
                <div className="flex flex-col items-center shrink-0">
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0 z-10", c.circle)}>
                    {idx + 1}
                  </div>
                  {!isLast && <div className="w-0.5 flex-1 bg-amber-200 my-1" />}
                </div>

                {/* Right — content card */}
                <div className={cn(
                  "flex-1 rounded-xl border p-3 mb-3",
                  c.bg, c.border,
                )}>
                  <p className="text-[12px] font-bold text-slate-800 leading-snug">{label}</p>
                  {action && (
                    <p className="text-[10px] text-slate-600 leading-relaxed mt-1">{action}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {item.timeline && (
                      <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full", c.badge)}>
                        {item.timeline}
                      </span>
                    )}
                    {item.owner && (
                      <span className="text-[9px] text-slate-500 font-medium">Owner: {item.owner}</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 pt-2 border-t border-amber-100">
          <span className="text-[8px] text-slate-400 font-medium uppercase tracking-wider">Timeline:</span>
          {[
            { label: "≤ 3 months", bg: "bg-emerald-500" },
            { label: "≤ 6 months", bg: "bg-amber-500" },
            { label: "> 6 months", bg: "bg-red-500" },
          ].map(l => (
            <span key={l.label} className="flex items-center gap-1 text-[8px] text-slate-500">
              <span className={cn("w-2 h-2 rounded-full", l.bg)} />{l.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CandidateReportPage() {
  const { groupId, candidateId } = useParams<{ groupId: string; candidateId: string }>()
  const [data,        setData]        = useState<any>(null)
  const [aiCache,     setAiCache]     = useState<Record<string, string>>({})
  const [loading,     setLoading]     = useState(true)
  const [generating,  setGenerating]  = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/interview/reports/${groupId}/candidate/${candidateId}`).then(r => r.json()),
      fetch(`/api/interview/reports/${groupId}/ai-cache?candidate_id=${candidateId}`).then(r => r.json().catch(() => ({}))),
    ]).then(([d, cache]) => {
      if (d.error) { toast.error(d.error); return }
      setData(d)
      setAiCache(cache ?? {})
    }).catch(() => toast.error("Failed to load report"))
      .finally(() => setLoading(false))
  }, [groupId, candidateId])

  async function savePdf() {
    setDownloading(true)
    toast.info("Generating PDF — please wait…")
    try {
      await downloadPdf(
        `/api/interview/reports/${groupId}/candidate/${candidateId}/pdf?name=${encodeURIComponent(candidate.full_name)}`,
        `Interview Report - ${candidate.full_name}.pdf`,
      )
      toast.success("PDF downloaded!")
    } catch (e: any) {
      toast.error("PDF generation failed: " + (e?.message ?? "unknown"))
    } finally {
      setDownloading(false)
    }
  }

  async function generateExpert() {
    setGenerating(true)
    toast.info("Generating Expert Report — please wait 10–15 seconds…")
    try {
      const res    = await fetch(`/api/interview/reports/${groupId}/candidate/${candidateId}/generate`, { method: "POST" })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(result.error ?? "Generation failed"); return }
      toast.success(`Expert Report generated! (${result.sections_saved ?? "?"} sections)`)
      const cache = await fetch(`/api/interview/reports/${groupId}/ai-cache?candidate_id=${candidateId}`).then(r => r.json()).catch(() => ({}))
      setAiCache(cache ?? {})
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-slate-100">
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-[#1B4F8A] mx-auto" />
        <p className="text-sm text-slate-500">Loading report…</p>
      </div>
    </div>
  )
  if (!data) return null

  const { group, candidate, assessors, assessor_pillar_weights, snapshot, report } = data as {
    group:                  any
    candidate:              any
    assessors:              Array<{ id: string; name: string; email: string }>
    assessor_pillar_weights: Record<string, Record<string, number>>
    snapshot:               any
    report:                 CandidateReportData
  }

  const verdictTier = getVerdictTierConfig(report.overall_score, snapshot)
  const vc          = verdictConfig(report.verdict, verdictTier.label, verdictTier.color)
  const sc          = (score: number) => scoreColor(score, snapshot)
  const today   = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })

  // Shared banner props — reused on every content page
  const bannerProps = {
    candidateName: candidate.full_name,
    today,
    verdictLabel:  vc.label,
    verdictBg:     vc.bg,
    verdictBorder: vc.border,
    verdictColor:  vc.color,
  }
  const hasExpert = Object.keys(aiCache).length > 0

  const scheduledDate = group.scheduled_date
    ? new Date(group.scheduled_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null

  // Derived stats
  const allComps    = report.pillar_results.flatMap(pr => pr.competency_results)
  const aboveAvg    = allComps.filter(cr => cr.weighted_avg >= 4.0).length
  const totalComps  = allComps.length
  const divergFlags = report.divergent_competencies.length
  const hasWeak     = allComps.some(cr => cr.weighted_avg < 3.5)

  // Qualitative synthesis parsed
  const qualSynthesisRaw = aiCache["qualitative_synthesis"]
  let qualSynthesis: { remarks: string; gap_analysis: string; recommendation: string } | null = null
  try { if (qualSynthesisRaw) qualSynthesis = JSON.parse(qualSynthesisRaw) } catch {}

  // Development courses parsed
  let devCourses: Array<{ competency: string; course: string; provider: string; duration: string; description: string }> = []
  try { if (aiCache["development_courses"]) devCourses = JSON.parse(aiCache["development_courses"]) } catch {}

  // Development area insights (per-competency AI insight)
  let devAreaInsights: Record<string, string> = {}
  try { if (aiCache["development_area_insights"]) devAreaInsights = JSON.parse(aiCache["development_area_insights"]) } catch {}

  // Per-assessor qualitative rephrase
  const qualRephrase: Record<string, { remarks: string; gap_analysis: string; recommendation: string }> = {}
  for (const a of assessors) {
    try {
      const raw = aiCache[`qual_rephrase_${a.id}`]
      if (raw) qualRephrase[a.id] = JSON.parse(raw)
    } catch {}
  }

  // Top 3 strengths + bottom 3 concerns (derived from scores — no AI needed)
  const sortedComps = [...allComps].sort((a, b) => b.weighted_avg - a.weighted_avg)
  const topStrengths = sortedComps.slice(0, 3)
  const topConcerns  = [...allComps].sort((a, b) => a.weighted_avg - b.weighted_avg).slice(0, 3)

  // Radar + heatmap data
  const radarData = report.pillar_results.map(pr => ({ name: pr.pillar.name, score: pr.pillar_score }))
  const heatmapCells = report.pillar_results.flatMap(pr =>
    pr.competency_results.map(cr => ({
      pillarName:     pr.pillar.name,
      competencyName: cr.competency.name,
      score:          cr.weighted_avg,
      insightLabel:   pr.insight_label,
    }))
  )

  // Live per-assessor per-pillar weights (from group_assessors, not frozen snapshot)
  // Used to determine which assessors are active for each pillar
  const liveWeights = assessor_pillar_weights ?? snapshot.assessor_weights ?? {}

  // Page count
  // 1=cover, 2=overview(new), 3=snapshot, 4=matrix, 5+…=pillar pages, then qualitative, then dev?, then expert insights
  const pillarPages = report.pillar_results.length
  const hasDevPage  = hasWeak
  const totalPages  = 5 + pillarPages + (hasDevPage ? 1 : 0) + 1   // +1 overview, +1 expert insights

  return (
    <>
      <style>{`
        .page-break  { break-before: page; }
        .avoid-break { break-inside: avoid; }
        @page { size: 794px 1122px; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          aside  { display: none !important; }
          header { display: none !important; }
          body { margin: 0; background: white; }
          body > div { display: block !important; height: auto !important; overflow: visible !important; }
          body > div > div:last-child { display: block !important; height: auto !important; overflow: visible !important; }
          main { display: block !important; height: auto !important; overflow: visible !important; padding: 0 !important; }
          main > div { display: flex !important; justify-content: flex-start !important; background: white !important; padding: 0 !important; min-height: auto !important; }
          #report-root { gap: 0 !important; background: white !important; padding: 0 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="no-print sticky top-0 z-40 bg-white border-b shadow-sm px-6 py-3 flex items-center justify-between">
        <Link href={`/interview/reports/${groupId}/candidates`}>
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          {!hasExpert ? (
            <Button size="sm" onClick={generateExpert} disabled={generating}
              className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Generating…" : "Generate Expert Report"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={generateExpert} disabled={generating} className="gap-2 text-xs">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Regenerate Expert
            </Button>
          )}
          <Button
            size="sm"
            className="gap-2 bg-[#1B4F8A] hover:bg-[#163f6e] text-white"
            onClick={savePdf}
            disabled={downloading}
          >
            {downloading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <FileDown className="h-4 w-4" />}
            {downloading ? "Generating…" : "Save as PDF"}
          </Button>
        </div>
      </div>

      {/* ── Report canvas ── */}
      <div className="bg-slate-300 min-h-screen py-8 flex justify-center print:bg-white print:p-0">
        <div id="report-root" className="flex flex-col gap-5 print:gap-0 print:bg-white" style={{ width: 794 }}>

          {/* ══ PAGE 1 — COVER ══ */}
          <Page dark first>
            {/* Decorative blobs */}
            <div className="absolute top-0 right-0 w-96 h-96 rounded-full pointer-events-none opacity-10"
              style={{ background: "radial-gradient(circle, #60a5fa, transparent)", transform: "translate(35%,-35%)" }} />
            <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full pointer-events-none opacity-10"
              style={{ background: "radial-gradient(circle, #93c5fd, transparent)", transform: "translate(-35%,35%)" }} />

            {/* Logo bar */}
            <div className="flex items-center justify-between px-12 pt-10 shrink-0">
              <Image src="/logo/logo-white.png" alt="ICS Aviation" width={130} height={36} className="object-contain" />
              <p className="text-white/40 text-xs">{today}</p>
            </div>

            {/* Center */}
            <div className="flex-1 flex flex-col items-center justify-center px-12 text-center gap-8">
              <div className="space-y-3">
                <p className="text-white/50 text-[11px] uppercase tracking-[0.4em]">Individual Assessment Report</p>
                <div className="flex items-center gap-3 justify-center">
                  <div className="h-px w-14 bg-white/20" />
                  <div className="w-1 h-1 rounded-full bg-white/30" />
                  <div className="h-px w-14 bg-white/20" />
                </div>
              </div>

              {/* Candidate identity */}
              <div>
                <h1 className="text-4xl font-extrabold text-white tracking-tight">{candidate.full_name}</h1>
                <p className="text-white/50 text-sm mt-2">
                  {[candidate.position, candidate.track_name].filter(Boolean).join(" · ")}
                  {candidate.years_experience ? ` · ${candidate.years_experience} years exp.` : ""}
                </p>
                {candidate.employment_id && (
                  <p className="text-white/30 text-xs mt-1">ID: {candidate.employment_id}</p>
                )}
              </div>

              {/* Score ring */}
              <CoverRing score={report.overall_score} verdict={report.verdict} verdictTier={verdictTier} />

              {/* Group info */}
              <div className="px-8 py-4 rounded-2xl border border-white/10 bg-white/5 space-y-1.5 text-center">
                <p className="text-white/80 text-sm font-semibold">{group.name}</p>
                <p className="text-white/40 text-xs">{[scheduledDate, group.location].filter(Boolean).join(" · ")}</p>
                {assessors.length > 0 && (
                  <p className="text-white/30 text-[10px]">Assessed by: {assessors.map(a => a.name).join(" · ")}</p>
                )}
              </div>
            </div>

            <div className="px-12 py-6 border-t border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-3.5 w-3.5 text-purple-300/60" />
                <p className="text-white/30 text-[10px]">Generated by ICS Interview Analytics</p>
              </div>
              <p className="text-white/20 text-[9px]">Page 1 of {totalPages}</p>
            </div>
          </Page>

          {/* ══ PAGE 2 — CANDIDATE OVERVIEW ══ */}
          <Page>
            <PageHeader title="Candidate Overview" subtitle={group.name} today={today} />
            <div className="px-12 py-6 space-y-5">
              <PageBanner {...bannerProps} title="Candidate Overview" icon={<LayoutDashboard className="h-5 w-5 text-white" />} />

              {/* Identity + verdict banner */}
              <div className="avoid-break flex items-start justify-between gap-6 pb-5 border-b-2 border-slate-100">
                <div className="space-y-1.5">
                  <h2 className="text-2xl font-extrabold text-[#1B4F8A] tracking-tight">{candidate.full_name}</h2>
                  <p className="text-sm text-slate-500">
                    {[candidate.position, candidate.track_name].filter(Boolean).join(" · ")}
                    {candidate.years_experience ? ` · ${candidate.years_experience} yrs exp.` : ""}
                  </p>
                  {scheduledDate && <p className="text-xs text-slate-400">Assessment date: {scheduledDate}</p>}
                  {group.location && <p className="text-xs text-slate-400">Location: {group.location}</p>}
                </div>
                {/* Score + verdict */}
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div className="rounded-2xl px-8 py-4 text-center border-2" style={{ background: vc.bg, borderColor: vc.border }}>
                    <p className="text-4xl font-black tabular-nums" style={{ color: vc.color }}>{report.overall_score.toFixed(2)}</p>
                    <p className="text-[10px] font-semibold mt-0.5" style={{ color: vc.color }}>/ 5.00</p>
                    <p className="text-xs font-black uppercase tracking-widest mt-1" style={{ color: vc.color }}>{vc.label}</p>
                  </div>
                </div>
              </div>

              {/* KPI row */}
              <div className="grid grid-cols-4 gap-3 avoid-break">
                {[
                  { label: "Strong Competencies", value: `${aboveAvg} / ${totalComps}`, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
                  { label: "Development Areas",   value: allComps.filter(c => c.weighted_avg < 3.5).length, color: "text-red-600", bg: "bg-red-50 border-red-200" },
                  { label: "Divergence Flags",    value: divergFlags,                    color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
                  { label: "Pillars Assessed",    value: report.pillar_results.length,   color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
                ].map(kpi => (
                  <div key={kpi.label} className={cn("rounded-xl border p-3 text-center", kpi.bg)}>
                    <p className={cn("text-2xl font-black", kpi.color)}>{kpi.value}</p>
                    <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5 leading-tight">{kpi.label}</p>
                  </div>
                ))}
              </div>

              {/* Pillar bars */}
              <div className="avoid-break">
                <SectionTitle>Pillar Performance</SectionTitle>
                <div className="space-y-2.5">
                  {report.pillar_results.map(pr => {
                    const pc  = sc(pr.pillar_score)
                    return (
                      <div key={pr.pillar.id}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-700">{pr.pillar.name}</span>
                            {pr.insight_display_label && (
                              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: (pr.insight_color ?? "#64748b") + "20", color: pr.insight_color ?? "#64748b" }}>
                                {pr.insight_display_label}
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-black tabular-nums" style={{ color: pc.text }}>{pr.pillar_score.toFixed(2)}</span>
                        </div>
                        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(pr.pillar_score / 5) * 100}%`, background: pc.text }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Strengths vs Concerns */}
              <div className="avoid-break grid grid-cols-2 gap-4">
                <div>
                  <SectionTitle>Top Strengths</SectionTitle>
                  <div className="space-y-2">
                    {topStrengths.map(cr => {
                      const cc = sc(cr.weighted_avg)
                      return (
                        <div key={cr.competency.id} className="flex items-center justify-between rounded-lg px-3 py-2 border" style={{ background: cc.bg, borderColor: cc.border }}>
                          <p className="text-xs font-semibold text-slate-700">{cr.competency.name}</p>
                          <span className="text-sm font-black tabular-nums" style={{ color: cc.text }}>{cr.weighted_avg.toFixed(2)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <SectionTitle>Key Concerns</SectionTitle>
                  <div className="space-y-2">
                    {topConcerns.map(cr => {
                      const cc = sc(cr.weighted_avg)
                      return (
                        <div key={cr.competency.id} className="flex items-center justify-between rounded-lg px-3 py-2 border" style={{ background: cc.bg, borderColor: cc.border }}>
                          <p className="text-xs font-semibold text-slate-700">{cr.competency.name}</p>
                          <span className="text-sm font-black tabular-nums" style={{ color: cc.text }}>{cr.weighted_avg.toFixed(2)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Expert Executive Summary */}
              <ExpertPanel text={aiCache["executive_summary"]} label="Expert Executive Summary" color="blue" hasExpert={hasExpert} onGenerate={generating ? undefined : generateExpert} />

            </div>
            <PageFooter page={2} total={totalPages} />
          </Page>

          {/* ══ PAGE 3 — ASSESSMENT SNAPSHOT ══ */}
          <Page>
            <PageHeader title="Assessment Snapshot" subtitle={candidate.full_name} today={today} />
            <div className="px-12 py-6 space-y-6">
              <PageBanner {...bannerProps} title="Assessment Snapshot" icon={<BarChart3 className="h-5 w-5 text-white" />} />

              {/* KPI cards */}
              <div className="grid grid-cols-4 gap-3 avoid-break">
                {[
                  { label: "Strong Competencies", value: `${aboveAvg}/${totalComps}`,     color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200"   },
                  { label: "Divergence Flags",    value: divergFlags,                      color: "text-amber-600",   bg: "bg-amber-50 border-amber-200"       },
                  { label: "Assessors",            value: assessors.length,                 color: "text-slate-700",   bg: "bg-slate-50 border-slate-200"       },
                  { label: "Pillars Assessed",    value: report.pillar_results.length,     color: "text-purple-600",  bg: "bg-purple-50 border-purple-200"     },
                ].map(kpi => (
                  <div key={kpi.label} className={cn("rounded-xl border p-3 text-center", kpi.bg)}>
                    <p className={cn("text-xl font-black", kpi.color)}>{kpi.value}</p>
                    <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5 leading-tight">{kpi.label}</p>
                  </div>
                ))}
              </div>

              {/* Charts row: Radar + Pillar bar */}
              <div className="grid grid-cols-2 gap-6 avoid-break">
                <div>
                  <SectionTitle>Pillar Profile</SectionTitle>
                  <PillarRadarChart pillars={radarData} showAverage={false} height={260} />
                </div>
                <div>
                  <SectionTitle>Pillar Scores</SectionTitle>
                  <div className="space-y-2.5 pt-1">
                    {report.pillar_results.map(pr => {
                      const pc  = sc(pr.pillar_score)
                      const pct = (pr.pillar_score / 5) * 100
                      return (
                        <div key={pr.pillar.id}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-700">{pr.pillar.name}</span>
                              {pr.insight_display_label && (
                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={{ background: (pr.insight_color ?? "#64748b") + "20", color: pr.insight_color ?? "#64748b" }}>
                                  {pr.insight_display_label}
                                </span>
                              )}
                            </div>
                            <span className="text-sm font-black tabular-nums" style={{ color: pc.text }}>{pr.pillar_score.toFixed(2)}</span>
                          </div>
                          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pc.text }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Competency score grid (PDF-safe, no dynamic chart) */}
              <div className="avoid-break">
                <SectionTitle>Competency Overview</SectionTitle>
                <div className={cn(
                  "grid gap-2",
                  heatmapCells.length <= 8 ? "grid-cols-4"
                  : heatmapCells.length <= 12 ? "grid-cols-4"
                  : "grid-cols-5"
                )}>
                  {heatmapCells.map((cell, i) => {
                    const cc = sc(cell.score)
                    return (
                      <div key={i} className="rounded-lg border px-3 py-2" style={{ borderColor: cc.border, background: cc.bg }}>
                        <p className="text-[8px] font-bold uppercase tracking-wider mb-0.5" style={{ color: cc.text, opacity: 0.6 }}>
                          {cell.pillarName}
                        </p>
                        <p className="text-[10px] font-semibold text-slate-700 leading-tight truncate">{cell.competencyName}</p>
                        <p className="text-base font-black tabular-nums mt-0.5" style={{ color: cc.text }}>{cell.score.toFixed(2)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>

            </div>
            <PageFooter page={3} total={totalPages} />
          </Page>

          {/* ══ PAGE 4 — ASSESSOR SCORE MATRIX ══ */}
          <Page>
            <PageHeader title="Assessor Score Matrix" subtitle={candidate.full_name} today={today} />
            <div className="px-12 py-6 space-y-6">
              <PageBanner {...bannerProps} title="Assessor Score Matrix" icon={<TableProperties className="h-5 w-5 text-white" />} />

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

              {/* One section per pillar */}
              {report.pillar_results.map((pr) => {
                const pc = sc(pr.pillar_score)

                // ── Determine which assessors are ACTIVE for this pillar ─────────────
                // Use live group_assessors.pillar_weights (not frozen snapshot).
                // An assessor is active if their weight is undefined (defaults to 100%)
                // or explicitly > 0. Weight === 0 means excluded from this pillar.
                const pillarAssessors = assessors.filter(a => {
                  const w = liveWeights[a.id]?.[pr.pillar.id]
                  return w === undefined || w > 0
                })

                // No scores submitted = every active assessor has no score for every competency
                const noScoresSubmitted = pillarAssessors.length > 0 && pillarAssessors.every(a =>
                  pr.competency_results.every(cr => cr.assessor_scores[a.id] === undefined)
                )

                return (
                  <div key={pr.pillar.id} className="avoid-break space-y-2">

                    {/* Pillar header */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-extrabold text-[#1B4F8A] uppercase tracking-wider">{pr.pillar.name}</span>
                        <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">Weight {pr.pillar.weight}%</span>
                      </div>
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-sm font-black tabular-nums shrink-0" style={{ color: pc.text }}>
                        {pr.pillar_score > 0 ? pr.pillar_score.toFixed(2) : "—"}{" "}
                        <span className="text-[10px] font-normal text-slate-400">pillar avg</span>
                      </span>
                    </div>

                    {/* No scores yet banner (only when genuinely no submissions) */}
                    {noScoresSubmitted && (
                      <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <p className="text-[10px] font-semibold">
                          No scores submitted yet for this pillar.
                        </p>
                      </div>
                    )}

                    {/* Table for this pillar */}
                    <div className="rounded-xl border border-slate-100 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-[#1B4F8A]/5 border-b border-slate-100">
                            <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-500 py-2.5 px-4">Competency</th>
                            {pillarAssessors.map(a => {
                              const w    = liveWeights[a.id]?.[pr.pillar.id]
                              const wPct = w !== undefined ? Math.round(w) : 100
                              return (
                                <th key={a.id} className="text-center text-[9px] font-bold uppercase tracking-wider text-slate-500 py-2.5 px-3 whitespace-nowrap">
                                  {a.name.split(" ")[0]}
                                  {wPct !== 100 && (
                                    <span className="font-normal text-slate-400 ml-0.5">({wPct}%)</span>
                                  )}
                                </th>
                              )
                            })}
                            <th className="text-center text-[9px] font-bold uppercase tracking-wider text-[#1B4F8A] py-2.5 px-4 bg-[#1B4F8A]/8">
                              Weighted Avg
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {pr.competency_results.map((cr, ci) => {
                            const cc = sc(cr.weighted_avg)
                            // "has a score" = at least one ACTIVE assessor submitted
                            const hasAnyScore = pillarAssessors.some(a => cr.assessor_scores[a.id] !== undefined)
                            return (
                              <tr key={cr.competency.id}
                                className={cn("border-b border-slate-50 last:border-0", ci % 2 === 0 ? "bg-white" : "bg-slate-50/40")}>
                                <td className="py-2.5 px-4">
                                  <p className="text-[11px] font-semibold text-slate-700 leading-snug">{cr.competency.name}</p>
                                  {cr.is_divergent && (
                                    <span className="text-[8px] text-amber-600 font-bold flex items-center gap-0.5 mt-0.5">
                                      <AlertTriangle className="h-2 w-2" /> Divergent (spread ±{cr.divergence.toFixed(1)})
                                    </span>
                                  )}
                                </td>
                                {pillarAssessors.map(a => {
                                  const s  = cr.assessor_scores[a.id]
                                  const ac = s !== undefined ? sc(s) : null
                                  return (
                                    <td key={a.id} className="py-2.5 px-3 text-center">
                                      {s !== undefined ? (
                                        <span className="inline-block text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-md"
                                          style={{ color: ac?.text, background: ac?.bg }}>
                                          {s.toFixed(1)}
                                        </span>
                                      ) : (
                                        <span className="text-slate-300 text-[11px] font-semibold">—</span>
                                      )}
                                    </td>
                                  )
                                })}
                                {/* Weighted avg cell */}
                                <td className="py-2.5 px-4 text-center bg-slate-50/60">
                                  {hasAnyScore ? (
                                    <span className="inline-block text-[12px] font-black tabular-nums px-2.5 py-0.5 rounded-md"
                                      style={{ color: cc.text, background: cc.bg }}>
                                      {cr.weighted_avg.toFixed(2)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 text-[11px] font-semibold">—</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                          {/* Pillar average footer row */}
                          <tr className="bg-[#1B4F8A]/5 border-t-2 border-[#1B4F8A]/10">
                            <td className="py-2.5 px-4 text-[10px] font-extrabold text-[#1B4F8A] uppercase tracking-wider">
                              Pillar Average
                            </td>
                            {pillarAssessors.map(a => {
                              const aScores = pr.competency_results
                                .map(cr => cr.assessor_scores[a.id])
                                .filter(v => v !== undefined) as number[]
                              const avg = aScores.length > 0
                                ? aScores.reduce((s, v) => s + v, 0) / aScores.length
                                : null
                              const ac  = avg !== null ? sc(avg) : null
                              return (
                                <td key={a.id} className="py-2.5 px-3 text-center">
                                  {avg !== null ? (
                                    <span className="text-[11px] font-bold tabular-nums" style={{ color: ac?.text }}>
                                      {avg.toFixed(2)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 text-[11px] font-semibold">—</span>
                                  )}
                                </td>
                              )
                            })}
                            <td className="py-2.5 px-4 text-center bg-[#1B4F8A]/8">
                              <span className="text-[13px] font-black tabular-nums" style={{ color: pc.text }}>
                                {pr.pillar_score > 0 ? pr.pillar_score.toFixed(2) : "—"}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
            <PageFooter page={4} total={totalPages} />
          </Page>

          {/* ══ PAGES 5+ — PILLAR DEEP DIVE ══ */}
          {report.pillar_results.map((pr, pi) => {
            const pc = sc(pr.pillar_score)
            const pillarAiStory    = aiCache[`pillar_story_${pr.pillar.id}`]
            const pillarAiVariance = aiCache[`pillar_variance_${pr.pillar.id}`]

            return (
              <Page key={pr.pillar.id}>
                <PageHeader title={`Pillar ${pi + 1} — ${pr.pillar.name}`} subtitle={candidate.full_name} today={today} />
                <div className="px-12 py-6 space-y-5">
                  <PageBanner {...bannerProps} title={`Pillar ${pi + 1} — ${pr.pillar.name}`} icon={<BarChart3 className="h-5 w-5 text-white" />} />

                  {/* Pillar meta strip — score + insight badge */}
                  <div className="avoid-break flex items-center gap-3 py-2.5 px-4 rounded-xl border border-slate-100 bg-slate-50/60">
                    {pr.insight_display_label && (
                      <span className="text-[9px] font-bold px-2 py-1 rounded-full"
                        style={{ background: (pr.insight_color ?? "#64748b") + "20", color: pr.insight_color ?? "#64748b" }}>
                        {pr.insight_display_label}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-full">Weight: {pr.pillar.weight}%</span>
                    <div className="flex-1" />
                    <span className="text-2xl font-black tabular-nums" style={{ color: pc.text }}>{pr.pillar_score.toFixed(2)}</span>
                    <span className="text-[10px] text-slate-400">/ 5.00</span>
                  </div>

                  {/* Competency bar chart (inline) */}
                  <div className="avoid-break">
                    <SectionTitle>Competency Breakdown</SectionTitle>
                    <div className="space-y-2">
                      {pr.competency_results.map(cr => {
                        const cc  = sc(cr.weighted_avg)
                        const pct = (cr.weighted_avg / 5) * 100
                        return (
                          <div key={cr.competency.id}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-600">{cr.competency.name}</span>
                                {cr.is_divergent && (
                                  <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                                    <AlertTriangle className="h-2 w-2" /> Divergent
                                  </span>
                                )}
                              </div>
                              <span className="text-sm font-black tabular-nums" style={{ color: cc.text }}>{cr.weighted_avg.toFixed(2)}</span>
                            </div>
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cc.text }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Evidence table — one table per pillar, all assessors × competencies */}
                  <div className="avoid-break">
                    <SectionTitle>Assessor Evidence</SectionTitle>
                    <div className="rounded-xl border border-slate-100 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-[#1B4F8A]/5 border-b border-slate-100">
                            <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-500 py-2.5 px-4 w-[26%]">Competency</th>
                            <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-500 py-2.5 px-3 w-[11%]">Assessor</th>
                            <th className="text-center text-[9px] font-bold uppercase tracking-wider text-slate-500 py-2.5 px-2 w-[7%]">Score</th>
                            <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-500 py-2.5 px-4">Evidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pr.competency_results.map((cr, ci) => {
                            // Get AI-rephrased text (new key first, legacy key fallback)
                            const rephraseRaw = aiCache[`evidence_rephrase_${cr.competency.id}`]
                              || aiCache[`evidence_bullets_${cr.competency.id}`]
                            let rephraseMap: Record<string, string | string[]> = {}
                            try { if (rephraseRaw) rephraseMap = JSON.parse(rephraseRaw) } catch {}

                            // Active assessors = those who submitted a score or have evidence
                            const activeAssessors = assessors.filter(a =>
                              cr.assessor_scores[a.id] !== undefined || cr.evidence[a.id]
                            )
                            if (activeAssessors.length === 0) return null

                            return activeAssessors.map((a, ai) => {
                              const score    = cr.assessor_scores[a.id]
                              const rawEv    = cr.evidence[a.id]
                              const rephrased = rephraseMap[a.id]
                              // Show rephrased if available (string or first bullet), else raw
                              const displayText = typeof rephrased === "string"
                                ? rephrased
                                : Array.isArray(rephrased) ? rephrased.join(" ")
                                : rawEv
                              const cc2 = score !== undefined ? sc(score) : null

                              return (
                                <tr key={`${cr.competency.id}-${a.id}`}
                                  className={cn("border-b border-slate-50 last:border-0", ci % 2 === 0 ? "bg-white" : "bg-slate-50/30")}>
                                  {/* Competency name — rowspan across all assessors for this competency */}
                                  {ai === 0 && (
                                    <td rowSpan={activeAssessors.length} className="py-2.5 px-4 align-top border-r border-slate-100">
                                      <p className="text-[11px] font-semibold text-slate-700 leading-snug">{cr.competency.name}</p>
                                      {cr.is_divergent && (
                                        <span className="text-[8px] text-amber-600 font-bold flex items-center gap-0.5 mt-0.5">
                                          <AlertTriangle className="h-2 w-2" /> Divergent ±{cr.divergence.toFixed(1)}
                                        </span>
                                      )}
                                    </td>
                                  )}
                                  {/* Assessor */}
                                  <td className="py-2.5 px-3">
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-4 h-4 rounded-full bg-[#1B4F8A]/10 flex items-center justify-center text-[8px] font-bold text-[#1B4F8A] shrink-0">
                                        {a.name[0]}
                                      </div>
                                      <span className="text-[10px] font-medium text-slate-600 truncate">{a.name.split(" ")[0]}</span>
                                    </div>
                                  </td>
                                  {/* Score */}
                                  <td className="py-2.5 px-2 text-center">
                                    {score !== undefined && cc2 ? (
                                      <span className="inline-block text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded"
                                        style={{ color: cc2.text, background: cc2.bg }}>
                                        {score.toFixed(1)}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 text-[11px]">—</span>
                                    )}
                                  </td>
                                  {/* Evidence */}
                                  <td className="py-2.5 px-4">
                                    {displayText
                                      ? <p className="text-[10px] text-slate-600 leading-relaxed">{displayText}</p>
                                      : <span className="text-[10px] text-slate-300 italic">No evidence submitted</span>
                                    }
                                  </td>
                                </tr>
                              )
                            })
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Expert Pillar Analysis */}
                  <ExpertPanel text={pillarAiStory} label={`Expert ${pr.pillar.name} Analysis`} color="blue" hasExpert={hasExpert} onGenerate={generating ? undefined : generateExpert} />
                  {pillarAiVariance && (
                    <ExpertPanel text={pillarAiVariance} label="Intra-Pillar Variance Note" color="amber" hasExpert={hasExpert} onGenerate={generating ? undefined : generateExpert} />
                  )}
                </div>
                <PageFooter page={5 + pi} total={totalPages} />
              </Page>
            )
          })}

          {/* ══ QUALITATIVE PAGE ══ */}
          <Page>
            <PageHeader title="Assessor Evaluations" subtitle={candidate.full_name} today={today} />
            <div className="px-12 py-6 space-y-5">
              <PageBanner {...bannerProps} title="Assessor Evaluations" icon={<MessageSquareText className="h-5 w-5 text-white" />} />

              {/* Expert Qualitative Synthesis (top — most prominent) */}
              {qualSynthesis ? (
                <div className="avoid-break border border-[#1B4F8A]/20 rounded-xl bg-[#1B4F8A]/5 p-5 space-y-4">
                  <div className="flex items-center gap-2 text-[#1B4F8A]">
                    <BrainCircuit className="h-4 w-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Expert Qualitative Synthesis</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: "Remarks",        value: qualSynthesis.remarks        },
                      { label: "Gap Analysis",   value: qualSynthesis.gap_analysis   },
                      { label: "Recommendation", value: qualSynthesis.recommendation },
                    ].map(f => (
                      <div key={f.label}>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#1B4F8A]/60 mb-1">{f.label}</p>
                        <p className="text-xs text-slate-700 leading-relaxed">{f.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    "no-print avoid-break flex items-center gap-2.5 text-sm text-slate-400 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 transition-colors",
                    !generating && "cursor-pointer hover:bg-purple-50 hover:border-purple-200 hover:text-slate-500",
                  )}
                  onClick={generating ? undefined : generateExpert}
                >
                  <Sparkles className="h-4 w-4 shrink-0 text-purple-400" />
                  <span>
                    Click <strong className="text-purple-600 font-semibold">Generate Expert Report</strong> to add expert qualitative synthesis here.
                  </span>
                </div>
              )}

              {/* Per-assessor qualitative — AI-rephrased when available */}
              {report.qualitative.length > 0 && (
                <div className="avoid-break">
                  <SectionTitle>Per-Assessor Evaluations</SectionTitle>
                  <div className={cn("grid gap-5", report.qualitative.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                    {report.qualitative.map((q: any) => {
                      const a          = assessors.find(x => x.id === q.assessor_id)
                      const rephrased  = qualRephrase[q.assessor_id]
                      return (
                        <div key={q.assessor_id} className="border border-slate-100 rounded-xl overflow-hidden">
                          {/* Assessor header */}
                          <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1B4F8A]/5 border-b border-slate-100">
                            <div className="w-6 h-6 rounded-full bg-[#1B4F8A] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                              {a?.name?.[0]?.toUpperCase()}
                            </div>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-700">{a?.name}</p>
                              {q.confirmed && <span className="text-[8px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">✓ Confirmed</span>}
                              {rephrased && <span className="text-[8px] text-purple-600 font-bold bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><BrainCircuit className="h-2 w-2" /> Expert Reviewed</span>}
                            </div>
                          </div>
                          {/* Fields */}
                          <div className="p-4 space-y-3">
                            {[
                              { label: "Remarks",        raw: q.remarks,        ai: rephrased?.remarks        },
                              { label: "Gap Analysis",   raw: q.gap_analysis,   ai: rephrased?.gap_analysis   },
                              { label: "Recommendation", raw: q.recommendation, ai: rephrased?.recommendation },
                            ].map(f => (
                              <div key={f.label}>
                                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">{f.label}</p>
                                <p className="text-[10px] text-slate-600 leading-relaxed">
                                  {f.ai ?? f.raw ?? <span className="italic text-slate-300">Not provided</span>}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

            </div>
            <PageFooter page={5 + report.pillar_results.length} total={totalPages} />
          </Page>

          {/* ══ DEVELOPMENT PAGE (only if weak areas exist) ══ */}
          {hasDevPage && (
            <Page>
              <PageHeader title="Development Roadmap" subtitle={candidate.full_name} today={today} />
              <div className="px-12 py-6 space-y-5">
                <PageBanner {...bannerProps} title="Development Roadmap" icon={<TrendingUp className="h-5 w-5 text-white" />} />

                {/* Weak competencies identified */}
                <div className="avoid-break">
                  <SectionTitle>Areas Identified for Development</SectionTitle>
                  <div className="space-y-2">
                    {report.pillar_results.flatMap(pr =>
                      pr.competency_results
                        .filter(cr => cr.weighted_avg < 3.5)
                        .map(cr => {
                          const cc      = sc(cr.weighted_avg)
                          const insight = devAreaInsights[cr.competency.id]
                          return (
                            <div key={cr.competency.id} className="rounded-xl border overflow-hidden"
                              style={{ borderColor: cc.border }}>
                              {/* Area header */}
                              <div className="flex items-center justify-between px-3 py-2.5"
                                style={{ background: cc.bg }}>
                                <div>
                                  <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: cc.text, opacity: 0.7 }}>{pr.pillar.name}</p>
                                  <p className="text-xs font-semibold text-slate-700">{cr.competency.name}</p>
                                </div>
                                <span className="text-lg font-black tabular-nums" style={{ color: cc.text }}>
                                  {cr.weighted_avg.toFixed(2)}
                                </span>
                              </div>
                              {/* Expert insight — always shown (placeholder before generate) */}
                              <div className="px-3 py-2 bg-white border-t" style={{ borderColor: cc.border }}>
                                {insight ? (
                                  <p className="text-[10px] text-slate-600 leading-relaxed">{insight}</p>
                                ) : (
                                  <div
                                    className={cn(
                                      "no-print flex items-center gap-2 text-[10px] text-slate-400 rounded transition-colors",
                                      !generating && "cursor-pointer hover:text-purple-700",
                                    )}
                                    onClick={generating ? undefined : generateExpert}
                                  >
                                    <Sparkles className="h-3 w-3 shrink-0 text-purple-400" />
                                    <span>Click <strong className="text-purple-600 font-semibold">Generate Expert Report</strong> for expert insight on this area.</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })
                    )}
                  </div>
                </div>

                {/* Recommended courses */}
                {devCourses.length > 0 && (
                  <div className="avoid-break">
                    <SectionTitle><BookOpen className="h-3 w-3 inline mr-1.5" />Recommended Training Courses</SectionTitle>
                    <div className="space-y-2">
                      {devCourses.map((c, i) => (
                        <div key={i} className="flex items-start gap-4 p-4 border border-slate-100 rounded-xl bg-slate-50/50">
                          <div className="w-8 h-8 rounded-full bg-[#1B4F8A] flex items-center justify-center text-white text-xs font-bold shrink-0">{i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-bold text-slate-700">{c.course}</p>
                              <span className="text-[9px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full shrink-0">{c.duration}</span>
                            </div>
                            <p className="text-[10px] text-[#1B4F8A] font-medium mt-0.5">{c.provider}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              <span className="text-slate-400">Target: </span>{c.competency} · {c.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No courses yet — prompt to generate */}
                {devCourses.length === 0 && (
                  <div
                    className={cn(
                      "no-print avoid-break flex items-center gap-2.5 text-sm text-slate-400 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 transition-colors",
                      !generating && "cursor-pointer hover:bg-purple-50 hover:border-purple-200 hover:text-slate-500",
                    )}
                    onClick={generating ? undefined : generateExpert}
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-purple-400" />
                    <span>
                      Click <strong className="text-purple-600 font-semibold">Generate Expert Report</strong> to see recommended training courses.
                    </span>
                  </div>
                )}

                {/* Expert Development Roadmap */}
                <DevelopmentRoadmap raw={aiCache["development_plan"]} hasExpert={hasExpert} onGenerate={generating ? undefined : generateExpert} />
              </div>
              <PageFooter page={5 + report.pillar_results.length + 1} total={totalPages} />
            </Page>
          )}

          {/* ══ EXPERT ANALYSIS PAGE — phased structure ══ */}
          <Page>
            <PageHeader title="Expert Analysis" subtitle={candidate.full_name} today={today} />
            <div className="px-12 py-6 space-y-5">

              <PageBanner {...bannerProps} title="Expert Analysis Report" icon={<BrainCircuit className="h-5 w-5 text-white" />} />

              {/* Phase 1 — Candidate Profile */}
              <div className="avoid-break">
                <SectionTitle>Phase 1 — Candidate Profile</SectionTitle>
                <div className="grid grid-cols-2 gap-4">
                  <ExpertPanel text={aiCache["profile_interpretation"]} label="Profile Interpretation" color="slate" hasExpert={hasExpert} onGenerate={generating ? undefined : generateExpert} />
                  <ExpertPanel text={aiCache["red_thread"]}             label="Hidden Pattern"          color="purple" hasExpert={hasExpert} onGenerate={generating ? undefined : generateExpert} />
                </div>
              </div>

              {/* Phase 2 — Strengths & Weaknesses */}
              <div className="avoid-break">
                <SectionTitle>Phase 2 — Strengths &amp; Development Areas</SectionTitle>
                <div className="grid grid-cols-2 gap-4">
                  <ExpertPanel text={aiCache["strengths_narrative"]}  label="Demonstrated Strengths"  color="emerald" hasExpert={hasExpert} onGenerate={generating ? undefined : generateExpert} />
                  <ExpertPanel text={aiCache["weaknesses_narrative"]} label="Key Development Gaps"     color="amber"   hasExpert={hasExpert} onGenerate={generating ? undefined : generateExpert} />
                </div>
              </div>

              {/* Phase 3 — Verdict Intelligence */}
              <div className="avoid-break">
                <SectionTitle>Phase 3 — Verdict Intelligence</SectionTitle>
                <div className="grid grid-cols-2 gap-4">
                  <ExpertPanel text={aiCache["verdict_explanation"]} label="What Drove This Verdict"   color="blue"  hasExpert={hasExpert} onGenerate={generating ? undefined : generateExpert} />
                  <ExpertPanel text={aiCache["what_would_change"]}   label="What Would Change It"      color="amber" hasExpert={hasExpert} onGenerate={generating ? undefined : generateExpert} />
                </div>
              </div>

              {/* Phase 4 — Future Focus */}
              <div className="avoid-break">
                <SectionTitle>Phase 4 — Future Focus</SectionTitle>
                <ExpertPanel text={aiCache["forward_focus"]} label="What the Candidate Must Focus On" color="blue" hasExpert={hasExpert} onGenerate={generating ? undefined : generateExpert} />
              </div>

              {/* Phase 5 — Final Recommendation */}
              <div className="avoid-break">
                <SectionTitle>Phase 5 — Final Recommendation</SectionTitle>
                {/* Verdict badge */}
                <div className="flex items-center gap-4 mb-3">
                  <div className="rounded-xl px-5 py-2.5 border-2 flex items-center gap-3" style={{ background: vc.bg, borderColor: vc.border }}>
                    <div className="w-3 h-3 rounded-full" style={{ background: vc.dot }} />
                    <p className="text-sm font-black uppercase tracking-widest" style={{ color: vc.color }}>{vc.label}</p>
                    <p className="text-xl font-black tabular-nums" style={{ color: vc.color }}>{report.overall_score.toFixed(2)}</p>
                  </div>
                </div>
                <ExpertPanel text={aiCache["recommendation"]} label="Expert Recommendation" color="blue" hasExpert={hasExpert} onGenerate={generating ? undefined : generateExpert} />
              </div>

            </div>

            {/* Sign-off */}
            <div className="px-12 py-5 border-t border-slate-100 flex flex-col items-center gap-1.5 text-center mt-auto">
              <Image src="/logo/logo-dark-blue.png" alt="ICS" width={70} height={20} className="object-contain opacity-20" />
              <p className="text-[9px] text-slate-300 uppercase tracking-widest">ICS Aviation · Integrated Consulting Services · Confidential</p>
              <p className="text-[9px] text-slate-300 max-w-md">
                This report is based on structured assessment data and is for internal use only.
              </p>
            </div>
            <PageFooter page={totalPages} total={totalPages} />
          </Page>

        </div>
      </div>
    </>
  )
}
