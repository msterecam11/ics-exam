import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { TrendingUp, Building2, ChevronRight, Search, User, AlertTriangle, FolderKanban } from "lucide-react"
import { db } from "@/lib/db"
import { cn } from "@/lib/utils"
import { selectAll } from "@/lib/lms-report-cache"
import { isUuid, loadProgramReport } from "@/lib/lms-report-scope"
import { pageScope, canSeeProgram, visibleStudentIds } from "@/lib/staff-access"

export const dynamic = "force-dynamic"

// Student Progress in layers: Companies → Programs → (Track) → Students,
// plus learners outside company programs and a search across everyone in scope.

type SP = { company?: string; program?: string; track?: string; individual?: string; q?: string }
const fmt = (d: string | null) => d ? new Date(d.length === 10 ? d + "T00:00:00Z" : d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—"
const pctBar = (v: number | null) => (
  <div className="flex items-center gap-2 w-40">
    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={cn("h-full rounded-full", (v ?? 0) >= 100 ? "bg-emerald-500" : "bg-[#1B4F8A]")} style={{ width: `${Math.min(100, v ?? 0)}%` }} /></div>
    <span className="text-xs font-semibold text-slate-600 w-9 text-right">{v === null ? "—" : `${v}%`}</span>
  </div>
)

export default async function ProgressPage({ searchParams }: { searchParams: Promise<SP> }) {
  const scope = await pageScope()
  if (!scope) redirect("/auth/login")
  const sp = await searchParams
  const q = (sp.q ?? "").trim()

  const Header = ({ crumbs }: { crumbs: { label: string; href?: string }[] }) => (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><TrendingUp className="h-6 w-6 text-[#1B4F8A]" /> Student Progress</h1>
        <nav className="flex items-center gap-1 text-sm text-slate-500 mt-1 flex-wrap">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
              {c.href ? <Link href={c.href} className="hover:text-[#1B4F8A] hover:underline">{c.label}</Link> : <span className="text-slate-800 font-medium">{c.label}</span>}
            </span>
          ))}
        </nav>
      </div>
      <form action="/lms-admin/progress" className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input name="q" defaultValue={q} placeholder="Find any student by name or email…" className="w-full h-10 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm" />
      </form>
    </div>
  )
  const studentRow = (s: { id: string; name: string; sub?: string | null; progress: number | null; right?: React.ReactNode; flag?: boolean }) => (
    <Link key={s.id} href={`/lms-admin/progress/${s.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 group">
      <div className="w-9 h-9 rounded-full bg-[#1B4F8A]/10 flex items-center justify-center text-[#1B4F8A] font-bold text-sm shrink-0">{s.name[0]?.toUpperCase()}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate flex items-center gap-2">{s.name}{s.flag && <span className="text-[10px] font-semibold uppercase text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> needs support</span>}</p>
        {s.sub && <p className="text-xs text-slate-400 truncate">{s.sub}</p>}
      </div>
      {s.right}
      {pctBar(s.progress)}
      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#1B4F8A] shrink-0" />
    </Link>
  )
  const Card = ({ children }: { children: React.ReactNode }) => <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">{children}</div>

  // ── Search ────────────────────────────────────────────────────────────────
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, m => `\\${m}`)}%`
    const ids = await visibleStudentIds(scope)
    let sq = db.from("lms_students").select("id, name, email, company, job_title").or(`name.ilike.${JSON.stringify(like)},email.ilike.${JSON.stringify(like)}`).order("name").limit(50)
    if (ids !== "all") sq = sq.in("id", ids.length ? ids.slice(0, 1000) : ["00000000-0000-0000-0000-000000000000"])
    const { data: found } = await sq
    const list = (found ?? []) as any[]
    const { data: enr } = list.length ? await db.from("lms_enrollments").select("student_id, progress_pct, status").in("student_id", list.map(s => s.id)).neq("status", "dropped") : { data: [] as any[] }
    const avg = (sid: string) => { const m = ((enr ?? []) as any[]).filter(e => e.student_id === sid); return m.length ? Math.round(m.reduce((a, e) => a + Number(e.progress_pct ?? 0), 0) / m.length) : null }
    return (
      <div className="space-y-5 max-w-5xl">
        <Header crumbs={[{ label: "All companies", href: "/lms-admin/progress" }, { label: `Search “${q}”` }]} />
        {list.length ? <Card>{list.map(s => studentRow({ id: s.id, name: s.name, sub: [s.company, s.email, s.job_title].filter(Boolean).join(" · "), progress: avg(s.id) }))}</Card>
          : <p className="text-sm text-slate-400 text-center py-12">No student matches “{q}”.</p>}
      </div>
    )
  }

  // ── Program (→ track) → students ─────────────────────────────────────────
  if (isUuid(sp.program)) {
    if (!canSeeProgram(scope, sp.program)) notFound()
    const track = isUuid(sp.track) ? sp.track : null
    const cached = await loadProgramReport(sp.program, track)
    if (!cached) notFound()
    const r = cached.data
    const base = `/lms-admin/progress?program=${r.program.id}`
    const crumbs = [
      { label: "All companies", href: "/lms-admin/progress" },
      ...(r.program.company ? [{ label: r.program.company.name, href: `/lms-admin/progress?company=${r.program.company.id}` }] : []),
      { label: r.program.name, href: track ? base : undefined },
      ...(r.scope.trackName ? [{ label: r.scope.trackName }] : []),
    ]
    const roster = r.roster.filter(s => s.status !== "withdrawn")
    return (
      <div className="space-y-5 max-w-5xl">
        <Header crumbs={crumbs} />
        {r.tracks.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link href={base} className={cn("px-3 py-1.5 rounded-lg text-xs border", !track ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50 bg-white")}>All tracks</Link>
            {r.tracks.map(t => <Link key={t.id} href={`${base}&track=${t.id}`} className={cn("px-3 py-1.5 rounded-lg text-xs border", track === t.id ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50 bg-white")}>{t.name}</Link>)}
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{roster.length} students · avg progress {r.stats.avgProgress ?? "—"}% · {r.stats.atRisk} needing support</span>
          <Link href={`/lms-admin/reports/programs/${r.program.id}${track ? `?track=${track}` : ""}`} className="text-[#1B4F8A] hover:underline">Open the report</Link>
        </div>
        {roster.length ? (
          <Card>{[...roster].sort((a, b) => Number(b.atRisk.length > 0) - Number(a.atRisk.length > 0) || a.name.localeCompare(b.name)).map(s => studentRow({
            id: s.student_id, name: s.name, flag: s.atRisk.length > 0, progress: s.progress,
            sub: [!track && s.track, s.job_title, `${s.coursesDone}/${s.coursesTotal} courses`, s.lastActivity ? `last active ${fmt(s.lastActivity)}` : "not started"].filter(Boolean).join(" · "),
          }))}</Card>
        ) : <p className="text-sm text-slate-400 text-center py-12">No students in this {track ? "track" : "program"} yet.</p>}
      </div>
    )
  }

  // Programs and enrollments in scope, for the company and program levels.
  let pq = db.from("lms_programs").select("id, name, reference, status, company_id, is_individual, start_date, end_date").neq("status", "draft")
  if (!scope.isAdmin) pq = pq.in("id", scope.programIds.length ? scope.programIds : ["00000000-0000-0000-0000-000000000000"])
  const [{ data: progRows }, { data: companyRows }] = await Promise.all([pq, db.from("lms_companies").select("id, name, code").order("name")])
  const programs = ((progRows ?? []) as any[]).filter(p => !p.is_individual)
  const progIds = programs.map(p => p.id)
  const members = progIds.length ? await selectAll<any>((f, t) => db.from("lms_program_members").select("program_id, student_id, status").in("program_id", progIds).neq("status", "withdrawn").range(f, t)) : []
  const enr = progIds.length ? await selectAll<any>((f, t) => db.from("lms_enrollments").select("program_id, progress_pct, status").in("program_id", progIds).neq("status", "dropped").range(f, t)) : []
  const stat = (ids: Set<string>) => {
    const m = members.filter(x => ids.has(x.program_id)), e = enr.filter(x => ids.has(x.program_id))
    return { students: new Set(m.map(x => x.student_id)).size, avg: e.length ? Math.round(e.reduce((a, x) => a + (x.status === "completed" ? 100 : Number(x.progress_pct ?? 0)), 0) / e.length) : null }
  }

  // ── Company → programs ───────────────────────────────────────────────────
  if (isUuid(sp.company)) {
    const company = ((companyRows ?? []) as any[]).find(c => c.id === sp.company)
    if (!company) notFound()
    const mine = programs.filter(p => p.company_id === company.id).sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || (b.start_date ?? "").localeCompare(a.start_date ?? ""))
    return (
      <div className="space-y-5 max-w-5xl">
        <Header crumbs={[{ label: "All companies", href: "/lms-admin/progress" }, { label: company.name }]} />
        {mine.length ? <Card>{mine.map(p => { const s = stat(new Set([p.id])); return (
          <Link key={p.id} href={`/lms-admin/progress?program=${p.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 group">
            <FolderKanban className="h-5 w-5 text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{p.name} <span className={cn("ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full", p.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{p.status === "active" ? "Running" : p.status}</span></p>
              <p className="text-xs text-slate-400">{s.students} students · {fmt(p.start_date)} → {fmt(p.end_date)}</p>
            </div>
            {pctBar(s.avg)}
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#1B4F8A] shrink-0" />
          </Link>
        ) })}</Card> : <p className="text-sm text-slate-400 text-center py-12">No running or past programs for {company.name}.</p>}
      </div>
    )
  }

  // ── Individual learners (outside company programs) ──────────────────────
  if (sp.individual === "1" && scope.isAdmin) {
    const loose = await selectAll<any>((f, t) => db.from("lms_enrollments").select("student_id, progress_pct, status, program_id, lms_programs(is_individual)").neq("status", "dropped").range(f, t))
    const mineRows = loose.filter(e => !e.program_id || e.lms_programs?.is_individual)
    const ids = [...new Set(mineRows.map(e => e.student_id))]
    const { data: st } = ids.length ? await db.from("lms_students").select("id, name, email, company").in("id", ids.slice(0, 1000)).order("name") : { data: [] as any[] }
    return (
      <div className="space-y-5 max-w-5xl">
        <Header crumbs={[{ label: "All companies", href: "/lms-admin/progress" }, { label: "Individual learners" }]} />
        {(st ?? []).length ? <Card>{((st ?? []) as any[]).map(s => { const m = mineRows.filter(e => e.student_id === s.id); return studentRow({
          id: s.id, name: s.name, sub: [s.company, s.email, `${m.length} course${m.length === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
          progress: m.length ? Math.round(m.reduce((a, e) => a + (e.status === "completed" ? 100 : Number(e.progress_pct ?? 0)), 0) / m.length) : null,
        }) })}</Card> : <p className="text-sm text-slate-400 text-center py-12">No learners outside company programs.</p>}
      </div>
    )
  }

  // ── Companies ────────────────────────────────────────────────────────────
  const companies = ((companyRows ?? []) as any[])
    .map(c => { const ps = programs.filter(p => p.company_id === c.id); return { ...c, programs: ps.length, running: ps.filter(p => p.status === "active").length, ...stat(new Set(ps.map(p => p.id))) } })
    .filter(c => c.programs > 0)
    .sort((a, b) => Number(b.running > 0) - Number(a.running > 0) || a.name.localeCompare(b.name))
  return (
    <div className="space-y-5 max-w-5xl">
      <Header crumbs={[{ label: "All companies" }]} />
      {companies.length ? <Card>{companies.map(c => (
        <Link key={c.id} href={`/lms-admin/progress?company=${c.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 group">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0"><Building2 className="h-4 w-4 text-indigo-600" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{c.name}</p>
            <p className="text-xs text-slate-400">{c.programs} program{c.programs === 1 ? "" : "s"}{c.running ? ` · ${c.running} running` : ""} · {c.students} students</p>
          </div>
          {pctBar(c.avg)}
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#1B4F8A] shrink-0" />
        </Link>
      ))}</Card> : <p className="text-sm text-slate-400 text-center py-12">No programs in your scope yet.</p>}
      {scope.isAdmin && (
        <Link href="/lms-admin/progress?individual=1" className="flex items-center gap-3 px-5 py-3 bg-white rounded-xl border border-slate-200 hover:bg-slate-50 group">
          <User className="h-5 w-5 text-slate-400" />
          <span className="flex-1 text-sm font-medium text-slate-800">Individual learners <span className="font-normal text-slate-400">· enrolled outside a company program</span></span>
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#1B4F8A]" />
        </Link>
      )}
    </div>
  )
}
