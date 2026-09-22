import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { isMgr } from "@/lib/staff-roles"

// Who delivers a course — us, or a training partner (ICAO, Etihad Aviation
// Training, …). Separate from the CLIENT, which is who receives the training.
// One row is "us" (is_self) and can never be archived or deleted.

const COLUMNS = `id, name, short_code, logo_url, country, website,
                 contact_name, contact_email, contact_phone, notes, is_self, status, created_at`
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Input = Record<string, unknown>
const text = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.trim() : ""
  return s ? s.slice(0, max) : null
}

function parse(body: Input, isUpdate: boolean): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const row: Record<string, unknown> = {}
  if (!isUpdate || "name" in body) {
    const name = text(body.name, 200)
    if (!name) return { ok: false, error: "Give the provider a name" }
    row.name = name
  }
  for (const [key, max] of [["short_code", 20], ["country", 100], ["website", 300],
                            ["contact_name", 200], ["contact_email", 200], ["contact_phone", 50],
                            ["notes", 2000], ["logo_url", 1000]] as const) {
    if (key in body) row[key] = text(body[key], max)
  }
  if ("status" in body) {
    if (body.status !== "active" && body.status !== "archived") return { ok: false, error: "Unknown status" }
    row.status = body.status
  }
  return { ok: true, row }
}

// GET /api/lms/providers?status=active — with how many courses use each
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const status = new URL(req.url).searchParams.get("status")
  let query = db.from("lms_service_providers").select(COLUMNS).order("is_self", { ascending: false }).order("name")
  if (status === "active" || status === "archived") query = query.eq("status", status)

  const [{ data: providers, error }, { data: courses }] = await Promise.all([
    query,
    db.from("lms_courses").select("provider_id").not("provider_id", "is", null),
  ])
  if (error) return NextResponse.json({ error: "Could not load providers" }, { status: 500 })

  const used = new Map<string, number>()
  for (const c of (courses ?? []) as any[]) used.set(c.provider_id, (used.get(c.provider_id) ?? 0) + 1)

  return NextResponse.json((providers ?? []).map((p: any) => ({ ...p, course_count: used.get(p.id) ?? 0 })))
}

// POST /api/lms/providers — admin only
export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const parsed = parse(await req.json().catch(() => ({})), false)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data, error } = await db.from("lms_service_providers")
    .insert({ ...parsed.row, created_by: session.user.id }).select(COLUMNS).single()

  if (error) {
    if (error.message.includes("lms_service_providers_name_key"))
      return NextResponse.json({ error: "A provider with that name already exists" }, { status: 409 })
    return NextResponse.json({ error: "Could not create the provider" }, { status: 500 })
  }
  await auditLog(session, "lms.provider.create", "lms_service_provider", (data as any).id, (data as any).name, parsed.row)
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/lms/providers — admin only. Archiving is how a used provider goes away.
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const body = await req.json().catch(() => ({})) as Input
  const id = typeof body.id === "string" && UUID_RE.test(body.id) ? body.id : null
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: existing } = await db.from("lms_service_providers").select("id, name, is_self").eq("id", id).maybeSingle()
  if (!existing) return NextResponse.json({ error: "Provider not found" }, { status: 404 })
  if ((existing as any).is_self && body.status === "archived")
    return NextResponse.json({ error: "ICS can't be archived — it's us" }, { status: 400 })

  const parsed = parse(body, true)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data, error } = await db.from("lms_service_providers")
    .update(parsed.row).eq("id", id).select(COLUMNS).single()

  if (error) {
    if (error.message.includes("lms_service_providers_name_key"))
      return NextResponse.json({ error: "A provider with that name already exists" }, { status: 409 })
    return NextResponse.json({ error: "Could not save the provider" }, { status: 500 })
  }
  await auditLog(session, "lms.provider.update", "lms_service_provider", id, (data as any).name, parsed.row)
  return NextResponse.json(data)
}

// DELETE /api/lms/providers?id= — only while nothing uses it; otherwise archive.
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const id = new URL(req.url).searchParams.get("id")
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: existing } = await db.from("lms_service_providers").select("id, name, is_self").eq("id", id).maybeSingle()
  if (!existing) return NextResponse.json({ error: "Provider not found" }, { status: 404 })
  if ((existing as any).is_self) return NextResponse.json({ error: "ICS can't be deleted — it's us" }, { status: 400 })

  const { count } = await db.from("lms_courses").select("id", { count: "exact", head: true }).eq("provider_id", id)
  if ((count ?? 0) > 0)
    return NextResponse.json({
      error: `${count} course${count === 1 ? " uses" : "s use"} this provider — archive it instead`,
    }, { status: 409 })

  const { error } = await db.from("lms_service_providers").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "Could not delete the provider" }, { status: 500 })
  await auditLog(session, "lms.provider.delete", "lms_service_provider", id, (existing as any).name)
  return NextResponse.json({ ok: true })
}
