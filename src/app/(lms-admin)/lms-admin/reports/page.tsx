import { redirect } from "next/navigation"
import Link from "next/link"
import {
  AlertTriangle, Clock, UserX, Award, MessageSquare, ClipboardCheck, ChevronRight, ChevronLeft,
  FileDown, Building2, FolderKanban, BookOpen, User, Search,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { pageScope, can } from "@/lib/staff-access"
import { loadReportsHome, parsePeriod, PERIOD_LABEL, ATTENTION, type Period, type AttentionKind } from "@/lib/lms-reports-home"
import ReportsSearch from "@/components/lms/reports/ReportsSearch"

export const dynamic = "force-dynamic"

type Tab = "companies" | "programs" | "courses" | "individuals"
type SP = { period?: string; tab?: string; q?: string; status?: string; delivery?: string; page?: string }

const PAGE_SIZE = 25
const ICONS: Record<AttentionKind, any> = { behind: AlertTriangle, inactive: UserX, deadlines: Clock, certificates: Award, feedback: MessageSquare }
const TONE: Record<AttentionKind, string> = {
  behind: "bg-red-50 text-red-700 border-red-100", inactive: "bg-amber-50 text-amber-800 border-amber-100",
  deadlines: "bg-amber-50 text-amber-800 border-amber-100", certificates: "bg-blue-50 text-blue-700 border-blue-100",
  feedback: "bg-blue-50 text-blue-700 border-blue-100",
}
const STATUS_CHIP: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700", completed: "bg-blue-50 text-blue-700", archived: "bg-slate-100 text-slate-500",
  published: "bg-emerald-50 text-emerald-700", draft: "bg-slate-100 text-slate-500", inactive: "bg-slate-100 text-slate-500", dropped: "bg-slate-100 text-slate-500",
}
const pct = (v: number | null) => (v === null ? "—" : `${v}%`)
const monthName = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
const day = (iso: string | null) => iso ? new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—"

export default async function ReportsHomePage({ searchParams }: { searchParams: Promise<SP> }) {
  const scope = await pageScope()
  if (!scope) redirect("/auth/login")
  const sp = await searchParams
  const period: Period = parsePeriod(sp.period)
  const tabs: Tab[] = scope.isAdmin ? ["companies", "courses", "individuals"] : ["programs", "courses"]
  const tab: Tab = tabs.includes(sp.tab as Tab) ? (sp.tab as Tab) : tabs[0]
  const q = (sp.q ?? "").trim().toLowerCase()
  const status = sp.status ?? ""
  const delivery = sp.delivery ?? ""
  const page = Math.max(1, Number(sp.page) || 1)

  const home = await loadReportsHome(scope, period)
  const programPdf = scope.isAdmin || can(scope, "export_reports")

  const href = (o: Partial<SP>) => {
    const next = { period: sp.period, tab: sp.tab, q: sp.q, status: sp.status, delivery: sp.delivery, page: undefined as string | undefined, ...o }
    const p = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][])
    const s = p.toString()
    return `/lms-admin/reports${s ? `?${s}` : ""}`
  }

  // ── Browse rows for the current tab ────────────────────────────────────────
  const match = (...v: (string | null | undefined)[]) => !q || v.some(x => (x ?? "").toLowerCase().includes(q))
  let rows: any[] = []
  let statuses: string[] = []
  if (tab === "companies") {
    statuses = ["running", "past"]
    rows = home.companyList.filter(c => match(c.name, c.code) && (!status || (status === "running" ? c.running > 0 : c.running === 0)))
      .sort((a, b) => Number(b.running > 0) - Number(a.running > 0) || a.name.localeCompare(b.name))
  } else if (tab === "programs") {
    statuses = ["active", "completed", "archived"]
    rows = home.programList.filter(p => match(p.name, p.company, p.reference) && (!status || p.status === status))
      .sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""))
  } else if (tab === "courses") {
    statuses = ["published", "draft"]
    rows = home.courseList.filter(c => match(c.title) && (!status || c.status === status) && (!delivery || c.delivery === delivery))
      .sort((a, b) => b.enrolled - a.enrolled || a.title.localeCompare(b.title))
  } else {
    statuses = ["running", "past"]
    rows = home.individualList.filter(r => match(r.course, monthName(r.month)) && (!status || (status === "running") === r.live) && (!delivery || r.delivery === delivery))
      .sort((a, b) => b.month.localeCompare(a.month) || a.course.localeCompare(b.course))
  }
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const shown = rows.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE)

  const kpis = [
    { label: "Active programs", value: String(home.kpis.activePrograms) },
    { label: "Learners in progress", value: String(home.kpis.inProgress) },
    { label: `Courses completed · ${period === "all" ? "all time" : PERIOD_LABEL[period].toLowerCase()}`, value: String(home.kpis.completed) },
    { label: `Exam pass rate · ${home.kpis.passSat} sat`, value: pct(home.kpis.passRate) },
  ]
  const TAB_META: Record<Tab, { label: string; icon: any }> = {
    companies: { label: "Companies", icon: Building2 }, programs: { label: "Programs", icon: FolderKanban },
    courses: { label: "Courses", icon: BookOpen }, individuals: { label: "Individual learners", icon: User },
  }
  const pdfLink = (url: string) => (
    <a href={url} className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4F8A] hover:underline" title="Download the client PDF">
      <FileDown className="h-3.5 w-3.5" /> PDF
    </a>
  )
  const th = "px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
  const td = "px-4 py-3"

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Reports</h2>
          <p className="text-muted-foreground text-sm">Search, see what needs attention, or browse down to any student.</p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {(["90d", "year", "all"] as Period[]).map(p => (
            <Link key={p} href={href({ period: p === "90d" ? undefined : p, page: undefined })}
              className={cn("px-3 py-1.5 rounded-md text-xs font-medium", period === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}>
              {PERIOD_LABEL[p]}
            </Link>
          ))}
        </div>
      </div>

      <ReportsSearch />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="bg-white border border-border rounded-xl px-4 py-3">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-0.5">{k.value}</p>
          </div>
        ))}
      </div>

      <section className="bg-white border border-border rounded-2xl p-4 sm:p-5">
        <h3 className="font-semibold text-slate-800 mb-3">Needs attention</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {(Object.keys(ATTENTION) as AttentionKind[]).map(k => {
            const Icon = ICONS[k]
            const n = home.lists[k].length
            return (
              <Link key={k} href={`/lms-admin/reports/attention?kind=${k}`} title={ATTENTION[k].hint}
                className={cn("flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors",
                  n ? TONE[k] + " hover:brightness-95" : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100")}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="text-lg font-bold tabular-nums">{n}</span>
                <span className="text-sm flex-1">{ATTENTION[k].label}</span>
                <ChevronRight className="h-4 w-4 opacity-50" />
              </Link>
            )
          })}
          {scope.isAdmin && (
            <Link href="/lms-admin/questions/reviews"
              className={cn("flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors",
                home.openReviews ? "bg-violet-50 text-violet-700 border-violet-100 hover:brightness-95" : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100")}>
              <ClipboardCheck className="h-4 w-4 shrink-0" />
              <span className="text-lg font-bold tabular-nums">{home.openReviews}</span>
              <span className="text-sm flex-1">Exam reviews</span>
              <ChevronRight className="h-4 w-4 opacity-50" />
            </Link>
          )}
        </div>
      </section>

      <section className="bg-white border border-border rounded-2xl">
        <div className="px-4 sm:px-5 pt-4 flex items-center gap-1.5 flex-wrap border-b border-border">
          {tabs.map(t => {
            const Icon = TAB_META[t].icon
            return (
              <Link key={t} href={href({ tab: t, q: undefined, status: undefined, delivery: undefined })}
                className={cn("flex items-center gap-2 px-3 py-2.5 text-sm border-b-2 -mb-px",
                  tab === t ? "border-[#1B4F8A] text-[#1B4F8A] font-medium" : "border-transparent text-slate-500 hover:text-slate-800")}>
                <Icon className="h-4 w-4" /> {TAB_META[t].label}
              </Link>
            )
          })}
        </div>

        <form action="/lms-admin/reports" className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-2 border-b border-border">
          {sp.period && <input type="hidden" name="period" value={sp.period} />}
          <input type="hidden" name="tab" value={tab} />
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input name="q" defaultValue={sp.q ?? ""} placeholder={`Filter ${TAB_META[tab].label.toLowerCase()}`}
              className="w-full h-9 rounded-lg border border-slate-200 pl-8 pr-3 text-sm" />
          </div>
          <select name="status" defaultValue={status} className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white">
            <option value="">Any status</option>
            {statuses.map(s => <option key={s} value={s}>{s === "active" && tab === "programs" ? "Running" : s === "running" ? "Running now" : s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
          {(tab === "courses" || tab === "individuals") && (
            <select name="delivery" defaultValue={delivery} className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white">
              <option value="">Any delivery</option><option value="onsite">Onsite</option><option value="online">Online</option><option value="external">External</option>
            </select>
          )}
          <button className="h-9 px-3 rounded-lg bg-[#1B4F8A] text-white text-sm font-medium hover:bg-[#163f6f]">Apply</button>
          {(sp.q || status || delivery) && <Link href={href({ q: undefined, status: undefined, delivery: undefined })} className="text-xs text-slate-500 hover:underline">Clear</Link>}
          <span className="ml-auto text-xs text-slate-400">{rows.length} {rows.length === 1 ? "row" : "rows"}</span>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-50 border-b border-border">
              {tab === "companies" && <tr><th className={th}>Company</th><th className={th}>Programs</th><th className={th}>Learners</th><th className={th}>Completion</th><th className={th}>Pass rate</th><th className={th} /></tr>}
              {tab === "programs" && <tr><th className={th}>Program</th><th className={th}>Company</th><th className={th}>Dates</th><th className={th}>Learners</th><th className={th}>Completion</th><th className={th}>Pass rate</th><th className={th}>Status</th><th className={th} /></tr>}
              {tab === "courses" && <tr><th className={th}>Course</th><th className={th}>Delivery</th><th className={th}>Enrolled</th><th className={th}>Completion</th><th className={th}>Pass rate</th><th className={th}>Status</th><th className={th} /></tr>}
              {tab === "individuals" && <tr><th className={th}>Group</th><th className={th}>Learners</th><th className={th}>Completion</th><th className={th}>Pass rate</th><th className={th}>Status</th><th className={th} /></tr>}
            </thead>
            <tbody className="divide-y divide-border">
              {shown.length === 0 && (
                <tr><td colSpan={8} className="text-center py-14 text-muted-foreground">
                  {q || status || delivery ? "Nothing matches these filters." : tab === "individuals" ? "No individual learners yet — people enrolled outside a company program appear here, grouped by course and month." : "Nothing here yet."}
                </td></tr>
              )}
              {tab === "companies" && shown.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className={td}>
                    {c.programs ? <Link href={`/lms-admin/reports/clients/${c.id}`} className="font-medium text-slate-800 hover:text-[#1B4F8A]">{c.name}</Link> : <span className="font-medium text-slate-800">{c.name}</span>}
                    <p className="text-xs text-muted-foreground">{[c.code, c.running ? `${c.running} running` : null, c.status !== "active" ? "inactive" : null].filter(Boolean).join(" · ")}</p>
                  </td>
                  <td className={td}>{c.programs ? <Link href={href({ tab: "programs", q: c.name, status: undefined })} className="hover:underline">{c.programs}</Link> : 0}</td>
                  <td className={td}>{c.learners}</td><td className={td}>{pct(c.completion)}</td><td className={td}>{pct(c.pass)}</td>
                  <td className={td}>{c.programs ? pdfLink(`/api/lms/reports/clients/${c.id}/pdf?audience=client`) : null}</td>
                </tr>
              ))}
              {tab === "programs" && shown.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className={td}><Link href={`/lms-admin/reports/programs/${p.id}`} className="font-medium text-slate-800 hover:text-[#1B4F8A]">{p.name}</Link>{p.reference && <p className="text-xs text-muted-foreground">{p.reference}</p>}</td>
                  <td className={cn(td, "text-slate-600")}>{p.company ?? "—"}</td>
                  <td className={cn(td, "text-xs text-slate-500 whitespace-nowrap")}>{day(p.start)} → {day(p.end)}</td>
                  <td className={td}>{p.learners}</td><td className={td}>{pct(p.completion)}</td><td className={td}>{pct(p.pass)}</td>
                  <td className={td}><span className={cn("text-xs px-2 py-0.5 rounded-full", STATUS_CHIP[p.status])}>{p.status === "active" ? "Running" : p.status}</span></td>
                  <td className={td}>{programPdf ? pdfLink(`/api/lms/reports/programs/${p.id}/pdf?audience=client`) : null}</td>
                </tr>
              ))}
              {tab === "courses" && shown.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className={td}><Link href={`/lms-admin/reports/${c.id}`} className="font-medium text-slate-800 hover:text-[#1B4F8A]">{c.title}</Link></td>
                  <td className={cn(td, "capitalize text-slate-600")}>{c.delivery ?? "—"}</td>
                  <td className={td}>{c.enrolled}</td><td className={td}>{pct(c.completion)}</td><td className={td}>{pct(c.pass)}</td>
                  <td className={td}><span className={cn("text-xs px-2 py-0.5 rounded-full capitalize", STATUS_CHIP[c.status])}>{c.status}</span></td>
                  <td className={td}>{scope.isAdmin && c.enrolled ? pdfLink(`/api/lms/reports/course/${c.id}/pdf`) : null}</td>
                </tr>
              ))}
              {tab === "individuals" && shown.map(r => (
                <tr key={r.key} className="hover:bg-slate-50">
                  <td className={td}><Link href={`/lms-admin/reports/${r.courseId}/group?month=${r.month}`} className="font-medium text-slate-800 hover:text-[#1B4F8A]">{r.course}</Link><p className="text-xs text-muted-foreground">Individual learners · {monthName(r.month)}</p></td>
                  <td className={td}>{r.learners}</td><td className={td}>{pct(r.completion)}</td><td className={td}>{pct(r.pass)}</td>
                  <td className={td}><span className={cn("text-xs px-2 py-0.5 rounded-full", r.live ? STATUS_CHIP.active : STATUS_CHIP.archived)}>{r.live ? "Running" : "Past"}</span></td>
                  <td className={td}>{pdfLink(`/api/lms/reports/course/${r.courseId}/pdf?month=${r.month}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="px-4 sm:px-5 py-3 flex items-center justify-between border-t border-border text-sm">
            <span className="text-xs text-slate-500">Page {Math.min(page, pages)} of {pages}</span>
            <div className="flex gap-2">
              {page > 1 && <Link href={href({ page: String(page - 1) })} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /> Previous</Link>}
              {page < pages && <Link href={href({ page: String(page + 1) })} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">Next <ChevronRight className="h-4 w-4" /></Link>}
            </div>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-400">
        Feedback reports: <Link href="/lms-admin/reports/feedback" className="text-[#1B4F8A] hover:underline">by program and course</Link>.
      </p>
    </div>
  )
}
