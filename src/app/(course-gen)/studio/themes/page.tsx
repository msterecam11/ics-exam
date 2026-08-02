import { db } from "@/lib/db"
import { Palette, Check } from "lucide-react"

const MASTER_LABELS: Record<string, string> = {
  cover: "Cover", section_divider: "Section divider",
  content_white: "Content (white)", content_lightblue: "Content (light blue)",
  summary_dark: "Summary (dark)", self_assessment: "Self-assessment",
  closing_cta: "Closing / CTA",
}

export default async function StudioThemesPage() {
  const { data: themes } = await db
    .from("cg_themes")
    .select("id, name, is_main, tokens, layout_templates, created_at")
    .order("created_at")

  return (
    <div className="s-fade" style={{ maxWidth: 1160, margin: "0 auto" }}>
      <div style={{ marginBottom: 22 }}>
        <h1 className="s-h1">Themes</h1>
        <p className="s-body" style={{ marginTop: 4 }}>
          Slide masters, brand tokens and layout zones. Every course binds to one theme — chrome renders from it, so swapping a theme repaints every slide.
        </p>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(390px,1fr))" }}>
        {(themes ?? []).map((t: any) => {
          const masters = Object.keys(t.layout_templates ?? {})
          const colors: Record<string, string> = t.tokens?.colors ?? {}
          return (
            <div key={t.id} className="s-card overflow-hidden">
              <div style={{ height: 74, background: `linear-gradient(135deg,${colors.primary ?? "#0C72C6"},${colors["primary-dark"] ?? "#045089"})`, position: "relative" }}>
                <Palette className="h-5 w-5" style={{ position: "absolute", left: 18, top: 16, color: "rgba(255,255,255,.85)" }} />
                {t.is_main && (
                  <span className="s-pill" style={{ position: "absolute", right: 14, top: 14, background: "rgba(255,255,255,.92)", color: "#0C72C6" }}>
                    <Check className="h-3 w-3" /> Main theme
                  </span>
                )}
              </div>

              <div style={{ padding: "14px 18px 16px" }}>
                <p className="s-h2" style={{ fontSize: 15 }}>{t.name}</p>

                <p className="s-label" style={{ marginTop: 13, marginBottom: 7 }}>Palette</p>
                <div className="flex gap-1.5 flex-wrap">
                  {["primary", "primary-dark", "primary-light", "navy", "accent-warm", "danger", "success", "tab-yellow"].map(k =>
                    colors[k] ? (
                      <span key={k} title={`${k} · ${colors[k]}`}
                        style={{ width: 26, height: 26, borderRadius: 7, background: colors[k], border: "1.5px solid rgba(0,0,0,.06)" }} />
                    ) : null)}
                </div>

                <p className="s-label" style={{ marginTop: 14, marginBottom: 7 }}>{masters.length} slide masters</p>
                <div className="flex gap-1.5 flex-wrap">
                  {masters.map(m => (
                    <span key={m} className="s-pill s-pill-neutral" style={{ fontSize: 10.5, padding: "3px 9px" }}>
                      {MASTER_LABELS[m] ?? m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
