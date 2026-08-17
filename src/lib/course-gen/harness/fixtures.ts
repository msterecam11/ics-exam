// Render-harness fixtures — hand-written blueprints, one per primitive.
//
// These exist so a primitive can be SEEN without generating a course. Every
// visual bug found so far reached us the same way: a paid generation, a
// screenshot from the user, and a diagnosis after the fact. A fixture is the
// same slide for free, in seconds, before anything ships.
//
// Rules for adding one:
//  - Hand-write it. A fixture captured from a real generation drifts with the
//    agent's taste; a hand-written one tests the PRIMITIVE, which is what we
//    actually change.
//  - Keep the content short and obviously synthetic. This is a rendering
//    test, not a content sample — real prose invites arguing about wording
//    instead of looking at the layout.
//  - When a visual bug is found, add a fixture that REPRODUCES it before
//    fixing it (see the `bug-*` entries). That fixture is then the proof the
//    fix worked, and the guard that it stays fixed.

import type { BlueprintNode, DecorSpec } from "../primitives"

export interface Fixture {
  /** Which master to compose inside. */
  master: "content_white" | "content_lightblue" | "summary_dark" | "self_assessment" | "closing_cta"
  title: string
  blueprint: BlueprintNode
  decor?: DecorSpec
  /** Why this fixture exists — shown in the harness index. */
  note?: string
}

const lorem = {
  short: "Determined by the critical aeroplane in normal use.",
  med: "The first responding vehicle must reach the point of need and discharge agent at not less than 50% of the specified rate.",
}

export const FIXTURES: Record<string, Fixture> = {
  // ── Containers & text ──────────────────────────────────────────────────
  "text-hierarchy": {
    master: "content_white",
    title: "Text Hierarchy",
    note: "Baseline for the typography audit — how many distinct sizes actually render?",
    blueprint: {
      type: "stack", gap: "md",
      children: [
        { type: "heading", text: "Heading level 2", level: 2, eyebrow: "EYEBROW LABEL", accentBar: true },
        { type: "body", text: "A standfirst line, set at lead size to frame what follows.", size: "lead" },
        { type: "heading", text: "Heading level 4", level: 4 },
        { type: "body", text: lorem.med },
        { type: "body", text: "FIG 1.1: a caption, at the small step.", size: "caption" },
        { type: "body", text: [{ text: "Body with " }, { text: "bold", bold: true }, { text: " and " }, { text: "a highlight", highlight: "token:tab-yellow" }] },
      ],
    } as BlueprintNode,
  },

  "row-asymmetric": {
    master: "content_white",
    title: "Asymmetric Row (weights 1:3)",
    note: "Narrow rail beside a wide main column.",
    blueprint: {
      type: "row", gap: "lg", weights: [1, 3],
      children: [
        { type: "stat", value: "9 min", label: "response ceiling" },
        { type: "stack", gap: "sm", children: [
          { type: "heading", text: "Main Column", level: 4 },
          { type: "body", text: lorem.med },
        ] },
      ],
    } as BlueprintNode,
  },

  // ── Relationship primitives ────────────────────────────────────────────
  "flow-horizontal": {
    master: "content_white",
    title: "Flow — Horizontal, Numbered",
    blueprint: {
      type: "flow", direction: "horizontal", marker: "text",
      steps: [
        { n: "01", heading: "Detection", body: "Emergency detected and notified." },
        { n: "02", heading: "Turnout", body: "Crews don gear and mobilise." },
        { n: "03", heading: "Travel", body: "Vehicles route to the incident." },
      ],
    } as BlueprintNode,
  },

  "flow-escalate": {
    master: "content_lightblue",
    title: "Flow — Escalating Severity",
    note: "Green→red ramp; text must invert on the filled steps.",
    blueprint: {
      type: "flow", direction: "horizontal", escalate: true,
      steps: [
        { n: "1", heading: "Local Standby", body: "Defect suspected; normal landing expected." },
        { n: "2", heading: "Full Emergency", body: "Danger of an accident; all resources activate." },
        { n: "3", heading: "Aircraft Accident", body: "Accident at or near the aerodrome." },
      ],
    } as BlueprintNode,
  },

  "flow-circle-marker": {
    master: "content_white",
    title: "Flow — Circle Markers",
    blueprint: {
      type: "flow", direction: "horizontal", marker: "circle",
      style: { fill: "tinted", corner: "round", accent: "token:primary" },
      steps: [
        { n: "1", heading: "Assess", body: "Identify the critical aeroplane." },
        { n: "2", heading: "Match", body: "Length and width against the bands." },
        { n: "3", heading: "Assign", body: "Category and required resources." },
      ],
    } as BlueprintNode,
  },

  "radial": {
    master: "content_white",
    title: "Radial — Hub and Satellites",
    blueprint: {
      type: "radial",
      hub: { heading: "RFFS Readiness", icon: "shield-check" },
      spokes: [
        { heading: "Vehicles", body: "Scaled to aerodrome category." },
        { heading: "Agents", body: "Principal and complementary." },
        { heading: "Personnel", body: "Crewed every shift." },
      ],
    } as BlueprintNode,
  },

  "tiers": {
    master: "content_white",
    title: "Tiers — Stacked Bands",
    blueprint: {
      type: "tiers",
      style: { fill: "tinted", corner: "soft", elevation: "raised" },
      bands: [
        { heading: "INCIDENT COMMANDER", tone: "token:navy", items: ["Tactical authority at the scene", "Directs agent application"] },
        { heading: "REPORTING LINES", tone: "token:primary-light", items: ["RFFS ↔ Air Traffic Control", "RFFS ↔ Aerodrome Operator"] },
        { heading: "EXTERNAL SERVICES", tone: "token:surface-alt", items: ["Police", "Ambulance", "Municipal Fire"] },
      ],
    } as BlueprintNode,
  },

  "stat-equation": {
    master: "content_white",
    title: "Stat Equation — Terms Resolving to One Outcome",
    blueprint: {
      type: "stat-equation",
      style: { fill: "tinted", accent: "token:accent-warm", corner: "soft" },
      terms: [
        { label: "Category", sublabel: "Set by the critical aeroplane" },
        { label: "Response Time", sublabel: "To any runway point" },
        { label: "Agents", sublabel: "Sized to category" },
      ],
      result: { label: "Effective Response", sublabel: "Coordinated capability" },
    } as BlueprintNode,
  },

  // The GSE deck put a left rail through the first characters of whatever led
  // the slide on three separate pages, and no fixture exercised decor.edge, so
  // nothing caught it. The rail belongs in the gutter, clear of the column.
  "bug-decor-edge-rail": {
    master: "content_white",
    title: "Decor Rail Beside the Content Column",
    note: "BUG REPRO — the left rail must sit in the margin, NOT strike through the eyebrow/heading text.",
    decor: { edge: "left", accent: "token:primary-light" },
    blueprint: {
      type: "stack",
      gap: "sm",
      children: [
        { type: "heading", level: 6, text: "COMPLIANCE REPORT WORKFLOW", color: "token:primary-light" },
        { type: "heading", level: 2, text: "Three Decisions Close the Report" },
        { type: "body", text: "The rail is decoration. It must never share an x-coordinate with the text column beside it." },
      ],
    } as BlueprintNode,
  },

  // Long labels wrap to three lines and used to collide with their own
  // sublabel. The stat-equation fixture above has short labels and never
  // reproduced it.
  "bug-stat-equation-wrap": {
    master: "content_white",
    title: "Stat Equation — Long Labels That Wrap",
    note: "BUG REPRO — 3-line term labels must not overlap their sublabels or spill past the box.",
    blueprint: {
      type: "stat-equation",
      style: { fill: "tinted", accent: "token:primary", corner: "soft" },
      terms: [
        { label: "Regulatory Framework Baseline", sublabel: "Applies across every operating station" },
        { label: "Recordkeeping Discipline", sublabel: "Retained, accessible, owned" },
        { label: "Reporting Timeliness", sublabel: "Notification through correction" },
      ],
      result: { label: "One Integrated Compliance Responsibility", sublabel: "Supervisors and technicians jointly accountable" },
    } as BlueprintNode,
  },

  "quote-banner": {
    master: "content_white",
    title: "Quote Banner",
    blueprint: {
      type: "quote-banner",
      text: "The first responding vehicle must reach any point of the runway within the mandated time.",
      attribution: "ICAO Annex 14 Volume I",
    } as BlueprintNode,
  },

  "band": {
    master: "content_white",
    title: "Band — Full-bleed Takeaway",
    blueprint: {
      type: "stack", gap: "lg",
      children: [
        { type: "body", text: lorem.med },
        { type: "band", icon: "flag", text: "Each element builds on the last — category sets resources, resources support response time." },
      ],
    } as BlueprintNode,
  },

  "tag-list": {
    master: "content_white",
    title: "Tag List",
    blueprint: {
      type: "tag-list",
      items: [
        { label: "Response time within limit", tag: "LEADING", tone: "success" },
        { label: "Agent quantity at minimum", tag: "WATCH", tone: "warning" },
        { label: "One vehicle unavailable", tag: "LAGGING", tone: "danger" },
      ],
    } as BlueprintNode,
  },

  // The agent reaches for tag-list on plain enumerations that have no
  // per-item status and leaves `tag` unset. Baking esc(undefined) printed the
  // literal word "undefined" on three slides. The fixture above tags every
  // item, so it never covered this.
  "bug-tag-list-untagged": {
    master: "content_white",
    title: "Tag List — Items With No Tag",
    note: "BUG REPRO — untagged items must render as plain rows, NEVER the literal text 'undefined'.",
    blueprint: {
      type: "tag-list",
      items: [
        { label: "Duplicate-key checks" },
        { label: "Record-count reconciliation" },
        { label: "Trend outlier analysis", tag: "SAMPLED", tone: "neutral" },
        { label: "Periodic manual sampling" },
      ],
    } as BlueprintNode,
  },

  // A 2x2 tile grid: row-2 tiles landed on row-1 body text because the body
  // spans re-wrapped a line taller at render than they measured. The
  // single-row icon-tiles fixture has nothing below it to collide with.
  "bug-icon-tile-grid": {
    master: "content_white",
    title: "Icon Tiles — Two-Row Grid",
    note: "BUG REPRO — row-2 tiles must not overlap row-1 body text.",
    blueprint: {
      type: "row", gap: "lg",
      children: [
        {
          type: "col", gap: "lg",
          children: [
            { type: "icon-tile", icon: "user-focus", heading: "Human Factors & Fatigue", body: "Extended shifts and complacency during repetitive turnarounds reduce awareness of moving equipment." },
            { type: "icon-tile", icon: "wrench", heading: "Equipment Malfunction", body: "Deferred maintenance, worn brakes, faulty lighting and inoperative reverse alarms on tugs." },
          ],
        },
        {
          type: "col", gap: "lg",
          children: [
            { type: "icon-tile", icon: "megaphone", heading: "Poor Ramp Communication", body: "Missing hand signals, radio lapses and unclear marshaller-to-driver coordination during pushback." },
            { type: "icon-tile", icon: "cloud", heading: "Environmental & Weather", body: "Low visibility, wet apron surfaces, high winds and inadequate lighting during night operations." },
          ],
        },
      ],
    } as BlueprintNode,
  },

  // The agent states the unit inside the title AND in `unit`, so the axis read
  // "Incidents per 1,000 Turnarounds (per 1,000 Turnarounds)". bug-chart-bare
  // parenthesises its unit, so it never reproduced the doubling.
  "bug-chart-unit-echo": {
    master: "content_white",
    title: "Chart — Unit Already Stated in the Axis Title",
    note: "BUG REPRO — the unit must appear ONCE on the y-axis, not doubled.",
    blueprint: {
      type: "chart",
      chartType: "line",
      unit: "per 1,000 turnarounds",
      yTitle: "Incidents per 1,000 turnarounds",
      xTitle: "Reporting period",
      data: {
        labels: ["2022", "2023", "2024"],
        datasets: [
          { label: "Station rate", data: [5.8, 5.0, 4.6] },
          { label: "Industry benchmark", data: [4.0, 4.0, 4.0] },
        ],
      },
    } as BlueprintNode,
  },

  // ── Fact primitives ────────────────────────────────────────────────────
  "icon-tiles": {
    master: "content_white",
    title: "Icon Tiles — Card Grid With Anchors",
    blueprint: {
      type: "row", gap: "md",
      children: [
        { type: "icon-tile", icon: "shield-check", heading: "Category", body: "Set by the critical aeroplane." },
        { type: "icon-tile", icon: "clock", heading: "Response", body: "Measured to any runway point." },
        { type: "icon-tile", icon: "fire-extinguisher", heading: "Agents", body: "Principal and complementary." },
      ],
    } as BlueprintNode,
  },

  "meter": {
    master: "content_white",
    title: "Meter — Labelled Proportions",
    blueprint: {
      type: "meter",
      items: [
        { label: "Category 6 compliance", value: 72, max: 100, caption: "72%" },
        { label: "Category 7 compliance", value: 91, max: 100, caption: "91%" },
        { label: "Category 8 compliance", value: 54, max: 100, caption: "54%" },
      ],
    } as BlueprintNode,
  },

  "comparison": {
    master: "content_white",
    title: "Comparison — Two Columns",
    blueprint: {
      type: "comparison",
      columns: [
        { heading: "PRINCIPAL AGENT", icon: "fire-extinguisher", accent: "token:primary", children: [
          { type: "body", text: "Knocks down the main fuel fire and opens the escape path." },
        ] },
        { heading: "COMPLEMENTARY", icon: "shield-check", accent: "token:accent-warm", children: [
          { type: "body", text: "Extinguishes residual pockets and guards against re-ignition." },
        ] },
      ],
    } as BlueprintNode,
  },

  "table": {
    master: "content_white",
    title: "Table",
    blueprint: {
      type: "table", headerRow: true,
      rows: [
        { cells: [{ text: "Category" }, { text: "Length (m)" }, { text: "Width (m)" }] },
        { cells: [{ text: "Cat 6" }, { text: "24–28" }, { text: "5" }] },
        { cells: [{ text: "Cat 7" }, { text: "28–39" }, { text: "5" }] },
        { cells: [{ text: "Cat 8" }, { text: "39–49" }, { text: "7" }] },
      ],
    } as BlueprintNode,
  },

  "callout-figure": {
    master: "content_white",
    title: "Callout Beside a Figure",
    note: "Figure has no URL in the harness (media step never runs) — expect the empty-image box.",
    blueprint: {
      type: "row", gap: "lg", weights: [3, 2],
      children: [
        { type: "callout", tone: "requirement", label: "REGULATORY BASIS", text: "ICAO Annex 14 Volume I and GACAR Part 139 §139.223." },
        { type: "figure", media: { want: "photo", subject: "airport fire appliance", purpose: "ground the subject" }, caption: "FIG: RFFS VEHICLE" },
      ],
    } as BlueprintNode,
  },

  "hero-stat": {
    master: "content_white",
    title: "Hero Stat",
    blueprint: {
      type: "stack", gap: "md",
      children: [
        { type: "stat", value: "3 min", label: "response time to any runway point", size: "hero" },
        { type: "body", text: lorem.short },
      ],
    } as BlueprintNode,
  },

  // ── Dark master ────────────────────────────────────────────────────────
  "dark-summary": {
    master: "summary_dark",
    title: "Summary on a Dark Master",
    note: "Every text run must invert; cards should read as glass.",
    blueprint: {
      type: "stack", gap: "md",
      children: [
        { type: "heading", text: "Four Requirements, One Capability", level: 3 },
        { type: "row", gap: "md", children: [
          { type: "card", tone: "glass", children: [{ type: "body", text: "Category" }] },
          { type: "card", tone: "glass", children: [{ type: "body", text: "Response Time" }] },
          { type: "card", tone: "glass", children: [{ type: "body", text: "Agents" }] },
        ] },
      ],
    } as BlueprintNode,
  },

  // ── Charts ─────────────────────────────────────────────────────────────
  "bug-chart-bare": {
    master: "content_lightblue",
    title: "RFFS Category Table: Length and Width Bands",
    note: "Captioned axis + units. Was: bare numbers against an unlabelled axis.",
    blueprint: {
      type: "chart", chartType: "bar",
      unit: "m", xTitle: "Maximum aeroplane length", yTitle: "RFFS category",
      data: {
        labels: ["Cat 1", "Cat 2", "Cat 3", "Cat 4", "Cat 5", "Cat 6", "Cat 7", "Cat 8", "Cat 9", "Cat 10"],
        datasets: [{ label: "Max length", data: [9, 12, 18, 24, 28, 39, 49, 61, 76, 90] }],
      },
    } as BlueprintNode,
  },

  "chart-donut": {
    master: "content_white",
    title: "Chart — Donut",
    blueprint: {
      type: "chart", chartType: "donut",
      data: { labels: ["Foam", "Dry powder", "Clean gas"], datasets: [{ label: "Agent split", data: [60, 25, 15] }] },
    } as BlueprintNode,
  },

  // ── Known-bug reproductions ────────────────────────────────────────────
  "bug-decor-over-tiers": {
    master: "content_white",
    title: "Command Structure and Reporting Lines",
    note: "BUG REPRO — decor icon shows through the gaps BETWEEN tier bands as jagged notches.",
    decor: { icon: "tree-structure", accent: "token:primary-light" },
    blueprint: {
      type: "stack", gap: "lg",
      children: [
        { type: "tiers", style: { fill: "tinted", corner: "soft", elevation: "raised" }, bands: [
          { heading: "INCIDENT COMMANDER", tone: "token:navy", items: ["Tactical authority at the scene"] },
          { heading: "REPORTING LINES", tone: "token:primary-light", items: ["RFFS ↔ Air Traffic Control", "RFFS ↔ Aerodrome Operator"] },
          { heading: "EXTERNAL SERVICES", tone: "token:surface-alt", items: ["Police", "Ambulance", "Municipal Fire"] },
        ] },
        { type: "band", icon: "flag", text: "Command is handed over once the emergency is controlled." },
      ],
    } as BlueprintNode,
  },

  "timeline-connectors": {
    master: "content_white",
    title: "Timeline — Connectors With Direction",
    note: "Proves the arrow prop: a real axis with a direction, which no primitive could draw before.",
    blueprint: {
      type: "custom", justification: "a dated axis with direction — no primitive expresses this", aspect: 2.6,
      children: [
        // The axis itself, running the width of the box and pointing forward.
        { kind: "line", x: 2, y: 47, width: 96, height: 3, props: { stroke: "token:primary", arrow: "end" } },
        { kind: "shape", x: 6, y: 40, width: 3.5, height: 14, props: { fill: "token:primary", radius: 20 } },
        { kind: "text", x: 1, y: 20, width: 16, height: 12, props: { text: "Detection", fontSize: 20, color: "token:navy", align: "center" } },
        { kind: "shape", x: 34, y: 40, width: 3.5, height: 14, props: { fill: "token:accent-warm", radius: 20 } },
        { kind: "text", x: 29, y: 62, width: 16, height: 12, props: { text: "Turnout", fontSize: 20, color: "token:navy", align: "center" } },
        { kind: "shape", x: 62, y: 40, width: 3.5, height: 14, props: { fill: "token:primary-light", radius: 20 } },
        { kind: "text", x: 57, y: 20, width: 16, height: 12, props: { text: "Travel", fontSize: 20, color: "token:navy", align: "center" } },
        { kind: "shape", x: 88, y: 40, width: 3.5, height: 14, props: { fill: "token:success", radius: 20 } },
        { kind: "text", x: 83, y: 62, width: 16, height: 12, props: { text: "On scene", fontSize: 20, color: "token:navy", align: "center" } },
      ],
    } as BlueprintNode,
  },

  // ── Negative tests: these MUST fail the linter ─────────────────────────
  // A gate that never fires is indistinguishable from no gate at all. After
  // the relationship-primitive fix every real fixture passes, so these exist
  // purely to prove the rules still bite. If one of them starts passing,
  // the linter has regressed — that is the whole point of keeping them.
  "neg-invisible-text": {
    master: "summary_dark",
    title: "Dark Master, Dark Text",
    note: "MUST FAIL contrast — navy on the dark master is the original invisible-text bug (~1.0:1).",
    blueprint: {
      type: "stack", gap: "md",
      children: [
        { type: "heading", text: "Navy Heading on a Dark Background", level: 3, color: "token:navy" },
        { type: "heading", text: "And a second one, equally invisible", level: 4, color: "token:primary-dark" },
      ],
    } as BlueprintNode,
  },

  "neg-unbalanced": {
    master: "content_white",
    title: "Content Pinned to the Bottom",
    note: "MUST FAIL balance — all ink sits in the lower quarter of the zone.",
    blueprint: {
      type: "custom", justification: "deliberately unbalanced for the linter's negative test", aspect: 2.5,
      children: [
        { kind: "text", x: 2, y: 78, width: 60, height: 12, props: { text: "Everything is down here", fontSize: 24, color: "token:navy" } },
        { kind: "text", x: 2, y: 90, width: 60, height: 8, props: { text: "and the top of the zone is empty", fontSize: 16, color: "token:text" } },
      ],
    } as BlueprintNode,
  },

  "bug-sparse-top-gap": {
    master: "content_white",
    title: "Sparse Slide — Dead Space Above the Content",
    note: "Sparse but correctly centred — the linter should ADVISE on density, not gate.",
    blueprint: {
      type: "stack", gap: "md",
      children: [
        { type: "heading", text: "Two Agents, One Objective", level: 3, accentBar: true },
        { type: "row", gap: "md", children: [
          { type: "card", tone: "plain", children: [{ type: "body", text: "Principal agent — knocks down the fire." }] },
          { type: "card", tone: "plain", children: [{ type: "body", text: "Complementary agent — secures residual pockets." }] },
        ] },
      ],
    } as BlueprintNode,
  },
}

export const FIXTURE_NAMES = Object.keys(FIXTURES).sort()
