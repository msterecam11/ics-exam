---
name: verifier-slides
description: Render and visually verify course-generator slides without generating a course. Use whenever changing anything under src/lib/course-gen/ — primitives, blueprintHtml, compiler, slideHtml, charts, decor, surface, theme1 — or when asked to check how a slide, primitive, or design change actually looks. Renders real PNGs through the production pipeline for free.
---

# Verifying slide rendering

Changes to the course generator's visual layer are **not verifiable by reading
code**. This system has shipped four separate bugs of the form "built, typechecked,
never rendered": `effects` parsed and discarded, `mask` never exposed, run-level
`color` resolved against an empty fallback, `chart` data never populated. Each one
survived review because the code was correct in isolation.

There is a harness. Use it. A render costs nothing and takes ~10 seconds.

## Render a fixture

The dev server must be running (`preview_start` with the `dev` config — never
`npm run dev` via Bash).

```bash
curl -s -X POST http://localhost:3000/api/course-gen/harness \
  -H "Content-Type: application/json" -d '{"fixture":"flow-horizontal"}'
```

PNGs land in `.harness/out/<name>.png` (gitignored). **Read the PNG** — the JSON
response is not the verification, the image is.

- `{"all":true}` renders every fixture (~10s each, sequential by design)
- `{"fixture":"…","qa":true}` also runs the vision reviewer. This is the only
  option here that costs money (one Haiku vision call). Use it to calibrate a
  rubric or threshold change against real renders — never guess a threshold,
  the last three were all wrong in the same direction (too strict, firing on
  things the design agent could not act on)
- `{"blueprint":{...},"master":"content_white","title":"…"}` renders an ad-hoc
  blueprint without adding a fixture — use while iterating on a shape
- `GET` the same URL lists available fixtures

## Snapshot diffing — read this before dismissing a `changed`

Every fixture has a **committed** reference image in `.harness/baseline/`. Each
render is compared against it and the result comes back as `diff`:

| status | meaning |
|---|---|
| `match` | pixel-identical within the noise floor — nothing moved |
| `changed` | **something you did moved pixels.** A `<name>.diff.png` is written; open it |
| `new` | no baseline for this fixture yet (a fixture you just added) |
| `size-mismatch` | the slide's dimensions changed — almost never intentional |

`changed` is information, not a failure. Half this codebase's visual work
*should* change pixels. The question it answers is **"did it change only what I
meant to change?"** — which is the one thing reading a diff cannot tell you. A
`changed` on a fixture unrelated to your edit is the finding.

After confirming the new renders are correct, promote them:

```bash
curl -s -X POST http://localhost:3000/api/course-gen/harness \
  -H "Content-Type: application/json" -d '{"all":true,"snapshot":true}'
```

**Never snapshot to make a diff go away.** A baseline records whatever the code
does at that moment, bug included, and then defends it as correct forever after.
Snapshot only once you have looked at the PNG and decided it is right.

## What the response tells you

`overflow` / `underfill` are what the production pipeline currently decides.
`probe` is a read-only geometry report — top/bottom gap, band occupancy, distinct
font sizes, left-edge spread, overlaps. It gates nothing; it is there so a layout
complaint can be stated as a number instead of an impression.

Treat a `probe.notes` entry as a lead, not a verdict. Some are known to
false-positive: `Ragged: N distinct left edges` fires on any centred multi-column
layout, where varying left edges are correct.

## Adding a fixture

`src/lib/course-gen/harness/fixtures.ts`.

- **Hand-write it.** A blueprint copied from a real generation drifts with the
  agent's taste; the fixture is meant to test the *primitive*.
- **Keep content short and obviously synthetic.** This tests layout. Real prose
  invites arguing about wording instead of looking at the picture.
- **Reproduce a bug before fixing it.** Add a `bug-*` fixture that shows the
  defect, confirm it renders wrong, then fix. That fixture becomes both the proof
  and the regression guard.

## The rule

Any change under `src/lib/course-gen/` that could alter what a slide looks like
gets rendered before it is called done, and the before/after PNGs are what gets
reported — not a description of the diff.

`npx tsc --noEmit` is necessary and not sufficient. Every one of the four bugs
above typechecked cleanly.

## Parity

Three surfaces must paint identically: `blueprintHtml.ts` (measurement),
`slideHtml.ts` (PDF + QA screenshot), `SlideCanvas.tsx` (editor). The harness
exercises the first two. **A visual change touching only one of the three is a
bug in progress** — this is exactly how the bullets primitive broke. Shared
resolution lives in `surface.ts` and `charts.ts`; put new mapping there rather
than duplicating it per surface.
