// An instructor changes the mark of one question on a final-exam attempt.
//
// GET  ?attempt_id=  — the paper: each question, the participant's answer,
//                      the automatic mark and any instructor mark
// POST { attempt_id, question_id, score | null, reason }
//      score: the new mark (0–points); null puts the automatic mark back.
//      A reason is always required and kept with who/when; the attempt's
//      score and pass/fail are recalculated and the course re-checked.
//
// Any staff who can see the participant (admins, their program's or group's
// instructors).

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff, canSeeStudent, forbidden } from "@/lib/staff-access"
import { scorePaper, passMarkFor, type PaperQuestion, type QuestionOverride } from "@/lib/lms-exam-bank"
import { scoreObjectiveQuestion } from "@/lib/lms-exam-scoring"
import { checkCourseCompletion, syncEnrollmentProgress } from "@/lib/lms-completion"
import { isUuid } from "@/lib/lms-groups"

export const dynamic = "force-dynamic"

const COLS = "id, student_id, enrollment_id, course_id, module_id, attempt_no, score, max_score, passed, answers, paper, ai_feedback, submitted_at, lms_modules!inner(module_type, title), lms_students(name)"

async function load(attemptId: unknown) {
  const g = await guardStaff()
  if (!g.ok) return { ok: false as const, res: g.res }
  if (!isUuid(attemptId)) return { ok: false as const, res: NextResponse.json({ error: "attempt_id required" }, { status: 400 }) }
  const { data } = await db.from("lms_module_attempts").select(COLS).eq("id", attemptId).maybeSingle()
  const a = data as any
  if (!a || a.lms_modules?.module_type !== "final_exam") return { ok: false as const, res: NextResponse.json({ error: "Exam attempt not found" }, { status: 404 }) }
  if (!(await canSeeStudent(g.scope, a.student_id))) return { ok: false as const, res: forbidden() }
  return { ok: true as const, g, a }
}

/** The automatic mark: the key for objective questions, the AI's for open-ended. */
function autoScore(q: PaperQuestion, a: any): number {
  if (q.type === "open_ended") return Math.min(Number(a.ai_feedback?.open_ended_scores?.[q.id]?.score ?? 0), Number(q.points ?? 0))
  return scoreObjectiveQuestion(q as any, (a.answers ?? {})[q.id])
}

/** The participant's answer in words. */
function answerText(q: any, ans: any): string {
  if (ans === undefined || ans === null || ans === "") return ""
  if (q.type === "open_ended") return String(ans)
  if (q.type === "mcq_single" || q.type === "mcq_multiple") {
    const ids = Array.isArray(ans) ? ans : [ans]
    return ids.map((id: string) => q.options?.find((o: any) => o.id === id)?.text ?? id).join("; ")
  }
  if (q.type === "ordering") return (Array.isArray(ans) ? ans : []).map((id: string) => q.items?.find((i: any) => i.id === id)?.text ?? id).join(" → ")
  if (q.type === "match_pair") return (q.pairs ?? []).map((p: any) => `${p.left} → ${ans?.[p.id] ?? "—"}`).join("; ")
  return JSON.stringify(ans)
}

function correctText(q: any): string | null {
  if (q.type === "mcq_single" || q.type === "mcq_multiple") return (q.options ?? []).filter((o: any) => o.correct).map((o: any) => o.text).join("; ")
  if (q.type === "ordering") return (q.items ?? []).map((i: any) => i.text).join(" → ")
  if (q.type === "match_pair") return (q.pairs ?? []).map((p: any) => `${p.left} → ${p.right}`).join("; ")
  return q.rubric ?? null
}

export async function GET(req: Request) {
  const l = await load(new URL(req.url).searchParams.get("attempt_id"))
  if (!l.ok) return l.res
  const a = l.a
  const overrides: Record<string, QuestionOverride> = a.ai_feedback?.question_overrides ?? {}
  const paper = (Array.isArray(a.paper) ? a.paper : []) as PaperQuestion[]
  return NextResponse.json({
    attempt: {
      id: a.id, attempt_no: a.attempt_no, score: a.score, max_score: a.max_score, passed: a.passed, submitted_at: a.submitted_at,
      student: a.lms_students?.name ?? null, exam: a.lms_modules?.title ?? "Final exam",
      time_limit_exceeded: !!a.ai_feedback?.time_limit_exceeded,
    },
    questions: paper.map((q: any, i: number) => ({
      id: q.id, n: i + 1, type: q.type, text: q.text ?? "", points: Number(q.points ?? 0), voided: !!q.voided,
      answer: answerText(q, (a.answers ?? {})[q.id]), correct: correctText(q),
      auto: q.voided ? 0 : autoScore(q, a),
      ai_note: q.type === "open_ended" ? a.ai_feedback?.open_ended_scores?.[q.id]?.justification ?? null : null,
      override: overrides[q.id] ?? null,
    })),
    history: a.ai_feedback?.rescores ?? [],
  })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const l = await load(body.attempt_id)
  if (!l.ok) return l.res
  const { g, a } = l
  const paper = (Array.isArray(a.paper) ? a.paper : []) as PaperQuestion[]
  const q = paper.find((x: any) => x.id === body.question_id)
  if (!q) return NextResponse.json({ error: "That question isn't on this paper" }, { status: 400 })
  if ((q as any).voided) return NextResponse.json({ error: "This question was voided and counts for nobody" }, { status: 400 })
  const reason = typeof body.reason === "string" ? body.reason.trim() : ""
  if (reason.length < 3) return NextResponse.json({ error: "Give a reason for changing the mark" }, { status: 400 })
  const points = Number(q.points ?? 0)
  const clear = body.score === null
  const score = Number(body.score)
  if (!clear && (!Number.isFinite(score) || score < 0 || score > points))
    return NextResponse.json({ error: `The mark must be between 0 and ${points}` }, { status: 400 })

  const aiFeedback = { ...(a.ai_feedback ?? {}) }
  const overrides: Record<string, QuestionOverride> = { ...(aiFeedback.question_overrides ?? {}) }
  const from = overrides[q.id] ? Number(overrides[q.id].score) : autoScore(q, a)
  const at = new Date().toISOString()
  if (clear) delete overrides[q.id]
  else overrides[q.id] = { score, reason: reason.slice(0, 500), by: g.session.id, by_name: g.session.name ?? null, at }
  const to = clear ? autoScore(q, a) : score
  aiFeedback.question_overrides = overrides
  aiFeedback.rescores = [...(aiFeedback.rescores ?? []), { question_id: q.id, from, to, reason: reason.slice(0, 500), by: g.session.name ?? g.session.id, at, ...(clear ? { cleared: true } : {}) }]

  const result = scorePaper(paper, a.answers, aiFeedback.open_ended_scores, overrides)
  const { data: enr } = a.enrollment_id ? await db.from("lms_enrollments").select("program_id, status").eq("id", a.enrollment_id).maybeSingle() : { data: null }
  const passMark = await passMarkFor(a.course_id, (enr as any)?.program_id ?? null)
  const passed = !aiFeedback.time_limit_exceeded && result.pct >= passMark

  const { error } = await db.from("lms_module_attempts").update({ ai_feedback: aiFeedback, score: result.score, max_score: result.maxScore, passed }).eq("id", a.id)
  if (error) return NextResponse.json({ error: "Could not save the mark" }, { status: 500 })

  const actor = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any
  await auditLog(actor, "lms.exam.rescore", "lms_module_attempt", a.id, a.lms_students?.name ?? null,
    { question_id: q.id, from, to, reason, before: { score: a.score, passed: a.passed }, after: { score: result.score, passed } })
  if (a.enrollment_id) {
    await syncEnrollmentProgress(a.student_id, a.course_id, a.enrollment_id)
    await checkCourseCompletion(a.student_id, a.course_id, a.enrollment_id).catch(() => {})
  }
  // A completed course is never taken back automatically.
  const warning = a.passed && !passed && (enr as any)?.status === "completed"
    ? "This participant had already completed the course. Their completion and any certificate stay as they are — withdraw them by hand if needed."
    : null
  return NextResponse.json({ ok: true, score: result.score, max_score: result.maxScore, pct: result.pct, passed, pass_mark: passMark, warning })
}
