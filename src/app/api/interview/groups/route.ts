import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const isAssessor = session.user.role === "assessor"

  if (isAssessor) {
    // Assessors only see groups they are assigned to
    const { data: assignments } = await db
      .from("group_assessors")
      .select("group_id")
      .eq("assessor_id", session.user.id)

    const groupIds = (assignments ?? []).map((a: any) => a.group_id)
    if (groupIds.length === 0) return NextResponse.json([])

    const { data, error } = await db
      .from("assessment_groups")
      .select(`
        id, name, location, scheduled_date, status, created_at,
        assessment_configs ( id, name ),
        interview_candidates ( id )
      `)
      .in("id", groupIds)
      .order("created_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Admins / instructors see all groups
  const { data, error } = await db
    .from("assessment_groups")
    .select(`
      id, name, location, scheduled_date, status, created_at,
      assessment_configs ( id, name ),
      interview_candidates ( id )
    `)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { name, config_id, location, scheduled_date } = body
  if (!name?.trim() || !config_id)
    return NextResponse.json({ error: "name and config_id required" }, { status: 400 })

  const { data, error } = await db
    .from("assessment_groups")
    .insert({
      name: name.trim(),
      config_id,
      location: location?.trim() ?? null,
      scheduled_date: scheduled_date ?? null,
      created_by: session.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
