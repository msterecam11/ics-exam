// Few-shot exemplar blueprints — transcribed from ICS's real Module 2 deck.
// These are NOT a closed catalog: the Content Agent composes interiors
// freely from the primitives, anchored by these house-style references so
// slide 12 and slide 19 don't express the same content shape in two
// arbitrarily different ways. Simple shapes may take an exemplar as-is
// (fast path); complex content gets full dynamic composition.

import type { BlueprintNode } from "./primitives"

export interface Exemplar {
  name: string
  when: string // guidance line included in the prompt
  blueprint: BlueprintNode
}

export const EXEMPLARS: Exemplar[] = [
  {
    // Real deck p3 — "Understanding Certification vs. Authorization"
    name: "two-concept comparison with callout and figure",
    when: "Two named concepts contrasted side by side; optional requirement/note callout under one column; supporting figure under the other.",
    blueprint: {
      type: "comparison",
      columns: [
        {
          heading: "CERTIFICATION", icon: "airplane-takeoff", accent: "token:accent-warm",
          children: [
            { type: "body", text: [{ text: "Mandatory for " }, { text: "Civil/Public Aerodromes", bold: true }, { text: " that serve scheduled or non-scheduled commercial air services." }] },
            { type: "callout", tone: "requirement", label: "Requirement Level", text: "Stringent requirements due to commercial aviation role and high passenger volume." },
          ],
        },
        {
          heading: "AUTHORIZATION", icon: "airplane-landing", accent: "token:accent-warm",
          children: [
            { type: "body", text: [{ text: "Required for " }, { text: "General Aviation Aerodromes", bold: true }, { text: ", including private use, flight training, and recreational flying." }] },
            { type: "figure", media: { want: "photo", subject: "general aviation facility with light aircraft", purpose: "illustrate a GA aerodrome" }, caption: "FIG: GENERAL AVIATION FACILITY" },
          ],
        },
      ],
    },
  },
  {
    // Real deck p4 — "Initiating the Authorization Application Process"
    name: "numbered process beside an image",
    when: "A 2-5 step sequential process; each step gets a navy number badge, an orange heading, and body text; a supporting image card on the other side.",
    blueprint: {
      type: "row", weights: [2, 3], gap: "lg",
      children: [
        { type: "figure", media: { want: "photo", subject: "self assessment checklist", purpose: "visualize pre-application self-check" }, shadow: true },
        {
          type: "stack", gap: "md",
          children: [
            { type: "badge-number", n: "01", variant: "navy", heading: "Pre-Application Verification" },
            { type: "body", text: [{ text: "Before submitting, the applicant bears " }, { text: "full responsibility", bold: true }, { text: " for ensuring all requirements are met." }] },
            { type: "badge-number", n: "02", variant: "navy", heading: "Formal Submission" },
            { type: "body", text: "Once compliance is verified, the application must be submitted in a form acceptable to the authority." },
          ],
        },
      ],
    },
  },
  {
    // The badge-number pattern WITHOUT an image. The exemplar above pairs it
    // with a figure, so when imagery was scarce the whole pattern became
    // unreachable and the agent fell back to `flow` every time — badge-number
    // was chosen zero times across a 46-slide deck. A numbered list of named
    // steps does not need a photograph to work.
    name: "numbered steps, full width, no image",
    when: "A 2-4 step sequence of NAMED stages where each stage needs a sentence of explanation. Use this instead of `flow` when the steps carry real prose rather than a few words, and when no photograph is involved.",
    blueprint: {
      type: "stack", gap: "md",
      children: [
        { type: "badge-number", n: "01", variant: "navy", heading: "Pre-Application Verification" },
        { type: "body", text: [{ text: "Before submitting, the applicant bears " }, { text: "full responsibility", bold: true }, { text: " for ensuring all requirements are met." }] },
        { type: "badge-number", n: "02", variant: "navy", heading: "Formal Submission" },
        { type: "body", text: "Once compliance is verified, the application must be submitted in a form acceptable to the authority." },
      ],
    },
  },
  {
    // Second reference pattern: a lead statement, then conditions as icon rows.
    // Distinct from `tag-list` (which pairs each row with a status pill) and
    // from `bullets` (no icons, no row surface).
    name: "lead statement then iconed condition rows",
    when: "A criteria/definition statement followed by 3-5 conditions that must all hold. Each condition gets its own iconed row on a tinted surface. Use when the conditions are parallel requirements rather than a sequence — this is NOT a tag-list (no status pills) and NOT plain bullets (the rows are a surface).",
    blueprint: {
      type: "stack", gap: "md",
      children: [
        { type: "heading", level: 4, text: "Issuance Criteria" },
        { type: "body", text: [{ text: "Authorization is issued when the authority confirms all requirements are met. There must be " }, { text: "no outstanding findings or deviations", bold: true }, { text: " or accepted corrective action plans must be in place." }] },
        { type: "heading", level: 5, text: "Conditions for Validity", icon: "checks", color: "token:accent-warm" },
        {
          type: "alternating-list",
          items: [
            { icon: "arrows-clockwise", text: "Organization maintains continuous compliance" },
            { icon: "magnifying-glass", text: "Provides authority access for inspections" },
            { icon: "file-text", text: "Authorization is not surrendered or revoked" },
            { icon: "prohibit", text: "Authority does not suspend or cancel it" },
          ],
        },
      ],
    },
  },
  {
    // Real deck p7 — "Authorization Issuance and Validity Conditions"
    name: "definition block plus condition list plus status figure",
    when: "A lead definition/criteria statement, then a checklist of conditions as alternating rows, with a status/stamp style figure.",
    blueprint: {
      type: "row", weights: [3, 2], gap: "lg",
      children: [
        {
          type: "stack", gap: "md",
          children: [
            { type: "heading", text: "Issuance Criteria", level: 4, color: "token:primary", accentBar: true },
            { type: "body", text: [{ text: "Authorization is issued when the authority confirms all requirements are met. There must be " }, { text: "no outstanding findings or deviations", bold: true, color: "token:primary" }, { text: " or accepted corrective action plans must be in place." }] },
            { type: "heading", text: "Conditions for Validity", level: 5, color: "token:accent-warm", icon: "checks" },
            { type: "alternating-list", items: [
              { text: "Organization maintains continuous compliance", icon: "arrows-clockwise" },
              { text: "Provides authority access for inspections", icon: "magnifying-glass" },
              { text: "Authorization is not surrendered or revoked", icon: "file-text" },
              { text: "Authority does not suspend or cancel it", icon: "prohibit" },
            ]},
          ],
        },
        { type: "figure", media: { want: "photo", subject: "approval granted stamp", purpose: "signal approved status" }, shadow: true },
      ],
    },
  },
  {
    // Real deck p11 — "The Aerodrome Master Plan as Strategic Foundation"
    name: "categorized sections with colored accents and side figure",
    when: "3-4 labeled aspects of one topic; each gets a colored accent bar + colored heading + short body; optional nested bullets; side figure.",
    blueprint: {
      type: "row", weights: [3, 2], gap: "lg",
      children: [
        {
          type: "stack", gap: "md",
          children: [
            { type: "heading", text: "Strategic Purpose", level: 4, color: "token:accent-warm", accentBar: true, icon: "strategy" },
            { type: "body", text: "The master plan guides all infrastructure development, aligning physical facilities with operational goals." },
            { type: "heading", text: "Key Components", level: 4, color: "token:primary-light", accentBar: true, icon: "list-checks" },
            { type: "bullets", items: ["Schedule of Priorities", "Phased Implementation Plan", "Infrastructure Layouts"] },
            { type: "heading", text: "Dynamic Lifecycle", level: 4, color: "token:success", accentBar: true, icon: "arrows-clockwise" },
            { type: "body", text: "Reviewed periodically to adapt to traffic, technology, and demand." },
          ],
        },
        { type: "figure", media: { want: "illustration", subject: "airport terminal map diagram", purpose: "example master plan artifact" } },
      ],
    },
  },
  {
    // Real deck p14 — "Determining ARC Code Elements"
    name: "two-band comparison with definition callouts",
    when: "Exactly two parallel classification elements; full-width colored header bands (warm then blue) with big numerals, body text, then DEF/IMPACT style callouts.",
    blueprint: {
      type: "row", weights: [1, 1], gap: "lg",
      children: [
        {
          type: "stack", gap: "md",
          children: [
            { type: "badge-number", n: "01", variant: "band-warm", heading: "Code Number" },
            { type: "body", text: [{ text: "Determined by the " }, { text: "Reference Field Length", bold: true }, { text: " — the highest value among aircraft the runway serves." }] },
            { type: "callout", tone: "definition", label: "DEF:", text: "Minimum field length for take-off at max certificated mass, sea level, standard conditions." },
          ],
        },
        {
          type: "stack", gap: "md",
          children: [
            { type: "badge-number", n: "02", variant: "band-blue", heading: "Code Letter" },
            { type: "body", text: [{ text: "Determined by the " }, { text: "Wingspan", bold: true }, { text: " of the largest aeroplane the facility is intended for." }] },
            { type: "callout", tone: "impact", label: "IMPACT:", text: "Directly affects separation distances, taxiway widths, and apron dimensions." },
          ],
        },
      ],
    },
  },
  {
    // Real deck p21 — "Summary and Key Takeaways" (dark master)
    name: "glass summary cards",
    when: "Summary/key-takeaways on the dark master: 3 glass cards side by side (icon + heading + short lines), plus one wide glass card for the core message.",
    blueprint: {
      type: "stack", gap: "lg",
      children: [
        {
          type: "row", weights: [1, 1, 1], gap: "md",
          children: [
            { type: "card", tone: "glass", children: [
              { type: "heading", text: "Authorization", level: 5, icon: "identification-badge" },
              { type: "body", text: "Required when certification criteria aren't met. Valid 5 years, renewable." },
            ]},
            { type: "card", tone: "glass", children: [
              { type: "heading", text: "Design & ARC", level: 5, icon: "compass" },
              { type: "body", text: "Master Plan is the strategic foundation. ARC = Code Number + Code Letter." },
            ]},
            { type: "card", tone: "glass", children: [
              { type: "heading", text: "Establishment", level: 5, icon: "crane-tower" },
              { type: "body", text: "Permission before construction. Build strictly to approved specifications." },
            ]},
          ],
        },
        { type: "card", tone: "glass", children: [
          { type: "heading", text: "Core Responsibility", level: 5, icon: "user-circle-check" },
          { type: "body", text: "The holder retains ultimate responsibility for safety management, reporting, and personnel competence." },
        ]},
      ],
    },
  },
  {
    // Real deck p23 — "Self-Assessment and Preview"
    name: "review question rows",
    when: "Self-assessment slide: 3-4 open review questions as accent-bar rows, with the theme's question-mark graphic.",
    blueprint: {
      type: "row", weights: [3, 1], gap: "lg",
      children: [
        { type: "question-rows", questions: [
          "What is the standard validity period for an Aerodrome Authorization?",
          "Which two parameters determine the Aerodrome Reference Code?",
          "At what stage must permission to establish an aerodrome be obtained?",
        ]},
        { type: "figure", media: { want: "illustration", subject: "3D question mark speech bubble", purpose: "self-assessment visual" } },
      ],
    },
  },
  {
    name: "escalating flow — sequence with rising severity",
    when: "Content is a sequence where position IS meaning — an escalation process, a lifecycle, a growing consequence. Steps read left to right, colour rising in intensity.",
    blueprint: {
      type: "flow", direction: "horizontal", escalate: true,
      steps: [
        { n: "1", heading: "Coaching", body: "Verbal feedback and guidance" },
        { n: "2", heading: "Written Warning", body: "Formal notice, corrective action required" },
        { n: "3", heading: "Penalty", body: "Financial consequence per contract" },
        { n: "4", heading: "Suspension", body: "Temporary halt of activities" },
        { n: "5", heading: "Termination", body: "Contract ended for cause" },
      ],
    },
  },
  {
    name: "hub-and-satellites — one concept surrounded by related items",
    when: "One central regulation, role, or system with several distinct related things attached to it — none of which are steps in a sequence, they're all simply connected to the hub.",
    blueprint: {
      type: "radial",
      hub: { heading: "Aerodrome Certification", icon: "shield-check" },
      spokes: [
        { heading: "Personnel Licensing", body: "Qualification requirements", icon: "identification-badge" },
        { heading: "Safety Management", body: "SMS integration", icon: "shield-check" },
        { heading: "Emergency Planning", body: "Coordination requirements", icon: "siren" },
        { heading: "Aeronautical Info", body: "NOTAM publication", icon: "map-pin" },
      ],
    },
  },
  {
    name: "tiers — an authority hierarchy",
    when: "Content describes levels of oversight or governance, each level setting direction for the one below it — never a plain enumeration.",
    blueprint: {
      type: "tiers",
      bands: [
        { heading: "STRATEGIC LEADERSHIP", items: ["Safety Policy", "Resource Allocation", "Accountability"], tone: "token:navy" },
        { heading: "SYSTEM OVERSIGHT", items: ["Performance Monitoring", "Audit & Inspection", "Risk Management"], tone: "token:primary" },
        { heading: "FUNCTIONAL EXECUTION", items: ["Operations", "Maintenance", "Safety"], tone: "token:surface-alt" },
      ],
    },
  },
]

/** Compact rendering of exemplars for the generation prompt. */
export function exemplarPromptBlock(): string {
  return EXEMPLARS.map(e =>
    `### ${e.name}\nUse when: ${e.when}\n\`\`\`json\n${JSON.stringify(e.blueprint)}\n\`\`\``
  ).join("\n\n")
}
