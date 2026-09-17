"use client"

import Image from "next/image"
import type { FeedbackSummary } from "@/lib/lms-report-shared"

// Shared page chrome for the paged reports (same look as the course reports):
// each [data-report-page] becomes one PDF page, sized to its content.

export const SECTION = "text-[10px] font-bold uppercase tracking-widest text-slate-400"

export function sc(p: number | null | undefined) {
  if (p === null || p === undefined) return { t: "#64748b", b: "#f1f5f9" }
  if (p >= 80) return { t: "#059669", b: "#d1fae5" }
  if (p >= 60) return { t: "#D97706", b: "#fef3c7" }
  return { t: "#DC2626", b: "#fee2e2" }
}

export function fmtTime(s: number) {
  if (!s || s < 60) return s >= 1 ? `${s}s` : "—"
  const totalMin = Math.round(s / 60), h = Math.floor(totalMin / 60), m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
export const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`)
export function fmtDay(iso: string | null | undefined) {
  if (!iso) return "—"
  return new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
}

export function Page({ children, dark = false, first = false }: { children: React.ReactNode; dark?: boolean; first?: boolean }) {
  return (
    <div data-report-page="" className={`relative w-full flex flex-col ${dark ? "bg-[#1B4F8A]" : "bg-white"} ${first ? "overflow-hidden" : "page-break"}`}
      style={first ? { minHeight: 1122 } : undefined}>
      {children}
    </div>
  )
}

export function PageHeader({ title, subtitle, today, logoUrl }: { title: string; subtitle?: string; today: string; logoUrl?: string | null }) {
  return (
    <div className="flex items-center justify-between px-12 pt-8 pb-5 border-b-2 border-[#1B4F8A] shrink-0 gap-4">
      <div className="flex items-center gap-3">
        <Image src="/logo/logo-dark-blue.png" alt="ICS Aviation" width={110} height={30} className="object-contain" />
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-7 max-w-[90px] object-contain border-l border-slate-200 pl-3" />
        )}
      </div>
      <div className="text-right">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A]">{title}</p>
        {subtitle && <p className="text-[10px] mt-0.5 text-slate-400">{subtitle}</p>}
        <p className="text-[10px] mt-0.5 text-slate-400">{today}</p>
      </div>
    </div>
  )
}

export function PageFooter({ page, total, confidential = true }: { page: number; total: number; confidential?: boolean }) {
  return (
    <div className="px-12 py-4 border-t border-slate-100 flex items-center justify-between mt-auto shrink-0">
      <p className="text-[9px] uppercase tracking-widest text-slate-300">ICS Aviation · Integrated Consulting Services{confidential ? " · Confidential" : ""}</p>
      <p className="text-[9px] text-slate-300">Page {page} of {total}</p>
    </div>
  )
}

export function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 text-center">
      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold" style={{ color: color ?? "#1e293b" }}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

export function Bar({ pct, color }: { pct: number | null; color?: string }) {
  return (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-2 rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%`, background: color ?? sc(pct).t }} />
    </div>
  )
}

export const METRIC_NOTE = "Completion = completed ÷ enrolled (withdrawn excluded) · Pass rate = passed ÷ sat the final exam · Average score = each student's best exam attempt."

/** FB-7 block: response rate, averages with distribution, recommend %, comments. */
export function FeedbackBlock({ title, summary, note, showComments = true, suppressed = false }: {
  title: string; summary: FeedbackSummary; note?: string; showComments?: boolean; suppressed?: boolean
}) {
  const cols = { went_well: "border-emerald-300", improve: "border-amber-300", comment: "border-slate-200" } as const
  const label = { went_well: "Went well", improve: "Improve", comment: "Comment" } as const
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 avoid-break">
        <p className={SECTION}>{title}</p>
        <p className="text-[11px] text-slate-500">
          {summary.responses} response{summary.responses !== 1 ? "s" : ""}
          {summary.asked > 0 && <> of {summary.asked} asked · <span className="font-semibold text-slate-700">{fmtPct(summary.responseRate)} response rate</span></>}
        </p>
      </div>
      {summary.responses === 0 ? (
        <p className="text-sm text-slate-400">No responses yet.</p>
      ) : suppressed ? (
        <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-4">Fewer than 3 responses, so the breakdown isn&apos;t shown to protect respondents&apos; privacy.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 avoid-break">
            {summary.ratings.map(r => {
              const dmax = Math.max(1, ...r.dist)
              return (
                <div key={r.key} className="border border-slate-100 rounded-xl p-3">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">{r.label}</p>
                    <p className="text-lg font-bold" style={{ color: sc((r.avg ?? 0) * 20).t }}>{r.avg?.toFixed(1) ?? "—"}<span className="text-[10px] text-slate-400 font-normal">/5</span></p>
                  </div>
                  <div className="flex items-end gap-1 h-10 mt-2">
                    {r.dist.map((d, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                        <div className="w-full rounded-t-sm bg-amber-400" style={{ height: `${Math.max(4, (d / dmax) * 100)}%`, opacity: d ? 1 : 0.2 }} />
                        <span className="text-[8px] text-slate-400 mt-0.5">{i + 1}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1">{r.count} rating{r.count !== 1 ? "s" : ""}</p>
                </div>
              )
            })}
            {summary.recommend && (
              <div className="border border-slate-100 rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Would recommend</p>
                <p className="text-lg font-bold text-emerald-700">{fmtPct(summary.recommend.yesPct)}</p>
                <p className="text-[10px] text-slate-500 mt-1">{summary.recommend.yes} yes · {summary.recommend.maybe} maybe · {summary.recommend.no} no</p>
              </div>
            )}
          </div>
          {showComments && summary.comments.length > 0 && (
            <div className="space-y-1.5">
              <p className={SECTION}>What respondents said</p>
              {summary.comments.slice(0, 14).map((c, i) => (
                <div key={i} className={`avoid-break border-l-2 ${cols[c.kind]} pl-3`}>
                  <p className="text-[8px] uppercase font-bold text-slate-400">{label[c.kind]}</p>
                  <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-line">{c.text}</p>
                </div>
              ))}
              {summary.comments.length > 14 && <p className="text-[10px] text-slate-400">+ {summary.comments.length - 14} more</p>}
            </div>
          )}
        </>
      )}
      {note && <p className="text-[10px] text-slate-400">{note}</p>}
    </div>
  )
}

export const PRINT_CSS = `
  .page-break  { break-before: page; }
  .avoid-break { break-inside: avoid; }
  @media print {
    .no-print { display: none !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
`
export const SCREEN_PRINT_CSS = `
  .page-break { break-before: page; }
  .avoid-break { break-inside: avoid; }
  @page { size: 794px 1122px; margin: 0; }
  @media print {
    .no-print { display: none !important; }
    aside, header { display: none !important; }
    body { margin: 0; background: white; }
    body > div { display: block !important; height: auto !important; overflow: visible !important; }
    main { display: block !important; height: auto !important; overflow: visible !important; padding: 0 !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
`
