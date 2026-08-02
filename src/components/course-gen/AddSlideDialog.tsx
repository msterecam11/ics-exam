"use client"

// Add-slide picker. Shows a real preview of every master in the course's
// CURRENT theme — rendered with the same component the stage uses — so the
// choice is visual rather than a list of names.

import SlideCanvas, { type Master } from "./SlideCanvas"
import type { ThemeTokens } from "@/lib/course-gen/tokens"
import { SLIDE_W, SLIDE_H } from "@/lib/course-gen/tokens"
import { X } from "lucide-react"

const LABELS: Record<string, string> = {
  cover: "Cover",
  section_divider: "Section divider",
  content_white: "Content (white)",
  content_lightblue: "Content (light blue)",
  summary_dark: "Summary (dark)",
  self_assessment: "Self-assessment",
  closing_cta: "Closing / CTA",
}

const HINTS: Record<string, string> = {
  cover: "Opens a module",
  section_divider: "Module number + title",
  content_white: "The workhorse content slide",
  content_lightblue: "Content on a soft blue wash",
  summary_dark: "Key takeaways, glass cards",
  self_assessment: "Review questions",
  closing_cta: "Feedback / QR — ends the course",
}

const PREVIEW_W = 208

interface Props {
  masters: Record<string, Master>
  tokens: ThemeTokens
  themeName?: string
  moduleNumber?: number
  partnerLogoLight?: string | null
  partnerLogoDark?: string | null
  onPick: (layoutKind: string) => void
  onClose: () => void
}

export default function AddSlideDialog(props: Props) {
  const scale = PREVIEW_W / SLIDE_W
  const keys = Object.keys(props.masters)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(11,43,69,.55)" }} onClick={props.onClose}>
      <div className="s-card s-fade flex flex-col" style={{ maxWidth: 940, width: "100%", maxHeight: "86vh", boxShadow: "0 30px 80px -20px rgba(0,0,0,.5)" }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-start gap-4" style={{ padding: "18px 22px", borderBottom: "1.5px solid var(--s-line)" }}>
          <div className="flex-1 min-w-0">
            <p className="s-h2">Add a slide</p>
            <p className="s-meta" style={{ marginTop: 3 }}>
              Slide masters from <strong style={{ color: "var(--s-ink)" }}>{props.themeName ?? "the current theme"}</strong> —
              the new slide starts with this master&apos;s background, logos and footer already in place.
            </p>
          </div>
          <button onClick={props.onClose} className="s-btn s-btn-ghost" style={{ padding: 8 }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto" style={{ padding: 22 }}>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill,minmax(${PREVIEW_W}px,1fr))` }}>
            {keys.map(k => (
              <button key={k} onClick={() => props.onPick(k)} className="text-left group">
                <div style={{
                  width: "100%", aspectRatio: `${SLIDE_W} / ${SLIDE_H}`,
                  borderRadius: 8, overflow: "hidden",
                  border: "1.5px solid var(--s-line)", position: "relative", background: "#fff",
                  transition: "border-color .15s ease, box-shadow .15s ease",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--s-primary)"; e.currentTarget.style.boxShadow = "0 8px 20px -8px rgba(12,114,198,.6)" }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--s-line)"; e.currentTarget.style.boxShadow = "none" }}>
                  <div style={{
                    transform: `scale(${scale})`, transformOrigin: "top left",
                    width: SLIDE_W, height: SLIDE_H, pointerEvents: "none",
                  }}>
                    <SlideCanvas
                      elements={[]}
                      master={props.masters[k]}
                      tokens={props.tokens}
                      pageNumber={1}
                      moduleNumber={props.moduleNumber}
                      partnerLogoLight={props.partnerLogoLight}
                      partnerLogoDark={props.partnerLogoDark}
                    />
                  </div>
                </div>
                <p className="s-h3" style={{ fontSize: 12.5, marginTop: 8 }}>{LABELS[k] ?? k}</p>
                <p className="s-meta" style={{ fontSize: 11 }}>{HINTS[k] ?? ""}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
