import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { pageScope } from "@/lib/staff-access"
import { loadReportsHome, ATTENTION, type AttentionKind } from "@/lib/lms-reports-home"

export const dynamic = "force-dynamic"
const PAGE_SIZE = 50

export default async function AttentionPage({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string; page?: string }> }) {
  const scope = await pageScope()
  if (!scope) redirect("/auth/login")
  const sp = await searchParams
  const kinds = Object.keys(ATTENTION) as AttentionKind[]
  const kind: AttentionKind = kinds.includes(sp.kind as AttentionKind) ? (sp.kind as AttentionKind) : "behind"
  const q = (sp.q ?? "").trim().toLowerCase()
  const page = Math.max(1, Number(sp.page) || 1)

  const home = await loadReportsHome(scope, "all")
  const rows = home.lists[kind]
    .filter(r => !q || [r.student, r.company, r.course, r.program].some(v => (v ?? "").toLowerCase().includes(q)))
    .sort((a, b) => (a.program ?? "").localeCompare(b.program ?? "") || a.student.localeCompare(b.student))
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const cur = Math.min(page, pages)
  const shown = rows.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE)
  const link = (o: { kind?: string; q?: string; page?: number }) => {
    const p = new URLSearchParams()
    p.set("kind", o.kind ?? kind)
    const qq = o.q ?? sp.q; if (qq) p.set("q", qq)
    if (o.page && o.page > 1) p.set("page", String(o.page))
    return `/lms-admin/reports/attention?${p}`
  }
  const th = "px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/lms-admin/reports" aria-label="Back to reports" className="p-1.5 rounded-lg hover:bg-slate-100 text-muted-foreground hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <h2 className="text-xl font-bold">Needs attention</h2>
          <p className="text-muted-foreground text-sm">{ATTENTION[kind].hint}.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {kinds.map(k => (
          <Link key={k} href={link({ kind: k, q: "" })}
            className={cn("px-3 py-1.5 rounded-lg text-xs border", k === kind ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
            {ATTENTION[k].label} <span className="ml-1 tabular-nums opacity-70">{home.lists[k].length}</span>
          </Link>
        ))}
      </div>

      <form action="/lms-admin/reports/attention" className="flex gap-2">
        <input type="hidden" name="kind" value={kind} />
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Filter by student, company, program or course"
          className="h-9 w-full max-w-sm rounded-lg border border-slate-200 px-3 text-sm" />
        <button className="h-9 px-3 rounded-lg bg-[#1B4F8A] text-white text-sm font-medium hover:bg-[#163f6f]">Apply</button>
      </form>

      <div className="bg-white border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-50 border-b border-border">
            <tr><th className={th}>Student</th><th className={th}>Program</th><th className={th}>Course</th><th className={th}>Why</th><th className={th} /></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.length === 0 && <tr><td colSpan={5} className="text-center py-14 text-muted-foreground">{q ? "Nothing matches." : "Nothing here — all clear."}</td></tr>}
            {shown.map(r => (
              <tr key={r.enrollmentId} className="hover:bg-slate-50">
                <td className="px-4 py-3"><p className="font-medium text-slate-800">{r.student}</p>{r.company && <p className="text-xs text-muted-foreground">{r.company}</p>}</td>
                <td className="px-4 py-3 text-slate-600">{r.programId ? <Link href={`/lms-admin/reports/programs/${r.programId}`} className="hover:underline">{r.program}</Link> : <span className="text-slate-400">Individual</span>}</td>
                <td className="px-4 py-3 text-slate-600">{r.course}</td>
                <td className="px-4 py-3 text-slate-600">{r.detail}</td>
                <td className="px-4 py-3"><Link href={r.href} className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4F8A] hover:underline">Report <ChevronRight className="h-3 w-3" /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-xs text-slate-500">Page {cur} of {pages} · {rows.length} students</span>
          <div className="flex gap-2">
            {cur > 1 && <Link href={link({ page: cur - 1 })} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /> Previous</Link>}
            {cur < pages && <Link href={link({ page: cur + 1 })} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">Next <ChevronRight className="h-4 w-4" /></Link>}
          </div>
        </div>
      )}
    </div>
  )
}
