import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff } from "@/lib/staff-access"
import { runCorrections } from "@/lib/lms-exam-bank"

// POST /api/lms/modules/[id]/recalculate-attempts
// Body: { preview?: boolean, include_finished?: boolean }
//
// Re-marks every paper of a final exam against the CURRENT content of the
// version each student was given — i.e. it applies corrections. It never
// applies an update: a question rewritten as a new version reaches future
// papers only, because an old paper keeps its version number.
//
// Admin only. A correction reaches every program that sat the exam, so it is
// not something an instructor can do for one group (IR-15). Programs that are
// completed or archived are left alone unless `include_finished` is set —
// their reports and certificates have already gone to the client.
//
// `preview: true` works out exactly what would change and writes nothing.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const { id: moduleId } = await params

  const { data: module } = await db.from("lms_modules").select("id, title, module_type").eq("id", moduleId).single()
  if (!module) return NextResponse.json({ error: "Module not found" }, { status: 404 })
  if ((module as any).module_type !== "final_exam")
    return NextResponse.json({ error: "Not a Final Exam module" }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const preview = body?.preview === true
  const includeFinished = body?.include_finished === true

  const report = await runCorrections({ moduleId }, { apply: !preview, includeFinished, actorId: g.session.id })

  if (!preview)
    await auditLog({ user: { id: g.session.id, name: g.session.name } } as any, "lms.exam.recalculate", "lms_module",
      moduleId, (module as any).title, {
        checked: report.checked, changed: report.changed, include_finished: includeFinished,
        finished_left_alone: includeFinished ? 0 : report.finished.attempts,
      })

  // `recalculated` / `changed` / `flips` keep the shape the older editor reads.
  return NextResponse.json({ preview, recalculated: report.checked, ...report })
}
