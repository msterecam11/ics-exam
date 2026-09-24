import { CalendarDays, Clock, MapPin, Globe, UserCheck, Download, Lock, FolderDown, ExternalLink } from "lucide-react"
import { FileIcon, fmtSize } from "@/components/lms/groups/file-display"
import type { MaterialSection, MaterialItem } from "@/lib/lms-materials"

// The participant's view of an onsite course's delivery (their group) and of
// everything they can download. Plain server-rendered markup: downloads are
// ordinary links to /api/lms/materials/…, which check access and record them.

export type StudentGroup = {
  label: string; dates: string; daily_start: string | null; daily_end: string | null
  venue_name: string | null; venue_address: string | null; city: string | null; country: string | null; map_url: string | null
  provider: string | null; instructors: string[]; days: number; language: string | null
  joining_instructions?: string | null
}

export function GroupCard({ group, pending }: { group: StudentGroup | null; pending: boolean }) {
  if (!group) {
    if (!pending) return null
    return (
      <div className="bg-white border border-dashed border-slate-300 rounded-2xl px-5 py-4 flex items-center gap-3">
        <CalendarDays className="h-5 w-5 text-slate-400 shrink-0" />
        <p className="text-sm text-slate-600">Your training dates and venue will appear here once you&apos;re placed in a group.</p>
      </div>
    )
  }
  const where = [group.venue_name, group.city, group.country].filter(Boolean).join(", ")
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="bg-[#1B4F8A] px-5 py-3 flex items-center gap-2 text-white">
        <CalendarDays className="h-4 w-4" />
        <p className="font-semibold text-sm">{group.dates}</p>
        {group.city && <p className="text-white/70 text-sm">· {group.city}</p>}
      </div>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 text-sm">
        {group.daily_start && (
          <p className="flex items-start gap-2 text-slate-700"><Clock className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
            <span>{group.daily_start.slice(0, 5)}–{group.daily_end?.slice(0, 5)} daily · {group.days} day{group.days === 1 ? "" : "s"}</span></p>
        )}
        {where && (
          <p className="flex items-start gap-2 text-slate-700"><MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
            <span>{where}{group.venue_address ? <span className="block text-xs text-slate-500">{group.venue_address}</span> : null}
              {group.map_url && <a href={group.map_url} target="_blank" rel="noreferrer" className="text-xs text-[#1B4F8A] hover:underline inline-flex items-center gap-1">Open map <ExternalLink className="h-3 w-3" /></a>}</span></p>
        )}
        {group.provider && <p className="flex items-start gap-2 text-slate-700"><Globe className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" /><span>Delivered by {group.provider}</span></p>}
        {group.instructors.length > 0 && <p className="flex items-start gap-2 text-slate-700"><UserCheck className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" /><span>Instructor{group.instructors.length > 1 ? "s" : ""}: {group.instructors.join(", ")}</span></p>}
      </div>
      {group.joining_instructions && (
        <div className="mx-5 mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-1">Before you come</p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{group.joining_instructions}</p>
        </div>
      )}
    </div>
  )
}

export function MaterialsList({ courseId, sections }: { courseId: string; sections: MaterialSection[] }) {
  if (!sections.length) return null
  const openCount = sections.reduce((n, s) => n + s.items.filter(i => i.available).length, 0)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2"><FolderDown className="h-5 w-5 text-[#1B4F8A]" /> Course Material</h2>
        {openCount > 1 && (
          <a href={`/api/lms/materials/zip?course_id=${courseId}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1B4F8A] border border-[#1B4F8A]/30 rounded-lg px-3 py-1.5 hover:bg-[#1B4F8A]/5">
            <Download className="h-4 w-4" /> Download all
          </a>
        )}
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
        {sections.map(s => (
          <div key={s.key}>
            <p className="px-5 pt-3 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{s.title}</p>
            {s.items.map(it => (
              <div key={it.key} className="flex items-center gap-3 px-5 py-2.5">
                <FileIcon name={it.fileName} className={it.available ? "h-5 w-5 text-[#1B4F8A] shrink-0" : "h-5 w-5 text-slate-300 shrink-0"} />
                <div className="flex-1 min-w-0">
                  <p className={it.available ? "text-sm text-slate-800 truncate" : "text-sm text-slate-400 truncate"}>{it.title}</p>
                  <p className="text-xs text-slate-400 truncate">{it.lockedNote ?? [it.fileName, fmtSize(it.sizeBytes)].filter(Boolean).join(" · ")}</p>
                </div>
                {it.available ? (
                  <a href={`/api/lms/materials/download?course_id=${courseId}&key=${encodeURIComponent(it.key)}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1B4F8A] hover:underline shrink-0">
                    <Download className="h-4 w-4" /> Download
                  </a>
                ) : <Lock className="h-4 w-4 text-slate-300 shrink-0" />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** The files of one exercise / assignment (sheet, template), shown where the work is done. */
export function ItemFiles({ courseId, items, label = "Files" }: { courseId: string; items: MaterialItem[]; label?: string }) {
  if (!items.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 space-y-1">
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
      {items.map(it => (
        <div key={it.key} className="flex items-center gap-2 text-sm">
          <FileIcon name={it.fileName} className={it.available ? "h-4 w-4 text-[#1B4F8A] shrink-0" : "h-4 w-4 text-slate-300 shrink-0"} />
          <span className={it.available ? "flex-1 min-w-0 truncate text-slate-700" : "flex-1 min-w-0 truncate text-slate-400"}>{it.title}</span>
          {it.available
            ? <a href={`/api/lms/materials/download?course_id=${courseId}&key=${encodeURIComponent(it.key)}`} className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4F8A] hover:underline shrink-0"><Download className="h-3.5 w-3.5" /> Download</a>
            : <span className="text-xs text-slate-400 shrink-0">{it.lockedNote}</span>}
        </div>
      ))}
    </div>
  )
}
