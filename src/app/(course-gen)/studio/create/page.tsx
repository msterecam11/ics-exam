"use client"

// Create a Course — the brief every downstream agent works from.
// Matches the approved design: sectioned form + live summary panel,
// per-module breakdown, partner logos (light + dark), reference uploads.

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Loader2, Plus, Trash2, Upload, FileText, Sparkles, X,
} from "lucide-react"

interface ModuleRow { title: string; slide_count: number }
interface RefFile { file: File; status: "pending" | "uploading" | "done" | "failed" }

const TONES = ["Corporate / formal", "Instructional", "Conversational"]

export default function CreateCoursePage() {
  const router = useRouter()

  // ── Basics ──
  const [title, setTitle] = useState("")
  const [overview, setOverview] = useState("")
  const [audience, setAudience] = useState("")
  const [objectives, setObjectives] = useState<string[]>([""])
  const [tone, setTone] = useState(TONES[0])
  const [days, setDays] = useState(5)

  // ── Structure ──
  const [modules, setModules] = useState<ModuleRow[]>([
    { title: "", slide_count: 20 },
  ])

  // ── Options ──
  const [framework, setFramework] = useState("")
  const [language, setLanguage] = useState<"en" | "ar" | "both">("en")
  const [includeAssessment, setIncludeAssessment] = useState(true)
  const [prerequisites, setPrerequisites] = useState("")
  const [partnerName, setPartnerName] = useState("")
  const [partnerLight, setPartnerLight] = useState<File | null>(null)
  const [partnerDark, setPartnerDark] = useState<File | null>(null)

  // ── References ──
  const [refs, setRefs] = useState<RefFile[]>([])

  const [submitting, setSubmitting] = useState(false)

  const totalSlides = useMemo(
    () => modules.reduce((s, m) => s + (Number.isFinite(m.slide_count) ? m.slide_count : 0), 0),
    [modules]
  )

  function setModule(i: number, patch: Partial<ModuleRow>) {
    setModules(ms => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  }

  async function submit() {
    if (!title.trim()) { toast.error("Course name is required"); return }
    if (!overview.trim()) { toast.error("Course overview is required"); return }
    const cleanModules = modules.filter(m => m.title.trim())
    if (cleanModules.length === 0) { toast.error("Add at least one module"); return }

    setSubmitting(true)
    try {
      // 1. Create the course (the whole brief snapshots into generation_input)
      const res = await fetch("/api/course-gen/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          overview: overview.trim(),
          target_audience: audience.trim() || null,
          objectives: objectives.map(o => o.trim()).filter(Boolean),
          regulatory_framework: framework.trim() || null,
          language,
          tone,
          day_count: days,
          partner_name: partnerName.trim() || null,
          include_assessment: includeAssessment,
          prerequisites: prerequisites.trim() || null,
          generation_input: {
            modules: cleanModules,
            total_slides: totalSlides,
          },
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Failed to create course")
      }
      const { id } = await res.json()

      // 2. Partner logos (best-effort — failures warn, don't block)
      for (const [variant, file] of [["light", partnerLight], ["dark", partnerDark]] as const) {
        if (!file) continue
        const fd = new FormData()
        fd.append("file", file)
        fd.append("variant", variant)
        const r = await fetch(`/api/course-gen/courses/${id}/partner-logo`, { method: "POST", body: fd })
        if (!r.ok) toast.warning(`Partner logo (${variant}) upload failed — you can retry later`)
      }

      // 3. Reference materials, sequentially (text extraction runs server-side)
      for (let i = 0; i < refs.length; i++) {
        setRefs(rs => rs.map((r, j) => (j === i ? { ...r, status: "uploading" } : r)))
        const fd = new FormData()
        fd.append("file", refs[i].file)
        const r = await fetch(`/api/course-gen/courses/${id}/references`, { method: "POST", body: fd })
        setRefs(rs => rs.map((x, j) => (j === i ? { ...x, status: r.ok ? "done" : "failed" } : x)))
        if (!r.ok) toast.warning(`Reference "${refs[i].file.name}" upload failed`)
      }

      toast.success("Course created")
      router.push(`/studio/courses/${id}`)
    } catch (e: any) {
      toast.error(e.message ?? "Something went wrong")
      setSubmitting(false)
    }
  }

  const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0C72C6]/30 focus:border-[#0C72C6]"
  const labelCls = "block text-xs font-semibold text-slate-500 mb-1.5"
  const sectionCls = "bg-white rounded-xl border border-slate-200 p-5 space-y-4"
  const sectionTitle = (n: number, t: string) => (
    <div className="flex items-center gap-2.5">
      <span className="w-6 h-6 rounded-full bg-[#0C72C6] text-white text-xs font-bold flex items-center justify-center">{n}</span>
      <h2 className="text-sm font-bold text-slate-800">{t}</h2>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Create a Course</h1>
        <p className="text-sm text-slate-500 mt-1">
          This brief grounds every agent in the pipeline. Fill it once — Module 0 front matter is generated automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* ── Form column ── */}
        <div className="space-y-5">

          {/* 1 · Basics */}
          <div className={sectionCls}>
            {sectionTitle(1, "Basics")}
            <div>
              <label className={labelCls}>Course name *</label>
              <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Apron Safety & Ground Operations" />
            </div>
            <div>
              <label className={labelCls}>Course overview *</label>
              <textarea className={`${inputCls} min-h-24 resize-y`} value={overview} onChange={e => setOverview(e.target.value)}
                placeholder="What this course covers and why it exists…" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Target audience</label>
                <input className={inputCls} value={audience} onChange={e => setAudience(e.target.value)}
                  placeholder="e.g. Ramp agents" />
              </div>
              <div>
                <label className={labelCls}>Tone</label>
                <select className={inputCls} value={tone} onChange={e => setTone(e.target.value)}>
                  {TONES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Days</label>
                <input type="number" min={1} max={30} className={inputCls} value={days}
                  onChange={e => setDays(parseInt(e.target.value) || 1)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Objectives</label>
              <div className="space-y-2">
                {objectives.map((o, i) => (
                  <div key={i} className="flex gap-2">
                    <input className={inputCls} value={o}
                      onChange={e => setObjectives(os => os.map((x, j) => j === i ? e.target.value : x))}
                      placeholder={`Objective ${i + 1}`} />
                    {objectives.length > 1 && (
                      <button onClick={() => setObjectives(os => os.filter((_, j) => j !== i))}
                        className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                ))}
                <button onClick={() => setObjectives(os => [...os, ""])}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#0C72C6] hover:text-[#0a63ab]">
                  <Plus className="h-3.5 w-3.5" /> Add objective
                </button>
              </div>
            </div>
          </div>

          {/* 2 · Structure */}
          <div className={sectionCls}>
            {sectionTitle(2, "Course structure")}
            <p className="text-xs text-slate-400 -mt-2">
              One row per module. Slides per module is a target, not a hard limit — the outline review lets you adjust before anything is generated.
            </p>
            <div className="space-y-2">
              {modules.map((m, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className="text-xs font-bold text-slate-400 w-14 shrink-0">Module {i + 1}</span>
                  <input className={inputCls} value={m.title}
                    onChange={e => setModule(i, { title: e.target.value })}
                    placeholder="Module title" />
                  <input type="number" min={4} max={60} className={`${inputCls} !w-20 shrink-0`} value={m.slide_count}
                    onChange={e => setModule(i, { slide_count: parseInt(e.target.value) || 10 })}
                    title="Target slides" />
                  {modules.length > 1 && (
                    <button onClick={() => setModules(ms => ms.filter((_, j) => j !== i))}
                      className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
              <button onClick={() => setModules(ms => [...ms, { title: "", slide_count: 20 }])}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#0C72C6] hover:text-[#0a63ab]">
                <Plus className="h-3.5 w-3.5" /> Add module
              </button>
            </div>
          </div>

          {/* 3 · Compliance & options */}
          <div className={sectionCls}>
            {sectionTitle(3, "Compliance & options")}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Regulatory framework / standard</label>
                <input className={inputCls} value={framework} onChange={e => setFramework(e.target.value)}
                  placeholder="e.g. GACAR Part-139, ICAO Annex 14" />
              </div>
              <div>
                <label className={labelCls}>Language</label>
                <select className={inputCls} value={language} onChange={e => setLanguage(e.target.value as any)}>
                  <option value="en">English</option>
                  <option value="ar">Arabic (best-effort, review required)</option>
                  <option value="both">Both</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Prerequisites</label>
              <input className={inputCls} value={prerequisites} onChange={e => setPrerequisites(e.target.value)}
                placeholder="e.g. Basic airside awareness training" />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={includeAssessment} onChange={e => setIncludeAssessment(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-[#0C72C6]" />
              <span className="text-sm text-slate-700">Include knowledge checks / self-assessment per module</span>
            </label>
          </div>

          {/* 4 · Client branding */}
          <div className={sectionCls}>
            {sectionTitle(4, "Client branding (optional)")}
            <div>
              <label className={labelCls}>Client / partner name</label>
              <input className={inputCls} value={partnerName} onChange={e => setPartnerName(e.target.value)}
                placeholder="e.g. Riyadh Airports" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([["light", "Light logo (for dark slides)", partnerLight, setPartnerLight],
                 ["dark", "Dark logo (for light slides)", partnerDark, setPartnerDark]] as const
              ).map(([variant, label, file, setFile]) => (
                <div key={variant}>
                  <label className={labelCls}>{label}</label>
                  <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-500 cursor-pointer hover:border-[#0C72C6] hover:text-[#0C72C6] transition-colors">
                    <Upload className="h-4 w-4 shrink-0" />
                    <span className="truncate">{file ? file.name : "Choose image…"}</span>
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => setFile(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              The client logo appears in every slide's footer/cover chrome. Uploading both variants gives the best result; with one, the other is derived automatically.
            </p>
          </div>

          {/* 5 · Reference materials */}
          <div className={sectionCls}>
            {sectionTitle(5, "Reference materials (optional)")}
            <p className="text-xs text-slate-400 -mt-2">
              Regulatory docs, past courses, manuals — the Content Agent grounds generation in these instead of writing from the brief alone. PDF & text files are read; other formats are stored.
            </p>
            <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-6 text-sm text-slate-500 cursor-pointer hover:border-[#0C72C6] hover:text-[#0C72C6] transition-colors">
              <Upload className="h-4 w-4" /> Add files
              <input type="file" multiple className="hidden"
                accept=".pdf,.txt,.md,.csv,.docx,.pptx"
                onChange={e => {
                  const files = Array.from(e.target.files ?? [])
                  setRefs(rs => [...rs, ...files.map(file => ({ file, status: "pending" as const }))])
                  e.target.value = ""
                }} />
            </label>
            {refs.length > 0 && (
              <div className="space-y-1.5">
                {refs.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                    <FileText className="h-4 w-4 text-[#0C72C6] shrink-0" />
                    <span className="text-xs text-slate-600 truncate flex-1">{r.file.name}</span>
                    {r.status === "uploading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                    {r.status === "done" && <span className="text-[10px] font-bold text-emerald-600">UPLOADED</span>}
                    {r.status === "failed" && <span className="text-[10px] font-bold text-red-500">FAILED</span>}
                    {r.status === "pending" && (
                      <button onClick={() => setRefs(rs => rs.filter((_, j) => j !== i))}
                        className="text-slate-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Summary panel ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 lg:sticky lg:top-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Summary</p>
          <p className="text-lg font-bold text-slate-800 leading-snug">
            {title.trim() || "Untitled course"}
          </p>
          <div className="space-y-2 text-sm">
            {[
              ["Standard", framework.trim() || "—"],
              ["Language", language === "en" ? "English" : language === "ar" ? "Arabic" : "EN + AR"],
              ["Duration", `${days} day${days === 1 ? "" : "s"}`],
              ["Modules", String(modules.filter(m => m.title.trim()).length || "—")],
              ["Est. slides", totalSlides ? `~${totalSlides} + front matter` : "—"],
              ["Client", partnerName.trim() || "—"],
              ["References", refs.length ? `${refs.length} file${refs.length === 1 ? "" : "s"}` : "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <span className="text-slate-400 text-xs">{k}</span>
                <span className="text-slate-700 font-medium text-right text-xs">{v}</span>
              </div>
            ))}
          </div>
          <button
            onClick={submit}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#0C72C6] hover:bg-[#0a63ab] disabled:opacity-60 transition-colors"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {submitting ? "Creating…" : "Create course"}
          </button>
          <p className="text-[11px] text-slate-400 text-center leading-relaxed">
            You'll review the slide-by-slide outline before any full generation runs.
          </p>
        </div>
      </div>
    </div>
  )
}
