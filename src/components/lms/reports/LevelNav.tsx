import Link from "next/link"
import { ChevronRight, FileDown } from "lucide-react"

// "What's inside" for one report level: the next level down as a short list,
// running items first and finished ones folded away, each with its PDF.

export type LevelRow = {
  id: string; label: string; sub?: string | null; href: string
  cells: (string | number)[]; live?: boolean; pdfHref?: string | null
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`)
export { pct as levelPct }

export default function LevelNav({ title, hint, columns, rows, pastLabel = "Past" }: {
  title: string; hint?: string; columns: string[]; rows: LevelRow[]; pastLabel?: string
}) {
  if (!rows.length) return null
  const live = rows.filter(r => r.live !== false)
  const past = rows.filter(r => r.live === false)
  const grid = { gridTemplateColumns: `minmax(0,2.4fr) repeat(${columns.length},minmax(0,1fr)) 64px` }

  const Row = ({ r }: { r: LevelRow }) => (
    <div className="grid gap-3 items-center px-4 py-2.5 border-t border-slate-100 hover:bg-slate-50" style={grid}>
      <Link href={r.href} className="min-w-0 group">
        <span className="block text-sm font-medium text-slate-800 group-hover:text-[#1B4F8A] truncate">{r.label}</span>
        {r.sub && <span className="block text-xs text-slate-400 truncate">{r.sub}</span>}
      </Link>
      {r.cells.map((c, i) => <span key={i} className="text-sm text-slate-600 tabular-nums">{c}</span>)}
      <span className="flex items-center justify-end gap-2">
        {r.pdfHref && <a href={r.pdfHref} title="Download PDF" className="text-[#1B4F8A] hover:opacity-70"><FileDown className="h-4 w-4" /></a>}
        <Link href={r.href} aria-label={`Open ${r.label}`} className="text-slate-300 hover:text-[#1B4F8A]"><ChevronRight className="h-4 w-4" /></Link>
      </span>
    </div>
  )

  return (
    <section className="max-w-[1100px] mx-auto mb-5 bg-white border border-slate-200 rounded-xl overflow-hidden print:hidden">
      <div className="px-4 py-3 flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-800">{title} <span className="text-slate-400 font-normal">({rows.length})</span></h3>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[620px]">
          <div className="grid gap-3 px-4 py-2 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wide" style={grid}>
            <span>Name</span>{columns.map(c => <span key={c}>{c}</span>)}<span />
          </div>
          {live.map(r => <Row key={r.id} r={r} />)}
          {past.length > 0 && (
            <details className="border-t border-slate-100" open={live.length === 0}>
              <summary className="px-4 py-2.5 text-xs font-medium text-slate-500 cursor-pointer hover:bg-slate-50 select-none">{pastLabel} ({past.length})</summary>
              {past.map(r => <Row key={r.id} r={r} />)}
            </details>
          )}
        </div>
      </div>
    </section>
  )
}
