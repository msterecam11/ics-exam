// Step 11 — things a person decides after a correction. Admin only.
//
// GET  ?status=open|resolved
// POST { id, action: "keep" }                              → leave as it is
// POST { id, action: "revoke", reason }                   → certificate review only
// POST { id, action: "suggest" }                          → remark: ask the AI for a mark (nothing saved)
// POST { id, action: "remark", score, reason? }           → remark: set the mark and re-score the attempt
//
// Nothing here happens on its own: a certificate is never revoked and a mark
// never changes until someone chooses to.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff } from "@/lib/staff-access"
import { scorePaper, type PaperQuestion } from "@/lib/lms-exam-bank"
import { scoreOpenEndedAnswer } from "@/lib/ai-scoring"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"

export const dynamic = "force-dynamic"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const status = new URL(req.url).searchParams.get("status") === "resolved" ? "resolved" : "open"
  const { data, error } = await db.from("lms_exam_reviews")
    .select("id, kind, status, question_id, details, resolution, created_at, resolved_at, attempt_id, lms_students(id, name), lms_courses(id, title)")
    .eq("status", status).order("created_at", { ascending: status === "open" }).limit(300)
  if (error) return NextResponse.json({ error: "Could not load reviews" }, { status: 500 })

  // For re-marks, the question and the student's answer, so it can be judged on screen.
  const attemptIds = [...new Set(((data ?? []) as any[]).filter(r => r.kind === "remark").map(r => r.attempt_id))]
  const { data: attempts } = attemptIds.length
    ? await db.from("lms_module_attempts").select("id, paper, answers, ai_feedback").in("id", attemptIds)
    : { data: [] as any[] }
  const byAttempt = new Map(((attempts ?? []) as any[]).map(a => [a.id, a]))

  return NextResponse.json(((data ?? []) as any[]).map(r => {
    const a = r.kind === "remark" ? byAttempt.get(r.attempt_id) : null
    const q = a ? (a.paper ?? []).find((x: any) => x.id === r.question_id) : null
    return {
      id: r.id, kind: r.kind, status: r.status, resolution: r.resolution,
      created_at: r.created_at, resolved_at: r.resolved_at,
      student: r.lms_students ? { id: r.lms_students.id, name: r.lms_students.name } : null,
      course: r.lms_courses ? { id: r.lms_courses.id, title: r.lms_courses.title } : null,
      details: r.details,
      ...(q ? {
        question: { text: q.text, rubric: q.rubric ?? "", points: q.points },
        answer: typeof a.answers?.[r.question_id] === "string" ? a.answers[r.question_id] : "",
        current: a.ai_feedback?.open_ended_scores?.[r.question_id] ?? null,
      } : {}),
    }
  }))
}

export async function POST(req: Request) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const actor = { user: { id: g.session.id, name: g.session.name } } as any
  const body = await req.json().catch(() => ({}))
  if (typeof body.id !== "string" || !UUID_RE.test(body.id)) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: r } = await db.from("lms_exam_reviews").select("*").eq("id", body.id).maybeSingle()
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const review = r as any
  if (review.status !== "open") return NextResponse.json({ error: "Already decided" }, { status: 409 })

  const close = (resolution: string) => db.from("lms_exam_reviews").update({
    status: "resolved", resolution, resolved_by: g.session.id, resolved_at: new Date().toISOString(),
  }).eq("id", review.id).eq("status", "open")

  if (body.action === "keep") {
    await close(review.kind === "certificate" ? "Certificate kept" : "Mark kept")
    await auditLog(actor, `lms.exam.review.keep`, "lms_exam_review", review.id, null, { kind: review.kind })
    return NextResponse.json({ ok: true })
  }

  if (review.kind === "certificate" && body.action === "revoke") {
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : ""
    if (!reason) return NextResponse.json({ error: "Give a reason — it is kept with the certificate record" }, { status: 400 })
    const certId = review.details?.certificate_id
    if (!certId) return NextResponse.json({ error: "No certificate on this review" }, { status: 409 })
    await db.from("lms_certificates").update({ revoked_at: new Date().toISOString() }).eq("id", certId).is("revoked_at", null)
    await close(`Certificate revoked: ${reason}`)
    await auditLog(actor, "lms.certificate.revoke", "lms_certificate", certId, review.details?.code ?? null, { reason, review_id: review.id })
    return NextResponse.json({ ok: true })
  }

  if (review.kind === "remark" && (body.action === "suggest" || body.action === "remark")) {
    const { data: a } = await db.from("lms_module_attempts")
      .select("id, student_id, course_id, enrollment_id, score, max_score, passed, paper, answers, ai_feedback")
      .eq("id", review.attempt_id).single()
    if (!a) return NextResponse.json({ error: "The attempt no longer exists" }, { status: 404 })
    const attempt = a as any
    const q = (attempt.paper ?? []).find((x: any) => x.id === review.question_id) as PaperQuestion | undefined
    if (!q) return NextResponse.json({ error: "That question isn't on the paper" }, { status: 409 })

    if (body.action === "suggest") {
      const { allowed, retryAfterSeconds } = await rateLimit(`lms-ai-grade:${g.session.id}`, 30, 600)
      if (!allowed) return res429(retryAfterSeconds)
      const answer = typeof attempt.answers?.[q.id] === "string" ? attempt.answers[q.id] : ""
      if (!answer.trim()) return NextResponse.json({ suggestion: { score: 0, justification: "No answer was given." } })
      const suggestion = await scoreOpenEndedAnswer(
        q.text ?? "", q.rubric?.trim() || "Evaluate the answer for accuracy, completeness, and relevance.", answer, Number(q.points ?? 1))
      return NextResponse.json({ suggestion })
    }

    const score = Number(body.score)
    if (!Number.isFinite(score) || score < 0 || score > Number(q.points ?? 0))
      return NextResponse.json({ error: `The mark must be between 0 and ${q.points}` }, { status: 400 })

    const aiFeedback = { ...(attempt.ai_feedback ?? {}) }
    aiFeedback.open_ended_scores = { ...(aiFeedback.open_ended_scores ?? {}),
      [q.id]: { score, justification: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "Re-marked after the rubric was corrected" } }
    // This mark replaces any earlier instructor override for the question.
    if (aiFeedback.question_overrides?.[q.id]) {
      const { [q.id]: _dropped, ...rest } = aiFeedback.question_overrides
      aiFeedback.question_overrides = rest
    }
    const result = scorePaper(attempt.paper, attempt.answers, aiFeedback.open_ended_scores, aiFeedback.question_overrides)

    // The pass mark that applies to this attempt's program.
    const { data: enr } = attempt.enrollment_id
      ? await db.from("lms_enrollments").select("program_id").eq("id", attempt.enrollment_id).maybeSingle()
      : { data: null }
    let passMark = 70
    const programId = (enr as any)?.program_id
    if (programId) {
      const { data: rule } = await db.from("lms_program_course_rules").select("pass_mark").eq("program_id", programId).eq("course_id", attempt.course_id).maybeSingle()
      if ((rule as any)?.pass_mark != null) passMark = Number((rule as any).pass_mark)
    } else {
      const { data: c } = await db.from("lms_courses").select("final_exam_pass_mark").eq("id", attempt.course_id).maybeSingle()
      passMark = Number((c as any)?.final_exam_pass_mark ?? 70)
    }
    const passed = !aiFeedback.time_limit_exceeded && result.pct >= passMark

    await db.from("lms_module_attempts").update({
      ai_feedback: aiFeedback, score: result.score, max_score: result.maxScore, passed,
    }).eq("id", attempt.id)
    await close(`Re-marked: ${score}/${q.points}`)

    if (!attempt.passed && passed) {
      const { checkCourseCompletion } = await import("@/lib/lms-completion")
      await checkCourseCompletion(attempt.student_id, attempt.course_id, attempt.enrollment_id ?? undefined)
    }
    await auditLog(actor, "lms.exam.remark", "lms_module_attempt", attempt.id, null,
      { question_id: q.id, score, before: { score: attempt.score, passed: attempt.passed }, after: { score: result.score, passed } })
    return NextResponse.json({ ok: true, score: result.score, maxScore: result.maxScore, passed })
  }

  return NextResponse.json({ error: "Unknown action for this review" }, { status: 400 })
}
