import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { PROGRAM_COLUMNS } from "@/lib/lms-programs"
import { parseProgramInput } from "@/lib/lms-program-input"
import { isMgr } from "@/lib/staff-roles"

// GET /api/lms/programs?status=&company_id=
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const sp = new URL(req.url).searchParams
  let query = db
    .from("lms_programs")
    .select(`${PROGRAM_COLUMNS}, lms_companies(id, name, code)`)
    .order("created_at", { ascending: false })
  const status = sp.get("status")
  if (status && status !== "all") query = query.eq("status", status)
  const companyId = sp.get("company_id")
  if (companyId === "individual") query = query.eq("is_individual", true)
  else if (companyId) query = query.eq("company_id", companyId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: "Could not load programs" }, { status: 500 })

  const ids = ((data ?? []) as any[]).map(p => p.id)
  const [{ data: members }, { data: tracks }] = ids.length
    ? await Promise.all([
        db.from("lms_program_members").select("program_id, status").in("program_id", ids),
        db.from("lms_program_tracks").select("program_id").in("program_id", ids),
      ])
    : [{ data: [] }, { data: [] }]

  const counts = new Map<string, { active: number; completed: number; withdrawn: number; tracks: number }>()
  const get = (id: string) => counts.get(id) ?? (counts.set(id, { active: 0, completed: 0, withdrawn: 0, tracks: 0 }), counts.get(id)!)
  for (const m of (members ?? []) as any[]) (get(m.program_id) as any)[m.status]++
  for (const t of (tracks ?? []) as any[]) get(t.program_id).tracks++

  return NextResponse.json(((data ?? []) as any[]).map(p => ({
    ...p,
    member_counts: get(p.id),
  })))
}

// POST /api/lms/programs — admin only; always created as draft
export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const parsed = await parseProgramInput(body, false)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data, error } = await db
    .from("lms_programs")
    .insert({ ...parsed.values, status: "draft", created_by: session.user.id })
    .select(PROGRAM_COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: "Could not create program" }, { status: 500 })

  await auditLog(session, "lms.program.create", "lms_program", (data as any).id, (data as any).name)
  return NextResponse.json(data, { status: 201 })
}
