// Step 9 (IR-1 … IR-15) — what a staff account may reach.
//
// An admin may reach everything. An instructor may reach only the programs they
// are assigned to (Program → Settings → Instructors), the students in those
// programs, and the courses those programs deliver — plus anything extra that
// was ticked on their account.
//
// Every API route and page guard goes through this file so there is one place
// to read, and one place to change. Before this, `isMgr(role)` treated an
// instructor as an admin across the whole LMS.

import { db } from "@/lib/db"
import { auth } from "@/lib/auth"

export type StaffRole = "admin" | "instructor"

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

export interface StaffSession {
  id: string
  role: string
  name?: string | null
  email?: string | null
}

export interface StaffScope {
  userId: string
  role: StaffRole
  isAdmin: boolean
  /** Programs they may touch. Empty for an instructor with no assignment yet. */
  programIds: string[]
  /** Tracks they cover, per program. An absent entry means the whole program. */
  tracksByProgram: Map<string, string[]>
  permissions: Record<string, boolean>
}

const isStaffRole = (r?: string): r is StaffRole => r === "admin" || r === "instructor"

/** The signed-in staff member, or null. Students and viewers are not staff. */
export async function staffSession(): Promise<StaffSession | null> {
  const session = await auth().catch(() => null)
  if (!session?.user || !isStaffRole(session.user.role)) return null
  return { id: session.user.id, role: session.user.role, name: session.user.name, email: session.user.email }
}

/**
 * Everything the access checks need, read once per request.
 * Admins come back with isAdmin true and no program list — they are never
 * filtered by one.
 */
export async function staffScope(session: StaffSession): Promise<StaffScope> {
  if (session.role === "admin")
    return { userId: session.id, role: "admin", isAdmin: true, programIds: [], tracksByProgram: new Map(), permissions: {} }

  const [{ data: links }, { data: me }] = await Promise.all([
    db.from("lms_program_instructors").select("program_id, track_ids").eq("user_id", session.id),
    db.from("admin_users").select("permissions").eq("id", session.id).maybeSingle(),
  ])

  const tracksByProgram = new Map<string, string[]>()
  for (const l of (links ?? []) as any[]) {
    const tracks = Array.isArray(l.track_ids) ? l.track_ids.filter(Boolean) : []
    // Two rows for one program merge; "whole program" (no tracks) wins.
    const existing = tracksByProgram.get(l.program_id)
    if (existing === undefined) tracksByProgram.set(l.program_id, tracks)
    else if (existing.length && tracks.length) tracksByProgram.set(l.program_id, [...new Set([...existing, ...tracks])])
    else tracksByProgram.set(l.program_id, [])
  }

  const raw = (me as any)?.permissions
  return {
    userId: session.id, role: "instructor", isAdmin: false,
    programIds: [...tracksByProgram.keys()],
    tracksByProgram,
    permissions: raw && typeof raw === "object" ? raw : {},
  }
}

/** Convenience: the session and its scope together, or null when not staff. */
export async function requireStaff(): Promise<{ session: StaffSession; scope: StaffScope } | null> {
  const session = await staffSession()
  if (!session) return null
  return { session, scope: await staffScope(session) }
}

export function can(scope: StaffScope, permission: StaffPermission): boolean {
  return scope.isAdmin || scope.permissions[permission] === true
}

// ── Program / track ──────────────────────────────────────────────────────────

export function canSeeProgram(scope: StaffScope, programId: string | null | undefined): boolean {
  if (scope.isAdmin) return true
  if (!programId) return false
  return scope.tracksByProgram.has(programId)
}

/**
 * A track-limited instructor sees only their tracks. Courses and students that
 * sit outside every track they cover are not theirs, even inside "their" program.
 */
export function canSeeTrack(scope: StaffScope, programId: string, trackId: string | null | undefined): boolean {
  if (scope.isAdmin) return true
  const tracks = scope.tracksByProgram.get(programId)
  if (tracks === undefined) return false
  if (!tracks.length) return true                 // assigned to the whole program
  if (!trackId) return true                       // shared, untracked content
  return tracks.includes(trackId)
}

/** Narrows a list of program ids to the ones this account may see. */
export function visibleProgramIds(scope: StaffScope, ids: string[]): string[] {
  return scope.isAdmin ? ids : ids.filter(id => scope.tracksByProgram.has(id))
}

// ── Students ─────────────────────────────────────────────────────────────────

/** True when the student is a member of at least one program in scope. */
export async function canSeeStudent(scope: StaffScope, studentId: string): Promise<boolean> {
  if (scope.isAdmin) return true
  if (!scope.programIds.length) return false
  const { data } = await db
    .from("lms_program_members")
    .select("program_id, track_id")
    .eq("student_id", studentId)
    .in("program_id", scope.programIds)
  return (data ?? []).some((m: any) => canSeeTrack(scope, m.program_id, m.track_id))
}

/** Every student this account may see, for list screens. */
export async function visibleStudentIds(scope: StaffScope): Promise<string[] | "all"> {
  if (scope.isAdmin) return "all"
  if (!scope.programIds.length) return []
  const { data } = await db
    .from("lms_program_members")
    .select("student_id, program_id, track_id")
    .in("program_id", scope.programIds)
  const ids = (data ?? [])
    .filter((m: any) => canSeeTrack(scope, m.program_id, m.track_id))
    .map((m: any) => m.student_id)
  return [...new Set(ids)]
}

// ── Courses ──────────────────────────────────────────────────────────────────

/**
 * Courses delivered by the programs in scope, limited to the instructor's own
 * tracks, plus (IR-12) any course they created themselves.
 */
export async function visibleCourseIds(scope: StaffScope): Promise<string[] | "all"> {
  if (scope.isAdmin) return "all"
  const out = new Set<string>()

  if (scope.programIds.length) {
    const { data } = await db
      .from("lms_program_items")
      .select("program_id, track_id, course_id")
      .in("program_id", scope.programIds)
    for (const i of (data ?? []) as any[]) {
      if (i.course_id && canSeeTrack(scope, i.program_id, i.track_id)) out.add(i.course_id)
    }
  }

  const { data: mine } = await db.from("lms_courses").select("id").eq("created_by", scope.userId)
  for (const c of (mine ?? []) as any[]) out.add(c.id)

  return [...out]
}

export async function canSeeCourse(scope: StaffScope, courseId: string): Promise<boolean> {
  if (scope.isAdmin) return true
  const ids = await visibleCourseIds(scope)
  return ids === "all" || ids.includes(courseId)
}

/** IR-12 — editing a course needs the permission AND the course in scope. */
export async function canEditCourse(scope: StaffScope, courseId: string): Promise<boolean> {
  if (scope.isAdmin) return true
  if (!can(scope, "author_courses")) return false
  return canSeeCourse(scope, courseId)
}

// ── Enrollments ──────────────────────────────────────────────────────────────

/** An enrollment is in scope when its program is — or, outside a program, when
 *  the course is one the instructor owns. */
export async function canSeeEnrollment(scope: StaffScope, enrollmentId: string): Promise<boolean> {
  if (scope.isAdmin) return true
  const { data } = await db
    .from("lms_enrollments")
    .select("program_id, course_id, student_id, lms_program_members(track_id)")
    .eq("id", enrollmentId)
    .maybeSingle()
  if (!data) return false
  const e = data as any
  if (e.program_id) return canSeeProgram(scope, e.program_id) && canSeeTrack(scope, e.program_id, e.lms_program_members?.track_id ?? null)
  return canSeeStudent(scope, e.student_id)
}

// ── Reasons, for consistent API replies ──────────────────────────────────────

export const FORBIDDEN = { error: "You don't have access to this" }
export const ADMIN_ONLY = { error: "Only an admin can do this" }
export function permissionError(permission: StaffPermission) {
  const def = STAFF_PERMISSIONS.find(p => p.key === permission)
  return { error: `Your account doesn't have "${def?.label ?? permission}"` }
}
