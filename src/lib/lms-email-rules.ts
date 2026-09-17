// Registry of every automatic LMS email (EM-1 … EM-20).
//
// Browser-safe on purpose: the admin screens import this for labels, hints and
// the shape of each rule's timing numbers. Nothing here touches the database —
// the stored settings live in lms_email_config / lms_email_rules / a program's
// email_settings, and are read through lms-email-settings.ts (server only).
//
// Adding an email means adding one entry here plus its template; the settings
// screens, the per-program overrides and the log filters pick it up on their own.

export type EmailRuleCode =
  | "welcome" | "program_started" | "not_started" | "inactive" | "deadline"
  | "course_completed" | "certificate" | "last_attempt" | "feedback_reminder"
  | "class_reminder" | "catalogue_ack" | "password_reset"
  | "instructor_digest" | "catalogue_admin" | "grading_due"

export interface RuleKnob {
  key: string
  label: string
  hint?: string
  kind: "number" | "number_list" | "weekday"
  unit?: string
  min?: number
  max?: number
  default: number | number[]
}

export interface EmailRuleDef {
  code: EmailRuleCode
  em: string                       // "EM-4", for cross-referencing the manual
  label: string
  description: string
  audience: "student" | "staff"
  /** program: has a per-program override. global: one setting for the whole LMS. */
  scope: "program" | "global"
  /** Sent by a dated job (the daily cron) rather than by something a person does. */
  scheduled: boolean
  /** Turning this off has a consequence worth spelling out on screen. */
  warning?: string
  knobs?: RuleKnob[]
}

export const EMAIL_RULES: EmailRuleDef[] = [
  // ── Student ────────────────────────────────────────────────────────────────
  {
    code: "welcome", em: "EM-1", label: "Welcome + login details", audience: "student", scope: "global", scheduled: false,
    description: "Sent when a student account is created, or when an admin resets its password.",
    warning: "With this off, new students are never told their password. You would have to pass it on yourself.",
  },
  {
    code: "program_started", em: "EM-2", label: "Program started", audience: "student", scope: "program", scheduled: true,
    description: "On the program's start date, telling the student what they are enrolled in and where to log in.",
  },
  {
    code: "not_started", em: "EM-3", label: "Not started yet", audience: "student", scope: "program", scheduled: true,
    description: "A nudge for students who have not opened a single course since the program started.",
    knobs: [{ key: "days", label: "Days after the start date", kind: "number", unit: "days", min: 1, max: 60, default: 3 }],
  },
  {
    code: "inactive", em: "EM-4", label: "Inactive", audience: "student", scope: "program", scheduled: true,
    description: "For students who started but have done nothing for a while, and the program is still running.",
    knobs: [
      { key: "days", label: "Days without activity", kind: "number", unit: "days", min: 1, max: 90, default: 7 },
      { key: "repeat_days", label: "Send again at most every", hint: "0 = send once only", kind: "number", unit: "days", min: 0, max: 90, default: 7 },
    ],
  },
  {
    code: "deadline", em: "EM-5", label: "Deadline approaching", audience: "student", scope: "program", scheduled: true,
    description: "Counts down to the student's own end date, so a personal extension moves the reminder with it.",
    knobs: [{ key: "days_list", label: "Send this many days before the end", hint: "One or more, e.g. 14 and 3", kind: "number_list", unit: "days", min: 1, max: 180, default: [14, 3] }],
  },
  {
    code: "course_completed", em: "EM-6", label: "Course completed", audience: "student", scope: "program", scheduled: false,
    description: "Congratulates the student when they finish a course, naming the program.",
  },
  {
    code: "certificate", em: "EM-7", label: "Certificate released", audience: "student", scope: "program", scheduled: false,
    description: "Tells the student a certificate is ready to download.",
  },
  {
    code: "last_attempt", em: "EM-8", label: "Last exam attempt left", audience: "student", scope: "program", scheduled: false,
    description: "A kind nudge to review before using the final attempt, sent when they fail with exactly one left.",
  },
  {
    code: "feedback_reminder", em: "EM-9", label: "Feedback reminder", audience: "student", scope: "program", scheduled: true,
    description: "One reminder for feedback that was asked for and never given. Never sent twice.",
    knobs: [{ key: "days", label: "Days after feedback was asked", kind: "number", unit: "days", min: 1, max: 60, default: 3 }],
  },
  {
    code: "class_reminder", em: "EM-10", label: "Class reminder", audience: "student", scope: "program", scheduled: true,
    description: "Reminds the students booked on a live session, with the time, room or meeting link.",
    knobs: [{ key: "hours", label: "Hours before the session", kind: "number", unit: "hours", min: 1, max: 168, default: 24 }],
  },
  {
    code: "catalogue_ack", em: "EM-11", label: "Catalogue request received", audience: "student", scope: "global", scheduled: false,
    description: "Confirmation to whoever asks for a course from the public catalogue.",
  },
  {
    code: "password_reset", em: "EM-12", label: "Password reset", audience: "student", scope: "global", scheduled: false,
    description: "The link a student uses to choose a new password after asking to reset it.",
    warning: "With this off, a student who forgets their password cannot get back in without an admin resetting it by hand.",
    knobs: [{ key: "expiry_minutes", label: "Link expires after", kind: "number", unit: "minutes", min: 5, max: 1440, default: 30 }],
  },

  // ── Staff ──────────────────────────────────────────────────────────────────
  {
    code: "instructor_digest", em: "EM-13", label: "Weekly program digest", audience: "staff", scope: "program", scheduled: true,
    description: "To the program's instructors: new completions, who is behind, and what is waiting to be graded.",
    knobs: [{ key: "weekday", label: "Day of the week", kind: "weekday", min: 0, max: 6, default: 1 }],
  },
  {
    code: "catalogue_admin", em: "EM-14", label: "Catalogue request (to admins)", audience: "staff", scope: "global", scheduled: false,
    description: "Tells the admins a catalogue request came in, as it happens.",
  },
  {
    code: "grading_due", em: "EM-15", label: "Assignment to grade", audience: "staff", scope: "program", scheduled: false,
    description: "Tells the program's instructors that a student submitted work that needs marking.",
  },
]

export const RULE_BY_CODE: Record<string, EmailRuleDef> =
  Object.fromEntries(EMAIL_RULES.map(r => [r.code, r]))

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

/** A rule's built-in timing numbers, used when nothing has been configured. */
export function defaultConfig(code: string): Record<string, number | number[]> {
  const def = RULE_BY_CODE[code]
  if (!def?.knobs) return {}
  return Object.fromEntries(def.knobs.map(k => [k.key, k.default]))
}

/** Programs only carry overrides for rules that are program-scoped. */
export const PROGRAM_RULES = EMAIL_RULES.filter(r => r.scope === "program")
export const GLOBAL_RULES  = EMAIL_RULES.filter(r => r.scope === "global")

/**
 * Checks the timing numbers coming from a settings screen against the knobs a
 * rule declares. Used by both the global settings route and the per-program one,
 * so a program can never store a value the global screen would refuse.
 */
export function validateKnobs(knobs: RuleKnob[], input: Record<string, any>):
  { value: Record<string, any> } | { error: string } {
  const out: Record<string, any> = {}
  for (const k of knobs) {
    if (!(k.key in input)) continue
    const raw = input[k.key]
    if (k.kind === "number_list") {
      const arr = Array.isArray(raw) ? raw.map(Number) : []
      if (!arr.length || arr.some(n => !Number.isInteger(n) || n < (k.min ?? 1) || n > (k.max ?? 999)))
        return { error: `"${k.label}" must be whole numbers between ${k.min ?? 1} and ${k.max ?? 999}` }
      out[k.key] = [...new Set(arr)].sort((a, b) => b - a)
    } else {
      const n = Number(raw)
      if (!Number.isInteger(n) || n < (k.min ?? 0) || n > (k.max ?? 9999))
        return { error: `"${k.label}" must be a whole number between ${k.min ?? 0} and ${k.max ?? 9999}` }
      out[k.key] = n
    }
  }
  return { value: out }
}

/** Human label for the log and the settings screens. */
export function ruleLabel(code: string | null | undefined): string {
  if (!code) return "—"
  const def = RULE_BY_CODE[code]
  return def ? `${def.em} ${def.label}` : code
}
