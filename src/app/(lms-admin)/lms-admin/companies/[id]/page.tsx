"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  Building2, ArrowLeft, Loader2, Users, GraduationCap, BarChart3, Settings,
  LayoutDashboard, Mail, Phone, MapPin, Edit, Power, Trash2, BarChart2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import CompanyFormDialog, { type CompanyRow } from "@/components/lms/CompanyFormDialog"

type Student = {
  id: string; name: string; email: string; job_title: string | null; department: string | null
  employee_number: string | null; last_login: string | null; created_at: string
}

const TABS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "students", label: "Students", icon: Users },
  { key: "programs", label: "Programs", icon: GraduationCap },
  { key: "reports",  label: "Reports",  icon: BarChart3 },
  { key: "settings", label: "Settings", icon: Settings },
] as const
type Tab = typeof TABS[number]["key"]

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user.role === "admin"

  const [company,  setCompany]  = useState<CompanyRow | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading,  setLoading]  = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [tab,      setTab]      = useState<Tab>("overview")
  const [editOpen, setEditOpen] = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [programs, setPrograms] = useState<{ id: string; name: string; status: string; start_date: string | null; end_date: string | null; member_counts: { active: number; completed: number } }[] | null>(null)

  useEffect(() => {
    if (tab !== "programs" || programs) return
    fetch(`/api/lms/programs?company_id=${id}`).then(r => r.ok ? r.json() : []).then(d => setPrograms(Array.isArray(d) ? d : []))
  }, [tab, programs, id])

  useEffect(() => {
    fetch(`/api/lms/companies/${id}`)
      .then(async r => {
        if (r.status === 404) { setNotFound(true); return }
        if (!r.ok) throw new Error()
        const d = await r.json()
        setCompany({ ...d.company, student_count: d.students.length })
        setStudents(d.students)
      })
      .catch(() => toast.error("Could not load company"))
      .finally(() => setLoading(false))
  }, [id])

  async function toggleActive() {
    if (!company) return
    const next = company.status === "active" ? "inactive" : "active"
    if (next === "inactive" && !confirm(`Deactivate ${company.name}? Its students and history are kept, but no new students can be added to it.`)) return
    setBusy(true)
    const res = await fetch(`/api/lms/companies/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast.error(data.error ?? "Could not update"); return }
    setCompany(c => c && { ...c, ...data })
    toast.success(next === "active" ? "Company reactivated" : "Company deactivated")
  }

  async function remove() {
    if (!company || !confirm(`Delete ${company.name}? This cannot be undone.`)) return
    setBusy(true)
    const res = await fetch(`/api/lms/companies/${id}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast.error(data.error ?? "Could not delete"); return }
    toast.success("Company deleted")
    router.push("/lms-admin/companies")
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
  if (notFound || !company) return (
    <div className="py-20 text-center">
      <p className="text-slate-600 font-medium">Company not found</p>
      <Link href="/lms-admin/companies" className="text-sm text-[#1B4F8A] hover:underline">Back to companies</Link>
    </div>
  )

  return (
    <div className="space-y-6">
      <Link href="/lms-admin/companies" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Companies
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          {company.logo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={company.logo_url} alt="" className="w-14 h-14 rounded-xl object-contain border border-slate-100 bg-white shrink-0" />
            : <div className="w-14 h-14 rounded-xl bg-[#1B4F8A]/10 flex items-center justify-center text-[#1B4F8A] font-bold shrink-0">{company.code.slice(0, 3)}</div>}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 truncate">{company.name}</h1>
            <p className="text-sm text-slate-500">
              {company.code}{company.name_ar ? <> · <span dir="rtl">{company.name_ar}</span></> : null}
              {company.status === "inactive" && <span className="ml-2 text-[10px] font-semibold uppercase bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Inactive</span>}
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button variant="outline" onClick={() => setEditOpen(true)} className="gap-2"><Edit className="h-4 w-4" /> Edit</Button>
        )}
      </div>

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.filter(t => t.key !== "settings" || isAdmin).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap",
              tab === t.key ? "border-[#1B4F8A] text-[#1B4F8A]" : "border-transparent text-slate-500 hover:text-slate-800")}>
            <t.icon className="h-4 w-4" /> {t.label}
            {t.key === "students" && <span className="text-xs text-slate-400">{students.length}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Details</p>
            <Row label="Sector" value={company.sector} />
            <Row label="Location" value={[company.city, company.country].filter(Boolean).join(", ") || null} icon={MapPin} />
            <Row label="Catalogue" value={company.show_catalogue ? "Visible to participants" : "Hidden from participants"} />
            <Row label="Added" value={fmtDate(company.created_at)} />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Main contact</p>
            {company.contact_name || company.contact_email || company.contact_phone ? (
              <>
                <Row label="Name" value={company.contact_name} />
                <Row label="Email" value={company.contact_email} icon={Mail} href={company.contact_email ? `mailto:${company.contact_email}` : undefined} />
                <Row label="Phone" value={company.contact_phone} icon={Phone} />
              </>
            ) : <p className="text-sm text-slate-400">No contact added</p>}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">At a glance</p>
            <p className="text-3xl font-bold text-slate-900">{students.length}</p>
            <p className="text-sm text-slate-500 -mt-2">linked student{students.length !== 1 ? "s" : ""}</p>
            {company.notes && <p className="text-sm text-slate-600 whitespace-pre-wrap border-t border-slate-100 pt-3">{company.notes}</p>}
          </div>
        </div>
      )}

      {tab === "students" && (
        students.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="h-10 w-10 text-slate-200 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">No students linked yet. Link students from the Students page (Edit → Company) or import a CSV into this company.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Student</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Job / department</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Employee No.</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Last login</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.email}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-600">
                      {s.job_title ?? "—"}{s.department && <p className="text-xs text-slate-400">{s.department}</p>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-600">{s.employee_number ?? "—"}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-500">{s.last_login ? fmtDate(s.last_login) : "Never"}</td>
                    <td className="px-4 py-3">
                      <Link href={`/lms-admin/progress/${s.id}`} title="View progress" className="text-slate-400 hover:text-[#1B4F8A]">
                        <BarChart2 className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "programs" && (
        programs === null ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
        ) : programs.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-xl border border-dashed border-slate-200">
            <GraduationCap className="h-10 w-10 text-slate-200 mx-auto mb-2" />
            <p className="text-slate-600 font-medium text-sm">No programs for {company.name} yet</p>
            <Link href="/lms-admin/programs" className="text-xs text-[#1B4F8A] hover:underline">Open Program Manager</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {programs.map(pr => (
              <Link key={pr.id} href={`/lms-admin/programs/${pr.id}`} className="bg-white rounded-xl border border-slate-200 hover:border-[#1B4F8A]/30 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm text-slate-900 truncate">{pr.name}</p>
                  <span className="text-[10px] font-semibold uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{pr.status}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{pr.member_counts.active + pr.member_counts.completed} students · {fmtDate(pr.start_date)} → {fmtDate(pr.end_date)}</p>
              </Link>
            ))}
          </div>
        )
      )}

      {tab === "reports" && (
        <div className="py-16 text-center bg-white rounded-xl border border-dashed border-slate-200">
          <BarChart3 className="h-10 w-10 text-slate-200 mx-auto mb-2" />
          <p className="text-slate-600 font-medium text-sm">Company reports come with the Reports step</p>
          <p className="text-xs text-slate-400 mt-1">Everything this company has done across its programs.</p>
        </div>
      )}

      {tab === "settings" && isAdmin && (
        <div className="max-w-xl space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">{company.status === "active" ? "Deactivate company" : "Reactivate company"}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {company.status === "active"
                  ? "Keeps its students and history, but no new students can be added."
                  : "Allows adding students to this company again."}
              </p>
            </div>
            <Button variant="outline" onClick={toggleActive} disabled={busy} className="gap-2 shrink-0">
              <Power className="h-4 w-4" /> {company.status === "active" ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
          <div className="bg-white rounded-xl border border-red-100 p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-red-700">Delete company</p>
              <p className="text-xs text-slate-500 mt-0.5">Only possible while no students are linked. Otherwise deactivate it.</p>
            </div>
            <Button variant="outline" onClick={remove} disabled={busy || students.length > 0} className="gap-2 text-red-600 border-red-200 hover:bg-red-50 shrink-0">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        </div>
      )}

      <CompanyFormDialog
        open={editOpen}
        editing={company}
        onClose={() => setEditOpen(false)}
        onSaved={c => setCompany(prev => prev && { ...prev, ...c, student_count: prev.student_count })}
      />
    </div>
  )
}

function Row({ label, value, icon: Icon, href }: { label: string; value: string | null; icon?: typeof Building2; href?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-slate-400 shrink-0">{label}</span>
      {value
        ? href
          ? <a href={href} className="text-[#1B4F8A] hover:underline truncate flex items-center gap-1">{Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}{value}</a>
          : <span className="text-slate-700 text-right truncate flex items-center gap-1">{Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />}{value}</span>
        : <span className="text-slate-300">—</span>}
    </div>
  )
}
