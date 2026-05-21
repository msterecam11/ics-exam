"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Plus, CalendarClock, Copy, QrCode, Pencil, Trash2,
  Users, Clock, MapPin, Loader2, CheckCircle2, XCircle,
  ExternalLink, MoreHorizontal, Globe, Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const MODE_LABEL: Record<string, string> = {
  system: "System-Connected",
  free:   "Free / Open",
}
const SOURCE_LABEL: Record<string, string> = {
  group:      "By Group",
  group_role: "Group + Role",
  role:       "By Role",
}
const FORMAT_LABEL: Record<string, string> = {
  in_person: "In-Person",
  online:    "Online",
  hybrid:    "Hybrid",
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700 border-emerald-200",
    draft:  "bg-slate-100   text-slate-600   border-slate-200",
    closed: "bg-red-100     text-red-600     border-red-200",
  }
  return (
    <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border", styles[status] ?? styles.draft)}>
      {status}
    </span>
  )
}

export default function ScheduleListPage() {
  const router = useRouter()
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [deleting,  setDeleting]  = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/interview/schedule")
      .then(r => r.json())
      .then(d => { setSchedules(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function bookingUrl(id: string) {
    return `${window.location.origin}/book/${id}`
  }

  function copyLink(id: string) {
    navigator.clipboard.writeText(bookingUrl(id))
    toast.success("Link copied to clipboard!")
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    const res = await fetch(`/api/interview/schedule/${id}`, { method: "DELETE" })
    setDeleting(null)
    setConfirmId(null)
    if (!res.ok) { toast.error("Failed to delete schedule"); return }
    setSchedules(prev => prev.filter(s => s.id !== id))
    toast.success("Schedule deleted")
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-[#1B4F8A]" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1B4F8A] tracking-tight">Scheduling</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create interview schedules and share booking links with candidates</p>
        </div>
        <Link href="/interview/schedule/new">
          <Button className="bg-[#1B4F8A] hover:bg-[#1B4F8A]/90 gap-2">
            <Plus className="h-4 w-4" /> New Schedule
          </Button>
        </Link>
      </div>

      {/* Empty state */}
      {schedules.length === 0 && (
        <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
          <CalendarClock className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-semibold">No schedules yet</p>
          <p className="text-slate-400 text-sm mt-1 mb-4">Create your first interview schedule and share a booking link with candidates</p>
          <Link href="/interview/schedule/new">
            <Button className="bg-[#1B4F8A] hover:bg-[#1B4F8A]/90 gap-2">
              <Plus className="h-4 w-4" /> New Schedule
            </Button>
          </Link>
        </div>
      )}

      {/* Schedule cards */}
      <div className="space-y-4">
        {schedules.map((s: any) => {
          const pct       = s.slot_count > 0 ? Math.round((s.booking_count / s.slot_count) * 100) : 0
          const isFull    = s.slot_count > 0 && s.booking_count >= s.slot_count
          const isDeleting = deleting === s.id

          return (
            <div key={s.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">

                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-[#1B4F8A]/10 flex items-center justify-center shrink-0 mt-0.5">
                  <CalendarClock className="h-5 w-5 text-[#1B4F8A]" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="font-extrabold text-slate-800 text-base truncate">{s.name}</h2>
                    <StatusBadge status={s.status} />
                    {isFull && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Full</span>}
                  </div>

                  {/* Meta chips */}
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap mb-3">
                    <span className="flex items-center gap-1">
                      {s.booking_mode === "system" ? <Users className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                      {MODE_LABEL[s.booking_mode]}
                      {s.source_type && ` · ${SOURCE_LABEL[s.source_type]}`}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {FORMAT_LABEL[s.interview_format]}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {s.slot_duration_min} min
                      {s.buffer_min > 0 && ` + ${s.buffer_min} min buffer`}
                    </span>
                    {s.location && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="truncate max-w-[160px]">{s.location}</span>
                      </>
                    )}
                  </div>

                  {/* Progress bar */}
                  {s.slot_count > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-500">{s.booking_count} / {s.slot_count} booked</span>
                        <span className="text-xs font-bold text-[#1B4F8A]">{pct}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: isFull ? "#10b981" : "#1B4F8A" }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/interview/schedule/${s.id}`}>
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-[#1B4F8A]/30 text-[#1B4F8A] hover:bg-[#1B4F8A]/5">
                        View Details <ExternalLink className="h-3 w-3" />
                      </Button>
                    </Link>
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5"
                      onClick={() => copyLink(s.id)}>
                      <Copy className="h-3 w-3" /> Copy Link
                    </Button>
                    <a href={`/print/interview/schedule/${s.id}`} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                        <QrCode className="h-3 w-3" /> QR Card
                      </Button>
                    </a>
                    <Link href={`/interview/schedule/${s.id}?edit=1`}>
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                    </Link>
                    {confirmId === s.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500">Delete?</span>
                        <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" disabled={isDeleting}
                          onClick={() => handleDelete(s.id)}>
                          {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          Yes
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmId(null)}>
                          <XCircle className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => setConfirmId(s.id)}>
                        <Trash2 className="h-3 w-3" /> Delete
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
