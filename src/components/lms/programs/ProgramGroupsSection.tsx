"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { CalendarDays, ChevronRight, Loader2, MapPin, Plus, UserCheck, Users, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { GroupFormDialog, emptyGroup } from "@/components/lms/groups/GroupFormDialog"

// A program's onsite deliveries ("groups"), course by course. A group made
// here is private to the program; when it's the only upcoming one for a
// course, the program's participants are placed in it automatically. With
// several (e.g. Riyadh in October, Jeddah in December) people are split from
// the group page — by hand or a whole track at once.

type G = {
  id: string; label: string; status: string; start_date: string; end_date: string
  daily_start: string | null; daily_end: string | null; city: string | null; venue_name: string | null
  seats: number | null; seats_taken: number; days: number
  provider: { id: string; name: string } | null
  staff: { id: string; name: string; role: string }[]
}
type C = { id: string; title: string; course_code: string | null; delivery_mode: string; provider_id: string | null; enrolled: number; unplaced: number; groups: G[] }

const STATUS_STYLE: Record<string, string> = {
  planned: "bg-slate-100 text-slate-600", confirmed: "bg-emerald-50 text-emerald-700",
  completed: "bg-blue-50 text-blue-700", cancelled: "bg-red-50 text-red-600",
}

export default function ProgramGroupsSection({ programId, canEdit }: { programId: string; canEdit: boolean }) {
  const [courses, setCourses] = useState<C[] | null>(null)
  const [creating, setCreating] = useState<C | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/lms/groups?program_id=${programId}`)
    const d = await res.json().catch(() => ({}))
    setCourses(res.ok && Array.isArray(d.courses) ? d.courses : [])
  }, [programId])
  useEffect(() => { load() }, [load])

  if (courses === null) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
  if (!courses.length) return null

  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Onsite groups</h3>
        <p className="text-xs text-slate-500 mt-0.5">Each group is one delivery for this program: dates, venue, instructor, facilitator. With a single group, everyone is placed in it automatically; with several, split people from the group&apos;s page.</p>
      </div>
      {courses.map(c => (
        <div key={c.id} className="bg-white border border-slate-200 rounded-xl">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 text-sm truncate">{c.title}{c.course_code ? <span className="text-slate-400 font-normal"> · {c.course_code}</span> : null}</p>
              <p className="text-xs text-slate-500">{c.enrolled} participant{c.enrolled === 1 ? "" : "s"} · {c.groups.length} group{c.groups.length === 1 ? "" : "s"}</p>
            </div>
            {c.unplaced > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                <AlertCircle className="h-3.5 w-3.5" />{c.unplaced} not in a group yet{c.groups.length > 1 ? " — open a group to place them" : ""}
              </span>
            )}
            {canEdit && (
              <Button size="sm" onClick={() => setCreating(c)} className="gap-1.5 bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
                <Plus className="h-3.5 w-3.5" /> Schedule a group
              </Button>
            )}
          </div>
          {c.groups.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-400">No group yet. Schedule one — dates, venue and staff — and this program&apos;s participants go straight into it.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {c.groups.map(g => {
                const running = g.status === "confirmed" && g.start_date <= today && g.end_date >= today
                return (
                  <Link key={g.id} href={`/lms-admin/groups/${g.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 group">
                    <CalendarDays className="h-4 w-4 text-[#1B4F8A] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-800">{g.label}</p>
                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", running ? "bg-amber-50 text-amber-700" : STATUS_STYLE[g.status])}>
                          {running ? "Running now" : g.status[0].toUpperCase() + g.status.slice(1)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                        {(g.venue_name || g.city) && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[g.venue_name, g.city].filter(Boolean).join(", ")}</span>}
                        {g.daily_start && <span>{g.daily_start.slice(0, 5)}–{g.daily_end?.slice(0, 5)}</span>}
                        <span>{g.days} day{g.days === 1 ? "" : "s"}</span>
                        {g.staff.length > 0 && <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" />{g.staff.map(s => s.name).join(", ")}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-slate-600 flex items-center gap-1 shrink-0"><Users className="h-3.5 w-3.5 text-slate-400" />{g.seats_taken}{g.seats ? ` / ${g.seats}` : ""}</span>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#1B4F8A] shrink-0" />
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      ))}
      {creating && (
        <GroupFormDialog open onClose={() => setCreating(null)} courseId={creating.id} programId={programId}
          initial={emptyGroup(creating.provider_id)} onSaved={() => load()} />
      )}
    </section>
  )
}
