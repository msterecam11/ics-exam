"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Search, TrendingUp, User, Building2, Mail, Clock, ChevronRight, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface Student {
  id: string; name: string; email: string
  job_title: string | null; company: string | null
  language: string; last_login: string | null; created_at: string
}

function fmtDate(iso: string | null) {
  if (!iso) return "Never"
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export default function ProgressListPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState("")

  useEffect(() => {
    fetch("/api/lms/students")
      .then(r => r.json())
      .then(d => { setStudents(Array.isArray(d.students) ? d.students : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    (s.company ?? "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-[#1B4F8A]" />
          Student Progress
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Select a student to view their full academic progress, assessment results and security report.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search by name, email or company…"
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <User className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{search ? "No students match your search" : "No students yet"}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {filtered.map(s => (
            <Link
              key={s.id}
              href={`/lms-admin/progress/${s.id}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors group"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-[#1B4F8A]/10 flex items-center justify-center text-[#1B4F8A] font-bold text-sm shrink-0">
                {s.name[0]?.toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-medium text-slate-900 text-sm">{s.name}</p>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</span>
                  {s.company   && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{s.company}</span>}
                  {s.job_title && <span className="flex items-center gap-1"><User className="h-3 w-3" />{s.job_title}</span>}
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Last login: {fmtDate(s.last_login)}</span>
                </div>
              </div>

              <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#1B4F8A] transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 text-right">{filtered.length} student{filtered.length !== 1 ? "s" : ""}</p>
    </div>
  )
}
