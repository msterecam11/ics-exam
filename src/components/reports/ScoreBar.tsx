interface Props {
  label: string
  score: number       // 0–100
  detail?: string     // e.g. "6 / 8 correct"
  showPercent?: boolean
}

function barColor(score: number) {
  if (score >= 80) return { bar: "#10b981", bg: "#d1fae5", text: "#065f46" }
  if (score >= 60) return { bar: "#f59e0b", bg: "#fef3c7", text: "#92400e" }
  return { bar: "#ef4444", bg: "#fee2e2", text: "#991b1b" }
}

export default function ScoreBar({ label, score, detail, showPercent = true }: Props) {
  const { bar, bg, text } = barColor(score)
  const pct = Math.min(score, 100)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <div className="flex items-center gap-2">
          {detail && <span className="text-xs text-slate-400">{detail}</span>}
          {showPercent && (
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: bg, color: text }}>
              {score.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: bar }}
        />
      </div>
    </div>
  )
}
