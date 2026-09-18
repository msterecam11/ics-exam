// Step 11 — one final exam, as the exam builder sees it.
//
// GET  → the sections, the questions they hold, the sets and course modules to
//        pick from, and the publish check
// PUT  { sections }            → save the sections (checked; a published course's
//                                exam can never be saved in a state it can't start from)
// POST { action: "move" }      → move an exam's inline questions into the bank (admin)

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff, canEditCourse, forbidden } from "@/lib/staff-access"
import {
  BANK_COLUMNS, DIFFICULTIES, checkExam, examSections, mirrorInlineQuestions, moveExamIntoBank,
  type ExamSection,
} from "@/lib/lms-exam-bank"

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function loadExam(moduleId: string) {
  if (!UUID_RE.test(moduleId)) return null
  const { data } = await db.from("lms_modules")
    .select("id, title, course_id, module_type, exam_sections, questions, lms_courses(id, title, status)")
    .eq("id", moduleId).maybeSingle()
  if (!data || (data as any).module_type !== "final_exam") return null
  return data as any
}

export async function GET(_req: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const { moduleId } = await params
  const m = await loadExam(moduleId)
  if (!m) return NextResponse.json({ error: "Exam not found" }, { status: 404 })
  if (!(await canEditCourse(g.scope, m.course_id))) return forbidden()

  const sections = examSections(m)
  const fixedIds = (sections ?? []).flatMap(s => s.kind === "fixed" ? (s.question_ids ?? []) : [])
  const [qs, sets, mods, check] = await Promise.all([
    fixedIds.length ? db.from("lms_bank_questions").select(BANK_COLUMNS).in("id", fixedIds) : Promise.resolve({ data: [] }),
    db.from("lms_question_sets").select("id, name, course_id").is("archived_at", null).order("name"),
    db.from("lms_modules").select("id, title, module_type, order_index").eq("course_id", m.course_id).order("order_index"),
    sections ? checkExam(m) : Promise.resolve(null),
  ])

  // How many live questions each set holds, by difficulty, for the draw pickers.
  const setIds = ((sets.data ?? []) as any[]).map(s => s.id)
  const { data: counts } = setIds.length
    ? await db.from("lms_bank_questions").select("set_id, difficulty").in("set_id", setIds).is("archived_at", null)
    : { data: [] as any[] }

  // The exam's own set: where a question typed in the builder is saved.
  const { data: own } = await db.from("lms_question_sets").select("id").eq("source_exam_id", moduleId).is("archived_at", null)
    .order("created_at").limit(1).maybeSingle()

  return NextResponse.json({
    exam: { id: m.id, title: m.title, course: { id: m.course_id, title: m.lms_courses?.title, status: m.lms_courses?.status } },
    own_set_id: (own as any)?.id ?? null,
    moved: !!sections,
    inline_count: Array.isArray(m.questions) ? m.questions.length : 0,
    sections: sections ?? [],
    questions: qs.data ?? [],
    sets: ((sets.data ?? []) as any[]).map(s => ({
      id: s.id, name: s.name, own: s.course_id === m.course_id,
      counts: {
        total: (counts ?? []).filter((c: any) => c.set_id === s.id).length,
        easy: (counts ?? []).filter((c: any) => c.set_id === s.id && c.difficulty === "easy").length,
        medium: (counts ?? []).filter((c: any) => c.set_id === s.id && c.difficulty === "medium").length,
        hard: (counts ?? []).filter((c: any) => c.set_id === s.id && c.difficulty === "hard").length,
      },
    })),
    // The modules a section can say it tests: everything but the exam itself.
    modules: ((mods.data ?? []) as any[]).filter(x => x.module_type !== "final_exam").map(x => ({ id: x.id, title: x.title })),
    check,
    can_correct: g.scope.isAdmin,
  })
}

export async function PUT(req: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const { moduleId } = await params
  const m = await loadExam(moduleId)
  if (!m) return NextResponse.json({ error: "Exam not found" }, { status: 404 })
  if (!(await canEditCourse(g.scope, m.course_id))) return forbidden()
  if (!examSections(m))
    return NextResponse.json({ error: "Move this exam's questions into the bank first" }, { status: 409 })

  const body = await req.json().catch(() => ({}))
  if (!Array.isArray(body.sections) || body.sections.length > 20)
    return NextResponse.json({ error: "Sections must be a list of at most 20" }, { status: 400 })

  const { data: courseModules } = await db.from("lms_modules").select("id, module_type").eq("course_id", m.course_id)
  const moduleOk = new Set(((courseModules ?? []) as any[]).filter(x => x.module_type !== "final_exam").map(x => x.id))

  const clean: ExamSection[] = []
  for (const [i, raw] of (body.sections as any[]).entries()) {
    const label = `Section ${i + 1}`
    const kind = raw?.kind
    if (kind !== "fixed" && kind !== "draw") return NextResponse.json({ error: `${label}: choose fixed or draw` }, { status: 400 })
    const moduleIdOf = typeof raw.module_id === "string" && raw.module_id ? raw.module_id : null
    if (moduleIdOf && !moduleOk.has(moduleIdOf))
      return NextResponse.json({ error: `${label}: that module isn't part of this course` }, { status: 400 })
    const base = {
      id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 64) : crypto.randomUUID(),
      title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 200) : label,
      kind, module_id: moduleIdOf,
    } as ExamSection

    if (kind === "fixed") {
      const ids = (Array.isArray(raw.question_ids) ? raw.question_ids : []).filter((x: unknown) => typeof x === "string" && UUID_RE.test(x))
      if (ids.length > 300) return NextResponse.json({ error: `${label}: at most 300 questions` }, { status: 400 })
      clean.push({ ...base, question_ids: ids })
    } else {
      if (typeof raw.set_id !== "string" || !UUID_RE.test(raw.set_id))
        return NextResponse.json({ error: `${label}: choose a question set` }, { status: 400 })
      const count = Number(raw.count)
      const each = Number(raw.points_each)
      if (!Number.isInteger(count) || count < 1 || count > 200)
        return NextResponse.json({ error: `${label}: draw between 1 and 200 questions` }, { status: 400 })
      if (!Number.isFinite(each) || each <= 0 || each > 100)
        return NextResponse.json({ error: `${label}: points per question must be between 0 and 100` }, { status: 400 })
      const difficulty = raw.difficulty && DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : null
      clean.push({ ...base, set_id: raw.set_id, count, points_each: each, difficulty })
    }
  }

  // Every fixed question must exist in the bank.
  const fixedIds = clean.flatMap(s => s.kind === "fixed" ? (s.question_ids ?? []) : [])
  if (fixedIds.length) {
    const { data: found } = await db.from("lms_bank_questions").select("id").in("id", fixedIds)
    if ((found ?? []).length !== new Set(fixedIds).size)
      return NextResponse.json({ error: "One of those questions isn't in the bank" }, { status: 400 })
  }

  // A live exam must always be able to build a paper.
  const check = await checkExam({ id: moduleId, exam_sections: clean })
  if (m.lms_courses?.status === "published" && !check.ok)
    return NextResponse.json({
      error: "This course is published, so its exam has to stay ready to sit. " + check.problems.join(". "),
      check,
    }, { status: 409 })

  const { error } = await db.from("lms_modules").update({ exam_sections: clean }).eq("id", moduleId)
  if (error) return NextResponse.json({ error: "Could not save the exam" }, { status: 500 })
  await mirrorInlineQuestions(moduleId)
  await auditLog({ user: { id: g.session.id, name: g.session.name } } as any, "lms.exam.sections", "lms_module", moduleId, m.title,
    { sections: clean.length, fixed: clean.filter(s => s.kind === "fixed").length, draw: clean.filter(s => s.kind === "draw").length })
  return NextResponse.json({ ok: true, sections: clean, check })
}

export async function POST(req: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const { moduleId } = await params
  const body = await req.json().catch(() => ({}))
  if (body.action !== "move") return NextResponse.json({ error: "Unknown action" }, { status: 400 })

  const m = await loadExam(moduleId)
  if (!m) return NextResponse.json({ error: "Exam not found" }, { status: 404 })
  const r = await moveExamIntoBank(moduleId, g.session.id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  await auditLog({ user: { id: g.session.id, name: g.session.name } } as any, "lms.exam.move_to_bank", "lms_module", moduleId, m.title,
    { questions: r.questions, papers_saved: r.papersSaved })
  return NextResponse.json(r)
}
