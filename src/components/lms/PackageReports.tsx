"use client"

import { useEffect, useState } from "react"
import { Loader2, Package, ChevronDown, ChevronRight, Download } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────
interface StudentProgress {
  student_id:       string
  name:             string
  email:            string
  company:          string | null
  status:           string | null
  score:            number | null
  blocks_completed: number
  time_spent:       number
  started_at:       string | null
  completed_at:     string | null
  updated_at:       string | null
}

interface PackageReport {
  id:          string
  module_id:   string | null
  title:       string
  pass_mark:   number
  block_count: number
  students:    StudentProgress[]
}

// ── Helpers ───────────────────────────────────────────────────
function fmtTime(seconds: number) {
  if (!seconds) return "—"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-400 text-xs">Not started</span>
  const map: Record<string, { label: string; className: string }> = {
    passed:      { label: "Passed",      className: "bg-green-100 text-green-700" },
    failed:      { label: "Failed",      className: "bg-red-100 text-red-700" },
    in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-700" },
  }
  const { label, className } = map[status] ?? { label: status, className: "bg-slate-100 text-slate-600" }
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", className)}>
      {label}
    </span>
  )
}

// ── PackageTable ──────────────────────────────────────────────
function PackageTable({ pkg }: { pkg: PackageReport }) {
  const [open, setOpen] = useState(true)

  const passed   = pkg.students.filter(s => s.status === "passed").length
  const failed   = pkg.students.filter(s => s.status === "failed").length
  const inProg   = pkg.students.filter(s => s.status === "in_progress").length
  const avgScore = (() => {
    const graded = pkg.students.filter(s => s.score !== null)
    if (!graded.length) return null
    return Math.round(graded.reduce((a, s) => a + (s.score ?? 0), 0) / graded.length)
  })()

  function exportCsv() {
    const headers = ["Name", "Email", "Company", "Status", "Score (%)", "Blocks Completed", "Time Spent", "Started", "Completed"]
    const rows = pkg.students.map(s => [
      s.name, s.email, s.company ?? "",
      s.status ?? "not_started",
      s.score !== null ? s.score : "",
      `${s.blocks_completed}/${pkg.block_count}`,
      fmtTime(s.time_spent),
      s.started_at ? new Date(s.started_at).toLocaleDateString() : "",
      s.completed_at ? new Date(s.completed_at).toLocaleDateString() : "",
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `${pkg.title.replace(/[^a-z0-9]/gi, "_")}_report.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <span className="text-teal-600">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <Package className="h-4 w-4 text-teal-600 shrink-0" />
        <span className="font-semibold text-slate-800 flex-1">{pkg.title || "Untitled Package"}</span>

        {/* Stats pills */}
        <span className="flex items-center gap-2 text-xs">
          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{passed} passed</span>
          <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{failed} failed</span>
          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{inProg} in progress</span>
          {avgScore !== null && (
            <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium">avg {avgScore}%</span>
          )}
          <span className="text-slate-400 ml-1">{pkg.block_count} blocks · pass mark {pkg.pass_mark}%</span>
        </span>

        <Button
          size="sm"
          variant="outline"
          className="ml-3 h-7 text-xs gap-1.5 shrink-0"
          onClick={e => { e.stopPropagation(); exportCsv() }}
        >
          <Download className="h-3 w-3" /> CSV
        </Button>
      </button>

      {/* Table */}
      {open && (
        <div className="overflow-x-auto">
          {pkg.students.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">No students have started this package yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-slate-200 bg-white">
                  {["Student", "Status", "Score", "Blocks", "Time Spent", "Started", "Completed"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pkg.students.map(s => (
                  <tr key={s.student_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium text-slate-800">{s.name}</div>
                      <div className="text-xs text-slate-400">{s.email}</div>
                      {s.company && <div className="text-xs text-slate-400">{s.company}</div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {s.score !== null ? (
                        <span className={cn(
                          "font-semibold",
                          s.score >= pkg.pass_mark ? "text-green-600" : "text-red-500"
                        )}>
                          {s.score}%
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {s.blocks_completed}/{pkg.block_count}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {fmtTime(s.time_spent)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500 text-xs">
                      {fmtDate(s.started_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500 text-xs">
                      {fmtDate(s.completed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────
export default function PackageReports({ courseId }: { courseId: string }) {
  const [reports, setReports] = useState<PackageReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/lms/admin/packages/reports?course_id=${courseId}`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setReports(d)
        else setError(d.error ?? "Failed to load reports")
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false))
  }, [courseId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-16 text-center text-sm text-red-500">{error}</div>
    )
  }

  if (!reports.length) {
    return (
      <div className="py-16 text-center">
        <Package className="h-10 w-10 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-400 text-sm">No package modules found in this course.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Package Reports</h2>
        <p className="text-sm text-slate-500 mt-1">
          Per-student progress for all package modules in this course.
        </p>
      </div>
      {reports.map(pkg => (
        <PackageTable key={pkg.id} pkg={pkg} />
      ))}
    </div>
  )
}
