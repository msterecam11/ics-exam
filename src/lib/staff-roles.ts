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

export type Role = "admin" | "instructor" | "viewer" | "assessor" | "student"

/** Full LMS administration. */
export function isMgr(role?: string | null): boolean {
  return role === "admin"
}

/** Signed in as staff — says nothing about what they may reach. */
export function isStaff(role?: string | null): boolean {
  return role === "admin" || role === "instructor"
}
