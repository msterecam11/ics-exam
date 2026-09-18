"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Building2, FolderKanban, BookOpen, User, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type Hit = { id: string; label: string; sub?: string | null; href: string }
type Results = { companies: Hit[]; programs: Hit[]; courses: Hit[]; students: Hit[] }

const GROUPS = [
  { key: "companies", label: "Companies", icon: Building2 },
  { key: "programs", label: "Programs", icon: FolderKanban },
  { key: "courses", label: "Courses", icon: BookOpen },
  { key: "students", label: "Students", icon: User },
] as const

export default function ReportsSearch() {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [res, setRes] = useState<Results | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/lms/reports/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        if (r.ok) { setRes(await r.json()); setActive(0) }
      } catch { /* aborted */ }
      setLoading(false)
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [])

  const showing = q.trim().length >= 2 ? res : null
  const flat = showing ? GROUPS.flatMap(g => showing[g.key]) : []
  const go = (h: Hit) => { setOpen(false); router.push(h.href) }

  return (
    <div ref={box} className="relative w-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!flat.length) return
          if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => (a + 1) % flat.length) }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => (a - 1 + flat.length) % flat.length) }
          if (e.key === "Enter") { e.preventDefault(); go(flat[active]) }
          if (e.key === "Escape") setOpen(false)
        }}
        placeholder="Search a company, program, course or student"
        aria-label="Search reports"
        className="w-full h-11 rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 focus:border-[#1B4F8A]/40"
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-300" />}

      {open && showing && (
        <div className="absolute z-30 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-[420px] overflow-y-auto py-1">
          {flat.length === 0 && <p className="px-4 py-6 text-sm text-slate-400 text-center">Nothing matches “{q.trim()}”.</p>}
          {GROUPS.map(g => showing[g.key].length > 0 && (
            <div key={g.key} className="py-1">
              <p className="px-4 pt-1.5 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{g.label}</p>
              {showing[g.key].map(h => {
                const i = flat.indexOf(h)
                const Icon = g.icon
                return (
                  <button key={`${g.key}-${h.id}`} onMouseEnter={() => setActive(i)} onClick={() => go(h)}
                    className={cn("w-full flex items-center gap-3 px-4 py-2 text-left", i === active ? "bg-slate-50" : "")}>
                    <Icon className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm text-slate-800 truncate">{h.label}</span>
                      {h.sub && <span className="block text-xs text-slate-400 truncate">{h.sub}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
