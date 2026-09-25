"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Search, Loader2, Clock, BarChart3, Globe, Monitor, Layers, FolderOpen,
  ChevronLeft, ChevronRight, CheckCircle2, Hourglass, X,
  Landmark,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import CourseCover from "@/components/lms/CourseCover"

// SP-14 — the student catalogue. The courses themselves are on the first
// screen, grouped under their category, so nobody has to click a tile to find
// out what is inside. Opening a category is still there for the long ones.

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
  { key: "external", label: "External" },
]
const MODE_ICON: Record<string, any> = { online: Globe, onsite: Monitor, hybrid: Layers, external: Landmark }
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
  // Home view: every category with its courses underneath, longest first.
  const grouped = !category && !searching
  const PREVIEW = 6
  const sections = grouped
    ? [
        ...data.categories.map(k => ({
          id: k.id, name: k.name, description: k.description, colour: k.colour,
          courses: visible.filter(c => c.category_id === k.id),
        })),
        { id: NONE, name: "Other courses", description: null, colour: null, courses: visible.filter(c => !c.category_id) },
      ].filter(s => s.courses.length > 0)
    : []

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
          <FolderOpen className="h-8 w-8 text-slate-300 mx-auto" />
          <p className="text-sm text-slate-500 mt-3">{searching || mode ? "No courses match." : "New courses will appear as they open."}</p>
        </div>
      ) : grouped ? (
        <div className="space-y-7">
          {sections.map(s => (
            <section key={s.id}>
              <div className="flex items-end justify-between gap-3 mb-2.5">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.colour || "#1B4F8A" }} />
                    {s.name}
                    <span className="text-xs font-normal text-slate-400">{s.courses.length}</span>
                  </h2>
                  {s.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{s.description}</p>}
                </div>
                {s.courses.length > PREVIEW && (
                  <button onClick={() => setCategory(s.id)} className="text-xs text-[#1B4F8A] hover:underline shrink-0 flex items-center gap-0.5">
                    See all {s.courses.length} <ChevronRight className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {s.courses.slice(0, PREVIEW).map(c => <Card key={c.id} c={c} state={statusOf.get(c.id)} colour={s.colour} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map(c => <Card key={c.id} c={c} state={statusOf.get(c.id)} colour={openCat?.colour ?? null} />)}
        </div>
      )}
    </div>
  )
}

// One course card. The cover is never an empty grey box (CourseCover).
function Card({ c, state, colour }: { c: CourseCard; state?: string; colour: string | null }) {
  const Icon = MODE_ICON[c.delivery_mode] ?? Globe
  return (
    <Link href={`/lms/catalogue/${c.id}`}
      className="group bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-[#1B4F8A]/40 hover:shadow-sm transition-all flex flex-col">
      <CourseCover title={c.title} code={c.course_code} imageUrl={c.thumbnail_url} colour={colour} className="h-28"
        badge={state === "enrolled" ? (
          <span className="absolute top-2 right-2 text-[10px] font-semibold bg-emerald-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Enrolled
          </span>
        ) : state === "pending" ? (
          <span className="absolute top-2 right-2 text-[10px] font-semibold bg-amber-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
            <Hourglass className="h-3 w-3" /> Requested
          </span>
        ) : null} />
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
}
