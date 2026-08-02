"use client"

// Coverage check for the outline review.
//
// When a designer pastes a syllabus per module, "did the AI actually cover
// it?" stops being a judgement call: each required point is matched against
// the slides that claim to deliver it, and anything unclaimed is shown as a
// gap — which is exactly the kind of thing the review gate exists to catch.

import { Check, AlertTriangle } from "lucide-react"

interface Props {
  /** Raw syllabus text the designer pasted for this module. */
  coverage: string
  /** The outline's slides for this module. */
  slides: { title: string; covers?: string[] }[]
}

/** Bullet lines only — headings and blank lines aren't requirements. */
export function requiredPoints(coverage: string): string[] {
  return coverage
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 2 && /^[-•*o\d]/.test(l))
}

/** Loose match: the agent may reformat whitespace or drop a leading bullet. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/^[-•*o\d.)\s]+/, "").replace(/\s+/g, " ").trim()
}

export default function CoverageCheck({ coverage, slides }: Props) {
  const points = requiredPoints(coverage)
  if (points.length === 0) return null

  const claimed = slides.flatMap(s => (s.covers ?? []).map(c => ({ text: normalise(c), slide: s.title })))

  const rows = points.map(p => {
    const key = normalise(p)
    const hits = claimed.filter(c => c.text === key || c.text.includes(key) || key.includes(c.text))
    return { point: p, slides: [...new Set(hits.map(h => h.slide))] }
  })

  const missing = rows.filter(r => r.slides.length === 0)

  return (
    <div style={{
      marginTop: 8, borderRadius: 8, overflow: "hidden",
      border: `1.5px solid ${missing.length ? "#F5D89B" : "#CDE9D8"}`,
    }}>
      <div className="flex items-center gap-2" style={{
        padding: "8px 12px",
        background: missing.length ? "#FDF7EA" : "#F0F9F3",
      }}>
        {missing.length
          ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "#8a6412" }} />
          : <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "#1F7A44" }} />}
        <p style={{ fontSize: 11.5, fontWeight: 700, color: missing.length ? "#8a6412" : "#1F7A44" }}>
          {missing.length
            ? `${missing.length} of ${points.length} required points not covered`
            : `All ${points.length} required points covered`}
        </p>
      </div>

      <div style={{ background: "#fff" }}>
        {rows.map((r, i) => (
          <div key={i} className="flex items-start gap-2"
            style={{ padding: "6px 12px", borderTop: i === 0 ? "none" : "1px solid var(--s-line-soft)" }}>
            {r.slides.length
              ? <Check className="h-3 w-3 shrink-0" style={{ color: "#1F7A44", marginTop: 3 }} />
              : <AlertTriangle className="h-3 w-3 shrink-0" style={{ color: "#C05252", marginTop: 3 }} />}
            <div className="min-w-0 flex-1">
              <p style={{ fontSize: 11.5, color: r.slides.length ? "var(--s-body)" : "#C05252", lineHeight: 1.45 }}>
                {r.point}
              </p>
              {r.slides.length > 0 && (
                <p className="s-meta" style={{ fontSize: 10.5, marginTop: 1 }}>
                  {r.slides.join(" · ")}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {missing.length > 0 && (
        <p style={{ padding: "8px 12px", fontSize: 11, color: "#8a6412", background: "#FDF7EA", lineHeight: 1.5 }}>
          Ask for the gaps in the adjustments box below — e.g. &ldquo;add slides covering the uncovered points in this module&rdquo; — then regenerate.
        </p>
      )}
    </div>
  )
}
