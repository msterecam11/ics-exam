import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/db"
import { ArrowLeft, Building2, ChevronRight } from "lucide-react"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }
export const dynamic = "force-dynamic"

export default async function ClientReportsListPage() {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) redirect("/auth/login")

  const [{ data: companies }, { data: programs }, { data: members }] = await Promise.all([
    db.from("lms_companies").select("id, name, code, status, logo_url").order("name"),
    db.from("lms_programs").select("id, company_id, status").neq("status", "draft").not("company_id", "is", null),
    db.from("lms_program_members").select("student_id, status, lms_programs!inner(company_id, status)").neq("status", "withdrawn").neq("lms_programs.status", "draft"),
  ])
  const progs = (programs ?? []) as any[]
  const trained = new Map<string, Set<string>>()
  for (const m of (members ?? []) as any[]) {
    const c = m.lms_programs?.company_id; if (!c) continue
    if (!trained.has(c)) trained.set(c, new Set()); trained.get(c)!.add(m.student_id)
  }
  const rows = ((companies ?? []) as any[]).map(c => ({
    ...c,
    programs: progs.filter(p => p.company_id === c.id).length,
    running: progs.filter(p => p.company_id === c.id && p.status === "active").length,
    trained: trained.get(c.id)?.size ?? 0,
  })).filter(c => c.status === "active" || c.programs > 0)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/lms-admin/reports" aria-label="Back to reports" className="p-1.5 rounded-lg hover:bg-slate-100 text-muted-foreground hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <h2 className="text-xl font-bold">Reports by client</h2>
          <p className="text-muted-foreground text-sm">Programs delivered to each company and their results.</p>
        </div>
      </div>
      <div className="bg-white border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-slate-50 border-b border-border">
            <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <th className="px-4 py-3">Client</th><th className="px-4 py-3">Programs</th><th className="px-4 py-3">Running</th><th className="px-4 py-3">People trained</th><th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No clients yet.</td></tr>}
            {rows.map(c => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {c.logo_url ? <img src={c.logo_url} alt="" className="w-full h-full object-contain" /> : <Building2 className="h-4 w-4 text-indigo-600" />}
                    </div>
                    <div><p className="font-medium text-slate-800">{c.name}</p><p className="text-xs text-muted-foreground">{c.code}{c.status !== "active" ? " · inactive" : ""}</p></div>
                  </div>
                </td>
                <td className="px-4 py-3">{c.programs}</td>
                <td className="px-4 py-3">{c.running}</td>
                <td className="px-4 py-3">{c.trained}</td>
                <td className="px-4 py-3">
                  {c.programs > 0
                    ? <Link href={`/lms-admin/reports/clients/${c.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4F8A] hover:underline">Report <ChevronRight className="h-3 w-3" /></Link>
                    : <span className="text-xs text-muted-foreground">No programs</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
