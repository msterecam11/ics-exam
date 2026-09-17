import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { COMPANY_COLUMNS, parseCompanyInput, companyConflictMessage } from "@/lib/lms-companies"

const isMgr = (role?: string) => role === "admin" || role === "instructor"

// GET /api/lms/companies?status=active — list with student counts
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const status = new URL(req.url).searchParams.get("status")
  let query = db.from("lms_companies").select(COMPANY_COLUMNS).order("name")
  if (status === "active" || status === "inactive") query = query.eq("status", status)

  const [{ data: companies, error }, { data: links, error: lErr }] = await Promise.all([
    query,
    db.from("lms_students").select("company_id").not("company_id", "is", null),
  ])
  if (error || lErr) return NextResponse.json({ error: "Could not load companies" }, { status: 500 })

  const counts = new Map<string, number>()
  for (const l of (links ?? []) as { company_id: string }[]) counts.set(l.company_id, (counts.get(l.company_id) ?? 0) + 1)

  return NextResponse.json((companies ?? []).map((c: any) => ({ ...c, student_count: counts.get(c.id) ?? 0 })))
}

// POST /api/lms/companies — admin only
export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const parsed = parseCompanyInput(await req.json().catch(() => ({})), false)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data, error } = await db
    .from("lms_companies")
    .insert({ ...parsed.values, created_by: session.user.id })
    .select(COMPANY_COLUMNS)
    .single()

  if (error) {
    const conflict = companyConflictMessage(error)
    return NextResponse.json({ error: conflict ?? "Could not create company" }, { status: conflict ? 409 : 500 })
  }

  await auditLog(session, "lms.company.create", "lms_company", (data as any).id, (data as any).name)
  return NextResponse.json({ ...data, student_count: 0 }, { status: 201 })
}
