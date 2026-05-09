interface Props {
  score: number        // 0–100
  size?: number
  passed?: boolean
  label?: string
}

export default function ScoreRing({ score, size = 120, passed, label }: Props) {
  const strokeWidth = 10
  const r = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - Math.min(score, 100) / 100)

  const color = passed === undefined
    ? score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444"
    : passed ? "#10b981" : "#ef4444"

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={strokeWidth}
          />
          {/* Progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold" style={{ color }}>{score.toFixed(1)}%</span>
          {passed !== undefined && (
            <span className="text-[10px] font-semibold" style={{ color }}>
              {passed ? "PASSED" : "FAILED"}
            </span>
          )}
        </div>
      </div>
      {label && <p className="text-xs text-slate-500 text-center">{label}</p>}
    </div>
  )
}
