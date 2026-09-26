// Open / lock the final exam and assignments for one group.
//
// GET   — the course's exam + assignments with their state for this group
// PATCH { module_id, open } — the instructor opens or locks one
//
// Admins and this group's instructors. Before anyone decides, the exam is
// locked and assignments are open (see defaultOpen).

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff, forbidden } from "@/lib/staff-access"
import { loadGroup, isUuid, isItemOpen, GATED_TYPES, type ItemAccess } from "@/lib/lms-groups"

export const dynamic = "force-dynamic"
type Params = { params: Promise<{ id: string }> }

async function access(id: string) {
  const g = await guardStaff()
  if (!g.ok) return { ok: false as const, res: g.res }
  if (!g.scope.isAdmin && !g.scope.instructorGroupIds.includes(id)) return { ok: false as const, res: forbidden() }
  const { data: group } = await db.from("lms_course_groups").select("id, course_id, item_access, start_date").eq("id", id).maybeSingle()
  if (!group) return { ok: false as const, res: NextResponse.json({ error: "Group not found" }, { status: 404 }) }
  return { ok: true as const, g, group: group as { id: string; course_id: string; item_access: ItemAccess; start_date: string | null } }
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const a = await access(id)
  if (!a.ok) return a.res
  const { data: mods } = await db.from("lms_modules").select("id, title, module_type, order_index, activity_settings, parent_module_id")
    .eq("course_id", a.group.course_id).in("module_type", [...GATED_TYPES]).order("order_index")
  const acc = a.group.item_access ?? {}
  const byIds = [...new Set(Object.values(acc).map(e => e.by).filter(Boolean))] as string[]
  const { data: users } = byIds.length ? await db.from("admin_users").select("id, name").in("id", byIds) : { data: [] as any[] }
  const nameOf = new Map(((users ?? []) as any[]).map(u => [u.id, u.name]))
  return NextResponse.json({
    items: ((mods ?? []) as any[]).map(m => ({
      id: m.id, title: m.title, module_type: m.module_type, open: isItemOpen(acc, m, a.group.start_date ?? null),
      release_in_class: m.module_type === "package" && m.activity_settings?.release_in_class === true,
      changed_by: acc[m.id]?.by ? nameOf.get(acc[m.id].by!) ?? null : null, changed_at: acc[m.id]?.at ?? null,
    })),
  })
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const a = await access(id)
  if (!a.ok) return a.res
  const body = await req.json().catch(() => ({}))
  if (!isUuid(body.module_id) || typeof body.open !== "boolean") return NextResponse.json({ error: "module_id and open required" }, { status: 400 })
  const { data: mod } = await db.from("lms_modules").select("id, title, module_type, course_id").eq("id", body.module_id).maybeSingle()
  if (!mod || (mod as any).course_id !== a.group.course_id || !(GATED_TYPES as readonly string[]).includes((mod as any).module_type))
    return NextResponse.json({ error: "Only a module, the final exam or an assignment of this course" }, { status: 400 })

  // Re-read and merge so two quick toggles don't overwrite each other.
  const { data: fresh } = await db.from("lms_course_groups").select("item_access").eq("id", id).single()
  const next: ItemAccess = { ...(((fresh as any)?.item_access) ?? {}), [body.module_id]: { open: body.open, by: a.g.session.id, at: new Date().toISOString() } }
  const { error } = await db.from("lms_course_groups").update({ item_access: next }).eq("id", id)
  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 })

  const actor = { user: { id: a.g.session.id, name: a.g.session.name, role: a.g.session.role } } as any
  await auditLog(actor, body.open ? "lms.group.item_open" : "lms.group.item_lock", "lms_module", (mod as any).id, (mod as any).title, { group_id: id })
  return NextResponse.json({ ok: true, open: body.open })
}
