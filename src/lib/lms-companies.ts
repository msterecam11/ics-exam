// Companies (clients) for the LMS.
//
// A student linked to a company is a "company participant"; a student with no
// company is an "individual". The type is never stored separately — it is
// derived from company_id, so the two can't contradict each other.
//
// lms_students.company (free text) is kept equal to the linked company's name
// by a database trigger, so every screen and report that already reads that
// text stays correct. Students never linked keep whatever text they had.

export type Company = {
  id: string
  name: string
  name_ar: string | null
  code: string
  logo_url: string | null
  sector: string | null
  country: string | null
  city: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  notes: string | null
  status: "active" | "inactive"
  show_catalogue: boolean
  created_at: string
  updated_at: string
}

export const COMPANY_COLUMNS =
  "id, name, name_ar, code, logo_url, sector, country, city, contact_name, contact_email, contact_phone, notes, status, show_catalogue, created_at, updated_at"

export type StudentType = "company" | "individual"
export const studentType = (s: { company_id?: string | null }): StudentType => (s.company_id ? "company" : "individual")

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Code as stored: upper-case letters, digits, "-" or "_", max 20 (e.g. "RAC"). */
export function normalizeCompanyCode(v: unknown): string | null {
  if (typeof v !== "string") return null
  const code = v.trim().toUpperCase().replace(/\s+/g, "-")
  return /^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(code) ? code : null
}

type Result = { ok: true; values: Record<string, unknown> } | { ok: false; error: string }

/**
 * Validates a create (partial = false) or update (partial = true) body.
 * Only known fields are accepted; everything else is ignored.
 */
export function parseCompanyInput(body: any, partial: boolean): Result {
  const values: Record<string, unknown> = {}
  const has = (k: string) => body && Object.prototype.hasOwnProperty.call(body, k)

  const text = (k: string, max: number, required = false): string | null | undefined | false => {
    if (!has(k)) return required && !partial ? false : undefined
    const v = body[k]
    if (v === null || v === "") return required ? false : null
    if (typeof v !== "string") return false
    const t = v.trim().slice(0, max)
    return t ? t : (required ? false : null)
  }

  const name = text("name", 200, true)
  if (name === false) return { ok: false, error: "Company name is required" }
  if (name !== undefined) values.name = name

  if (has("code") || !partial) {
    const code = normalizeCompanyCode(body?.code)
    if (!code) return { ok: false, error: "Code is required: letters, numbers, - or _, up to 20 characters (e.g. RAC)" }
    values.code = code
  }

  for (const [k, max] of [["name_ar", 200], ["sector", 120], ["country", 120], ["city", 120],
                          ["contact_name", 200], ["contact_phone", 50], ["notes", 5000]] as const) {
    const v = text(k, max)
    if (v === false) return { ok: false, error: `Invalid ${k.replace("_", " ")}` }
    if (v !== undefined) values[k] = v
  }

  const email = text("contact_email", 200)
  if (email === false || (email && !EMAIL_RE.test(email))) return { ok: false, error: "Invalid contact email" }
  if (email !== undefined) values.contact_email = email ? email.toLowerCase() : null

  const logo = text("logo_url", 1000)
  if (logo === false || (logo && !/^https?:\/\//i.test(logo))) return { ok: false, error: "Logo must be an http(s) URL" }
  if (logo !== undefined) values.logo_url = logo

  if (has("status")) {
    if (body.status !== "active" && body.status !== "inactive") return { ok: false, error: "Status must be active or inactive" }
    values.status = body.status
  }
  if (has("show_catalogue")) {
    if (typeof body.show_catalogue !== "boolean") return { ok: false, error: "show_catalogue must be true or false" }
    values.show_catalogue = body.show_catalogue
  }

  return { ok: true, values }
}

/** Friendly message for the unique indexes on name / code. */
export function companyConflictMessage(err: { code?: string; message?: string } | null): string | null {
  if (err?.code !== "23505") return null
  return (err.message ?? "").includes("code")
    ? "Another company already uses this code"
    : "A company with this name already exists"
}
