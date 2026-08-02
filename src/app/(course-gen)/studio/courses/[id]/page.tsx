"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  Loader2, ArrowLeft, FileText, Sparkles, AlertCircle,
  RefreshCw, Trash2, Download, FileDown, Check, ChevronRight,
} from "lucide-react"
import GeneratingView from "@/components/course-gen/GeneratingView"
import { STATUS_PILL } from "@/components/course-gen/CourseCards"
import CoverageCheck from "@/components/course-gen/CoverageCheck"

// Slide-type chips on module cards, coloured like the prototype so a module's
// shape (cover → section → content → check → closing) reads at a glance.
const CHIP: Record<string, { label: string; bg: string; fg: string }> = {
  cover:             { label: "Cover",           bg: "linear-gradient(135deg,#4C63D2,#5B72DE)", fg: "#fff" },
  section_divider:   { label: "Section",         bg: "linear-gradient(135deg,#0C72C6,#1A82D6)", fg: "#fff" },
  content_white:     { label: "Content",         bg: "#fff",     fg: "#5B7189" },
  content_lightblue: { label: "Content",         bg: "#EAF3FC",  fg: "#0C72C6" },
  summary_dark:      { label: "Summary",         bg: "linear-gradient(135deg,#0B2B45,#123f63)", fg: "#fff" },
  self_assessment:   { label: "Knowledge Check", bg: "#FDF0E4",  fg: "#8a6412" },
  closing_cta:       { label: "Closing",         bg: "#0B2B45",  fg: "#fff" },
}

export default function StudioCoursePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [refs, setRefs] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [outline, setOutline] = useState<any>(null)
  const [adjustments, setAdjustments] = useState("")
  const [exports, setExports] = useState<any[]>([])
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([
      fetch(`/api/course-gen/courses/${id}`).then(x => x.json()),
      fetch(`/api/course-gen/courses/${id}/references`).then(x => x.json()).catch(() => ({ references: [] })),
    ])
    setData(c)
    setRefs(r.references ?? [])
    fetch(`/api/course-gen/courses/${id}/export`).then(x => x.json())
      .then(e => setExports(e.exports ?? [])).catch(() => {})
    if (c?.course?.status === "outline_review") {
      const o = await fetch(`/api/course-gen/courses/${id}/outline`).then(x => x.json()).catch(() => null)
      setOutline(o?.job?.output ?? null)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const status = data?.course?.status
    const exportRunning = exports.some(e => ["queued", "running"].includes(e.status))
    if (!["generating_outline", "generating_slides"].includes(status) && !exportRunning) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [data?.course?.status, exports, load])

  async function generateOutline(adj?: string) {
    setBusy(true)
    const res = await fetch(`/api/course-gen/courses/${id}/outline`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adj ? { adjustments: adj } : {}),
    })
    setBusy(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Outline generation isn't available yet"); return
    }
    setAdjustments(""); setOutline(null)
    toast.success(adj ? "Regenerating with your adjustments" : "Outline generation started")
    load()
  }

  async function approveOutline() {
    if (!confirm("Approve this outline? Slide generation will start for every module.")) return
    setBusy(true)
    const res = await fetch(`/api/course-gen/courses/${id}/outline/approve`, { method: "POST" })
    setBusy(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Approval failed"); return
    }
    toast.success("Outline approved — slide generation queued")
    load()
  }

  async function resumeGeneration() {
    setBusy(true)
    const res = await fetch(`/api/course-gen/courses/${id}/resume`, { method: "POST" })
    setBusy(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Could not resume"); return
    }
    toast.success("Resuming generation"); load()
  }

  async function exportPdf(moduleId?: string) {
    setExporting(true)
    const res = await fetch(`/api/course-gen/courses/${id}/export`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(moduleId ? { module_id: moduleId } : {}),
    })
    setExporting(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Could not start the export"); return
    }
    toast.success("Export queued — the PDF appears here when ready"); load()
  }

  async function deleteCourse() {
    if (!confirm("Delete this course and everything generated for it?")) return
    const res = await fetch(`/api/course-gen/courses/${id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Failed to delete"); return }
    toast.success("Course deleted"); router.push("/studio/courses")
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: 420 }}>
        <div className="s-spin" style={{ width: 52, height: 52, borderRadius: "50%", border: "4px solid var(--s-line)", borderTopColor: "var(--s-primary)" }} />
      </div>
    )
  }
  if (data.error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: 380 }}>
        <AlertCircle className="h-8 w-8" style={{ color: "#E0A93C" }} />
        <p className="s-body">{data.error}</p>
      </div>
    )
  }

  const { course, latestJob } = data
  const pill = STATUS_PILL[course.status] ?? STATUS_PILL.draft
  const generating = ["generating_outline", "generating_slides"].includes(course.status)

  // Full-screen generating experience, as designed.
  if (generating) {
    return (
      <GeneratingView
        courseTitle={course.title}
        step={latestJob?.current_step ?? null}
        progress={latestJob?.progress_pct ?? 3}
        log={(latestJob?.input?.log as string[]) ?? []}
      />
    )
  }

  const briefModules: { title: string; slide_count: number; coverage?: string }[] = course.generation_input?.modules ?? []

  return (
    <div className="s-fade" style={{ maxWidth: 1160, margin: "0 auto" }}>
      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap" style={{ marginBottom: 22 }}>
        <Link href="/studio/courses" style={{ color: "var(--s-muted)", marginTop: 6 }}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <span className={`s-pill ${pill.cls}`} style={{ marginBottom: 8 }}>
            {course.status === "ready" && <Check className="h-3 w-3" />}
            {pill.label}
            {(course.modules ?? []).length > 0 && ` · ${course.modules.reduce((s: number, m: any) => s + m.slide_count, 0)} slides`}
          </span>
          <h1 className="s-h1">{course.title}</h1>
          <p className="s-body" style={{ marginTop: 5 }}>
            {[course.regulatory_framework, course.language === "en" ? "English" : course.language,
              course.day_count ? `${course.day_count} days` : null, course.partner_name]
              .filter(Boolean).join(" · ")}
            {(course.modules ?? []).length > 0 && " · Open any module to edit its slides on the canvas."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(course.modules ?? []).length > 0 && (
            <button onClick={() => exportPdf()} disabled={exporting} className="s-btn s-btn-primary">
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              Export PDF
            </button>
          )}
          <button onClick={deleteCourse} title="Delete course" className="s-btn s-btn-ghost" style={{ padding: 9 }}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Failure */}
      {course.status === "failed" && (
        <div className="s-card flex items-center gap-3" style={{ padding: "14px 18px", marginBottom: 20, background: "#FBEAEA", borderColor: "#F3C9C9" }}>
          <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "#C05252" }} />
          <p className="flex-1" style={{ fontSize: 12.5, color: "#C05252" }}>{latestJob?.error ?? "Generation failed."}</p>
          <button onClick={() => (course.modules ?? []).length > 0 ? resumeGeneration() : generateOutline()}
            disabled={busy} className="s-btn s-btn-ghost" style={{ borderColor: "#E4B3B3", color: "#C05252" }}>
            <RefreshCw className="h-3.5 w-3.5" /> {(course.modules ?? []).length > 0 ? "Resume" : "Retry"}
          </button>
        </div>
      )}

      {/* Draft CTA */}
      {course.status === "draft" && (
        <div className="s-card flex flex-col items-center text-center" style={{ padding: "44px 30px", marginBottom: 22 }}>
          <Sparkles className="h-7 w-7" style={{ color: "var(--s-primary)" }} />
          <p className="s-h2" style={{ marginTop: 14 }}>Ready to generate the outline</p>
          <p className="s-body" style={{ marginTop: 6, maxWidth: 470 }}>
            The Content Agent drafts a slide-by-slide outline from your brief
            {refs.some(r => r.has_text) ? " and the uploaded reference materials" : ""}. Nothing else runs until you approve it.
          </p>
          <button onClick={() => generateOutline()} disabled={busy} className="s-btn s-btn-primary" style={{ marginTop: 18 }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate outline
          </button>
        </div>
      )}

      {/* Outline review */}
      {course.status === "outline_review" && (
        <div className="s-card overflow-hidden" style={{ marginBottom: 22, borderColor: "#F5D89B" }}>
          <div className="flex items-center gap-3 flex-wrap" style={{ padding: "14px 20px", background: "#FDF7EA", borderBottom: "1.5px solid #F5D89B" }}>
            <div className="flex-1 min-w-0">
              <p className="s-h3" style={{ color: "#8a6412" }}>Outline review</p>
              <p style={{ fontSize: 12, color: "#A08048", marginTop: 2 }}>
                Nothing is generated until you approve. Adjust and regenerate as often as you like.
              </p>
            </div>
            <button onClick={approveOutline} disabled={busy || !outline}
              className="s-btn" style={{ background: "#1F7A44", color: "#fff", boxShadow: "0 8px 20px -8px rgba(31,122,68,.8)" }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve outline
            </button>
          </div>

          {!outline ? (
            <div className="flex justify-center" style={{ padding: 40 }}>
              <div className="s-spin" style={{ width: 34, height: 34, borderRadius: "50%", border: "3px solid var(--s-line)", borderTopColor: "var(--s-primary)" }} />
            </div>
          ) : (
            <div style={{ padding: 20, maxHeight: 520, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
              {(outline.modules ?? []).map((m: any) => (
                <div key={m.module_number}>
                  <p className="s-h3" style={{ marginBottom: 7 }}>
                    {m.is_module_zero ? "Module 0" : `Module ${m.module_number}`} — {m.title}
                    <span className="s-meta" style={{ fontWeight: 500, marginLeft: 8 }}>
                      {m.slides?.length ?? 0} slides{m.day_number ? ` · Day ${m.day_number}` : ""}
                    </span>
                  </p>
                  <div className="flex flex-col gap-1">
                    {(m.slides ?? []).map((s: any, i: number) => (
                      <div key={i} className="flex items-center gap-3"
                        style={{ background: "var(--s-surface-soft2)", border: "1px solid var(--s-line-soft)", borderRadius: 7, padding: "7px 11px" }}>
                        <span className="s-meta" style={{ width: 18, fontSize: 11 }}>{i + 1}</span>
                        <span className="flex-1 truncate" style={{ fontSize: 12.5, color: "var(--s-ink)" }}>{s.title}</span>
                        <span className="s-meta" style={{ fontSize: 11 }}>{s.intent}</span>
                        <span className="s-pill s-pill-info" style={{ fontSize: 10, padding: "2px 8px" }}>
                          {(CHIP[s.layout_kind]?.label ?? s.layout_kind)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Required-coverage verification, when the brief supplied one */}
                  {(() => {
                    const idx = m.is_module_zero ? -1 : m.module_number - 1
                    const cov = briefModules[idx]?.coverage
                    return cov?.trim()
                      ? <CoverageCheck coverage={cov} slides={m.slides ?? []} />
                      : null
                  })()}
                </div>
              ))}
            </div>
          )}

          <div style={{ padding: 16, borderTop: "1px solid var(--s-line-soft)" }}>
            <textarea className="s-input" value={adjustments} onChange={e => setAdjustments(e.target.value)}
              placeholder='Request changes — e.g. "Add a slide on NOTAM procedures to Module 4"'
              style={{ minHeight: 62, resize: "vertical" }} />
            <button onClick={() => adjustments.trim() && generateOutline(adjustments.trim())}
              disabled={busy || !adjustments.trim()} className="s-btn s-btn-ghost" style={{ marginTop: 9 }}>
              <RefreshCw className="h-3.5 w-3.5" /> Regenerate with adjustments
            </button>
          </div>
        </div>
      )}

      {/* Cross-course consistency — a report to review, not an auto-fix; a
          contradiction between two modules needs a human call on which one's right. */}
      {course.consistency_report?.checked && (
        <div className="s-card" style={{ padding: "14px 18px", marginBottom: 22 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: course.consistency_report.issues?.length ? 10 : 0 }}>
            {course.consistency_report.issues?.length > 0
              ? <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "#C08A2E" }} />
              : <Check className="h-4 w-4 shrink-0" style={{ color: "#1F7A44" }} />}
            <p className="s-label flex-1">
              Consistency check{" "}
              {course.consistency_report.issues?.length > 0
                ? `— ${course.consistency_report.issues.length} item${course.consistency_report.issues.length === 1 ? "" : "s"} to review`
                : "— nothing found across modules"}
            </p>
            <span className="s-meta" style={{ fontSize: 11 }}>
              {course.consistency_report.slide_count} slides compared
              {course.consistency_report.truncated ? " (partial — course too large for one pass)" : ""}
            </span>
          </div>
          {(course.consistency_report.issues ?? []).map((iss: any, i: number) => (
            <div key={i} className="flex items-start gap-2.5" style={{
              padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid var(--s-line-soft)",
            }}>
              <span className={`s-pill ${iss.severity === "major" ? "s-pill-danger" : "s-pill-warn"}`}
                style={{ fontSize: 9.5, padding: "1px 7px", marginTop: 1, flexShrink: 0 }}>
                {iss.kind?.toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 12, color: "var(--s-body)", lineHeight: 1.5 }}>{iss.detail}</p>
                {Array.isArray(iss.slides) && iss.slides.length > 0 && (
                  <p className="s-meta" style={{ fontSize: 10.5, marginTop: 2 }}>
                    {iss.slides.map((s: any) => `Module ${s.module}, Slide ${s.slide}`).join("  ·  ")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modules */}
      {(course.modules ?? []).length > 0 && (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(430px,1fr))", marginBottom: 22 }}>
          {course.modules.map((m: any) => (
            <div key={m.id} className="s-card" style={{ padding: "16px 18px" }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                <p className="s-h3 flex-1 min-w-0 truncate">
                  {m.is_module_zero ? "Module 0 — Front Matter" : `Module ${m.order_index} — ${m.title}`}
                </p>
                {m.is_module_zero && <span className="s-pill s-pill-info" style={{ fontSize: 10, padding: "2px 8px" }}>AUTO</span>}
                <span className="s-meta" style={{ fontSize: 11.5 }}>{m.slide_count} slides</span>
              </div>

              <ModuleChips moduleId={m.id} count={m.slide_count} />

              <div className="flex items-center gap-3" style={{ marginTop: 13 }}>
                <Link href={`/studio/courses/${id}/edit/${m.id}`}
                  className="flex items-center gap-1" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--s-primary)" }}>
                  Open in editor <ChevronRight className="h-3.5 w-3.5" />
                </Link>
                {m.slide_count > 0 && (
                  <button onClick={() => exportPdf(m.id)} className="s-meta flex items-center gap-1 ml-auto"
                    style={{ fontSize: 11.5 }} title="Export this module">
                    <FileDown className="h-3.5 w-3.5" /> PDF
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Exports */}
      {exports.length > 0 && (
        <div className="s-card" style={{ padding: "16px 18px", marginBottom: 22 }}>
          <p className="s-label" style={{ marginBottom: 10 }}>Exports</p>
          <div className="flex flex-col gap-2">
            {exports.map(e => (
              <div key={e.id} className="flex items-center gap-3">
                <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--s-primary)" }} />
                <span className="flex-1 truncate" style={{ fontSize: 12.5, color: "var(--s-body)" }}>
                  {e.module_id ? "Single module" : "Whole course"}
                  <span className="s-meta"> · {new Date(e.created_at).toLocaleString("en-GB")}</span>
                </span>
                {e.status === "done" && e.file_url
                  ? <a href={e.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 shrink-0"
                      style={{ fontSize: 12, fontWeight: 700, color: "var(--s-primary)" }}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                  : e.status === "failed"
                    ? <span className="s-pill s-pill-danger" style={{ fontSize: 10 }}>FAILED</span>
                    : <span className="s-meta flex items-center gap-1 shrink-0" style={{ fontSize: 11.5 }}>
                        <Loader2 className="h-3 w-3 animate-spin" /> {e.status}
                      </span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Brief + references */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))" }}>
        <div className="s-card" style={{ padding: "16px 18px" }}>
          <p className="s-label" style={{ marginBottom: 9 }}>Brief</p>
          <p className="s-body" style={{ lineHeight: 1.6 }}>{course.overview || "—"}</p>
          {briefModules.length > 0 && (
            <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 3 }}>
              {briefModules.map((m, i) => (
                <p key={i} className="s-meta" style={{ fontSize: 11.5 }}>
                  <span style={{ fontWeight: 700, color: "var(--s-body-2)" }}>Module {i + 1}:</span> {m.title} · ~{m.slide_count} slides
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="s-card" style={{ padding: "16px 18px" }}>
          <p className="s-label" style={{ marginBottom: 9 }}>Reference materials</p>
          {refs.length === 0 ? <p className="s-meta">None uploaded.</p> : (
            <div className="flex flex-col gap-2">
              {refs.map(r => (
                <div key={r.id} className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--s-primary)" }} />
                  <a href={r.file_url} target="_blank" rel="noreferrer" className="flex-1 truncate"
                    style={{ fontSize: 12.5, color: "var(--s-body)" }}>{r.file_name}</a>
                  <span className={`s-pill ${r.has_text ? "s-pill-ready" : "s-pill-neutral"}`} style={{ fontSize: 10, padding: "2px 8px" }}>
                    {r.has_text ? "READ" : "STORED"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Slide-type chips for a module — fetched lazily so the course page stays
 *  one round-trip for its own data. */
function ModuleChips({ moduleId, count }: { moduleId: string; count: number }) {
  const [kinds, setKinds] = useState<string[] | null>(null)

  useEffect(() => {
    if (count === 0) { setKinds([]); return }
    fetch(`/api/course-gen/modules/${moduleId}`)
      .then(r => r.json())
      .then(d => setKinds((d.pages ?? []).map((p: any) => p.layout_kind)))
      .catch(() => setKinds([]))
  }, [moduleId, count])

  if (kinds === null) {
    return <div style={{ height: 46, borderRadius: 7, background: "var(--s-surface-soft2)" }} />
  }
  if (kinds.length === 0) {
    return <div className="flex items-center justify-center"
      style={{ height: 46, borderRadius: 7, border: "1.5px dashed #CBD9E7", fontSize: 11.5, color: "var(--s-muted)" }}>
      no slides yet
    </div>
  }

  return (
    <div className="flex gap-1.5 flex-wrap">
      {kinds.slice(0, 8).map((k, i) => {
        const c = CHIP[k] ?? CHIP.content_white
        return (
          <div key={i} className="flex items-end"
            style={{
              width: 58, height: 46, borderRadius: 6, background: c.bg,
              border: c.bg === "#fff" ? "1.5px solid var(--s-line)" : "none",
              padding: "0 5px 4px",
            }}>
            <span style={{ fontSize: 8.5, fontWeight: 700, color: c.fg, lineHeight: 1.15 }}>{c.label}</span>
          </div>
        )
      })}
      {kinds.length > 8 && (
        <div className="flex items-center justify-center"
          style={{ width: 58, height: 46, borderRadius: 6, background: "var(--s-surface-soft2)", border: "1.5px solid var(--s-line)" }}>
          <span className="s-meta" style={{ fontSize: 11, fontWeight: 700 }}>+{kinds.length - 8}</span>
        </div>
      )}
    </div>
  )
}
