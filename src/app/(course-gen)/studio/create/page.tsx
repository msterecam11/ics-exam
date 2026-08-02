"use client"

// Create a Course — the brief every downstream agent works from.
// Matches the approved design: sectioned form + live summary panel,
// per-module breakdown, partner logos (light + dark), reference uploads.

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  Loader2, Plus, Trash2, Upload, FileText, Sparkles, X, Check, Library,
} from "lucide-react"

interface ModuleRow { title: string; slide_count: number; coverage: string }
interface RefFile { file: File; status: "pending" | "uploading" | "done" | "failed" }
interface LibDoc {
  id: string; title: string; authority: string | null; doc_reference: string | null
  scan_status: string; section_count: number | null; page_count: number | null
}

const TONES = ["Corporate / formal", "Instructional", "Conversational"]

/** Rough count of the bullet points a designer pasted, for the hint line. */
function countPoints(text: string): number {
  return text.split(/\r?\n/).map(l => l.trim())
    .filter(l => l.length > 2 && /^[-•*o\d]/.test(l)).length
}

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
    { title: "", slide_count: 20, coverage: "" },
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
  // Two sources: the indexed global library (preferred — already scanned and
  // clause-indexed, so agents retrieve from it) and one-off uploads for this
  // course only.
  const [libDocs, setLibDocs] = useState<LibDoc[] | null>(null)
  const [pickedDocs, setPickedDocs] = useState<string[]>([])
  const [refs, setRefs] = useState<RefFile[]>([])

  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch("/api/course-gen/documents")
      .then(r => r.json())
      .then(d => setLibDocs(Array.isArray(d.documents) ? d.documents : []))
      .catch(() => setLibDocs([]))
  }, [])

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

      // 3. Link the chosen library documents (already indexed — no upload needed)
      if (pickedDocs.length > 0) {
        const r = await fetch(`/api/course-gen/courses/${id}/documents`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document_ids: pickedDocs }),
        })
        if (!r.ok) toast.warning("Reference library selection failed to save — you can set it on the course page")
      }

      // 4. One-off reference materials, sequentially (text extraction runs server-side)
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

  const inputCls = "s-input"
  const labelCls = "s-label block"
  const sectionCls = "s-card space-y-4"
  const sectionTitle = (n: number, t: string) => (
    <div className="flex items-center gap-2.5">
      <span className="flex items-center justify-center shrink-0"
        style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--s-primary)", color: "#fff", fontSize: 11, fontWeight: 800 }}>{n}</span>
      <h2 className="s-h3" style={{ fontSize: 14 }}>{t}</h2>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="s-h1">Create a Course</h1>
        <p className="s-body" style={{ marginTop: 4 }}>
          This brief grounds every agent in the pipeline. Fill it once — Module 0 front matter is generated automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* ── Form column ── */}
        <div className="space-y-5">

          {/* 1 · Basics */}
          <div className={sectionCls} style={{ padding: "18px 20px" }}>
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
                  className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 700, color: "var(--s-primary)" }}>
                  <Plus className="h-3.5 w-3.5" /> Add objective
                </button>
              </div>
            </div>
          </div>

          {/* 2 · Structure */}
          <div className={sectionCls} style={{ padding: "18px 20px" }}>
            {sectionTitle(2, "Course structure")}
            <p className="s-meta" style={{ fontSize: 11.5, marginTop: -6 }}>
              One row per module. Paste what each module must cover — the agent treats every point as required, maps it to specific slides, and the outline review flags anything left uncovered. Slide counts are targets, not limits.
            </p>
            <div className="space-y-3">
              {modules.map((m, i) => (
                <div key={i} style={{ border: "1.5px solid var(--s-line)", borderRadius: 8, padding: 12 }}>
                  <div className="flex gap-2 items-center">
                    <span className="s-meta shrink-0" style={{ width: 56, fontSize: 11, fontWeight: 700 }}>Module {i + 1}</span>
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
                  <textarea
                    className={inputCls}
                    style={{ marginTop: 8, minHeight: 76, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: 11.5 }}
                    value={m.coverage}
                    onChange={e => setModule(i, { coverage: e.target.value })}
                    placeholder={`What this module must cover — paste your syllabus, structure and all:

• Safety and Security Protocols
   - Introduction to Safety Management Systems (SMS) and OHS
   - Security measures [MR4.1], procedures, crisis management
• Performance and Quality Improvement
   - Performance metrics, continuous improvement, QMS
   - Introduction to Lean management [MR5.1]`} />
                  {m.coverage.trim() && (
                    <p className="s-meta" style={{ fontSize: 11, marginTop: 5 }}>
                      {countPoints(m.coverage)} required point{countPoints(m.coverage) === 1 ? "" : "s"} — the outline must cover every one, and you&apos;ll see which slides do.
                    </p>
                  )}
                </div>
              ))}
              <button onClick={() => setModules(ms => [...ms, { title: "", slide_count: 20, coverage: "" }])}
                className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 700, color: "var(--s-primary)" }}>
                <Plus className="h-3.5 w-3.5" /> Add module
              </button>
            </div>
          </div>

          {/* 3 · Compliance & options */}
          <div className={sectionCls} style={{ padding: "18px 20px" }}>
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
              <span style={{ fontSize: 12.5, color: "var(--s-body)" }}>Include knowledge checks / self-assessment per module</span>
            </label>
          </div>

          {/* 4 · Client branding */}
          <div className={sectionCls} style={{ padding: "18px 20px" }}>
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
                  <label className="flex items-center gap-2 cursor-pointer" style={{ border: "1.5px dashed #A9CFF0", borderRadius: 7, padding: "9px 12px", fontSize: 12.5, color: "var(--s-body-2)" }}>
                    <Upload className="h-4 w-4 shrink-0" />
                    <span className="truncate">{file ? file.name : "Choose image…"}</span>
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => setFile(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
              ))}
            </div>
            <p className="s-meta" style={{ fontSize: 11.5 }}>
              The client logo appears in every slide's footer/cover chrome. Uploading both variants gives the best result; with one, the other is derived automatically.
            </p>
          </div>

          {/* 5 · Reference materials */}
          <div className={sectionCls} style={{ padding: "18px 20px" }}>
            {sectionTitle(5, "Reference materials (optional)")}
            <p className="s-meta" style={{ fontSize: 11.5, marginTop: -6 }}>
              Regulatory docs, past courses, manuals — the Content Agent grounds generation in these instead of writing from the brief alone.
            </p>

            {/* 5a · Reference Library — already scanned and clause-indexed */}
            <div>
              <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                <Library className="h-3.5 w-3.5" style={{ color: "var(--s-primary)" }} />
                <p className="s-label flex-1">From the Reference Library</p>
                <Link href="/studio/library" className="s-meta" style={{ fontSize: 11, textDecoration: "underline" }}>
                  Manage
                </Link>
              </div>

              {libDocs === null ? (
                <p className="s-meta" style={{ fontSize: 11.5 }}>Loading library…</p>
              ) : libDocs.length === 0 ? (
                <p className="s-meta" style={{ fontSize: 11.5 }}>
                  No documents in the library yet. <Link href="/studio/library" style={{ textDecoration: "underline" }}>Add one</Link> and it gets scanned once, then any course can draw on it.
                </p>
              ) : (
                <div className="space-y-1.5" style={{ maxHeight: 260, overflowY: "auto" }}>
                  {libDocs.map(d => {
                    const picked = pickedDocs.includes(d.id)
                    const ready = d.scan_status === "ready"
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setPickedDocs(p => picked ? p.filter(x => x !== d.id) : [...p, d.id])}
                        className="flex items-center gap-2.5 w-full text-left"
                        style={{
                          background: picked ? "var(--s-primary-soft, #E8F2FB)" : "var(--s-surface-soft2)",
                          border: `1.5px solid ${picked ? "var(--s-primary)" : "var(--s-line-soft)"}`,
                          borderRadius: 8, padding: "8px 11px",
                        }}
                      >
                        <span className="flex items-center justify-center shrink-0" style={{
                          width: 16, height: 16, borderRadius: 4,
                          border: `1.5px solid ${picked ? "var(--s-primary)" : "#C9D6E4"}`,
                          background: picked ? "var(--s-primary)" : "#fff",
                        }}>
                          {picked && <Check className="h-3 w-3" style={{ color: "#fff" }} />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate" style={{ fontSize: 12, fontWeight: 700, color: "var(--s-ink)" }}>
                            {d.title}
                          </span>
                          <span className="s-meta block truncate" style={{ fontSize: 10.5 }}>
                            {[d.authority, d.doc_reference,
                              ready ? `${d.section_count ?? 0} indexed sections` : `scan ${d.scan_status}`]
                              .filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        {!ready && (
                          <span className="s-pill s-pill-warn shrink-0" style={{ fontSize: 9.5, padding: "1px 7px" }}>
                            NOT READY
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
              {pickedDocs.length > 0 && libDocs?.some(d => pickedDocs.includes(d.id) && d.scan_status !== "ready") && (
                <p className="s-meta" style={{ fontSize: 11, marginTop: 7 }}>
                  A document still scanning contributes only the sections indexed by the time generation runs.
                </p>
              )}
            </div>

            {/* 5b · One-off uploads, this course only */}
            <p className="s-label" style={{ marginBottom: -4 }}>Or upload for this course only</p>
            <label className="flex items-center justify-center gap-2 cursor-pointer" style={{ border: "1.5px dashed #A9CFF0", borderRadius: 8, padding: "22px 12px", fontSize: 12.5, color: "var(--s-body-2)" }}>
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
                  <div key={i} className="flex items-center gap-2" style={{ background: "var(--s-surface-soft2)", border: "1px solid var(--s-line-soft)", borderRadius: 7, padding: "7px 11px" }}>
                    <FileText className="h-4 w-4 text-[#0C72C6] shrink-0" />
                    <span className="truncate flex-1" style={{ fontSize: 12, color: "var(--s-body)" }}>{r.file.name}</span>
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
        <div className="s-card space-y-4 lg:sticky lg:top-2" style={{ padding: "18px 20px" }}>
          <p className="s-label">Summary</p>
          <p className="s-h2" style={{ lineHeight: 1.35 }}>
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
              ["Library docs", pickedDocs.length ? `${pickedDocs.length} selected` : "—"],
              ["Uploads", refs.length ? `${refs.length} file${refs.length === 1 ? "" : "s"}` : "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <span className="s-meta" style={{ fontSize: 11.5 }}>{k}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--s-ink)", textAlign: "right" }}>{v}</span>
              </div>
            ))}
          </div>
          <button
            onClick={submit}
            disabled={submitting}
            className="s-btn s-btn-primary w-full"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {submitting ? "Creating…" : "Create course"}
          </button>
          <p className="s-meta text-center" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            You'll review the slide-by-slide outline before any full generation runs.
          </p>
        </div>
      </div>
    </div>
  )
}
