"use client"

import { useEffect, useState } from "react"

// "Delivered by" on a course. Active providers only — plus whatever this course
// already has, so archiving a provider never silently rewrites a course.

type Option = { id: string; name: string; short_code: string | null; is_self: boolean; status: "active" | "archived" }

export function ProviderSelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [rows, setRows] = useState<Option[]>([])

  useEffect(() => {
    fetch("/api/lms/providers").then(r => r.ok ? r.json() : []).then((d: Option[]) => setRows(Array.isArray(d) ? d : []))
  }, [])

  const options = rows.filter(p => p.status === "active" || p.id === value)

  return (
    <select
      aria-label="Delivered by"
      value={value ?? ""}
      onChange={e => onChange(e.target.value || null)}
      className="w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
    >
      <option value="">Delivered by…</option>
      {options.map(p => (
        <option key={p.id} value={p.id}>
          {p.is_self ? "ICS Aviation" : p.name}{p.status === "archived" ? " (archived)" : ""}
        </option>
      ))}
    </select>
  )
}

export default ProviderSelect
