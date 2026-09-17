"use client"

import { use, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import {
  ArrowLeft, Loader2, LayoutDashboard, Layers, Users, CalendarDays, TrendingUp, BarChart3, Settings,
  Play, CheckCircle2, Archive, RotateCcw, Building2, Calendar,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { type ProgramDetail, PROGRAM_STATUS_STYLE, fmtDate, postJson } from "@/components/lms/programs/shared"
import ProgramStructureTab from "@/components/lms/programs/ProgramStructureTab"
import ProgramStudentsTab from "@/components/lms/programs/ProgramStudentsTab"
import ProgramSettingsTab from "@/components/lms/programs/ProgramSettingsTab"
import ProgramSessionsTab from "@/components/lms/programs/ProgramSessionsTab"

const TABS = [
  { key: "overview",  label: "Overview",  icon: LayoutDashboard },
  { key: "structure", label: "Structure", icon: Layers },
  { key: "students",  label: "Students",  icon: Users },
  { key: "sessions",  label: "Sessions",  icon: CalendarDays },
  { key: "progress",  label: "Progress",  icon: TrendingUp },
  { key: "reports",   label: "Reports",   icon: BarChart3 },
  { key: "settings",  label: "Settings",  icon: Settings },
] as const
type Tab = typeof TABS[number]["key"]

export default function ProgramPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = use(params)
  const { tab: tabParam } = use(searchParams)
  const { data: session } = useSession()
  const isAdmin = session?.user.role === "admin"
  const [detail, setDetail] = useState<ProgramDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const initialTab = (TABS.find(t => t.key === tabParam)?.key ?? "overview") as Tab
  const [tab, setTab] = useState<Tab>(initialTab)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/lms/programs/${id}`)
    if (res.status === 404) { setNotFound(true); setLoading(false); return }
    if (!res.ok) { toast.error("Could not load the program"); setLoading(false); return }
    setDetail(await res.json()); setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])

  async function setStatus(status: string, confirmText: string) {
    if (!confirm(confirmText)) return
    setBusy(true)
    const { ok, data } = await postJson(`/api/lms/programs/${id}`, "PATCH", { status })
    setBusy(false)
    if (!ok) { toast.error(data.error ?? "Could not change status"); return }
    toast.success(`Program is now ${status}`)
    if (data.sync?.issues) toast.warning(`${data.sync.issues} course enrollment(s) could not be created — check the Students tab`, { duration: 10000 })
    load()
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
  if (notFound || !detail) return (
    <div className="py-20 text-center">
      <p className="text-slate-600 font-medium">Program not found</p>
      <Link href="/lms-admin/programs" className="text-sm text-[#1B4F8A] hover:underline">Back to Program Manager</Link>
    </div>
  )

  const p = detail.program
  const active    = detail.members.filter(m => m.status === "active").length
  const completed = detail.members.filter(m => m.status === "completed").length
  const withdrawn = detail.members.filter(m => m.status === "withdrawn").length
  const current   = detail.members.filter(m => m.status !== "withdrawn")
  const avg = current.length ? Math.round(current.reduce((s, m) => s + m.progress_pct, 0) / current.length) : 0
  const courseCount = detail.rules.length

  return (
    <div className="space-y-6">
      <Link href="/lms-admin/programs" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Program Manager
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900">{p.name}</h1>
            <span className={cn("text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full", PROGRAM_STATUS_STYLE[p.status])}>{p.status}</span>
          </div>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              {p.is_individual ? "Individual learners" : p.lms_companies
                ? <Link href={`/lms-admin/companies/${p.lms_companies.id}`} className="hover:text-[#1B4F8A]">{p.lms_companies.name}</Link>
                : "—"}
            </span>
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {fmtDate(p.start_date)} → {fmtDate(p.end_date)}</span>
            {p.reference && <span>Ref. {p.reference}</span>}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            {p.status === "draft" && (
              <Button disabled={busy} onClick={() => setStatus("active", `Activate "${p.name}"?\n\nStudents get access to its courses and are emailed.`)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"><Play className="h-4 w-4" /> Activate</Button>
            )}
            {p.status === "active" && (
              <Button variant="outline" disabled={busy} onClick={() => setStatus("completed", `Mark "${p.name}" as completed?\n\nStudents then follow the "after end date" setting (${p.after_end_access.replace("_", "-")}).`)}
                className="gap-2"><CheckCircle2 className="h-4 w-4" /> Complete</Button>
            )}
            {p.status === "completed" && (
              <>
                <Button variant="outline" disabled={busy} onClick={() => setStatus("active", "Reopen this program?")} className="gap-2"><RotateCcw className="h-4 w-4" /> Reopen</Button>
                <Button variant="outline" disabled={busy} onClick={() => setStatus("archived", "Archive this program? It's hidden from lists; everything is kept.")} className="gap-2"><Archive className="h-4 w-4" /> Archive</Button>
              </>
            )}
            {p.status === "archived" && (
              <Button variant="outline" disabled={busy} onClick={() => setStatus("completed", "Unarchive this program?")} className="gap-2"><RotateCcw className="h-4 w-4" /> Unarchive</Button>
            )}
          </div>
        )}
      </div>

      {p.status === "draft" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          Draft — students can&apos;t see this program yet. Set up the structure and students, then Activate.
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.filter(t => t.key !== "settings" || isAdmin).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap",
              tab === t.key ? "border-[#1B4F8A] text-[#1B4F8A]" : "border-transparent text-slate-500 hover:text-slate-800")}>
            <t.icon className="h-4 w-4" /> {t.label}
            {t.key === "students" && <span className="text-xs text-slate-400">{active + completed}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Active students", value: active },
              { label: "Completed", value: completed },
              { label: "Average progress", value: `${avg}%` },
              { label: "Courses delivered", value: courseCount },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
          {p.structure === "tracks" && detail.tracks.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr><th className="text-left px-5 py-2 font-medium">Track</th><th className="text-left px-3 py-2 font-medium">Students</th><th className="text-left px-3 py-2 font-medium">Avg progress</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.tracks.map(t => {
                    const ms = current.filter(m => m.track_id === t.id)
                    const a = ms.length ? Math.round(ms.reduce((s, m) => s + m.progress_pct, 0) / ms.length) : 0
                    return <tr key={t.id}><td className="px-5 py-2.5 text-slate-800">{t.name}</td><td className="px-3 py-2.5">{ms.length}</td><td className="px-3 py-2.5">{a}%</td></tr>
                  })}
                </tbody>
              </table>
            </div>
          )}
          {p.description && <p className="text-sm text-slate-600 whitespace-pre-wrap bg-white rounded-xl border border-slate-200 p-5">{p.description}</p>}
          {withdrawn > 0 && <p className="text-xs text-slate-400">{withdrawn} withdrawn student{withdrawn !== 1 ? "s" : ""} (history kept).</p>}
        </div>
      )}

      {tab === "structure" && <ProgramStructureTab detail={detail} isAdmin={isAdmin} onChanged={load} />}
      {tab === "students" && <ProgramStudentsTab detail={detail} isAdmin={isAdmin} onChanged={load} />}

      {tab === "sessions" && <ProgramSessionsTab detail={detail} isAdmin={isAdmin} />}

      {tab === "progress" && (
        current.length === 0 ? <p className="text-sm text-slate-400 py-12 text-center">No students yet.</p> : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium sticky left-0 bg-slate-50">Student</th>
                  {detail.rules.map(r => <th key={r.course_id} className="text-left px-3 py-3 font-medium whitespace-nowrap">{r.lms_courses?.title}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {current.map(m => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5 sticky left-0 bg-white">
                      <Link href={`/lms-admin/progress/${m.student_id}`} className="text-slate-800 hover:text-[#1B4F8A]">{m.lms_students?.name}</Link>
                    </td>
                    {detail.rules.map(r => {
                      const e = m.enrollments.find(x => x.course_id === r.course_id && x.status !== "dropped")
                      if (!e) return <td key={r.course_id} className="px-3 py-2.5 text-slate-300">—</td>
                      const pct = Math.round(Number(e.progress_pct ?? 0))
                      return (
                        <td key={r.course_id} className="px-3 py-2.5">
                          {e.status === "completed"
                            ? <span className="text-emerald-600 text-xs font-medium flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Completed</span>
                            : <Link href={`/lms-admin/progress/${m.student_id}/course/${r.course_id}?enrollment_id=${e.id}`} className="text-xs text-slate-600 hover:text-[#1B4F8A]">{pct}%</Link>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "reports" && (
        <div className="space-y-3 max-w-2xl">
          <p className="text-sm text-slate-600">Reports for each course this program delivers:</p>
          {detail.rules.length === 0 ? <p className="text-sm text-slate-400">No courses yet.</p> : detail.rules.map(r => (
            <Link key={r.course_id} href={`/lms-admin/reports/${r.course_id}`}
              className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-5 py-3 hover:border-[#1B4F8A]/30">
              <span className="text-sm text-slate-800">{r.lms_courses?.title}</span>
              <BarChart3 className="h-4 w-4 text-slate-400" />
            </Link>
          ))}
          <p className="text-xs text-slate-400">Reports organised by client → program → track (combined program report, exports) come with the Reports step.</p>
        </div>
      )}

      {tab === "settings" && isAdmin && <ProgramSettingsTab detail={detail} onChanged={load} />}
    </div>
  )
}
