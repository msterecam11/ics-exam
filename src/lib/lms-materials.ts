import { db } from "@/lib/db"
import { todayISO, type EnrollmentContext } from "@/lib/lms-enrollment"
import { VISIBLE_GROUP_STATUSES } from "@/lib/lms-sessions"

// ── Course materials ───────────────────────────────────────────────────────
//
// What a participant can download from a course, in one list:
//   • files an admin uploaded — for the whole course, for one module, or for
//     one group (private bucket, reached only through short signed links);
//   • each module's slide PDFs, unless the module turns downloading off
//     (viewing them in the LMS is unaffected).
//
// A file can open from enrolment, from the first day, or after completion.

export const MATERIAL_BUCKET = "lms-materials"
export const MATERIAL_MAX_BYTES = 50 * 1024 * 1024          // the storage plan's limit per file
export const ZIP_MAX_BYTES = 150 * 1024 * 1024              // one "Download all" at most
export const MATERIAL_EXTENSIONS = ["pdf", "ppt", "pptx", "doc", "docx", "xls", "xlsx", "csv", "txt", "zip", "png", "jpg", "jpeg", "mp4"]
export const AVAILABLE_FROM = ["enrolment", "start", "completion"] as const
export type AvailableFrom = typeof AVAILABLE_FROM[number]
export const AVAILABLE_LABEL: Record<AvailableFrom, string> = {
  enrolment: "From enrolment", start: "From the first day", completion: "After completion",
}

export const extOf = (name: string) => (name.split(".").pop() ?? "").toLowerCase()

export type MaterialItem = {
  /** "m:<material id>" or "s:<package item id>" — what the download link names */
  key: string
  kind: "file" | "slides"
  /** The module / exercise / assignment an uploaded file belongs to. */
  moduleId?: string | null
  title: string
  fileName: string
  sizeBytes: number | null
  available: boolean
  /** Why it isn't open yet, for display. */
  lockedNote: string | null
}
export type MaterialSection = { key: string; title: string; items: MaterialItem[] }

const fmtDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

/**
 * Everything this enrolment's participant may see, by section: the course,
 * then each module in order, then their group. Items not yet open are
 * included with a note, so the participant knows they're coming.
 */
export async function materialsFor(enrollment: EnrollmentContext): Promise<MaterialSection[]> {
  const courseId = enrollment.course_id

  const [{ data: modules }, { data: files }, { data: pkgs }, groupRes] = await Promise.all([
    db.from("lms_modules").select("id, title, order_index, parent_module_id").eq("course_id", courseId).order("order_index"),
    db.from("lms_materials").select("id, module_id, group_id, title, file_name, size_bytes, available_from, order_index, created_at")
      .eq("course_id", courseId).order("order_index").order("created_at"),
    db.from("lms_packages").select("id, module_id, slides_downloadable, lms_package_items(id, type, order_index, config)").eq("course_id", courseId),
    enrollment.group_id
      ? db.from("lms_course_groups").select("id, status, start_date").eq("id", enrollment.group_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const group = groupRes.data && VISIBLE_GROUP_STATUSES.includes((groupRes.data as any).status) ? groupRes.data as any : null

  // "From the first day": the group's first day, else the program's start.
  const startDay: string | null = group?.start_date ?? enrollment.program?.start_date ?? null
  const today = todayISO()
  const gate = (from: AvailableFrom): { available: boolean; lockedNote: string | null } => {
    if (from === "start" && startDay && today < startDay) return { available: false, lockedNote: `Available from ${fmtDate(startDay)}` }
    if (from === "completion" && enrollment.status !== "completed") return { available: false, lockedNote: "Available once you complete the course" }
    return { available: true, lockedNote: null }
  }

  const fileItem = (f: any): MaterialItem => ({
    key: `m:${f.id}`, kind: "file", moduleId: f.module_id ?? null, title: f.title, fileName: f.file_name, sizeBytes: Number(f.size_bytes) || null,
    ...gate(f.available_from as AvailableFrom),
  })
  const mine = ((files ?? []) as any[]).filter(f => !f.group_id || (group && f.group_id === group.id))

  const sections: MaterialSection[] = []
  const courseWide = mine.filter(f => !f.module_id && !f.group_id).map(fileItem)
  if (courseWide.length) sections.push({ key: "course", title: "Course", items: courseWide })

  const pkgByModule = new Map(((pkgs ?? []) as any[]).map(p => [p.module_id, p]))
  // An exercise / assignment inside a module: its files sit in the module's section.
  const allMods = (modules ?? []) as any[]
  const ids = new Set(allMods.map(m => m.id))
  const nested = (m: any) => m.parent_module_id && ids.has(m.parent_module_id)
  for (const m of allMods.filter(x => !nested(x))) {
    const items: MaterialItem[] = []
    const pkg = pkgByModule.get(m.id)
    if (pkg && pkg.slides_downloadable !== false) {
      // One PDF is stored as one item per page: list each file once.
      const seen = new Set<string>()
      const pages = [...(pkg.lms_package_items ?? [])].filter((i: any) => i.type === "slide_pdf" && i.config?.file_url)
        .sort((a: any, b: any) => a.order_index - b.order_index)
      for (const p of pages) {
        const url = p.config.file_url as string
        if (seen.has(url)) continue
        seen.add(url)
        items.push({
          key: `s:${p.id}`, kind: "slides",
          title: seen.size === 1 ? `${m.title} — slides` : `${m.title} — slides (${seen.size})`,
          fileName: p.config.file_name ?? `${m.title}.pdf`, sizeBytes: null, available: true, lockedNote: null,
        })
      }
    }
    items.push(...mine.filter(f => f.module_id === m.id).map(fileItem))
    for (const c of allMods.filter(x => x.parent_module_id === m.id))
      items.push(...mine.filter(f => f.module_id === c.id).map(f => ({ ...fileItem(f), title: `${c.title} — ${f.title}` })))
    if (items.length) sections.push({ key: `module:${m.id}`, title: m.title, items })
  }

  const groupOnly = mine.filter(f => f.group_id && !f.module_id).map(fileItem)
  if (groupOnly.length) sections.push({ key: "group", title: "Your group", items: groupOnly })
  return sections
}

/** Where a participant's download of one item actually comes from. */
export async function resolveItem(key: string): Promise<
  { kind: "file"; materialId: string; storagePath: string; fileName: string } |
  { kind: "slides"; url: string; fileName: string } | null> {
  if (key.startsWith("m:")) {
    const { data } = await db.from("lms_materials").select("id, storage_path, file_name").eq("id", key.slice(2)).maybeSingle()
    return data ? { kind: "file", materialId: (data as any).id, storagePath: (data as any).storage_path, fileName: (data as any).file_name } : null
  }
  if (key.startsWith("s:")) {
    const { data } = await db.from("lms_package_items").select("config").eq("id", key.slice(2)).maybeSingle()
    const cfg = (data as any)?.config
    return cfg?.file_url ? { kind: "slides", url: cfg.file_url, fileName: cfg.file_name ?? "slides.pdf" } : null
  }
  return null
}

/** Records that the participant took these files. */
export async function logDownloads(rows: { studentId: string; enrollmentId: string; courseId: string; materialId: string | null; label: string; viaZip: boolean }[]) {
  if (!rows.length) return
  await db.from("lms_material_downloads").insert(rows.map(r => ({
    student_id: r.studentId, enrollment_id: r.enrollmentId, course_id: r.courseId,
    material_id: r.materialId, label: r.label.slice(0, 300), via_zip: r.viaZip,
  })))
}

/** A safe file name for storage paths and ZIP entries. */
export function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, " ").trim()
  return (cleaned || "file").slice(0, 120)
}
