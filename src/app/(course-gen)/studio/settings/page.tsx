import { Sparkles, ImageIcon, Cpu, Check, X } from "lucide-react"

// Honest status page: shows what is actually configured on the server rather
// than implying the pipeline is ready when a key is missing.
export default function StudioSettingsPage() {
  const aiReady = !!process.env.ANTHROPIC_API_KEY
  const imgReady = !!process.env.OPENAI_API_KEY

  const rows = [
    {
      icon: Sparkles, name: "Content, outline & chat",
      detail: `Claude Sonnet · ${process.env.CG_MODEL_CONTENT ?? "claude-sonnet-5"}`,
      ready: aiReady, need: "ANTHROPIC_API_KEY",
    },
    {
      icon: Cpu, name: "QA vision & media scoring",
      detail: `Claude Haiku · ${process.env.CG_MODEL_QA ?? "claude-haiku-4-5"}`,
      ready: aiReady, need: "ANTHROPIC_API_KEY",
    },
    {
      icon: ImageIcon, name: "Image generation (fallback)",
      detail: "Used only when no suitable library image is found",
      ready: imgReady, need: "OPENAI_API_KEY", optional: true,
    },
  ]

  return (
    <div className="s-fade" style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 22 }}>
        <h1 className="s-h1">Settings</h1>
        <p className="s-body" style={{ marginTop: 4 }}>
          Per-course options (theme, client logo, language) live in the Create wizard. This page reports what the server can actually run.
        </p>
      </div>

      <div className="s-card overflow-hidden" style={{ marginBottom: 18 }}>
        <div style={{ padding: "13px 18px", background: "var(--s-surface-soft2)", borderBottom: "1.5px solid var(--s-line)" }}>
          <p className="s-label">Pipeline configuration</p>
        </div>
        {rows.map((r, i) => (
          <div key={r.name} className="flex items-center gap-3"
            style={{ padding: "14px 18px", borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--s-line-soft)" }}>
            <span className="shrink-0 flex items-center justify-center"
              style={{ width: 34, height: 34, borderRadius: 9, background: "var(--s-tint)" }}>
              <r.icon className="h-4 w-4" style={{ color: "var(--s-primary)" }} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="s-h3">{r.name}</p>
              <p className="s-meta" style={{ fontSize: 11.5 }}>{r.detail}</p>
            </div>
            {r.ready ? (
              <span className="s-pill s-pill-ready"><Check className="h-3 w-3" /> Configured</span>
            ) : (
              <span className={`s-pill ${r.optional ? "s-pill-neutral" : "s-pill-warn"}`}>
                <X className="h-3 w-3" /> {r.need}
              </span>
            )}
          </div>
        ))}
      </div>

      {!aiReady && (
        <div className="s-card" style={{ padding: "16px 18px", background: "#FDF7EA", borderColor: "#F5D89B" }}>
          <p className="s-h3" style={{ color: "#8a6412" }}>Generation is not enabled yet</p>
          <p style={{ fontSize: 12.5, color: "#A08048", marginTop: 5, lineHeight: 1.6 }}>
            Add <code style={{ background: "rgba(0,0,0,.06)", padding: "1px 5px", borderRadius: 4 }}>ANTHROPIC_API_KEY</code> to
            the server environment and restart. Until then the Studio is fully browsable, the editor and PDF export work on existing
            slides, and any generation request returns a clear message instead of failing silently.
          </p>
        </div>
      )}
    </div>
  )
}
