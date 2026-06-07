"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Users, CheckCircle2, XCircle, Loader2, MoreHorizontal, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface Enrollment {
  id:           string
  status:       string
  enrolled_at:  string
  completed_at: string | null
  progress_pct: number
  lms_students: {
    id:        string
    name:      string
    email:     string
    company:   string | null
    job_title: string | null
  }
}

export default function CourseEnrollmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = use(params)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading,     setLoading]     = useState(true)
  const [updating,    setUpdating]    = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res  = await fetch(`/api/lms/enrollments?course_id=${courseId}`)
    const data = await res.json()
    setEnrollments(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [courseId])

  async function updateStatus(id: string, status: string) {
    setUpdating(id)
    const res  = await fetch("/api/lms/enrollments", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id, status }),
    })
    const data = await res.json()
    setUpdating(null)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success(`Status updated to ${status}`)
    load()
  }

  async function unenroll(id: string, name: string) {
    if (!confirm(`Unenroll ${name}? This cannot be undone.`)) return
    setUpdating(id)
    const res  = await fetch(`/api/lms/enrollments?id=${id}`, { method: "DELETE" })
    const data = await res.json()
    setUpdating(null)
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success(`${name} unenrolled`)
    load()
  }

  const active    = enrollments.filter(e => e.status === "active").length
  const completed = enrollments.filter(e => e.status === "completed").length

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href={`/lms-admin/courses/${courseId}`}>
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Enrolled Students</h1>
          <p className="text-sm text-slate-500">
            {enrollments.length} total · {active} active · {completed} completed
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Enrolled",  value: enrollments.length, color: "text-slate-700" },
          { label: "Active",    value: active,    color: "text-blue-600" },
          { label: "Completed", value: completed, color: "text-emerald-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-center">
            <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : enrollments.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Users className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500">No students enrolled yet.</p>
          <Link href={`/lms-admin/courses/${courseId}`}>
            <Button size="sm" className="mt-4 bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
              <Users className="h-4 w-4" /> Enroll Students
            </Button>
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Student</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Progress</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden xl:table-cell">Enrolled</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enrollments.map(e => (
                <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#1B4F8A]/10 flex items-center justify-center text-[#1B4F8A] font-bold text-xs shrink-0">
                        {e.lms_students?.name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{e.lms_students?.name}</p>
                        <p className="text-xs text-slate-500">{e.lms_students?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#1B4F8A] rounded-full"
                          style={{ width: `${e.progress_pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{e.progress_pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <Badge className={cn("text-xs border-0", {
                      "bg-blue-100 text-blue-700":    e.status === "active",
                      "bg-emerald-100 text-emerald-700": e.status === "completed",
                      "bg-slate-100 text-slate-500":  e.status === "dropped",
                    })}>
                      {e.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell text-xs text-slate-500">
                    {new Date(e.enrolled_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon" className="h-8 w-8" />}
                      >
                        {updating === e.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <MoreHorizontal className="h-4 w-4" />}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        {e.status !== "completed" && (
                          <DropdownMenuItem onClick={() => updateStatus(e.id, "completed")} className="gap-2 text-emerald-600">
                            <CheckCircle2 className="h-4 w-4" /> Mark Completed
                          </DropdownMenuItem>
                        )}
                        {e.status !== "dropped" && (
                          <DropdownMenuItem onClick={() => updateStatus(e.id, "dropped")} className="gap-2">
                            <XCircle className="h-4 w-4" /> Drop
                          </DropdownMenuItem>
                        )}
                        {e.status !== "active" && (
                          <DropdownMenuItem onClick={() => updateStatus(e.id, "active")} className="gap-2">
                            Re-activate
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => unenroll(e.id, e.lms_students?.name)}
                          className="gap-2 text-red-600 focus:text-red-600"
                        >
                          <XCircle className="h-4 w-4" /> Unenroll
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
