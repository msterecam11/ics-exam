// Who counts as staff, in one place (Step 9, IR-1 … IR-15).
//
// `isMgr` used to be copied into ~70 route files as
//   role === "admin" || role === "instructor"
// which gave an instructor account the run of the whole LMS: every company,
// every student, every course, the import tool and the settings screens.
//
// It now means **admin**. An instructor reaches a route only where that route
// explicitly allows it and scopes the result to their own programs, using
// staff-access.ts. Deny by default: a route nobody has re-opened stays closed
// rather than silently exposing everything.
//
// Kept free of database imports so it can be used from anywhere, including
// client components and middleware.

export type Role = "admin" | "instructor" | "facilitator" | "viewer" | "assessor" | "student"

/** Full LMS administration. */
export function isMgr(role?: string | null): boolean {
  return role === "admin"
}

/** Signed in as staff — says nothing about what they may reach. */
export function isStaff(role?: string | null): boolean {
  return role === "admin" || role === "instructor"
}

/** IR-9 … IR-14: the extras an admin can tick on an instructor's account. */
export const STAFF_PERMISSIONS = [
  { key: "release_certificates", ir: "IR-9",  label: "Release certificates",
    hint: "Release held certificates for students in their programs" },
  { key: "manage_students",      ir: "IR-10", label: "Manage students",
    hint: "Add and edit students, and enrol them in their own programs" },
  { key: "export_reports",       ir: "IR-11", label: "Export reports",
    hint: "Download report PDFs and Excel files. Without it they can read reports on screen only" },
  { key: "author_courses",       ir: "IR-12", label: "Author courses",
    hint: "Create and edit courses, packages, exams and question banks they own. Publishing and deleting stay with admins" },
  { key: "set_pass_marks",       ir: "IR-13", label: "Pass mark & attempts",
    hint: "Change the pass mark and number of attempts on their own programs" },
  { key: "reset_attempts",       ir: "IR-14", label: "Reset attempts",
    hint: "Give a student another go at an exam in their programs" },
] as const

export type StaffPermission = typeof STAFF_PERMISSIONS[number]["key"]

/**
 * IR-3 — the LMS sidebar per role.
 *
 * An instructor gets Dashboard, Program Manager, Live Sessions and Reports.
 * The screens behind the extra permissions appear only once that permission is
 * ticked, so nobody is shown a menu entry that then refuses them.
 *
 * `needs` is read as: undefined = admins only, "staff" = any staff account,
 * anything else = that permission.
 */
// "attendance" = anyone who takes attendance, facilitators included.
export type NavNeeds = "staff" | "attendance" | StaffPermission | undefined

export function navVisible(needs: NavNeeds, role?: string | null, permissions?: Record<string, boolean> | null): boolean {
  if (role === "admin") return true
  if (role === "facilitator") return needs === "attendance"
  if (role !== "instructor") return false
  if (needs === "attendance") return true
  if (needs === undefined) return false
  if (needs === "staff") return true
  return permissions?.[needs] === true
}
