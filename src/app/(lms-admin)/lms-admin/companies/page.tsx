"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { Building2, Plus, Search, Loader2, Users, ChevronRight, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import CompanyFormDialog, { type CompanyRow } from "@/components/lms/CompanyFormDialog"

export default function CompaniesPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user.role === "admin"

  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState("")
  const [search,    setSearch]    = useState("")
  const [status,    setStatus]    = useState<"active" | "inactive" | "all">("active")
  const [modal,     setModal]     = useState(false)

  useEffect(() => {
    fetch("/api/lms/companies")
      .then(async r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setCompanies(Array.isArray(d) ? d : []))
      .catch(() => setError("Could not load companies"))
      .finally(() => setLoading(false))
  }, [])

  const q = search.trim().toLowerCase()
  const filtered = companies
    .filter(c => status === "all" || c.status === status)
    .filter(c => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || (c.name_ar ?? "").includes(search.trim()))

  const activeCount = companies.filter(c => c.status === "active").length

  return (
    <div className="space-y-6">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-[#1B4F8A]" /> Companies
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {activeCount} active client{activeCount !== 1 ? "s" : ""} · {companies.reduce((s, c) => s + (c.student_count ?? 0), 0)} linked students
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setModal(true)} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
            <Plus className="h-4 w-4" /> New Company
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search by name or code…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {(["active", "inactive", "all"] as const).map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={cn("px-3 py-1.5 rounded-md capitalize", status === s ? "bg-[#1B4F8A] text-white" : "text-slate-600 hover:bg-slate-50")}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : error ? (
        <p className="text-sm text-red-500 py-10 text-center">{error}</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="h-12 w-12 text-slate-200 mb-3" />
          <p className="text-slate-600 font-medium">{companies.length ? "No companies match" : "No companies yet"}</p>
          {!companies.length && (
            <p className="text-sm text-slate-400 mt-1 max-w-sm">
              Add your clients here. Students linked to a company are company participants; everyone else is an individual.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <Link key={c.id} href={`/lms-admin/companies/${c.id}`}
              className="bg-white rounded-xl border border-slate-200 hover:border-[#1B4F8A]/30 hover:shadow-sm transition-all p-5 flex flex-col gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {c.logo_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain border border-slate-100 shrink-0" />
                  : <div className="w-10 h-10 rounded-lg bg-[#1B4F8A]/10 flex items-center justify-center text-[#1B4F8A] font-bold text-xs shrink-0">{c.code.slice(0, 3)}</div>}
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm truncate">{c.name}</p>
                  <p className="text-xs text-slate-400 truncate">{c.code}{c.sector ? ` · ${c.sector}` : ""}</p>
                </div>
                {c.status === "inactive" && (
                  <span className="ml-auto text-[10px] font-semibold uppercase bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full shrink-0">Inactive</span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {c.student_count ?? 0} students</span>
                {(c.city || c.country) && (
                  <span className="flex items-center gap-1 truncate"><MapPin className="h-3.5 w-3.5 shrink-0" /> {[c.city, c.country].filter(Boolean).join(", ")}</span>
                )}
                <ChevronRight className="h-4 w-4 ml-auto text-slate-300" />
              </div>
            </Link>
          ))}
        </div>
      )}

      <CompanyFormDialog
        open={modal}
        editing={null}
        onClose={() => setModal(false)}
        onSaved={c => setCompanies(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))}
      />
    </div>
  )
}
