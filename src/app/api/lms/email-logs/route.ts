// EM-19 — the email log: everything sent, redirected, skipped or failed, with
// the reason, filterable by student, program, email type and outcome.

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const sp = new URL(req.url).searchParams
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 200), 1), 1000)

  let q = db
    .from("lms_email_log")
    .select("id, type, rule, to_email, intended_email, subject, status, reason, error, sent_at, student_id, course_id, program_id, lms_students(name), lms_programs(name)")
    .order("sent_at", { ascending: false })
    .limit(limit)

  const student = sp.get("student"); if (student && UUID.test(student)) q = q.eq("student_id", student)
  const program = sp.get("program"); if (program && UUID.test(program)) q = q.eq("program_id", program)
  const rule = sp.get("rule"); if (rule) q = q.eq("rule", rule)
  const status = sp.get("status"); if (status) q = q.eq("status", status)
  const since = sp.get("since"); if (since && /^\d{4}-\d{2}-\d{2}$/.test(since)) q = q.gte("sent_at", `${since}T00:00:00Z`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json((data ?? []).map((r: any) => ({
    id: r.id, type: r.type, rule: r.rule,
    to_email: r.to_email, intended_email: r.intended_email,
    subject: r.subject, status: r.status, reason: r.reason, error: r.error, sent_at: r.sent_at,
    student: r.lms_students?.name ?? null, student_id: r.student_id,
    program: r.lms_programs?.name ?? null, program_id: r.program_id,
  })))
}
