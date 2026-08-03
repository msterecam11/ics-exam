// AI narrative bullet lists (strengths / weaknesses / improvements /
// development) render as-is wherever the report shows them. Groq legitimately
// returns an empty array sometimes — a candidate who aced a section can have
// nothing to call a weakness, one who bombed it can have nothing to call a
// strength — but every render site was a bare `.map()`, so an empty array
// meant a titled box with no content underneath: "Weakness Areas" with
// nothing under it, rather than a stated "none found."
//
// Fixed at the data layer, not by touching 34 JSX blocks across 7 report
// surfaces: this always returns at least one line, so every existing `.map()`
// keeps working unchanged and picks up the fallback for free.

export type NarrativeKind = "strengths" | "weaknesses" | "improvements" | "development"

const FALLBACK: Record<NarrativeKind, string> = {
  strengths: "No specific strengths were separately noted for this section.",
  weaknesses: "No specific weaknesses were identified — performance was consistent.",
  improvements: "No specific improvement areas were identified.",
  development: "No additional development action was identified for this section.",
}

export function narrativeItems(items: string[] | undefined | null, kind: NarrativeKind): string[] {
  return Array.isArray(items) && items.length > 0 ? items : [FALLBACK[kind]]
}
