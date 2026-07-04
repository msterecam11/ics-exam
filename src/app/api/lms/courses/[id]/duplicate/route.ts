import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// POST /api/lms/courses/[id]/duplicate
// Deep-clones a course: course row + all modules (with their questions,
// activity settings, assignment fields), packages, package items, and
// legacy content items. The copy is created as a draft.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: srcId } = await params

  // 1. Source course
  const { data: srcCourse, error: cErr } = await db.from("lms_courses").select("*").eq("id", srcId).single()
  if (cErr || !srcCourse) return NextResponse.json({ error: "Course not found" }, { status: 404 })

  // 2. Create the new course (copy fields, force draft, new owner)
  const courseCopy: any = { ...srcCourse }
  delete courseCopy.id; delete courseCopy.created_at; delete courseCopy.updated_at
  courseCopy.title       = `Copy of ${srcCourse.title}`
  courseCopy.course_code = srcCourse.course_code ? `${srcCourse.course_code}-COPY` : null
  courseCopy.status      = "draft"
  courseCopy.created_by  = session.user.id

  const { data: newCourse, error: ncErr } = await db.from("lms_courses").insert(courseCopy).select("id").single()
  if (ncErr || !newCourse) return NextResponse.json({ error: ncErr?.message ?? "Failed to create copy" }, { status: 500 })
  const newCourseId = newCourse.id

  // 3. Modules (carry questions / activity_settings / assignment fields with them)
  const { data: srcModules } = await db.from("lms_modules").select("*").eq("course_id", srcId).order("order_index")
  const moduleIdMap = new Map<string, string>()
  for (const m of (srcModules ?? []) as any[]) {
    const copy: any = { ...m }
    delete copy.id; delete copy.created_at; delete copy.updated_at
    copy.course_id = newCourseId
    copy.prerequisite_module_id = null // remapped in a second pass
    const { data: nm, error } = await db.from("lms_modules").insert(copy).select("id").single()
    if (error || !nm) return NextResponse.json({ error: `Module copy failed: ${error?.message}` }, { status: 500 })
    moduleIdMap.set(m.id, nm.id)
  }
  // Remap intra-course prerequisites now that every module has a new id
  for (const m of (srcModules ?? []) as any[]) {
    if (m.prerequisite_module_id && moduleIdMap.has(m.prerequisite_module_id)) {
      await db.from("lms_modules").update({ prerequisite_module_id: moduleIdMap.get(m.prerequisite_module_id) })
        .eq("id", moduleIdMap.get(m.id))
    }
  }

  const srcModuleIds = (srcModules ?? []).map((m: any) => m.id)

  // 4. Packages
  const pkgIdMap = new Map<string, string>()
  if (srcModuleIds.length) {
    const { data: srcPkgs } = await db.from("lms_packages").select("*").in("module_id", srcModuleIds)
    for (const p of (srcPkgs ?? []) as any[]) {
      const copy: any = { ...p }
      delete copy.id; delete copy.created_at; delete copy.updated_at
      copy.module_id = moduleIdMap.get(p.module_id)
      copy.course_id = newCourseId
      const { data: np, error } = await db.from("lms_packages").insert(copy).select("id").single()
      if (error || !np) return NextResponse.json({ error: `Package copy failed: ${error?.message}` }, { status: 500 })
      pkgIdMap.set(p.id, np.id)
    }

    // 5. Package items
    const srcPkgIds = [...pkgIdMap.keys()]
    if (srcPkgIds.length) {
      const { data: srcItems } = await db.from("lms_package_items").select("*").in("package_id", srcPkgIds)
      const itemsCopy = ((srcItems ?? []) as any[]).map(it => {
        const c: any = { ...it }; delete c.id; delete c.created_at
        c.package_id = pkgIdMap.get(it.package_id)
        return c
      })
      if (itemsCopy.length) {
        const { error } = await db.from("lms_package_items").insert(itemsCopy)
        if (error) return NextResponse.json({ error: `Item copy failed: ${error.message}` }, { status: 500 })
      }
    }

    // 6. Legacy content items
    const { data: srcContent } = await db.from("lms_content_items").select("*").in("module_id", srcModuleIds)
    const contentCopy = ((srcContent ?? []) as any[]).map(ci => {
      const c: any = { ...ci }; delete c.id; delete c.created_at; delete c.updated_at
      c.module_id = moduleIdMap.get(ci.module_id)
      return c
    })
    if (contentCopy.length) await db.from("lms_content_items").insert(contentCopy)
  }

  return NextResponse.json({ id: newCourseId, modules: moduleIdMap.size }, { status: 201 })
}
