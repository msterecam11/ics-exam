"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { CalendarDays, MapPin, Users, Plus, Loader2, ChevronRight, UserCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { GroupFormDialog, emptyGroup } from "@/components/lms/groups/GroupFormDialog"

// Course builder → Groups: every scheduled delivery of this course.

const STATUS_STYLE: Record<string, string> = {
  planned: "bg-slate-100 text-slate-600",
  confirmed: "bg-emerald-50 text-emerald-700",
  completed: "bg-blue-50 text-blue-700",
  cancelled: "bg-red-50 text-red-600",
}

type Row = {
  id: string; label: string; status: string; start_date: string; end_date: string
  daily_start: string | null; daily_end: string | null; city: string | null; venue_name: string | null
  seats: number | null; seats_taken: number; days: number
  provider: { id: string; name: string } | null
  staff: { id: string; name: string; role: string }[]
  /** The client program it belongs to; null = an open date for the catalogue. */
  program: { id: string; name: string } | null
}

export default function GroupsPanel({ courseId, providerId, deliveryMode }: { courseId: string; providerId: string | null; deliveryMode: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/lms/groups?course_id=${courseId}`)
    const d = await res.json().catch(() => [])
    setRows(Array.isArray(d) ? d : [])
  }, [courseId])
  useEffect(() => { load() }, [load])

  if (deliveryMode === "online") return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-bold text-slate-900">Groups</h2>
      <p className="text-sm text-slate-500 mt-2">Groups are scheduled deliveries (dates, venue, instructors) for <b>onsite</b> and <b>hybrid</b> courses. Change this course&apos;s delivery mode in Settings to use them.</p>
    </div>
  )

  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
  return (
    <div className="max-w-4xl pb-20 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Groups</h2>
          <p className="text-sm text-slate-500 mt-0.5">Every delivery of this course. A client&apos;s groups are scheduled from its program (Program Manager → the program → <b>Schedule</b>). Here you add <b>open dates</b>: shown in the catalogue for individuals to request.</p>
        </div>
        <Button onClick={() => setCreating(true)} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-1.5 shrink-0">
          <Plus className="h-4 w-4" /> New open date
        </Button>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl py-14 text-center">
          <CalendarDays className="h-9 w-9 text-slate-300 mx-auto" />
          <p className="font-semibold text-slate-600 mt-3">No groups yet</p>
          <p className="text-sm text-slate-400 mt-1">Schedule a client&apos;s group from its program, or add an open date here for the catalogue.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map(g => {
            const running = g.status === "confirmed" && g.start_date <= today && g.end_date >= today
            return (
              <Link key={g.id} href={`/lms-admin/groups/${g.id}`}
                className="flex items-center gap-4 bg-white border border-slate-200 rounded-xl px-5 py-4 hover:border-[#1B4F8A]/40 hover:shadow-sm transition-all group">
                <div className="w-11 h-11 rounded-xl bg-[#1B4F8A]/10 flex items-center justify-center shrink-0">
                  <CalendarDays className="h-5 w-5 text-[#1B4F8A]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900">{g.label}</p>
                    {g.program
                      ? <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{g.program.name}</span>
                      : <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">Open date</span>}
                    <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", running ? "bg-amber-50 text-amber-700" : STATUS_STYLE[g.status])}>
                      {running ? "Running now" : g.status[0].toUpperCase() + g.status.slice(1)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                    {(g.venue_name || g.city) && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[g.venue_name, g.city].filter(Boolean).join(", ")}</span>}
                    {g.daily_start && <span>{g.daily_start.slice(0, 5)}–{g.daily_end?.slice(0, 5)}</span>}
                    <span>{g.days} day{g.days === 1 ? "" : "s"}</span>
                    {g.provider && <span>{g.provider.name}</span>}
                    {g.staff.length > 0 && <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" />{g.staff.map(s => s.name).join(", ")}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-slate-800 flex items-center gap-1 justify-end"><Users className="h-3.5 w-3.5 text-slate-400" />{g.seats_taken}{g.seats ? ` / ${g.seats}` : ""}</p>
                  <p className="text-[11px] text-slate-400">{g.seats && g.seats_taken >= g.seats ? "Full" : "participants"}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#1B4F8A] shrink-0" />
              </Link>
            )
          })}
        </div>
      )}

      <GroupFormDialog open={creating} onClose={() => setCreating(false)} courseId={courseId}
        initial={emptyGroup(providerId)} onSaved={() => load()} />
    </div>
  )
}
