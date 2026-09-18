"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Search, Loader2, Clock, BarChart3, Globe, Monitor, Layers, FolderOpen,
  ChevronLeft, CheckCircle2, Hourglass, X,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

// SP-14 — the student catalogue: categories first, then the courses inside,
// with a filter for how the course is delivered. Mirrors the admin Courses
// screen on purpose, so the two feel like the same place.

interface Category { id: string; name: string; description: string | null; image_url: string | null; colour: string | null; count: number }
interface CourseCard {
  id: string; title: string; blurb: string | null; thumbnail_url: string | null
  language: string | null; delivery_mode: string; level: string | null
  duration_hours: number | null; category_id: string | null; course_code: string | null
}
interface Payload {
  available: boolean
  categories: Category[]
  uncategorised: number
  courses: CourseCard[]
  enrolled: string[]
  requests: { course_id: string; status: string }[]
}

const MODES = [
  { key: "", label: "All" },
  { key: "onsite", label: "Onsite" },
  { key: "online", label: "Online" },
  { key: "hybrid", label: "Hybrid" },
]
const MODE_ICON: Record<string, any> = { online: Globe, onsite: Monitor, hybrid: Layers }
const NONE = "__none__"

export default function CatalogueBrowser() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<string | null>(null)
  const [mode, setMode] = useState("")
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/lms/catalogue")
    setData(res.ok ? await res.json() : null)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const statusOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const id of data?.enrolled ?? []) m.set(id, "enrolled")
    for (const r of data?.requests ?? []) if (!m.has(r.course_id) && r.status === "pending") m.set(r.course_id, "pending")
    return m
  }, [data])

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>

  if (!data || !data.available) return (
    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
      <FolderOpen className="h-8 w-8 text-slate-300 mx-auto" />
      <p className="text-sm font-medium text-slate-700 mt-3">The catalogue isn&apos;t available</p>
      <p className="text-sm text-slate-500 mt-1">Your training is arranged by your organisation.</p>
    </div>
  )

  const searching = search.trim().length > 0
  const visible = data.courses.filter(c => {
    if (searching) {
      const q = search.toLowerCase()
      if (!c.title.toLowerCase().includes(q) && !(c.blurb ?? "").toLowerCase().includes(q) && !(c.course_code ?? "").toLowerCase().includes(q))
        return false
    } else if (category) {
      if (category === NONE ? !!c.category_id : c.category_id !== category) return false
    }
    if (mode && c.delivery_mode !== mode) return false
    return true
  })

  const openCat = data.categories.find(c => c.id === category)
  const showTiles = !category && !searching

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {category && !searching ? (
            <>
              <button onClick={() => setCategory(null)} className="text-xs text-slate-500 hover:text-[#1B4F8A] flex items-center gap-1">
                <ChevronLeft className="h-3.5 w-3.5" /> All categories
              </button>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">{category === NONE ? "Other courses" : openCat?.name}</h1>
              {openCat?.description && <p className="text-sm text-slate-500 mt-0.5">{openCat.description}</p>}
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900">Course catalogue</h1>
              <p className="text-sm text-slate-500 mt-0.5">Browse what&apos;s on offer and ask to join.</p>
            </>
          )}
        </div>
        <Link href="/lms/catalogue/requests" className="text-sm text-[#1B4F8A] hover:underline shrink-0">My requests</Link>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search every course…" className="pl-9 h-9" />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showTiles ? (
        data.categories.length === 0 && !data.uncategorised ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
            <FolderOpen className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="text-sm font-medium text-slate-700 mt-3">Nothing here yet</p>
            <p className="text-sm text-slate-500 mt-1">New courses will appear as they open.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.categories.map(c => (
              <button key={c.id} onClick={() => setCategory(c.id)}
                className="group text-left bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-[#1B4F8A]/40 hover:shadow-sm transition-all">
                <div className="h-24 relative" style={{ background: c.colour || "#1B4F8A" }}>
                  {c.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  )}
                </div>
                <div className="p-4">
                  <p className="text-sm font-semibold text-slate-800 group-hover:text-[#1B4F8A]">{c.name}</p>
                  {c.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{c.description}</p>}
                  <p className="text-xs text-slate-400 mt-2">{c.count} course{c.count === 1 ? "" : "s"}</p>
                </div>
              </button>
            ))}
            {data.uncategorised > 0 && (
              <button onClick={() => setCategory(NONE)}
                className="group text-left bg-white rounded-xl border border-dashed border-slate-300 overflow-hidden hover:border-slate-400">
                <div className="h-24 bg-slate-100 flex items-center justify-center"><FolderOpen className="h-7 w-7 text-slate-300" /></div>
                <div className="p-4">
                  <p className="text-sm font-semibold text-slate-600">Other courses</p>
                  <p className="text-xs text-slate-400 mt-2">{data.uncategorised} course{data.uncategorised === 1 ? "" : "s"}</p>
                </div>
              </button>
            )}
          </div>
        )
      ) : (
        <>
          <div className="flex items-center gap-1.5 flex-wrap">
            {MODES.map(m => (
              <button key={m.key} onClick={() => setMode(m.key)}
                className={cn("px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors",
                  mode === m.key ? "bg-[#1B4F8A] text-white border-[#1B4F8A]" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300")}>
                {m.label}
              </button>
            ))}
            <span className="text-xs text-slate-400 ml-auto">{visible.length} course{visible.length === 1 ? "" : "s"}</span>
          </div>

          {visible.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 py-16 text-center">
              <p className="text-sm text-slate-500">No courses match.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visible.map(c => {
                const state = statusOf.get(c.id)
                const Icon = MODE_ICON[c.delivery_mode] ?? Globe
                return (
                  <Link key={c.id} href={`/lms/catalogue/${c.id}`}
                    className="group bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-[#1B4F8A]/40 hover:shadow-sm transition-all flex flex-col">
                    <div className="h-28 bg-slate-100 relative shrink-0">
                      {c.thumbnail_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      )}
                      {state === "enrolled" && (
                        <span className="absolute top-2 right-2 text-[10px] font-semibold bg-emerald-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Enrolled
                        </span>
                      )}
                      {state === "pending" && (
                        <span className="absolute top-2 right-2 text-[10px] font-semibold bg-amber-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Hourglass className="h-3 w-3" /> Requested
                        </span>
                      )}
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <p className="text-sm font-semibold text-slate-800 group-hover:text-[#1B4F8A] line-clamp-2">{c.title}</p>
                      {c.blurb && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{c.blurb}</p>}
                      <div className="flex items-center gap-3 mt-auto pt-3 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1 capitalize"><Icon className="h-3 w-3" />{c.delivery_mode}</span>
                        {c.duration_hours ? <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{c.duration_hours}h</span> : null}
                        {c.level ? <span className="flex items-center gap-1 capitalize"><BarChart3 className="h-3 w-3" />{c.level}</span> : null}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
