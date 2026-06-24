import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// GET — list tracks for a cohort
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const cohortId = searchParams.get("cohort_id")
  if (!cohortId) return NextResponse.json({ error: "cohort_id required" }, { status: 400 })

  const { data, error } = await db
    .from("lms_cohort_tracks")
    .select("id, name, order_index, created_at, lms_cohort_members(count)")
    .eq("cohort_id", cohortId)
    .order("order_index", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tracks = (data ?? []).map((t: any) => ({
    id:            t.id,
    name:          t.name,
    order_index:   t.order_index,
    created_at:    t.created_at,
    student_count: t.lms_cohort_members?.[0]?.count ?? 0,
  }))

  return NextResponse.json(tracks)
}

// POST — create track
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { cohort_id, name } = body
  if (!cohort_id) return NextResponse.json({ error: "cohort_id required" }, { status: 400 })
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 })

  const { count } = await db
    .from("lms_cohort_tracks")
    .select("*", { count: "exact", head: true })
    .eq("cohort_id", cohort_id)

  const { data, error } = await db
    .from("lms_cohort_tracks")
    .insert({ cohort_id, name: name.trim(), order_index: count ?? 0 })
    .select("id, name, order_index, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, student_count: 0, courses: [] }, { status: 201 })
}

// PATCH — rename track
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { id, name } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 })

  const { data, error } = await db
    .from("lms_cohort_tracks")
    .update({ name: name.trim() })
    .eq("id", id)
    .select("id, name, order_index")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — delete track (clears track_id on members first)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  await db.from("lms_cohort_members").update({ track_id: null }).eq("track_id", id)
  const { error } = await db.from("lms_cohort_tracks").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
