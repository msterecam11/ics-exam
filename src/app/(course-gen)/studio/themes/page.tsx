"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Palette, Check, Plus, Loader2, ChevronRight, Copy } from "lucide-react"

const MASTER_LABELS: Record<string, string> = {
  cover: "Cover", section_divider: "Section divider",
  content_white: "Content (white)", content_lightblue: "Content (light blue)",
  summary_dark: "Summary (dark)", self_assessment: "Self-assessment",
  closing_cta: "Closing / CTA",
}

export default function StudioThemesPage() {
  const [themes, setThemes] = useState<any[] | null>(null)
  const [creating, setCreating] = useState<any | null>(null)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)

  async function load() {
    const d = await fetch("/api/course-gen/themes").then(r => r.json()).catch(() => ({ themes: [] }))
    setThemes(d.themes ?? [])
  }
  useEffect(() => { load() }, [])

  async function createVariant() {
    if (!name.trim()) { toast.error("Give the theme a name"); return }
    setBusy(true)
    const res = await fetch("/api/course-gen/themes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), parent_theme_id: creating?.id }),
    })
    setBusy(false)
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      toast.error(e.error ?? "Could not create the theme"); return
    }
    toast.success("Theme created — open it to change colours and backgrounds")
    setCreating(null); setName(""); load()
  }

  if (themes === null) {
    return <div className="flex justify-center" style={{ padding: 60 }}>
      <div className="s-spin" style={{ width: 44, height: 44, borderRadius: "50%", border: "4px solid var(--s-line)", borderTopColor: "var(--s-primary)" }} />
    </div>
  }

  return (
    <div className="s-fade" style={{ maxWidth: 1160, margin: "0 auto" }}>
      <div className="flex items-start gap-4 flex-wrap" style={{ marginBottom: 22 }}>
        <div className="flex-1 min-w-0">
          <h1 className="s-h1">Themes</h1>
          <p className="s-body" style={{ marginTop: 4, maxWidth: 720 }}>
            A theme owns the slide masters: background, the fixed logo/footer/page-number chrome, and the content zones agents write into.
            Courses bind to one theme, and slides render chrome from it — so editing a theme repaints every slide that uses it.
          </p>
        </div>
        <button className="s-btn s-btn-primary" onClick={() => setCreating(themes.find(t => t.is_main) ?? themes[0])}>
          <Plus className="h-4 w-4" /> New theme
        </button>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(390px,1fr))" }}>
        {themes.map((t: any) => {
          const masters = Object.keys(t.layout_templates ?? {})
          const colors: Record<string, string> = t.tokens?.colors ?? {}
          return (
            <Link key={t.id} href={`/studio/themes/${t.id}`} className="s-card overflow-hidden block"
              style={{ transition: "box-shadow .18s ease" }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 10px 28px -14px rgba(11,43,69,.4)" }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "none" }}>
              <div style={{ height: 74, background: `linear-gradient(135deg,${colors.primary ?? "#0C72C6"},${colors["primary-dark"] ?? "#045089"})`, position: "relative" }}>
                <Palette className="h-5 w-5" style={{ position: "absolute", left: 18, top: 16, color: "rgba(255,255,255,.85)" }} />
                {t.is_main
                  ? <span className="s-pill" style={{ position: "absolute", right: 14, top: 14, background: "rgba(255,255,255,.92)", color: "#0C72C6" }}>
                      <Check className="h-3 w-3" /> Main theme
                    </span>
                  : <span className="s-pill" style={{ position: "absolute", right: 14, top: 14, background: "rgba(255,255,255,.85)", color: "#5B7189" }}>
                      <Copy className="h-3 w-3" /> Variant
                    </span>}
              </div>
              <div style={{ padding: "14px 18px 16px" }}>
                <div className="flex items-center gap-2">
                  <p className="s-h2 flex-1 min-w-0 truncate" style={{ fontSize: 15 }}>{t.name}</p>
                  <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--s-muted)" }} />
                </div>
                <div className="flex gap-1.5 flex-wrap" style={{ marginTop: 12 }}>
                  {["primary", "primary-dark", "primary-light", "navy", "accent-warm", "danger", "success", "tab-yellow"].map(k =>
                    colors[k] ? <span key={k} title={`${k} · ${colors[k]}`}
                      style={{ width: 24, height: 24, borderRadius: 7, background: colors[k], border: "1.5px solid rgba(0,0,0,.06)" }} /> : null)}
                </div>
                <p className="s-meta" style={{ fontSize: 11.5, marginTop: 12 }}>
                  {masters.length} slide masters · used by {t.course_count} course{t.course_count === 1 ? "" : "s"}
                </p>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Create dialog */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(11,43,69,.55)" }} onClick={() => setCreating(null)}>
          <div className="s-card s-fade" style={{ maxWidth: 520, width: "100%", padding: 22 }} onClick={e => e.stopPropagation()}>
            <p className="s-h2">New theme</p>
            <p className="s-body" style={{ marginTop: 6, lineHeight: 1.6 }}>
              This copies <strong style={{ color: "var(--s-ink)" }}>{creating.name}</strong>&apos;s slide masters — the zones,
              logo placements and footer stay identical, so every layout the agents know keeps working. You then change the
              colours, and optionally replace each master&apos;s background artwork.
            </p>
            <div style={{ marginTop: 16 }}>
              <label className="s-label block">Theme name</label>
              <input className="s-input" value={name} onChange={e => setName(e.target.value)} autoFocus
                placeholder="e.g. ICS Theme 2 — Riyadh Airports" onKeyDown={e => { if (e.key === "Enter") createVariant() }} />
            </div>
            <div className="flex gap-2" style={{ marginTop: 18 }}>
              <button className="s-btn s-btn-primary flex-1" onClick={createVariant} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create theme
              </button>
              <button className="s-btn s-btn-ghost" onClick={() => setCreating(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="s-card" style={{ padding: "16px 18px", marginTop: 20, background: "var(--s-surface-soft)" }}>
        <p className="s-h3">How new themes work</p>
        <p className="s-body" style={{ marginTop: 6, lineHeight: 1.7 }}>
          Because primitives target <strong style={{ color: "var(--s-ink)" }}>named zones</strong> rather than coordinates, a new
          theme never breaks generation. Change colours only and you get a re-skin; also replace the background artwork per master
          and you get a genuinely different identity — in both cases every existing layout keeps working untouched.
          Moving the zones themselves (a visual master editor) is the one thing still on the roadmap.
        </p>
      </div>
    </div>
  )
}
