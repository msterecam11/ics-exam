"use client"

// Theme detail — see every slide master rendered from the theme itself,
// edit the palette, and (on non-main themes) replace a master's background.

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowLeft, Loader2, Check, Upload, Lock, Trash2, BookOpen,
} from "lucide-react"
import SlideCanvas, { type Master } from "@/components/course-gen/SlideCanvas"
import { SLIDE_W, SLIDE_H, type ThemeTokens } from "@/lib/course-gen/tokens"

const LABELS: Record<string, string> = {
  cover: "Cover", section_divider: "Section divider",
  content_white: "Content (white)", content_lightblue: "Content (light blue)",
  summary_dark: "Summary (dark)", self_assessment: "Self-assessment",
  closing_cta: "Closing / CTA",
}

const EDITABLE_COLORS = [
  ["primary", "Primary"], ["primary-dark", "Primary dark"], ["primary-light", "Primary light"],
  ["navy", "Heading navy"], ["accent-warm", "Warm accent"], ["danger", "Danger"],
  ["success", "Success"], ["tab-yellow", "Tab yellow"],
]

const PREVIEW_W = 300

export default function ThemeDetailPage() {
  const { themeId } = useParams<{ themeId: string }>()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const load = useCallback(async () => {
    const d = await fetch(`/api/course-gen/themes/${themeId}`).then(r => r.json())
    setData(d)
  }, [themeId])
  useEffect(() => { load() }, [load])

  async function saveColor(key: string, value: string) {
    setSaving(true)
    const res = await fetch(`/api/course-gen/themes/${themeId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colors: { [key]: value } }),
    })
    setSaving(false)
    if (!res.ok) { toast.error("Could not save that colour"); return }
    load()
  }

  async function uploadBackground(master: string, file: File, tone: string) {
    setUploading(master)
    const fd = new FormData()
    fd.append("file", file); fd.append("master", master); fd.append("tone", tone)
    const res = await fetch(`/api/course-gen/themes/${themeId}/background`, { method: "POST", body: fd })
    setUploading(null)
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      toast.error(e.error ?? "Upload failed"); return
    }
    toast.success("Background replaced — every slide using this master repaints")
    load()
  }

  async function deleteTheme() {
    if (!confirm("Delete this theme?")) return
    const res = await fetch(`/api/course-gen/themes/${themeId}`, { method: "DELETE" })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      toast.error(e.error ?? "Could not delete"); return
    }
    toast.success("Theme deleted"); router.push("/studio/themes")
  }

  if (!data) {
    return <div className="flex justify-center" style={{ padding: 60 }}>
      <div className="s-spin" style={{ width: 44, height: 44, borderRadius: "50%", border: "4px solid var(--s-line)", borderTopColor: "var(--s-primary)" }} />
    </div>
  }
  if (data.error) {
    return <p className="s-body text-center" style={{ padding: 60 }}>{data.error}</p>
  }

  const theme = data.theme
  const tokens: ThemeTokens = theme.tokens
  const masters: Record<string, Master> = theme.layout_templates ?? {}
  const colors: Record<string, string> = tokens?.colors ?? {}
  const scale = PREVIEW_W / SLIDE_W
  const locked = theme.is_main

  return (
    <div className="s-fade" style={{ maxWidth: 1160, margin: "0 auto" }}>
      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap" style={{ marginBottom: 20 }}>
        <Link href="/studio/themes" style={{ color: "var(--s-muted)", marginTop: 6 }}><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
            {locked
              ? <span className="s-pill s-pill-info"><Lock className="h-3 w-3" /> Main theme — protected</span>
              : <span className="s-pill s-pill-neutral">Variant</span>}
            {saving && <span className="s-meta flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> saving</span>}
          </div>
          <h1 className="s-h1">{theme.name}</h1>
          <p className="s-body" style={{ marginTop: 4 }}>
            {Object.keys(masters).length} slide masters · used by {data.courses?.length ?? 0} course{data.courses?.length === 1 ? "" : "s"}
          </p>
        </div>
        {!locked && (
          <button onClick={deleteTheme} className="s-btn s-btn-ghost" style={{ padding: 9 }} title="Delete theme">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {locked && (
        <div className="s-card" style={{ padding: "13px 18px", marginBottom: 18, background: "#FDF7EA", borderColor: "#F5D89B" }}>
          <p style={{ fontSize: 12.5, color: "#8a6412", lineHeight: 1.6 }}>
            This is ICS&apos;s master theme, reconstructed from the real course deck — it stays read-only so the house style can&apos;t
            drift. To make a client-specific look, create a new theme from it: the masters carry over, and you change colours and artwork on the copy.
          </p>
        </div>
      )}

      {/* Palette */}
      <div className="s-card" style={{ padding: "18px 20px", marginBottom: 18 }}>
        <p className="s-label" style={{ marginBottom: 12 }}>Palette</p>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))" }}>
          {EDITABLE_COLORS.map(([key, label]) => (
            <div key={key} className="flex items-center gap-2.5">
              <input type="color" value={colors[key] ?? "#000000"} disabled={locked}
                onChange={e => saveColor(key, e.target.value)}
                style={{ width: 34, height: 34, borderRadius: 8, border: "1.5px solid var(--s-line)", background: "none", cursor: locked ? "not-allowed" : "pointer", padding: 2 }} />
              <div className="min-w-0">
                <p className="s-h3" style={{ fontSize: 12 }}>{label}</p>
                <p className="s-meta" style={{ fontSize: 10.5, fontFamily: "ui-monospace, monospace" }}>{colors[key]}</p>
              </div>
            </div>
          ))}
        </div>
        {!locked && (
          <p className="s-meta" style={{ fontSize: 11.5, marginTop: 12 }}>
            Colours are tokens — slides reference them by name, so a change here repaints every slide that uses this theme.
          </p>
        )}
      </div>

      {/* Masters */}
      <p className="s-label" style={{ marginBottom: 10 }}>Slide masters</p>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill,minmax(${PREVIEW_W}px,1fr))`, marginBottom: 20 }}>
        {Object.keys(masters).map(k => {
          const m = masters[k]
          const zoneNames = (m.zones ?? []).map(z => z.name)
          return (
            <div key={k} className="s-card overflow-hidden">
              <div style={{ width: "100%", aspectRatio: `${SLIDE_W} / ${SLIDE_H}`, overflow: "hidden", position: "relative", background: "#fff", borderBottom: "1.5px solid var(--s-line)" }}>
                <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: SLIDE_W, height: SLIDE_H, pointerEvents: "none" }}>
                  <SlideCanvas elements={[]} master={m} tokens={tokens} pageNumber={1} moduleNumber={2} />
                </div>
              </div>
              <div style={{ padding: "12px 14px" }}>
                <div className="flex items-center gap-2">
                  <p className="s-h3 flex-1" style={{ fontSize: 12.5 }}>{LABELS[k] ?? k}</p>
                  <span className="s-pill s-pill-neutral" style={{ fontSize: 9.5, padding: "2px 7px" }}>
                    {m.background?.tone ?? "light"}
                  </span>
                </div>
                <p className="s-meta" style={{ fontSize: 10.5, marginTop: 5 }}>
                  zones: {zoneNames.join(", ") || "—"}
                </p>

                {!locked && (
                  <>
                    <input ref={el => { fileRefs.current[k] = el }} type="file" accept="image/*" className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) uploadBackground(k, f, m.background?.tone ?? "light")
                        e.target.value = ""
                      }} />
                    <button onClick={() => fileRefs.current[k]?.click()} disabled={uploading === k}
                      className="s-btn s-btn-ghost w-full" style={{ marginTop: 10, fontSize: 11.5, padding: "7px 10px" }}>
                      {uploading === k ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Replace background
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Courses using it */}
      {(data.courses ?? []).length > 0 && (
        <div className="s-card" style={{ padding: "16px 18px" }}>
          <p className="s-label" style={{ marginBottom: 10 }}>Courses using this theme</p>
          <div className="flex flex-col gap-2">
            {data.courses.map((c: any) => (
              <Link key={c.id} href={`/studio/courses/${c.id}`} className="flex items-center gap-2.5">
                <BookOpen className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--s-primary)" }} />
                <span className="flex-1 truncate" style={{ fontSize: 12.5, color: "var(--s-body)" }}>{c.title}</span>
                <span className="s-meta" style={{ fontSize: 11 }}>{c.status}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
