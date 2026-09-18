// Report charts as plain SVG: identical on screen and in the PDF, no chart library.

const BRAND = "#1B4F8A"
const TEAL = "#0F766E"
const AMBER = "#D97706"
const GRID = "#E2E8F0"
const INK = "#64748B"

const fmtDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })

/** Planned vs actual completion over the program's dates. */
export function ProgressTimelineChart({ start, end, total, points, width = 690, height = 210 }: {
  start: string | null; end: string | null; total: number; points: { date: string; completed: number }[]; width?: number; height?: number
}) {
  if (!start || !total || points.length < 2) return null
  const pad = { l: 36, r: 12, t: 12, b: 26 }
  const last = points[points.length - 1].date
  const x0 = Date.parse(start + "T00:00:00Z")
  const x1 = Math.max(Date.parse((end && end > last ? end : last) + "T00:00:00Z"), x0 + 86_400_000)
  const W = width - pad.l - pad.r, H = height - pad.t - pad.b
  const X = (iso: string) => pad.l + ((Date.parse(iso + "T00:00:00Z") - x0) / (x1 - x0)) * W
  const Y = (pct: number) => pad.t + H - (pct / 100) * H
  const actual = points.map(p => `${X(p.date).toFixed(1)},${Y((p.completed / total) * 100).toFixed(1)}`).join(" ")
  const planned = end ? `${X(start).toFixed(1)},${Y(0)} ${X(end).toFixed(1)},${Y(100)}` : null
  const now = points[points.length - 1]
  const nowPct = Math.round((now.completed / total) * 100)

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={`Completion over time: ${nowPct}% completed by ${fmtDate(now.date)}`}>
        {[0, 25, 50, 75, 100].map(v => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={Y(v)} y2={Y(v)} stroke={GRID} strokeWidth={1} />
            <text x={pad.l - 6} y={Y(v) + 3} fontSize={9} fill={INK} textAnchor="end">{v}%</text>
          </g>
        ))}
        {planned && <polyline points={planned} fill="none" stroke={AMBER} strokeWidth={2} strokeDasharray="5 4" />}
        <polyline points={actual} fill="none" stroke={BRAND} strokeWidth={2.5} strokeLinejoin="round" />
        <circle cx={X(now.date)} cy={Y(nowPct)} r={4} fill={BRAND} />
        <text x={Math.min(X(now.date) + 6, width - pad.r - 30)} y={Y(nowPct) - 6} fontSize={10} fontWeight={700} fill={BRAND}>{nowPct}%</text>
        <text x={pad.l} y={height - 8} fontSize={9} fill={INK}>{fmtDate(start)}</text>
        {end && <text x={X(end)} y={height - 8} fontSize={9} fill={INK} textAnchor="end">{fmtDate(end)}</text>}
      </svg>
      <div className="flex items-center gap-4 text-[10px] text-slate-500 mt-1">
        <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5" style={{ background: BRAND }} /> Courses completed (actual)</span>
        {planned && <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: AMBER }} /> Steady pace to the end date (planned)</span>}
      </div>
    </div>
  )
}

/** Number of results in each score band. */
export function ScoreBandsChart({ bands, labels, width = 690, height = 170 }: { bands: number[]; labels: string[]; width?: number; height?: number }) {
  const total = bands.reduce((a, b) => a + b, 0)
  if (!total) return null
  const pad = { l: 12, r: 12, t: 16, b: 26 }
  const W = width - pad.l - pad.r, H = height - pad.t - pad.b
  const max = Math.max(...bands)
  const slot = W / bands.length, bw = Math.min(64, slot * 0.6)
  const color = (i: number) => (i <= 1 ? "#DC2626" : i <= 3 ? AMBER : TEAL)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={`Score distribution of ${total} exam results`}>
      <line x1={pad.l} x2={width - pad.r} y1={pad.t + H} y2={pad.t + H} stroke={GRID} />
      {bands.map((n, i) => {
        const h = max ? (n / max) * H : 0
        const x = pad.l + slot * i + (slot - bw) / 2
        return (
          <g key={i}>
            <rect x={x} y={pad.t + H - h} width={bw} height={Math.max(h, n ? 2 : 0)} rx={3} fill={color(i)} opacity={0.85} />
            <text x={x + bw / 2} y={pad.t + H - h - 4} fontSize={10} fontWeight={700} fill="#334155" textAnchor="middle">{n || ""}</text>
            <text x={x + bw / 2} y={height - 8} fontSize={9} fill={INK} textAnchor="middle">{labels[i]}</text>
          </g>
        )
      })}
    </svg>
  )
}

/** Side-by-side bars per row, e.g. completion and pass rate per track or program. */
export function GroupedBars({ rows, series }: {
  rows: { label: string; values: (number | null)[] }[]
  series: { name: string; color: string }[]
}) {
  if (!rows.length) return null
  return (
    <div>
      <div className="space-y-2.5">
        {rows.map(r => (
          <div key={r.label} className="flex items-center gap-3 avoid-break">
            <span className="w-44 text-[11px] text-slate-700 truncate" title={r.label}>{r.label}</span>
            <div className="flex-1 space-y-1">
              {series.map((s, i) => {
                const v = r.values[i]
                return (
                  <div key={s.name} className="flex items-center gap-2">
                    <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, v ?? 0))}%`, background: s.color }} />
                    </div>
                    <span className="w-9 text-right text-[10px] font-semibold text-slate-600">{v === null ? "—" : `${v}%`}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 text-[10px] text-slate-500 mt-3">
        {series.map(s => <span key={s.name} className="flex items-center gap-1.5"><span className="inline-block w-3 h-2 rounded-sm" style={{ background: s.color }} /> {s.name}</span>)}
      </div>
    </div>
  )
}

export const CHART_COLORS = { brand: BRAND, teal: TEAL, amber: AMBER }
/** Labels for scoreBandsOf() in lms-program-report. */
export const SCORE_BANDS = ["Below 50", "50–59", "60–69", "70–79", "80–89", "90–100"]
