import { db } from "@/lib/db"

type Result = { ok: true; values: Record<string, unknown> } | { ok: false; error: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validates a program create (partial = false) or update (partial = true).
 * Status and structure are handled separately (status has its own transition
 * rules; structure can't change once members exist).
 */
export async function parseProgramInput(body: any, partial: boolean): Promise<Result> {
  const v: Record<string, unknown> = {}
  const has = (k: string) => body && Object.prototype.hasOwnProperty.call(body, k)

  if (has("name") || !partial) {
    const name = typeof body?.name === "string" ? body.name.trim() : ""
    if (!name) return { ok: false, error: "Program name is required" }
    v.name = name.slice(0, 200)
  }

  // Client: a company, or Individual learners (CO-11).
  if (has("company_id") || has("is_individual") || !partial) {
    if (body?.is_individual === true) {
      v.is_individual = true
      v.company_id = null
    } else {
      const cid = body?.company_id
      if (typeof cid !== "string" || !cid) return { ok: false, error: "Choose a client company, or Individual learners" }
      const { data: company } = await db.from("lms_companies").select("id, status").eq("id", cid).maybeSingle()
      if (!company) return { ok: false, error: "Company not found" }
      if ((company as any).status !== "active") return { ok: false, error: "This company is inactive" }
      v.company_id = cid
      v.is_individual = false
    }
  }

  if (!partial) {
    if (!["course", "path", "tracks"].includes(body?.structure))
      return { ok: false, error: "Choose a structure: one course, one learning path, or tracks" }
    v.structure = body.structure
  }

  for (const [k, max] of [["reference", 120], ["description", 5000]] as const) {
    if (!has(k)) continue
    const val = body[k]
    if (val !== null && typeof val !== "string") return { ok: false, error: `Invalid ${k}` }
    v[k] = val?.trim() ? val.trim().slice(0, max) : null
  }

  for (const k of ["start_date", "end_date"] as const) {
    if (!has(k)) continue
    const val = body[k]
    if (val === null || val === "") { v[k] = null; continue }
    if (typeof val !== "string" || !DATE_RE.test(val)) return { ok: false, error: `Invalid ${k.replace("_", " ")}` }
    v[k] = val
  }
  if (v.start_date && v.end_date && String(v.end_date) < String(v.start_date))
    return { ok: false, error: "End date must be on or after the start date" }

  if (has("capacity")) {
    const c = body.capacity
    if (c === null || c === "") v.capacity = null
    else {
      const n = Number(c)
      if (!Number.isInteger(n) || n < 1) return { ok: false, error: "Capacity must be a whole number above 0" }
      v.capacity = n
    }
  }

  if (has("after_end_access")) {
    if (!["read_only", "full", "locked"].includes(body.after_end_access))
      return { ok: false, error: "Invalid after-end access" }
    v.after_end_access = body.after_end_access
  }

  for (const k of ["certificate_enabled", "certificate_auto_release", "feedback_enabled", "feedback_mandatory", "feedback_anonymous", "progress_enforcement"] as const) {
    if (!has(k)) continue
    if (typeof body[k] !== "boolean") return { ok: false, error: `${k.replace(/_/g, " ")} must be true or false` }
    v[k] = body[k]
  }

  return { ok: true, values: v }
}
