import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { reapplyExamPassMark } from "@/lib/lms-exam-regrade"

// PATCH /api/lms/programs/[id]/rules — admin only
// Body: { course_id, pass_mark?, max_attempts?, apply_to_existing?: boolean }
//
// The program's own pass mark / attempts for one course. Changing the pass
// mark asks the admin whether existing results follow it (apply_to_existing)
// or only new attempts use it. Only this program's results are ever affected.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const { id } = await params

  const body = await req.json().catch(() => ({}))
  const courseId = body?.course_id
  if (typeof courseId !== "string") return NextResponse.json({ error: "course_id required" }, { status: 400 })

  const { data: rule } = await db
    .from("lms_program_course_rules").select("pass_mark, max_attempts")
    .eq("program_id", id).eq("course_id", courseId).maybeSingle()
  if (!rule) return NextResponse.json({ error: "This program doesn't deliver that course" }, { status: 404 })

  const updates: Record<string, number> = {}
  if (body.pass_mark !== undefined) {
    const n = Number(body.pass_mark)
    if (!Number.isInteger(n) || n < 0 || n > 100) return NextResponse.json({ error: "Pass mark must be a whole number from 0 to 100" }, { status: 400 })
    updates.pass_mark = n
  }
  if (body.max_attempts !== undefined) {
    const n = Number(body.max_attempts)
    if (!Number.isInteger(n) || n < 1 || n > 20) return NextResponse.json({ error: "Attempts must be a whole number from 1 to 20" }, { status: 400 })
    updates.max_attempts = n
  }
  if (!Object.keys(updates).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  const { error } = await db.from("lms_program_course_rules").update(updates).eq("program_id", id).eq("course_id", courseId)
  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 })

  let regrade = null
  // Re-applying is idempotent (only differing verdicts are written), so it runs
  // whenever asked — which also lets a failed run be retried.
  if (updates.pass_mark !== undefined && body.apply_to_existing === true) {
    try {
      regrade = await reapplyExamPassMark(courseId, { programId: id })
    } catch (err) {
      console.error("[programs] pass mark re-check failed", { programId: id, courseId, err })
      return NextResponse.json({ ok: true, regrade_error: "Saved, but existing results could not all be re-checked. Save again with 'apply to existing results' to retry." })
    }
  }

  await auditLog(session, "lms.program.rules", "lms_program", id, null, { course_id: courseId, ...updates, apply_to_existing: body.apply_to_existing === true })
  return NextResponse.json({ ok: true, ...(regrade ? { regrade } : {}) })
}
