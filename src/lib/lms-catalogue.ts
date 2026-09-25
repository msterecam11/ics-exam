// Step 10 (Catalogue) — who may see which course, and the category tree.
//
// Two settings decide it, and the stricter one wins:
//   1. the course's own catalogue_visibility (CV-1)
//   2. the student's company "Show catalogue to our participants" (CV-2)
//
// A company with the catalogue switched off hides everything from its people,
// whatever any course says. That is deliberate: a client who doesn't want their
// staff browsing should not have to police every course.

import { db } from "@/lib/db"

export const VISIBILITY = [
  { value: "hidden",      label: "Hidden",                    hint: "Not in the catalogue at all" },
  { value: "all",         label: "All students",              hint: "Everyone whose company allows the catalogue, plus individual learners" },
  { value: "individuals", label: "Individual learners only",  hint: "Students who don't belong to a company" },
  { value: "company",     label: "Company participants only", hint: "Anyone who belongs to a company" },
  { value: "specific",    label: "Specific companies",        hint: "Only the companies you choose" },
] as const

export type Visibility = typeof VISIBILITY[number]["value"]

export const LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
] as const

export const DELIVERY_MODES = [
  { value: "onsite", label: "Onsite" },
  { value: "online", label: "Online" },
  { value: "external", label: "External" },
] as const

export interface CatalogueViewer {
  studentId: string
  companyId: string | null
  /** false when the company has the catalogue switched off (CV-2). */
  companyAllows: boolean
}

/** Reads the one thing about the student the catalogue rules need. */
export async function catalogueViewer(studentId: string): Promise<CatalogueViewer | null> {
  const { data } = await db
    .from("lms_students")
    .select("id, company_id, lms_companies(show_catalogue)")
    .eq("id", studentId)
    .maybeSingle()
  if (!data) return null
  const s = data as any
  return {
    studentId: s.id,
    companyId: s.company_id ?? null,
    // No company means nobody can switch it off for them.
    companyAllows: s.company_id ? (s.lms_companies?.show_catalogue ?? true) !== false : true,
  }
}

export interface CourseVisibilityRow {
  catalogue_visibility?: string | null
  catalogue_companies?: string[] | null
  status?: string | null
}

/** CV-1 + CV-2 for one course. */
export function visibleTo(course: CourseVisibilityRow, viewer: CatalogueViewer): boolean {
  if (!viewer.companyAllows) return false                 // CV-2 wins
  if (course.status && course.status !== "published") return false
  const v = (course.catalogue_visibility ?? "hidden") as Visibility
  switch (v) {
    case "all":         return true
    case "individuals": return viewer.companyId === null
    case "company":     return viewer.companyId !== null
    case "specific":    return !!viewer.companyId && (course.catalogue_companies ?? []).includes(viewer.companyId)
    default:            return false                      // hidden
  }
}

/**
 * Narrows a Supabase query to the courses this student may browse. Kept as a
 * filter rather than fetching everything and filtering in memory, so a large
 * catalogue doesn't have to be loaded to show one category.
 */
export function catalogueFilter(query: any, viewer: CatalogueViewer) {
  if (!viewer.companyAllows) return query.eq("id", "00000000-0000-0000-0000-000000000000")
  const clauses = ["catalogue_visibility.eq.all"]
  if (viewer.companyId === null) clauses.push("catalogue_visibility.eq.individuals")
  else {
    clauses.push("catalogue_visibility.eq.company")
    clauses.push(`and(catalogue_visibility.eq.specific,catalogue_companies.cs.{${viewer.companyId}})`)
  }
  return query.eq("status", "published").or(clauses.join(","))
}

// ── Categories ───────────────────────────────────────────────────────────────

export interface CategoryRow {
  id: string
  name: string
  description: string | null
  image_url: string | null
  colour: string | null
  order_index: number
  is_active: boolean
}

export const CATEGORY_COLUMNS = "id, name, description, image_url, colour, order_index, is_active"

/** The label a course with no category is filed under, on every screen. */
export const UNCATEGORISED = "Uncategorised"

export async function listCategories(opts: { activeOnly?: boolean } = {}): Promise<CategoryRow[]> {
  let q = db.from("lms_course_categories").select(CATEGORY_COLUMNS).order("order_index").order("name")
  if (opts.activeOnly) q = q.eq("is_active", true)
  const { data } = await q
  return (data ?? []) as CategoryRow[]
}
