// Assignment submissions live in lms_module_attempts (module_type "assignment").
// The older lms_assignment_submissions table is no longer written to, so
// counts and lists read from here.

import { db } from "@/lib/db"

/** Still to be marked: submitted, or marked by the AI but not yet confirmed. */
export const TO_MARK = "status.eq.submitted,and(status.eq.graded,ai_feedback->>graded_by.neq.instructor)"

/** Assignment attempts with their module; add filters to the result. */
export function assignmentAttempts(columns: string, opts: { count?: boolean } = {}) {
  return db.from("lms_module_attempts")
    .select(`${columns}, lms_modules!inner(id, title, course_id, module_type)`, opts.count ? { count: "exact", head: true } : undefined)
    .eq("lms_modules.module_type", "assignment")
}
