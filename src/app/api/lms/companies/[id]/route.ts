import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { COMPANY_COLUMNS, parseCompanyInput, companyConflictMessage } from "@/lib/lms-companies"

const isMgr = (role?: string) => role === "admin" || role === "instructor"

// GET /api/lms/companies/[id] — company + its students
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const [{ data: company }, { data: students, error: sErr }] = await Promise.all([
    db.from("lms_companies").select(COMPANY_COLUMNS).eq("id", id).maybeSingle(),
    db.from("lms_students")
      .select("id, name, email, job_title, department, employee_number, last_login, created_at")
      .eq("company_id", id)
      .order("name"),
  ])
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })
  if (sErr) return NextResponse.json({ error: "Could not load students" }, { status: 500 })

  return NextResponse.json({ company, students: students ?? [] })
}

// PATCH /api/lms/companies/[id] — admin only
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { id } = await params
  const parsed = parseCompanyInput(await req.json().catch(() => ({})), true)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (!Object.keys(parsed.values).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  const { data, error } = await db
    .from("lms_companies")
    .update(parsed.values)
    .eq("id", id)
    .select(COMPANY_COLUMNS)
    .maybeSingle()

  if (error) {
    const conflict = companyConflictMessage(error)
    return NextResponse.json({ error: conflict ?? "Could not update company" }, { status: conflict ? 409 : 500 })
  }
  if (!data) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  await auditLog(session, "lms.company.update", "lms_company", id, (data as any).name, { fields: Object.keys(parsed.values) })
  return NextResponse.json(data)
}

// DELETE /api/lms/companies/[id] — admin only; refused while anything references it
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { id } = await params
  const { data: company } = await db.from("lms_companies").select("id, name").eq("id", id).maybeSingle()
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  // A company with history is deactivated, never deleted, so past reports keep
  // their client. (Programs will be checked here too once they exist.)
  const { count, error: cErr } = await db
    .from("lms_students").select("*", { count: "exact", head: true }).eq("company_id", id)
  if (cErr) return NextResponse.json({ error: "Could not verify the company is safe to delete" }, { status: 500 })
  if ((count ?? 0) > 0)
    return NextResponse.json(
      { error: `This company has ${count} student${count === 1 ? "" : "s"}. Deactivate it instead — its history is kept.` },
      { status: 409 }
    )

  const { error } = await db.from("lms_companies").delete().eq("id", id)
  // 23503: something else still references it (the FK refuses) — same advice.
  if (error) return NextResponse.json(
    { error: error.code === "23503" ? "This company is still in use. Deactivate it instead." : "Could not delete company" },
    { status: error.code === "23503" ? 409 : 500 }
  )

  await auditLog(session, "lms.company.delete", "lms_company", id, company.name)
  return NextResponse.json({ ok: true })
}
