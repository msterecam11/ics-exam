import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ groupId: string }> }

type BulkRow = {
  full_name: string
  employment_id?: string
  position?: string
  track_name?: string
  years_experience?: number | string
}

export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params
  const body = await req.json().catch(() => ({}))
  const rows: BulkRow[] = body.candidates

  if (!Array.isArray(rows) || rows.length === 0)
    return NextResponse.json({ error: "candidates array required" }, { status: 400 })

  // Verify group
  const { data: group } = await db
    .from("assessment_groups")
    .select("locked")
    .eq("id", groupId)
    .single()
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })
  if (group.locked) return NextResponse.json({ error: "Group is locked" }, { status: 409 })

  // Load all tracks to resolve track_name → track_id
  const { data: tracks } = await db.from("role_tracks").select("id, name")
  const trackMap: Record<string, string> = {}
  for (const t of tracks ?? []) trackMap[t.name.toLowerCase().trim()] = t.id

  // Validate + build insert payload
  const errors: string[] = []
  const inserts: Record<string, unknown>[] = []

  rows.forEach((row, i) => {
    const rowNum = i + 2 // 1-indexed + header row
    if (!row.full_name?.trim()) {
      errors.push(`Row ${rowNum}: full_name is required`)
      return
    }
    const trackId = row.track_name?.trim()
      ? (trackMap[row.track_name.trim().toLowerCase()] ?? null)
      : null
    if (row.track_name?.trim() && !trackId)
      errors.push(`Row ${rowNum}: track "${row.track_name}" not found — will be left blank`)

    const yearsExp = row.years_experience !== undefined && row.years_experience !== ""
      ? parseFloat(String(row.years_experience))
      : null

    inserts.push({
      group_id:        groupId,
      full_name:       row.full_name.trim(),
      employment_id:   row.employment_id?.trim() || null,
      position:        row.position?.trim() || null,
      track_id:        trackId,
      years_experience: yearsExp && !isNaN(yearsExp) ? yearsExp : null,
    })
  })

  if (inserts.length === 0)
    return NextResponse.json({ error: "No valid rows to insert", warnings: errors }, { status: 400 })

  const { data, error } = await db
    .from("interview_candidates")
    .insert(inserts)
    .select("*, role_tracks(id, name)")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    inserted: data?.length ?? 0,
    warnings: errors,
    candidates: data ?? [],
  }, { status: 201 })
}
