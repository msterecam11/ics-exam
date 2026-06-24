import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ groupId: string }> }

/**
 * GET /api/interview/reports/[groupId]/ai-cache
 *
 * Returns all cached AI content for this group, keyed by section.
 * Frontend uses this to hydrate the report pages after generation.
 *
 * Query params:
 *  ?candidate_id=xxx   — fetch candidate-level cache
 *  ?track_id=xxx       — fetch track-level cache
 *  (none)              — fetch group-level cache
 */
export async function GET(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const role = session.user.role ?? ""
  if (!["admin", "instructor", "viewer"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params

  // Viewer: verify access via viewer_access table (read-only cache, safe to expose)
  if (role === "viewer") {
    const { data: accessRows } = await db
      .from("viewer_access")
      .select("resource_type, resource_id, permissions")
      .eq("user_id", session.user.id)
      .eq("system", "interview")

    const rows = accessRows ?? []
    const directOk = rows.some(
      a => a.permissions?.reports && a.resource_type === "group" && a.resource_id === groupId
    )

    if (!directOk) {
      const { data: grp } = await db
        .from("assessment_groups").select("config_id").eq("id", groupId).single()
      const configOk = grp?.config_id && rows.some(
        a => a.permissions?.reports && a.resource_type === "config" && a.resource_id === grp.config_id
      )
      if (!configOk) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }
  const { searchParams } = new URL(req.url)
  const candidateId = searchParams.get("candidate_id")
  const trackId     = searchParams.get("track_id")

  let query = db
    .from("interview_report_cache")
    .select("section, content")

  if (candidateId) {
    query = query.eq("group_id", groupId).eq("candidate_id", candidateId)
  } else if (trackId) {
    query = query.eq("group_id", groupId).eq("track_id", trackId)
  } else {
    query = query.eq("group_id", groupId).is("candidate_id", null).is("track_id", null)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return as a flat map: { section: content }
  const cache: Record<string, string> = {}
  for (const row of data ?? []) cache[row.section] = row.content

  return NextResponse.json(cache)
}
