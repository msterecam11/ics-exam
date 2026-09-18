import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/db"
import { ArrowLeft, FolderKanban, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { pageScope } from "@/lib/staff-access"

export const dynamic = "force-dynamic"

const STATUS: Record<string, string> = { active: "bg-emerald-50 text-emerald-700", completed: "bg-blue-50 text-blue-700", archived: "bg-slate-100 text-slate-500" }
const fmt = (d: string | null) => d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—"

export default async function ProgramReportsListPage({ searchParams }: { searchParams: Promise<{ client?: string; status?: string }> }) {
  const scope = await pageScope()
  if (!scope) redirect("/auth/login")
  const { client, status } = await searchParams

  let q = db.from("lms_programs").select("id, name, reference, status, start_date, end_date, company_id, lms_companies(name), lms_program_tracks(id)")
    .neq("status", "draft").eq("is_individual", false).order("start_date", { ascending: false, nullsFirst: false })
  if (!scope.isAdmin) q = q.in("id", scope.programIds)
  if (client) q = q.eq("company_id", client)
  if (status && ["active", "completed", "archived"].includes(status)) q = q.eq("status", status)
  const [{ data: programs }, { data: members }, { data: companies }] = await Promise.all([
    q,
    db.from("lms_program_members").select("program_id, status"),
    db.from("lms_companies").select("id, name").order("name"),
  ])
  const counts = new Map<string, { active: number; total: number }>()
  for (const m of (members ?? []) as any[]) {
    const c = counts.get(m.program_id) ?? { active: 0, total: 0 }
    if (m.status !== "withdrawn") c.total++
    if (m.status === "active") c.active++
    counts.set(m.program_id, c)
  }
  const chip = (href: string, label: string, on: boolean) => (
    <Link key={href} href={href} className={cn("px-3 py-1.5 rounded-lg text-xs border", on ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>{label}</Link>
  )
  const qs = (o: Record<string, string | undefined>) => { const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]); const s = p.toString(); return s ? `?${s}` : "" }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/lms-admin/reports" aria-label="Back to reports" className="p-1.5 rounded-lg hover:bg-slate-100 text-muted-foreground hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <h2 className="text-xl font-bold">Reports by program</h2>
          <p className="text-muted-foreground text-sm">Open a program for its report, or a track within it.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {chip(`/lms-admin/reports/programs${qs({ client })}`, "All", !status)}
        {chip(`/lms-admin/reports/programs${qs({ client, status: "active" })}`, "Running", status === "active")}
        {chip(`/lms-admin/reports/programs${qs({ client, status: "completed" })}`, "Completed", status === "completed")}
        {chip(`/lms-admin/reports/programs${qs({ client, status: "archived" })}`, "Archived", status === "archived")}
        {client && <Link href={`/lms-admin/reports/programs${qs({ status })}`} className="text-xs text-[#1B4F8A] hover:underline ml-2">Clear client filter ({((companies ?? []) as any[]).find(c => c.id === client)?.name ?? "client"})</Link>}
      </div>
      <div className="bg-white border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-slate-50 border-b border-border">
            <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <th className="px-4 py-3">Program</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Dates</th><th className="px-4 py-3">Students</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(programs ?? []).length === 0 && <tr><td colSpan={6} className="text-center py-12 text-muted-foreground"><FolderKanban className="h-8 w-8 mx-auto mb-2 opacity-30" />No programs here yet.</td></tr>}
            {((programs ?? []) as any[]).map(p => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3"><p className="font-medium text-slate-800">{p.name}</p><p className="text-xs text-muted-foreground">{[p.reference, p.lms_program_tracks?.length ? `${p.lms_program_tracks.length} tracks` : null].filter(Boolean).join(" · ")}</p></td>
                <td className="px-4 py-3">{p.company_id ? <Link href={`/lms-admin/reports/programs?client=${p.company_id}`} className="text-slate-600 hover:underline">{p.lms_companies?.name}</Link> : "—"}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{fmt(p.start_date)} → {fmt(p.end_date)}</td>
                <td className="px-4 py-3">{counts.get(p.id)?.total ?? 0}</td>
                <td className="px-4 py-3"><span className={cn("text-xs px-2 py-0.5 rounded-full capitalize", STATUS[p.status])}>{p.status === "active" ? "running" : p.status}</span></td>
                <td className="px-4 py-3"><Link href={`/lms-admin/reports/programs/${p.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4F8A] hover:underline">Report <ChevronRight className="h-3 w-3" /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
