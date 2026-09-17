"use client"

import { useRouter } from "next/navigation"

type Option = { id: string; name: string; status: string; tracks: { id: string; name: string }[] }

// Chooses which enrollments a course report covers (RP-3): current enrollments,
// every run (course analytics), or one program and optionally one track.
export default function CourseScopePicker({ courseId, options, programId, trackId, allRuns }: {
  courseId: string; options: Option[]; programId: string | null; trackId: string | null; allRuns: boolean
}) {
  const router = useRouter()
  const go = (q: string) => router.push(`/lms-admin/reports/${courseId}/group${q ? `?${q}` : ""}`)
  const value = programId ? `p:${programId}` : allRuns ? "all" : ""
  const tracks = options.find(o => o.id === programId)?.tracks ?? []

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select aria-label="Report scope" value={value}
        onChange={e => { const v = e.target.value; go(v === "all" ? "scope=all" : v.startsWith("p:") ? `program=${v.slice(2)}` : "") }}
        className="h-8 rounded-lg border border-slate-200 px-2 text-xs bg-white max-w-[260px]">
        <option value="">Current enrollments</option>
        <option value="all">All runs (course analytics)</option>
        {options.length > 0 && (
          <optgroup label="Programs">
            {options.map(o => <option key={o.id} value={`p:${o.id}`}>{o.name}{o.status !== "active" ? ` (${o.status})` : ""}</option>)}
          </optgroup>
        )}
      </select>
      {programId && tracks.length > 0 && (
        <select aria-label="Track" value={trackId ?? ""}
          onChange={e => go(`program=${programId}${e.target.value ? `&track=${e.target.value}` : ""}`)}
          className="h-8 rounded-lg border border-slate-200 px-2 text-xs bg-white max-w-[180px]">
          <option value="">All tracks</option>
          {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
    </div>
  )
}
