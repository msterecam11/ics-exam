import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { isMgr } from "@/lib/staff-roles"

// GET /api/lms/packages/[id]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params

  const { data, error } = await db
    .from("lms_packages")
    .select(`
      id, module_id, course_id, title, description,
      pass_mark, free_navigation, certificate_on_pass, created_at, updated_at,
      lms_package_items (
        id, package_id, order_index, type, title, config, required, created_at
      )
    `)
    .eq("id", id)
    .single()

  if (error) {
    if (error.code === "PGRST116")
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ...data,
    lms_package_items: [...(data.lms_package_items ?? [])].sort(
      (a, b) => a.order_index - b.order_index
    ),
  })
}

// PUT /api/lms/packages/[id]
// Body: { title?, description?, pass_mark?, certificate_on_pass?, items[] }
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { title, description, pass_mark, free_navigation, certificate_on_pass, items } = body

  const { error: pkgErr } = await db
    .from("lms_packages")
    .update({
      ...(title               !== undefined && { title }),
      ...(description         !== undefined && { description }),
      ...(pass_mark           !== undefined && { pass_mark }),
      ...(free_navigation     !== undefined && { free_navigation }),
      ...(certificate_on_pass !== undefined && { certificate_on_pass }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (pkgErr) return NextResponse.json({ error: pkgErr.message }, { status: 500 })

  if (Array.isArray(items)) {
    // Items are updated IN PLACE, keeping their ids.
    //
    // This used to delete every item in the package and re-insert the list,
    // which gave every item a brand-new id on every save. Student progress is
    // keyed by item id (lms_package_progress.completed_items and item_scores),
    // so the first edit to a package — even correcting one slide title — would
    // have detached every student's completed items and scores for it (the
    // player's ticks, resume position and the report's per-item scores). All 48
    // packages have student progress and none has been saved since, which is
    // the only reason no progress has been lost yet.
    //
    // It was also not atomic: if the re-insert failed after the delete, the
    // package was left with no items at all. Now nothing is deleted until the
    // new state has been written, and only items actually removed are deleted.
    //
    // The editor sends existing items with their database id and new ones with
    // a client id ("new_…"), and after a successful save it reloads the items
    // with their database ids.
    const { data: currentRows, error: curErr } = await db
      .from("lms_package_items").select("id").eq("package_id", id)
    if (curErr) return NextResponse.json({ error: "Could not load package items" }, { status: 500 })
    const currentIds = new Set((currentRows ?? []).map((r: any) => r.id as string))

    const rows = items.map((item: any, i: number) => ({
      // Only reuse an id that already belongs to THIS package — never accept an
      // arbitrary id from the client (that could overwrite another package's item).
      ...(typeof item.id === "string" && currentIds.has(item.id) ? { id: item.id } : {}),
      package_id:  id,
      order_index: i,
      type:        item.type,
      title:       item.title ?? null,
      config:      item.config ?? {},
      required:    item.required ?? true,
    }))

    const existing = rows.filter((r: any) => r.id)
    const added    = rows.filter((r: any) => !r.id)

    // 1. Write the new state first.
    if (existing.length) {
      const { error: upErr } = await db.from("lms_package_items").upsert(existing, { onConflict: "id" })
      if (upErr) return NextResponse.json({ error: "Could not save package items" }, { status: 500 })
    }
    if (added.length) {
      const { error: insErr } = await db.from("lms_package_items").insert(added)
      if (insErr) return NextResponse.json({ error: "Could not save new package items" }, { status: 500 })
    }

    // 2. Only then remove the items the editor no longer contains.
    const keptIds = new Set(existing.map((r: any) => r.id as string))
    const removed = [...currentIds].filter(itemId => !keptIds.has(itemId))
    if (removed.length) {
      const { error: delErr } = await db.from("lms_package_items").delete().in("id", removed).eq("package_id", id)
      if (delErr) return NextResponse.json({ error: "Could not remove deleted package items" }, { status: 500 })
    }
  }

  const { data, error } = await db
    .from("lms_packages")
    .select(`*, lms_package_items(*)`)
    .eq("id", id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ...data,
    lms_package_items: [...(data.lms_package_items ?? [])].sort(
      (a, b) => a.order_index - b.order_index
    ),
  })
}

// DELETE /api/lms/packages/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Admin only. Deleting a package cascades to lms_package_progress, erasing
  // every student's progress and scores in it — yet any instructor could do it,
  // while deleting the containing module is already admin-only. Nothing in the
  // UI calls this endpoint.
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const { error } = await db.from("lms_packages").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
