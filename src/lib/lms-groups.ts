import { db } from "@/lib/db"

// ── Onsite groups ──────────────────────────────────────────────────────────
//
// A GROUP is one scheduled delivery of a course: dates, venue, provider, staff
// and seats. A participant's enrolment points at its group (group_id), whatever
// program — or none — brought them to the course. One active enrolment per
// student per course (a database rule) means one group per person per course.
//
// A group's days are ordinary lms_sessions rows with group_id set, so the
// attendance screen, the signed sheet and the reminders work unchanged.
//
// Participants see a group (and its days) only once it is confirmed.

export const GROUP_STATUSES = ["planned", "confirmed", "completed", "cancelled"] as const
export type GroupStatus = typeof GROUP_STATUSES[number]
export const GROUP_STATUS_LABEL: Record<GroupStatus, string> = {
  planned: "Planned", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled",
}

export const GROUP_COLUMNS = `id, course_id, name, provider_id, start_date, end_date, daily_start, daily_end,
  city, country, venue_name, venue_address, map_url, seats, language, status, notes, joining_instructions, created_at, updated_at`

export type CourseGroup = {
  id: string; course_id: string; name: string | null; provider_id: string | null
  start_date: string; end_date: string; daily_start: string | null; daily_end: string | null
  city: string | null; country: string | null; venue_name: string | null; venue_address: string | null; map_url: string | null
  seats: number | null; language: string | null; status: GroupStatus; notes: string | null
  /** Shown to participants and e-mailed before the start (EM-22). */
  joining_instructions?: string | null
  created_at: string; updated_at: string
}

/** Enrolments that hold a seat: still taking it, or finished it. */
export const SEAT_STATUSES = ["active", "completed"]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v)

const fmtDay = (iso: string, withYear: boolean) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" })

/** "8 – 12 Dec 2026" / "30 Nov – 4 Dec 2026" / "8 Dec 2026". */
export function groupDates(g: Pick<CourseGroup, "start_date" | "end_date">): string {
  if (g.start_date === g.end_date) return fmtDay(g.start_date, true)
  const [ys, ms] = g.start_date.split("-"), [ye, me] = g.end_date.split("-")
  if (ys === ye && ms === me) return `${Number(g.start_date.slice(8))} – ${fmtDay(g.end_date, true)}`
  if (ys === ye) return `${fmtDay(g.start_date, false)} – ${fmtDay(g.end_date, true)}`
  return `${fmtDay(g.start_date, true)} – ${fmtDay(g.end_date, true)}`
}

/** How a group is named where there's no custom name: dates · city. */
export function groupLabel(g: Pick<CourseGroup, "name" | "start_date" | "end_date" | "city">): string {
  if (g.name?.trim()) return g.name.trim()
  return [groupDates(g), g.city].filter(Boolean).join(" · ")
}

/** Calendar days in the group, inclusive. */
export function groupDays(g: Pick<CourseGroup, "start_date" | "end_date">): string[] {
  const out: string[] = []
  const end = Date.parse(g.end_date + "T00:00:00Z")
  for (let t = Date.parse(g.start_date + "T00:00:00Z"); t <= end && out.length < 60; t += 86_400_000)
    out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

export async function loadGroup(id: string): Promise<CourseGroup | null> {
  if (!isUuid(id)) return null
  const { data } = await db.from("lms_course_groups").select(GROUP_COLUMNS).eq("id", id).maybeSingle()
  return (data as any) ?? null
}

/** Seats taken in each of these groups. */
export async function seatsTaken(groupIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>(groupIds.map(id => [id, 0]))
  if (!groupIds.length) return out
  const { data } = await db.from("lms_enrollments").select("group_id").in("group_id", groupIds).in("status", SEAT_STATUSES)
  for (const r of (data ?? []) as any[]) out.set(r.group_id, (out.get(r.group_id) ?? 0) + 1)
  return out
}

// ── Validating what an admin types ───────────────────────────────────────────

export type GroupInput = Partial<Pick<CourseGroup,
  "name" | "provider_id" | "start_date" | "end_date" | "daily_start" | "daily_end" | "city" | "country"
  | "venue_name" | "venue_address" | "map_url" | "seats" | "language" | "notes" | "joining_instructions">>

const text = (v: unknown, max: number) => {
  if (v === null) return null
  const s = typeof v === "string" ? v.trim() : ""
  return s ? s.slice(0, max) : null
}

/**
 * Cleans the editable fields of a group. `partial` for an update: only the
 * fields present are returned. The result is checked as a whole (dates in
 * order, times in order) against `current` for an update.
 */
export function readGroupInput(body: any, opts: { partial: boolean; current?: CourseGroup }):
  { ok: true; value: Record<string, any> } | { ok: false; error: string } {
  const out: Record<string, any> = {}
  const has = (k: string) => body && Object.prototype.hasOwnProperty.call(body, k)
  const want = (k: string) => !opts.partial || has(k)

  for (const [k, max] of [["name", 120], ["city", 80], ["country", 80], ["venue_name", 160], ["venue_address", 300], ["language", 40], ["notes", 2000], ["joining_instructions", 4000]] as const)
    if (want(k)) out[k] = text(body?.[k], max)

  if (want("map_url")) {
    const u = text(body?.map_url, 500)
    if (u && !/^https?:\/\//i.test(u)) return { ok: false, error: "The map link must start with http:// or https://" }
    out.map_url = u
  }
  if (want("provider_id")) {
    const p = body?.provider_id
    if (p !== null && p !== undefined && p !== "" && !isUuid(p)) return { ok: false, error: "Invalid provider" }
    out.provider_id = p || null
  }
  for (const k of ["start_date", "end_date"] as const) {
    if (!want(k)) continue
    const d = body?.[k]
    if (typeof d !== "string" || !DATE_RE.test(d)) return { ok: false, error: k === "start_date" ? "Choose a start date" : "Choose an end date" }
    out[k] = d
  }
  for (const k of ["daily_start", "daily_end"] as const) {
    if (!want(k)) continue
    const t = body?.[k]
    if (t === null || t === undefined || t === "") { out[k] = null; continue }
    if (typeof t !== "string" || !TIME_RE.test(t)) return { ok: false, error: "Times must look like 08:30" }
    out[k] = t.slice(0, 5)
  }
  if (want("seats")) {
    const n = body?.seats
    if (n === null || n === undefined || n === "") out.seats = null
    else {
      const v = Number(n)
      if (!Number.isInteger(v) || v < 1 || v > 1000) return { ok: false, error: "Seats must be a whole number from 1 to 1000" }
      out.seats = v
    }
  }

  const merged = { ...(opts.current ?? {}), ...out } as any
  if (merged.start_date && merged.end_date && merged.end_date < merged.start_date)
    return { ok: false, error: "The end date is before the start date" }
  if (merged.start_date && merged.end_date
      && (Date.parse(merged.end_date + "T00:00:00Z") - Date.parse(merged.start_date + "T00:00:00Z")) / 86_400_000 >= 60)
    return { ok: false, error: "A group can't run longer than 60 days" }
  if (merged.daily_start && merged.daily_end && merged.daily_end <= merged.daily_start)
    return { ok: false, error: "The daily end time must be after the start time" }
  return { ok: true, value: out }
}

// ── Staff ──

/** [{ user_id, role }] — role instructor (default) or facilitator. */
export function readStaff(v: unknown): { ok: true; list: { user_id: string; role: "instructor" | "facilitator" }[] } | { ok: false; error: string } {
  if (v === undefined || v === null) return { ok: true, list: [] }
  if (!Array.isArray(v)) return { ok: false, error: "Invalid staff list" }
  const seen = new Set<string>()
  const list: { user_id: string; role: "instructor" | "facilitator" }[] = []
  for (const s of v as any[]) {
    const role = s?.role === "facilitator" ? "facilitator" : "instructor"
    if (!isUuid(s?.user_id)) return { ok: false, error: "Invalid staff member" }
    const k = `${s.user_id}:${role}`
    if (seen.has(k)) continue
    seen.add(k); list.push({ user_id: s.user_id, role })
  }
  return { ok: true, list }
}

// ── Placing participants ─────────────────────────────────────────────────────

export type PlaceResult = { enrollment_id: string; name?: string; status: "placed" | "moved" | "already" | "error"; message?: string }

/**
 * Puts enrolments of the group's course into the group. An enrolment already
 * in another group is MOVED (their attendance at the old group's days stays as
 * history). Seats are a hard limit unless `override` (admins only).
 */
export async function placeInGroup(group: CourseGroup, enrollmentIds: string[], opts: { override: boolean }):
  Promise<{ ok: true; results: PlaceResult[] } | { ok: false; status: number; error: string }> {
  if (group.status === "cancelled" || group.status === "completed")
    return { ok: false, status: 409, error: `People can't be added to a ${group.status} group` }

  const ids = [...new Set(enrollmentIds.filter(isUuid))]
  if (!ids.length) return { ok: false, status: 400, error: "Choose at least one participant" }

  const { data: rows } = await db.from("lms_enrollments")
    .select("id, course_id, status, group_id, lms_students(name)").in("id", ids)
  const byId = new Map(((rows ?? []) as any[]).map(r => [r.id, r]))

  const results: PlaceResult[] = []
  const toPlace: any[] = []
  for (const id of ids) {
    const r = byId.get(id)
    if (!r) { results.push({ enrollment_id: id, status: "error", message: "Not found" }); continue }
    const name = r.lms_students?.name
    if (r.course_id !== group.course_id) { results.push({ enrollment_id: id, name, status: "error", message: "Enrolled in a different course" }); continue }
    if (!SEAT_STATUSES.includes(r.status)) { results.push({ enrollment_id: id, name, status: "error", message: "Withdrawn from the course" }); continue }
    if (r.group_id === group.id) { results.push({ enrollment_id: id, name, status: "already" }); continue }
    toPlace.push(r)
  }

  if (group.seats && toPlace.length && !opts.override) {
    const taken = (await seatsTaken([group.id])).get(group.id) ?? 0
    const left = group.seats - taken
    if (toPlace.length > left)
      return { ok: false, status: 409, error: left > 0
        ? `Only ${left} seat${left === 1 ? "" : "s"} left in this group (${toPlace.length} chosen)`
        : "This group is full" }
  }

  for (const r of toPlace) {
    const { error } = await db.from("lms_enrollments").update({ group_id: group.id }).eq("id", r.id)
    results.push(error
      ? { enrollment_id: r.id, name: r.lms_students?.name, status: "error", message: "Could not save" }
      : { enrollment_id: r.id, name: r.lms_students?.name, status: r.group_id ? "moved" : "placed" })
  }
  return { ok: true, results }
}

// ── The catalogue ────────────────────────────────────────────────────────────

export type OpenGroup = {
  id: string; label: string; dates: string; city: string | null; venue_name: string | null
  daily_start: string | null; daily_end: string | null; provider: string | null
  seats_left: number | null; full: boolean
}

/** Confirmed groups of a course that haven't finished — what a student can ask to join. */
export async function openGroups(courseId: string, today: string): Promise<OpenGroup[]> {
  const { data } = await db.from("lms_course_groups")
    .select(`${GROUP_COLUMNS}, lms_service_providers(name)`)
    .eq("course_id", courseId).eq("status", "confirmed").gte("end_date", today)
    .order("start_date")
  const rows = (data ?? []) as any[]
  const taken = await seatsTaken(rows.map(r => r.id))
  return rows.map(r => {
    const left = r.seats ? Math.max(0, r.seats - (taken.get(r.id) ?? 0)) : null
    return {
      id: r.id, label: groupLabel(r), dates: groupDates(r), city: r.city, venue_name: r.venue_name,
      daily_start: r.daily_start, daily_end: r.daily_end, provider: r.lms_service_providers?.name ?? null,
      seats_left: left, full: left === 0,
    }
  })
}

// ── The group's days ─────────────────────────────────────────────────────────

/** Minutes between two "HH:MM" times, or the default. */
function minutesBetween(start: string | null, end: string | null, fallback = 420): number {
  if (!start || !end) return fallback
  const [sh, sm] = start.split(":").map(Number), [eh, em] = end.split(":").map(Number)
  const m = (eh * 60 + em) - (sh * 60 + sm)
  return m > 0 ? m : fallback
}

/**
 * One session per calendar day of the group (skipping days that already have
 * one), at the group's daily times and venue. `dates` limits it to some days —
 * e.g. to skip a weekend. Returns how many were created.
 */
export async function generateGroupDays(group: CourseGroup, courseTitle: string, actorId: string | null, dates?: string[]): Promise<number> {
  const wanted = (dates?.length ? dates : groupDays(group)).filter(d => d >= group.start_date && d <= group.end_date)
  const { data: existing } = await db.from("lms_sessions").select("session_date").eq("group_id", group.id)
  const have = new Set(((existing ?? []) as any[]).map(s => s.session_date))
  const all = groupDays(group)
  const location = [group.venue_name, group.city].filter(Boolean).join(", ") || null
  const rows = wanted.filter(d => !have.has(d)).map(d => ({
    course_id: group.course_id,
    group_id: group.id,
    program_id: null,
    track_id: null,
    title: `Day ${all.indexOf(d) + 1} — ${courseTitle}`,
    session_date: d,
    start_time: group.daily_start ?? "08:30",
    duration_minutes: minutesBetween(group.daily_start, group.daily_end),
    location,
    created_by: actorId,
  }))
  if (!rows.length) return 0
  const { error } = await db.from("lms_sessions").insert(rows)
  if (error) throw new Error("Could not create the days")
  return rows.length
}

/** Keeps the group's days in step after the venue or daily times change. */
export async function syncGroupDayDetails(group: CourseGroup) {
  const location = [group.venue_name, group.city].filter(Boolean).join(", ") || null
  await db.from("lms_sessions").update({
    start_time: group.daily_start ?? "08:30",
    duration_minutes: minutesBetween(group.daily_start, group.daily_end),
    location,
  }).eq("group_id", group.id).is("closed_at", null)
}

// ─── Open / lock per group ────────────────────────────────────────────────────
// The group's instructor opens the final exam when the class is ready for it
// (no access code), and can lock or reopen assignments. Stored on the group as
// item_access { module_id: { open, by, at } }. Participants without a group
// (online) are never gated here.

export const GATED_TYPES = ["final_exam", "assignment"] as const
export type ItemAccess = Record<string, { open: boolean; by?: string | null; at?: string | null }>

/** Before the instructor decides: the exam waits, assignments are open. */
export const defaultOpen = (moduleType: string) => moduleType !== "final_exam"

export function isItemOpen(access: ItemAccess | null | undefined, mod: { id: string; module_type: string }): boolean {
  if (!(GATED_TYPES as readonly string[]).includes(mod.module_type)) return true
  const e = access?.[mod.id]
  return e ? e.open === true : defaultOpen(mod.module_type)
}

/** Can this participant start / submit this item now? */
export async function itemGate(groupId: string | null | undefined, mod: { id: string; module_type: string }):
  Promise<{ open: true } | { open: false; message: string }> {
  if (!groupId || !(GATED_TYPES as readonly string[]).includes(mod.module_type)) return { open: true }
  const { data } = await db.from("lms_course_groups").select("item_access").eq("id", groupId).maybeSingle()
  if (isItemOpen((data as any)?.item_access, mod)) return { open: true }
  return { open: false, message: mod.module_type === "final_exam"
    ? "The final exam opens when your instructor releases it."
    : "Your instructor has locked this assignment for now." }
}
