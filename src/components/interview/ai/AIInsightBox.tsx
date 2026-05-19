"use client"

import { cn } from "@/lib/utils"
import { Sparkles, AlertTriangle, TrendingUp, Eye, Lightbulb, BarChart3 } from "lucide-react"

type InsightType =
  | "insight"      // general AI analysis — blue/indigo
  | "warning"      // divergence, gap, flag — amber
  | "strength"     // positive finding — emerald
  | "prediction"   // forward-looking — purple
  | "pattern"      // red thread / systemic — rose
  | "calibration"  // assessor bias — slate (admin)

interface AIInsightBoxProps {
  text:       string | null | undefined
  type?:      InsightType
  label?:     string          // override the default section label
  isLoading?: boolean
  className?: string
  compact?:   boolean         // smaller padding for inline use
}

const CONFIGS: Record<InsightType, {
  bg:     string
  border: string
  icon:   React.ReactNode
  label:  string
  text:   string
  dot:    string
}> = {
  insight: {
    bg:     "bg-[#1B4F8A]/5",
    border: "border-[#1B4F8A]/20",
    icon:   <Sparkles className="h-3.5 w-3.5" />,
    label:  "AI Analysis",
    text:   "text-[#1B4F8A]",
    dot:    "bg-[#1B4F8A]",
  },
  warning: {
    bg:     "bg-amber-50",
    border: "border-amber-200",
    icon:   <AlertTriangle className="h-3.5 w-3.5" />,
    label:  "AI Flag",
    text:   "text-amber-700",
    dot:    "bg-amber-500",
  },
  strength: {
    bg:     "bg-emerald-50",
    border: "border-emerald-200",
    icon:   <TrendingUp className="h-3.5 w-3.5" />,
    label:  "AI Insight",
    text:   "text-emerald-700",
    dot:    "bg-emerald-500",
  },
  prediction: {
    bg:     "bg-purple-50",
    border: "border-purple-200",
    icon:   <Eye className="h-3.5 w-3.5" />,
    label:  "AI Prediction",
    text:   "text-purple-700",
    dot:    "bg-purple-500",
  },
  pattern: {
    bg:     "bg-rose-50",
    border: "border-rose-200",
    icon:   <Lightbulb className="h-3.5 w-3.5" />,
    label:  "AI Pattern",
    text:   "text-rose-700",
    dot:    "bg-rose-500",
  },
  calibration: {
    bg:     "bg-slate-50",
    border: "border-slate-200",
    icon:   <BarChart3 className="h-3.5 w-3.5" />,
    label:  "Calibration Note",
    text:   "text-slate-600",
    dot:    "bg-slate-400",
  },
}

function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-3 bg-current rounded opacity-20 w-4/5" />
      <div className="h-3 bg-current rounded opacity-20 w-full" />
      <div className="h-3 bg-current rounded opacity-20 w-3/5" />
    </div>
  )
}

export default function AIInsightBox({
  text, type = "insight", label, isLoading = false, className, compact = false,
}: AIInsightBoxProps) {
  const cfg = CONFIGS[type]

  if (!isLoading && !text) return null

  return (
    <div
      className={cn(
        "rounded-xl border",
        cfg.bg,
        cfg.border,
        compact ? "p-3" : "p-4",
        className,
      )}
    >
      {/* Header */}
      <div className={cn("flex items-center gap-2 mb-2", cfg.text)}>
        <div className={cn("flex items-center justify-center w-5 h-5 rounded-full opacity-80", cfg.dot, "text-white")}>
          {cfg.icon}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">
          {label ?? cfg.label}
        </span>
        {/* Animated pulse dot when loading */}
        {isLoading && (
          <div className="ml-auto flex items-center gap-1">
            <div className={cn("w-1.5 h-1.5 rounded-full animate-ping", cfg.dot, "opacity-75")} />
            <span className="text-[9px] opacity-60">Generating…</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className={cn("text-sm leading-relaxed", cfg.text, "opacity-90")}>
        {isLoading ? <Skeleton /> : <p>{text}</p>}
      </div>
    </div>
  )
}
