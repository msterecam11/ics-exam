import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import Link from "next/link"
import { ArrowLeft, MessageSquare, Star, ChevronRight, BookOpen, FolderKanban } from "lucide-react"
import { cn } from "@/lib/utils"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

function ratingColor(avg: number | null) {
  if (avg === null) return "text-muted-foreground"
  if (avg >= 4) return "text-emerald-600"
  if (avg >= 3) return "text-amber-500"
  return "text-red-500"
}

const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"
const avg1 = (sum: number, n: number) => n ? Math.round((sum / n) * 10) / 10 : null

export default async function FeedbackCoursesPage() {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) redirect("/auth/login")

  const [{ data: courses }, { data: stats }, { data: programs }, { data: surveys }, { data: members }] = await Promise.all([
    db.from("lms_courses").select("id, title, feedback_enabled, feedback_anonymous").neq("status", "archived").order("title"),
    db.from("lms_feedback").select("course_id, program_id, rating_overall, recommend, submitted_at"),
    db.from("lms_programs").select("id, name, status, feedback_enabled, feedback_mandatory, feedback_anonymous, is_individual").neq("status", "draft").eq("is_individual", false).order("name"),
    db.from("lms_program_feedback").select("program_id, rating_overall, recommend"),
    db.from("lms_program_members").select("program_id").neq("status", "withdrawn"),
  ])

  type Agg = { count: number; sum: number; yes: number; answered: number; last: string | null }
  const blank = (): Agg => ({ count: 0, sum: 0, yes: 0, answered: 0, last: null })
  const add = (a: Agg, r: any) => {
    a.count++; a.sum += r.rating_overall ?? 0
    if (r.recommend) { a.answered++; if (r.recommend === "yes") a.yes++ }
    if (r.submitted_at && (!a.last || r.submitted_at > a.last)) a.last = r.submitted_at
  }
  const byCourse = new Map<string, Agg>()
  const byProgram = new Map<string, Agg>()
  for (const r of (stats ?? []) as any[]) {
    if (!byCourse.has(r.course_id)) byCourse.set(r.course_id, blank()); add(byCourse.get(r.course_id)!, r)
    if (r.program_id) { if (!byProgram.has(r.program_id)) byProgram.set(r.program_id, blank()); add(byProgram.get(r.program_id)!, r) }
  }
  const surveyBy = new Map<string, Agg>()
  for (const r of (surveys ?? []) as any[]) { if (!surveyBy.has(r.program_id)) surveyBy.set(r.program_id, blank()); add(surveyBy.get(r.program_id)!, r) }
  const memberCount = new Map<string, number>()
  for (const m of (members ?? []) as any[]) memberCount.set(m.program_id, (memberCount.get(m.program_id) ?? 0) + 1)

  const programRows = ((programs ?? []) as any[]).filter(p => p.feedback_enabled || byProgram.has(p.id) || surveyBy.has(p.id))
  const TH = "text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/lms-admin/reports" className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-muted-foreground hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h2 className="text-xl font-bold">Feedback</h2>
          <p className="text-muted-foreground text-sm">Course feedback and program surveys. Anonymous answers never show names.</p>
        </div>
      </div>

      {/* Programs */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><FolderKanban className="h-4 w-4 text-[#1B4F8A]" /> Programs</h3>
        <div className="bg-white border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-50 border-b border-border">
              <tr>
                <th className={TH}>Program</th>
                <th className={TH}>Settings</th>
                <th className={TH}>Course feedback</th>
                <th className={TH}>Program survey</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {programRows.length === 0 && (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">No program collects feedback yet.</td></tr>
              )}
              {programRows.map(p => {
                const cf = byProgram.get(p.id), sv = surveyBy.get(p.id)
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3.5 font-medium text-slate-800">{p.name}</td>
                    <td className="px-4 py-3.5 text-xs">
                      {p.feedback_enabled
                        ? <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">On{p.feedback_mandatory ? " · mandatory" : ""} · {p.feedback_anonymous ? "anonymous" : "named"}</span>
                        : <span className="bg-slate-100 text-muted-foreground px-2 py-0.5 rounded-full">Off</span>}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      {cf ? <>{cf.count} · <Star className="inline h-3 w-3 fill-amber-400 text-amber-400" /> {avg1(cf.sum, cf.count)?.toFixed(1)}{cf.answered ? ` · ${Math.round((cf.yes / cf.answered) * 100)}% recommend` : ""}</> : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      {sv ? <>{sv.count}/{memberCount.get(p.id) ?? 0} · <Star className="inline h-3 w-3 fill-amber-400 text-amber-400" /> {avg1(sv.sum, sv.count)?.toFixed(1)}</> : `0/${memberCount.get(p.id) ?? 0}`}
                    </td>
                    <td className="px-4 py-3.5">
                      <Link href={`/lms-admin/reports/feedback/program/${p.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4F8A] hover:underline">
                        View <ChevronRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Courses */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><BookOpen className="h-4 w-4 text-[#1B4F8A]" /> Courses (all programs)</h3>
        <div className="bg-white border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-50 border-b border-border">
              <tr>
                <th className={TH}>Course</th>
                <th className={TH}>Responses</th>
                <th className={TH}>Avg rating</th>
                <th className={TH}>Recommend</th>
                <th className={TH}>Last response</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(courses ?? []).length === 0 && (
                <tr><td colSpan={6} className="text-center py-16 text-muted-foreground"><MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />No courses found.</td></tr>
              )}
              {((courses ?? []) as any[]).map(c => {
                const s = byCourse.get(c.id)
                const avg = s ? avg1(s.sum, s.count) : null
                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-slate-800">{c.title}</td>
                    <td className="px-4 py-3.5">{s?.count ?? <span className="text-muted-foreground">0</span>}</td>
                    <td className="px-4 py-3.5">
                      {avg !== null ? (
                        <span className="flex items-center gap-1.5">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          <span className={cn("font-semibold", ratingColor(avg))}>{avg.toFixed(1)}</span>
                          <span className="text-muted-foreground text-xs">/ 5</span>
                        </span>
                      ) : <span className="text-muted-foreground text-xs">No data</span>}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600">{s?.answered ? `${Math.round((s.yes / s.answered) * 100)}% yes` : "—"}</td>
                    <td className="px-4 py-3.5 text-muted-foreground text-xs">{fmt(s?.last ?? null)}</td>
                    <td className="px-4 py-3.5">
                      {s ? (
                        <Link href={`/lms-admin/reports/feedback/${c.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4F8A] hover:underline">
                          View <ChevronRight className="h-3 w-3" />
                        </Link>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
