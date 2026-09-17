// EM-16 — validating and merging a program's email overrides.
//
// A program's `email_settings` holds only what it actually overrides:
//   { "deadline": { "enabled": false }, "inactive": { "days": 14 } }
// A missing key, or a key without "enabled", follows LMS Settings. Sending
// { "deadline": null } removes the override and goes back to inheriting.

import { PROGRAM_RULES, RULE_BY_CODE, validateKnobs } from "@/lib/lms-email-rules"

export type ProgramEmailSettings = Record<string, Record<string, any>>

export function applyProgramEmailSettings(current: any, incoming: any):
  { value: ProgramEmailSettings } | { error: string } {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming))
    return { error: "Email settings must be an object" }

  const out: ProgramEmailSettings = { ...(current && typeof current === "object" ? current : {}) }

  for (const [code, value] of Object.entries(incoming as Record<string, any>)) {
    const def = RULE_BY_CODE[code]
    if (!def) return { error: `Unknown email "${code}"` }
    if (def.scope !== "program")
      return { error: `"${def.em} ${def.label}" is set once for the whole LMS, not per program` }

    // null / {} → stop overriding, inherit again.
    if (value === null || value === undefined) { delete out[code]; continue }
    if (typeof value !== "object" || Array.isArray(value))
      return { error: `Setting for "${code}" must be an object` }

    const entry: Record<string, any> = { ...(out[code] ?? {}) }
    if ("enabled" in value) {
      if (value.enabled === null) delete entry.enabled            // inherit the switch, keep the knobs
      else if (typeof value.enabled === "boolean") entry.enabled = value.enabled
      else return { error: `"enabled" for "${code}" must be true, false or null` }
    }
    if (value.config && typeof value.config === "object") {
      const clean = validateKnobs(def.knobs ?? [], value.config)
      if ("error" in clean) return { error: clean.error }
      Object.assign(entry, clean.value)
    }
    // An entry that overrides nothing is the same as not being there at all.
    if (!Object.keys(entry).length) delete out[code]
    else out[code] = entry
  }

  // Drop anything for a rule that no longer exists, so old data can't linger.
  const known = new Set(PROGRAM_RULES.map(r => r.code))
  for (const code of Object.keys(out)) if (!known.has(code as any)) delete out[code]

  return { value: out }
}
