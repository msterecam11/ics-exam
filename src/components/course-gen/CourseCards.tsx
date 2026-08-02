"use client"

// Course gallery + table views, built to the approved prototype: gradient
// header with the course's initials, status pill, standard/language chips,
// and module/slide counts.

import Link from "next/link"
import { Layers, Images, ChevronRight } from "lucide-react"

export const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  draft:              { label: "Draft",            cls: "s-pill-neutral" },
  generating_outline: { label: "Generating",       cls: "s-pill-info" },
  outline_review:     { label: "Outline review",   cls: "s-pill-warn" },
  generating_slides:  { label: "Generating",       cls: "s-pill-info" },
  ready:              { label: "Ready",            cls: "s-pill-ready" },
  failed:             { label: "Failed",           cls: "s-pill-danger" },
  published:          { label: "Published",        cls: "s-pill-ready" },
}

/** Two-letter mark from the course title — digits kept when a title leads
 *  with a standard number (e.g. "14" for ICAO Annex 14), matching the
 *  prototype's cards. */
export function initialsFor(title: string): string {
  const words = title.replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean)
  if (!words.length) return "??"
  // Only a LEADING number becomes the mark (e.g. "14 Aerodrome Design" → 14).
  // Matching digits anywhere would turn "Ramp Safety Refresher 2026" into "20".
  if (/^\d+$/.test(words[0])) return words[0].slice(0, 2)
  const letters = words.filter(w => /^[A-Za-z]/.test(w))
  if (letters.length === 0) return words[0].slice(0, 2).toUpperCase()
  return letters.length === 1
    ? letters[0].slice(0, 2).toUpperCase()
    : (letters[0][0] + letters[1][0]).toUpperCase()
}

function timeAgo(iso?: string): string {
  if (!iso) return "—"
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const GRADIENTS = [
  "linear-gradient(135deg,#0C72C6,#2E86D3)",
  "linear-gradient(135deg,#1A6FA8,#2C87BE)",
  "linear-gradient(135deg,#127FA8,#21B0D4)",
  "linear-gradient(135deg,#0C72C6,#045089)",
  "linear-gradient(135deg,#14639E,#1E7CB8)",
]

export function CourseGallery({ courses }: { courses: any[] }) {
  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))" }}>
      {courses.map((c, i) => {
        const pill = STATUS_PILL[c.status] ?? STATUS_PILL.draft
        const generating = ["generating_outline", "generating_slides"].includes(c.status)
        return (
          <Link key={c.id} href={`/studio/courses/${c.id}`} className="s-card overflow-hidden s-fade block"
            style={{ transition: "box-shadow .18s ease, transform .18s ease" }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 10px 28px -14px rgba(11,43,69,.45)"; e.currentTarget.style.transform = "translateY(-2px)" }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none" }}>

            {/* Gradient header */}
            <div className="relative" style={{ height: 132, background: GRADIENTS[i % GRADIENTS.length] }}>
              <span style={{ position: "absolute", left: 20, top: 14, fontSize: 34, fontWeight: 800, color: "rgba(255,255,255,.42)", letterSpacing: "-1px" }}>
                {initialsFor(c.title)}
              </span>
              <span className={`s-pill ${pill.cls}`} style={{ position: "absolute", right: 14, top: 14, background: "rgba(255,255,255,.92)" }}>
                {generating && <span className="s-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />}
                {pill.label}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/course-gen/theme-1/logos/ics-icon-white.png" alt=""
                style={{ position: "absolute", right: 18, bottom: 14, width: 34, opacity: .85 }} />
            </div>

            {/* Body */}
            <div style={{ padding: "14px 18px 16px" }}>
              <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 9 }}>
                {c.regulatory_framework && (
                  <span className="s-pill s-pill-info" style={{ fontSize: 10.5, padding: "2px 9px" }}>{c.regulatory_framework}</span>
                )}
                <span className="s-pill s-pill-neutral" style={{ fontSize: 10.5, padding: "2px 9px" }}>
                  {c.language === "both" ? "EN·AR" : (c.language ?? "en").toUpperCase()}
                </span>
              </div>

              <p className="s-h3" style={{ fontSize: 14.5, lineHeight: 1.35, minHeight: 39 }}>{c.title}</p>

              <div className="flex items-center gap-4" style={{ marginTop: 12, paddingTop: 11, borderTop: "1px solid var(--s-line-soft)" }}>
                <span className="s-meta flex items-center gap-1.5" style={{ fontSize: 11.5 }}>
                  <Layers className="h-3.5 w-3.5" /> {c.module_count ?? 0} modules
                </span>
                <span className="s-meta flex items-center gap-1.5" style={{ fontSize: 11.5 }}>
                  <Images className="h-3.5 w-3.5" /> {c.slide_count ?? 0} slides
                </span>
                <span className="s-meta ml-auto" style={{ fontSize: 11.5 }}>
                  {generating ? "generating" : timeAgo(c.updated_at)}
                </span>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

export function CourseTable({ courses }: { courses: any[] }) {
  return (
    <div className="s-card overflow-hidden s-fade">
      <div className="grid items-center" style={{
        gridTemplateColumns: "1fr 150px 130px 90px 110px 30px",
        padding: "12px 18px", background: "var(--s-surface-soft2)",
        borderBottom: "1.5px solid var(--s-line)",
      }}>
        {["Course", "Standard", "Status", "Slides", "Updated", ""].map(h => (
          <span key={h} className="s-label" style={{ fontSize: 10.5 }}>{h}</span>
        ))}
      </div>

      {courses.map(c => {
        const pill = STATUS_PILL[c.status] ?? STATUS_PILL.draft
        return (
          <Link key={c.id} href={`/studio/courses/${c.id}`}
            className="grid items-center hover:bg-[var(--s-surface-soft)]"
            style={{
              gridTemplateColumns: "1fr 150px 130px 90px 110px 30px",
              padding: "13px 18px", borderBottom: "1px solid var(--s-line-soft)",
              transition: "background .12s ease",
            }}>
            <div className="flex items-center gap-3 min-w-0">
              <span className="shrink-0 flex items-center justify-center"
                style={{ width: 36, height: 36, borderRadius: 9, background: "linear-gradient(135deg,#0C72C6,#2E86D3)", color: "#fff", fontSize: 12, fontWeight: 800 }}>
                {initialsFor(c.title)}
              </span>
              <div className="min-w-0">
                <p className="s-h3 truncate" style={{ fontSize: 13 }}>{c.title}</p>
                <p className="s-meta" style={{ fontSize: 11 }}>
                  {c.module_count ?? 0} modules · {c.language === "both" ? "EN·AR" : (c.language ?? "en").toUpperCase()}
                </p>
              </div>
            </div>
            <span className="s-body" style={{ fontSize: 12 }}>{c.regulatory_framework ?? "—"}</span>
            <span><span className={`s-pill ${pill.cls}`}>{pill.label}</span></span>
            <span className="s-h3" style={{ fontSize: 13 }}>{c.slide_count ?? 0}</span>
            <span className="s-meta" style={{ fontSize: 12 }}>{timeAgo(c.updated_at)}</span>
            <ChevronRight className="h-4 w-4" style={{ color: "var(--s-muted)" }} />
          </Link>
        )
      })}
    </div>
  )
}
