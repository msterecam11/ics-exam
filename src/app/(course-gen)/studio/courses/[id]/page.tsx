"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  Loader2, ArrowLeft, FileText, Sparkles, Layers,
  AlertCircle, RefreshCw, Trash2,
} from "lucide-react"

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:              { label: "Draft",              cls: "bg-slate-100 text-slate-600" },
  generating_outline: { label: "Generating outline", cls: "bg-blue-50 text-blue-700" },
  outline_review:     { label: "Outline review",     cls: "bg-amber-50 text-amber-700" },
  generating_slides:  { label: "Generating slides",  cls: "bg-blue-50 text-blue-700" },
  ready:              { label: "Ready",              cls: "bg-emerald-50 text-emerald-700" },
  failed:             { label: "Failed",             cls: "bg-red-50 text-red-700" },
  published:          { label: "Published",          cls: "bg-emerald-100 text-emerald-800" },
}

export default function StudioCoursePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [refs, setRefs] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [outline, setOutline] = useState<any>(null)
  const [adjustments, setAdjustments] = useState("")

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([
      fetch(`/api/course-gen/courses/${id}`).then(x => x.json()),
      fetch(`/api/course-gen/courses/${id}/references`).then(x => x.json()).catch(() => ({ references: [] })),
    ])
    setData(c)
    setRefs(r.references ?? [])
    if (c?.course?.status === "outline_review") {
      const o = await fetch(`/api/course-gen/courses/${id}/outline`).then(x => x.json()).catch(() => null)
      setOutline(o?.job?.output ?? null)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // Poll while a generation is running so progress stays live.
  useEffect(() => {
    const status = data?.course?.status
    if (!["generating_outline", "generating_slides"].includes(status)) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [data?.course?.status, load])

  async function generateOutline(adj?: string) {
    setBusy(true)
    const res = await fetch(`/api/course-gen/courses/${id}/outline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adj ? { adjustments: adj } : {}),
    })
    setBusy(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Outline generation isn't available yet")
      return
    }
    setAdjustments("")
    setOutline(null)
    toast.success(adj ? "Regenerating outline with your adjustments" : "Outline generation started")
    load()
  }

  async function approveOutline() {
    if (!confirm("Approve this outline? Slide generation will start for every module.")) return
    setBusy(true)
    const res = await fetch(`/api/course-gen/courses/${id}/outline/approve`, { method: "POST" })
    setBusy(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Approval failed")
      return
    }
    toast.success("Outline approved — slide generation queued")
    load()
  }

  // A failed slide generation resumes from its cursor — finished slides are
  // already persisted, so this never regenerates work that succeeded.
  async function resumeGeneration() {
    setBusy(true)
    const res = await fetch(`/api/course-gen/courses/${id}/resume`, { method: "POST" })
    setBusy(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Could not resume")
      return
    }
    toast.success("Resuming generation")
    load()
  }

  async function deleteCourse() {
    if (!confirm("Delete this course and everything generated for it?")) return
    const res = await fetch(`/api/course-gen/courses/${id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Failed to delete"); return }
    toast.success("Course deleted")
    router.push("/studio/courses")
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-[#0C72C6]" />
      </div>
    )
  }

  if (data.error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="h-8 w-8 text-amber-500" />
        <p className="text-sm text-slate-500">{data.error}</p>
      </div>
    )
  }

  const { course, latestJob } = data
  const meta = STATUS_META[course.status] ?? STATUS_META.draft
  const gi = course.generation_input ?? {}
  const briefModules: { title: string; slide_count: number }[] = gi.modules ?? []

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Link href="/studio/courses" className="mt-1 text-slate-400 hover:text-slate-600 shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-800">{course.title}</h1>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${meta.cls}`}>{meta.label}</span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {[course.regulatory_framework, course.day_count ? `${course.day_count} days` : null,
                course.language === "en" ? "English" : course.language, course.partner_name]
                .filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <button onClick={deleteCourse} title="Delete course"
          className="text-slate-300 hover:text-red-500 transition-colors shrink-0 mt-1.5">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Live progress */}
      {["generating_outline", "generating_slides"].includes(course.status) && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-800">
              {latestJob?.current_step ?? (course.status === "generating_outline" ? "Drafting the outline…" : "Generating slides…")}
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-blue-100 overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${latestJob?.progress_pct ?? 5}%` }} />
            </div>
          </div>
        </div>
      )}

      {course.status === "failed" && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{latestJob?.error ?? "Generation failed."}</p>
          <button
            onClick={() => (course.modules ?? []).length > 0 ? resumeGeneration() : generateOutline()}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-900">
            <RefreshCw className="h-3.5 w-3.5" />
            {(course.modules ?? []).length > 0 ? "Resume" : "Retry"}
          </button>
        </div>
      )}

      {/* Draft state — outline CTA */}
      {course.status === "draft" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center space-y-3">
          <Sparkles className="h-7 w-7 text-[#0C72C6] mx-auto" />
          <h2 className="text-base font-semibold text-slate-800">Ready to generate the outline</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            The Content Agent drafts a slide-by-slide outline from your brief
            {refs.some(r => r.has_text) ? " and the uploaded reference materials" : ""}.
            Nothing else runs until you approve it.
          </p>
          <button onClick={() => generateOutline()} disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#0C72C6] hover:bg-[#0a63ab] disabled:opacity-60 transition-colors">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate outline
          </button>
        </div>
      )}

      {/* Outline review gate */}
      {course.status === "outline_review" && (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="bg-amber-50 border-b border-amber-100 px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-bold text-amber-800">Outline review</p>
              <p className="text-xs text-amber-600">
                Nothing is generated until you approve. Adjust and regenerate as many times as needed.
              </p>
            </div>
            <button onClick={approveOutline} disabled={busy || !outline}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 transition-colors">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Approve outline
            </button>
          </div>

          {!outline ? (
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
            </div>
          ) : (
            <div className="p-5 space-y-4 max-h-[520px] overflow-y-auto">
              {(outline.modules ?? []).map((m: any) => (
                <div key={m.module_number} className="space-y-1.5">
                  <p className="text-sm font-bold text-slate-800">
                    {m.is_module_zero ? "Module 0" : `Module ${m.module_number}`} — {m.title}
                    <span className="text-xs font-normal text-slate-400 ml-2">
                      {m.slides?.length ?? 0} slides{m.day_number ? ` · Day ${m.day_number}` : ""}
                    </span>
                  </p>
                  <div className="space-y-1">
                    {(m.slides ?? []).map((s: any, i: number) => (
                      <div key={i} className="flex items-center gap-2.5 rounded-lg bg-slate-50 border border-slate-100 px-3 py-1.5">
                        <span className="text-[10px] font-bold text-slate-300 w-5 shrink-0">{i + 1}</span>
                        <span className="text-xs text-slate-700 truncate flex-1">{s.title}</span>
                        <span className="text-[10px] font-semibold text-slate-400 shrink-0">{s.intent}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-[#0C72C6] bg-[#0C72C6]/10 px-1.5 py-0.5 rounded shrink-0">
                          {s.layout_kind?.replace(/_/g, " ")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-slate-100 p-4 space-y-2">
            <textarea
              value={adjustments}
              onChange={e => setAdjustments(e.target.value)}
              placeholder='Request changes — e.g. "Add a slide on NOTAM procedures to Module 4" or "Module 2 is too thin, expand it to 8 slides"'
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm min-h-16 resize-y placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0C72C6]/30"
            />
            <button
              onClick={() => adjustments.trim() && generateOutline(adjustments.trim())}
              disabled={busy || !adjustments.trim()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#0C72C6] bg-[#0C72C6]/10 hover:bg-[#0C72C6]/20 disabled:opacity-50 transition-colors">
              <RefreshCw className="h-3.5 w-3.5" /> Regenerate with adjustments
            </button>
          </div>
        </div>
      )}

      {/* Modules (once they exist) */}
      {(course.modules ?? []).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Layers className="h-4 w-4 text-[#0C72C6]" /> Modules
          </h2>
          {course.modules.map((m: any) => (
            <div key={m.id} className="flex items-center gap-4 bg-white rounded-xl border border-slate-200 p-4">
              <span className="text-xs font-bold text-slate-400 w-16 shrink-0">
                {m.is_module_zero ? "Module 0" : `Module ${m.order_index}`}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{m.title}</p>
                <p className="text-xs text-slate-400">{m.slide_count} slides</p>
              </div>
              {m.slide_count > 0 && (
                <Link href={`/studio/courses/${id}/edit/${m.id}`}
                  className="text-xs font-semibold text-[#0C72C6] hover:text-[#0a63ab] shrink-0">
                  Open in editor →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Brief summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Brief</p>
          <p className="text-sm text-slate-600 leading-relaxed">{course.overview || "—"}</p>
          {briefModules.length > 0 && (
            <div className="pt-1 space-y-1">
              {briefModules.map((m, i) => (
                <p key={i} className="text-xs text-slate-500">
                  <span className="font-semibold">Module {i + 1}:</span> {m.title}
                  <span className="text-slate-300"> · ~{m.slide_count} slides</span>
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Reference materials</p>
          {refs.length === 0 ? (
            <p className="text-sm text-slate-400">None uploaded.</p>
          ) : (
            <div className="space-y-1.5">
              {refs.map(r => (
                <div key={r.id} className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-[#0C72C6] shrink-0" />
                  <a href={r.file_url} target="_blank" rel="noreferrer"
                    className="text-xs text-slate-600 hover:text-[#0C72C6] truncate flex-1">{r.file_name}</a>
                  {r.has_text
                    ? <span className="text-[10px] font-bold text-emerald-600 shrink-0">READ</span>
                    : <span className="text-[10px] font-bold text-slate-300 shrink-0">STORED</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
