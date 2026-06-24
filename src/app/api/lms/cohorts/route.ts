import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// GET — list all cohorts with member count
export async function GET() {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Try full query first; fall back to basic columns if migration hasn't run
  let data: any[] | null = null

  const { data: fullData, error } = await db
    .from("lms_cohorts")
    .select(`
      id, name, description, mode, start_date, end_date,
      learning_path_id, created_at,
      lms_cohort_members(count),
      lms_learning_paths(id, title)
    `)
    .order("created_at", { ascending: false })

  if (error) {
    // Fall back to just the original columns
    const fallback = await db
      .from("lms_cohorts")
      .select("id, name, created_at, lms_cohort_members(count)")
      .order("created_at", { ascending: false })

    if (fallback.error)
      return NextResponse.json({ error: fallback.error.message }, { status: 500 })

    data = fallback.data
  } else {
    data = fullData
  }

  const cohorts = (data ?? []).map((c: any) => ({
    id:               c.id,
    name:             c.name,
    description:      c.description ?? null,
    mode:             c.mode ?? "unified",
    start_date:       c.start_date ?? null,
    end_date:         c.end_date ?? null,
    learning_path_id: c.learning_path_id ?? null,
    learning_path:    c.lms_learning_paths ?? null,
    member_count:     c.lms_cohort_members?.[0]?.count ?? 0,
    created_at:       c.created_at,
  }))

  return NextResponse.json(cohorts)
}

// POST — create cohort
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { name, description, mode, start_date, end_date, learning_path_id } = body
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 })

  // Try insert with all new columns; fall back to just name+created_by if migration hasn't run
  let data: any = null
  let error: any = null

  ;({ data, error } = await db
    .from("lms_cohorts")
    .insert({
      name:             name.trim(),
      description:      description?.trim() || null,
      mode:             mode ?? "unified",
      start_date:       start_date || null,
      end_date:         end_date   || null,
      learning_path_id: learning_path_id || null,
      created_by:       session.user.id,
    })
    .select("id, name, description, mode, start_date, end_date, learning_path_id, created_at")
    .single())

  if (error) {
    // Fall back — insert only original columns
    ;({ data, error } = await db
      .from("lms_cohorts")
      .insert({ name: name.trim(), created_by: session.user.id })
      .select("id, name, created_at")
      .single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    ...data,
    description: data.description ?? null,
    mode: data.mode ?? "unified",
    start_date: data.start_date ?? null,
    end_date: data.end_date ?? null,
    learning_path_id: data.learning_path_id ?? null,
    member_count: 0,
    learning_path: null,
  }, { status: 201 })
}

// PATCH — update cohort fields
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { id, name, description, mode, start_date, end_date, learning_path_id, certificate_enabled } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (name?.trim())                    updates.name                = name.trim()
  if ("description" in body)           updates.description         = description?.trim() || null
  if (mode)                            updates.mode                = mode
  if ("start_date" in body)            updates.start_date          = start_date || null
  if ("end_date" in body)              updates.end_date            = end_date   || null
  if ("learning_path_id" in body)      updates.learning_path_id    = learning_path_id || null
  if ("certificate_enabled" in body)   updates.certificate_enabled = !!certificate_enabled

  const { data, error } = await db
    .from("lms_cohorts")
    .update(updates)
    .eq("id", id)
    .select("id, name, description, mode, start_date, end_date, learning_path_id, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — delete cohort (cascades members)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { error } = await db.from("lms_cohorts").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
