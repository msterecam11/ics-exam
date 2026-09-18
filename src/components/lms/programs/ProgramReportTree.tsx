"use client"

import Link from "next/link"
import { BarChart3, ChevronRight, Route, BookOpen } from "lucide-react"
import type { ProgramDetail } from "@/components/lms/programs/shared"

// Program Manager → Reports: the program's reports in its own structure
// (tracks → course groups, learning paths grouped), opening the same report
// pages as Reports → Company → Program.
export default function ProgramReportTree({ programId, detail }: { programId: string; detail: ProgramDetail }) {
  const shared = detail.items.filter(i => !i.track_id)
  const tracks = detail.program.structure === "tracks" ? [...detail.tracks].sort((a, b) => a.order_index - b.order_index) : []

  const groupHref = (courseId: string, trackId: string | null) =>
    `/lms-admin/reports/${courseId}/group?program=${programId}${trackId ? `&track=${trackId}` : ""}`

  const Items = ({ items, trackId }: { items: ProgramDetail["items"]; trackId: string | null }) => (
    <div className="divide-y divide-slate-100">
      {[...items].sort((a, b) => a.order_index - b.order_index).map(i => i.course_id ? (
        <Link key={i.id} href={groupHref(i.course_id, trackId)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
          <BookOpen className="h-4 w-4 text-slate-400 shrink-0" />
          <span className="text-sm text-slate-800 flex-1">{i.lms_courses?.title ?? "Course"}</span>
          <span className="text-xs text-slate-400">Group report</span>
          <ChevronRight className="h-4 w-4 text-slate-300" />
        </Link>
      ) : i.path_id ? (
        <div key={i.id} className="px-4 py-2.5">
          <p className="flex items-center gap-2 text-xs font-medium text-slate-500"><Route className="h-3.5 w-3.5" /> Learning path: {i.lms_learning_paths?.title ?? "Path"}</p>
          <div className="mt-1 ml-5 border-l border-slate-100">
            {detail.path_courses.filter(pc => pc.path_id === i.path_id && pc.lms_courses).sort((a, b) => a.order_index - b.order_index).map(pc => (
              <Link key={pc.lms_courses!.id} href={groupHref(pc.lms_courses!.id, trackId)} className="flex items-center gap-3 pl-3 pr-1 py-1.5 hover:bg-slate-50 rounded-r">
                <span className="text-sm text-slate-700 flex-1">{pc.lms_courses!.title}</span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </Link>
            ))}
          </div>
        </div>
      ) : null)}
    </div>
  )

  return (
    <div className="space-y-3">
      {tracks.length > 0 ? tracks.map(t => (
        <div key={t.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <Link href={`/lms-admin/reports/programs/${programId}?track=${t.id}`} className="flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100">
            <span className="text-sm font-semibold text-slate-800">{t.name} <span className="font-normal text-slate-500">· track report</span></span>
            <BarChart3 className="h-4 w-4 text-slate-400" />
          </Link>
          <Items items={[...shared, ...detail.items.filter(i => i.track_id === t.id)]} trackId={t.id} />
        </div>
      )) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <p className="px-4 py-3 bg-slate-50 text-sm font-semibold text-slate-800">Course groups</p>
          <Items items={detail.items} trackId={null} />
        </div>
      )}
    </div>
  )
}
