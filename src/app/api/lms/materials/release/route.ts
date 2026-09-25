// Files that are "hidden until released" — handed out in class, one at a time.
//
// GET  ?group_id=                         — the group's releasable files and their state
// POST { material_id, group_id, released }  — release (or hide again) for one group:
//                                           admins, and the group's instructors and facilitators
// POST { material_id, released } (no group) — for everyone (course-wide): admins only

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff, forbidden } from "@/lib/staff-access"
import { isUuid } from "@/lib/lms-groups"

export const dynamic = "force-dynamic"

async function staffForGroup(groupId: unknown) {
  const g = await guardStaff({ allowFacilitator: true })
  if (!g.ok) return { ok: false as const, res: g.res }
  if (!isUuid(groupId)) return { ok: false as const, res: NextResponse.json({ error: "group_id required" }, { status: 400 }) }
  if (!g.scope.isAdmin && !g.scope.groupIds.includes(groupId)) return { ok: false as const, res: forbidden() }
  const { data: group } = await db.from("lms_course_groups").select("id, course_id, released_files").eq("id", groupId).maybeSingle()
  if (!group) return { ok: false as const, res: NextResponse.json({ error: "Group not found" }, { status: 404 }) }
  return { ok: true as const, g, group: group as any }
}

export async function GET(req: Request) {
  const a = await staffForGroup(new URL(req.url).searchParams.get("group_id"))
  if (!a.ok) return a.res
  const [{ data: files }, { data: mods }] = await Promise.all([
    db.from("lms_materials").select("id, title, file_name, module_id, group_id, released_at, order_index")
      .eq("course_id", a.group.course_id).eq("available_from", "release").or(`group_id.is.null,group_id.eq.${a.group.id}`),
    db.from("lms_modules").select("id, title, order_index").eq("course_id", a.group.course_id),
  ])
  const modOf = new Map(((mods ?? []) as any[]).map(m => [m.id, m]))
  const map = (a.group.released_files ?? {}) as Record<string, { at: string; by: string | null; by_name?: string | null }>
  const rows = ((files ?? []) as any[]).map(f => ({
    id: f.id, title: f.title, file_name: f.file_name,
    module: f.module_id ? modOf.get(f.module_id)?.title ?? null : null, module_order: f.module_id ? modOf.get(f.module_id)?.order_index ?? 999 : -1,
    group_only: !!f.group_id,
    everyone: !!f.released_at,
    released: !!f.released_at || !!map[f.id],
    released_at: map[f.id]?.at ?? f.released_at ?? null, released_by: map[f.id]?.by_name ?? null,
  })).sort((x, y) => x.module_order - y.module_order || x.title.localeCompare(y.title))
  return NextResponse.json({ files: rows })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (!isUuid(body.material_id) || typeof body.released !== "boolean") return NextResponse.json({ error: "material_id and released required" }, { status: 400 })
  const { data: mat } = await db.from("lms_materials").select("id, title, course_id, group_id, available_from").eq("id", body.material_id).maybeSingle()
  if (!mat || (mat as any).available_from !== "release") return NextResponse.json({ error: "That file isn't set to be released in class" }, { status: 400 })
  const m = mat as any

  // For everyone.
  if (!body.group_id) {
    const g = await guardStaff({ admin: true })
    if (!g.ok) return g.res
    await db.from("lms_materials").update({ released_at: body.released ? new Date().toISOString() : null }).eq("id", m.id)
    await auditLog({ user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any, body.released ? "lms.material.release_all" : "lms.material.hide_all", "lms_material", m.id, m.title, {})
    return NextResponse.json({ ok: true })
  }

  // For one group.
  const a = await staffForGroup(body.group_id)
  if (!a.ok) return a.res
  if (m.course_id !== a.group.course_id || (m.group_id && m.group_id !== a.group.id))
    return NextResponse.json({ error: "That file isn't part of this group's course" }, { status: 400 })
  const { data: fresh } = await db.from("lms_course_groups").select("released_files").eq("id", a.group.id).single()
  const next = { ...(((fresh as any)?.released_files) ?? {}) }
  if (body.released) next[m.id] = { at: new Date().toISOString(), by: a.g.session.id, by_name: a.g.session.name ?? null }
  else delete next[m.id]
  const { error } = await db.from("lms_course_groups").update({ released_files: next }).eq("id", a.group.id)
  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 })
  await auditLog({ user: { id: a.g.session.id, name: a.g.session.name, role: a.g.session.role } } as any,
    body.released ? "lms.material.release" : "lms.material.hide", "lms_material", m.id, m.title, { group_id: a.group.id })
  return NextResponse.json({ ok: true })
}
