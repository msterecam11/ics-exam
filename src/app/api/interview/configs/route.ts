import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await db
    .from("assessment_configs")
    .select(`
      id, name, description, assessor_weights, verdict_thresholds, created_at,
      pillars ( id, name, weight, order_index, applicable_track_ids,
        competencies ( id, name, weight, order_index )
      )
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
  const { name, description } = body
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 })

  const { data, error } = await db
    .from("assessment_configs")
    .insert({ name: name.trim(), description: description?.trim() ?? null, created_by: session.user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
