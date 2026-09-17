import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DeadlineLevel } from "@/lib/lms-student-portal"

// Small pieces shared by the student portal pages (server components).

/** A calendar date (YYYY-MM-DD) shown as "17 Sep 2026". */
export function fmtDay(iso: string | null | undefined) {
  if (!iso) return null
  return new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
}

export function DeadlineBadge({ daysLeft, level, extended, className }: {
  daysLeft: number | null; level: DeadlineLevel; extended?: boolean; className?: string
}) {
  if (daysLeft === null || !level) return null
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border",
      level === "red" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200",
      className,
    )}>
      <AlertTriangle className="h-3 w-3" />
      {daysLeft === 0 ? "Ends today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
      {extended && " · extended"}
    </span>
  )
}

export function ProgressBar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={cn("h-1.5 bg-slate-100 rounded-full overflow-hidden", className)}>
      <div className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : "bg-[#1B4F8A]")} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  )
}
