import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// GET /api/interview/schedule/candidates
// Returns candidate list for system-mode booking page name dropdown
// Query params: source_type, group_id?, track_id?
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const source_type = searchParams.get("source_type")
  const group_id    = searchParams.get("group_id")
  const track_id    = searchParams.get("track_id")

  let query = db
    .from("interview_candidates")
    .select(`
      id, full_name, position, years_experience,
      group_id, track_id,
      assessment_groups ( id, name ),
      role_tracks       ( id, name )
    `)
    .order("full_name", { ascending: true })

  if (source_type === "group" && group_id) {
    query = query.eq("group_id", group_id)
  } else if (source_type === "group_role" && group_id && track_id) {
    query = query.eq("group_id", group_id).eq("track_id", track_id)
  } else if (source_type === "role" && track_id) {
    query = query.eq("track_id", track_id)
  } else {
    return NextResponse.json({ error: "Invalid source_type or missing parameters" }, { status: 400 })
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
