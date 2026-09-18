// Step 11 — bank questions.
//
// GET    ?set_id=…&archived=1          → the questions in a set
// GET    ?id=…                         → one question, whether it has been answered, where it's used, its history
// POST   { set_id, question, difficulty?, tags?, topic?, module_id? }
// PATCH  { id, question?, difficulty?, tags?, topic?, module_id?, set_id?, archived?,
//          mode?: "correct" | "update", version?, preview?, include_finished?, note? }
// PATCH  { id, void: true, version?, preview?, include_finished?, note? }
//
// Saving a question nobody has answered yet just saves it. Once a student has
// had it on a paper, the save must say what it is:
//   correct — it was a mistake: everyone who had that version is re-marked (admin only)
//   update  — a deliberate change: a new version, future papers only
//   void    — the question is broken: removed from everyone's total (admin only)
// Some changes can only be updates (a new type, options added or removed),
// because they can't be applied fairly to answers already given.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff } from "@/lib/staff-access"
import {
  BANK_COLUMNS, DIFFICULTIES, classifyEdit, validateQuestion, isAnswered, runCorrections,
  archiveBlockers, examsUsing, mirrorInlineQuestions, versionContents, type BankQuestion,
} from "@/lib/lms-exam-bank"

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const cleanTags = (v: unknown) =>
  [...new Set((Array.isArray(v) ? v : []).map(t => String(t ?? "").trim()).filter(Boolean))].slice(0, 20)

export async function GET(req: Request) {
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const sp = new URL(req.url).searchParams

  const id = sp.get("id")
  if (id) {
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const { data: q } = await db.from("lms_bank_questions").select(BANK_COLUMNS).eq("id", id).maybeSingle()
    if (!q) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const [answered, uses, { data: history }] = await Promise.all([
      isAnswered(q as any),
      examsUsing({ questionIds: [id] }),
      db.from("lms_bank_question_history").select("version, change, note, affected, created_at, admin_users(name)")
        .eq("question_id", id).order("created_at", { ascending: false }).limit(50),
    ])
    return NextResponse.json({
      question: q, answered, used_in: uses,
      history: (history ?? []).map((h: any) => ({ ...h, by: h.admin_users?.name ?? null, admin_users: undefined })),
    })
  }

  const setId = sp.get("set_id")
  if (!setId || !UUID_RE.test(setId)) return NextResponse.json({ error: "set_id required" }, { status: 400 })
  let q = db.from("lms_bank_questions").select(BANK_COLUMNS).eq("set_id", setId).order("created_at")
  if (sp.get("archived") !== "1") q = q.is("archived_at", null)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: "Could not load questions" }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const body = await req.json().catch(() => ({}))

  if (typeof body.set_id !== "string" || !UUID_RE.test(body.set_id))
    return NextResponse.json({ error: "Choose a set" }, { status: 400 })
  const { data: set } = await db.from("lms_question_sets").select("id, archived_at").eq("id", body.set_id).maybeSingle()
  if (!set) return NextResponse.json({ error: "That set doesn't exist" }, { status: 404 })
  if ((set as any).archived_at) return NextResponse.json({ error: "That set is archived" }, { status: 409 })

  const v = validateQuestion(body.question)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const difficulty = DIFFICULTIES.includes(body.difficulty) ? body.difficulty : "medium"

  const { data, error } = await db.from("lms_bank_questions").insert({
    set_id: body.set_id, type: v.payload.type, difficulty, tags: cleanTags(body.tags),
    topic: typeof body.topic === "string" && body.topic.trim() ? body.topic.trim().slice(0, 120) : null,
    module_id: typeof body.module_id === "string" && UUID_RE.test(body.module_id) ? body.module_id : null,
    version: 1, payload: v.payload, created_by: g.session.id, updated_by: g.session.id,
  }).select(BANK_COLUMNS).single()
  if (error) return NextResponse.json({ error: "Could not save the question" }, { status: 500 })

  await db.from("lms_bank_question_history").insert({
    question_id: (data as any).id, version: 1, change: "create", payload: v.payload, created_by: g.session.id,
  })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: Request) {
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const actor = { user: { id: g.session.id, name: g.session.name } } as any
  const body = await req.json().catch(() => ({}))

  const id = body.id
  if (typeof id !== "string" || !UUID_RE.test(id)) return NextResponse.json({ error: "id required" }, { status: 400 })
  const { data: row } = await db.from("lms_bank_questions").select(BANK_COLUMNS).eq("id", id).maybeSingle()
  if (!row) return NextResponse.json({ error: "Question not found" }, { status: 404 })
  const q = row as BankQuestion
  const preview = body.preview === true
  const includeFinished = body.include_finished === true
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null

  // ── Void ────────────────────────────────────────────────────────────────
  if (body.void === true) {
    if (!g.scope.isAdmin)
      return NextResponse.json({ error: "Only an admin can void a question — it changes results in every program" }, { status: 403 })
    const version = Number.isInteger(body.version) ? body.version : q.version
    const contents = await versionContents([id])
    const cur = contents.get(`${id}|${version}`)
    if (!cur) return NextResponse.json({ error: "That version doesn't exist" }, { status: 404 })
    if (cur.voided) return NextResponse.json({ error: "That version is already void" }, { status: 409 })

    const overrides = new Map([[`${id}|${version}`, { payload: cur.payload, voided: true }]])
    const report = await runCorrections({ questionId: id }, { apply: false, includeFinished, overrides })

    // Voiding the current version also takes the question out of circulation:
    // out of every exam that holds it as a fixed question (so those exams can
    // still start), and out of the draw pools. A draw left short is reported
    // so it can be topped up.
    const retiring = version === q.version
    const uses = retiring ? await examsUsing({ questionIds: [id] }) : []
    const removedFrom = uses.filter(u => u.how === "fixed")
    const drawShort = retiring ? (await archiveBlockers([id])).filter(b => !b.includes("fixed question")) : []
    if (preview)
      return NextResponse.json({ preview: true, action: "void", version, ...report,
        removed_from: removedFrom.map(u => ({ exam: u.examTitle, course: u.courseTitle })), draw_short: drawShort })

    await db.from("lms_bank_question_history").insert({
      question_id: id, version, change: "void", payload: cur.payload, note, affected: report.checked, created_by: g.session.id,
    })
    if (retiring) {
      await db.from("lms_bank_questions").update({ archived_at: new Date().toISOString(), updated_by: g.session.id, updated_at: new Date().toISOString() }).eq("id", id)
      for (const moduleId of new Set(removedFrom.map(u => u.moduleId))) {
        const { data: m } = await db.from("lms_modules").select("exam_sections").eq("id", moduleId).single()
        const sections = ((m as any)?.exam_sections ?? []).map((sec: any) =>
          sec.kind === "fixed" ? { ...sec, question_ids: (sec.question_ids ?? []).filter((x: string) => x !== id) } : sec)
        await db.from("lms_modules").update({ exam_sections: sections }).eq("id", moduleId)
        await mirrorInlineQuestions(moduleId)
      }
    }
    const applied = await runCorrections({ questionId: id }, { apply: true, includeFinished, actorId: g.session.id })
    await auditLog(actor, "lms.bank.question.void", "lms_bank_question", id, null, {
      version, checked: applied.checked, changed: applied.changed,
      removed_from_exams: removedFrom.map(u => u.moduleId), draw_short: drawShort,
    })
    return NextResponse.json({ ok: true, action: "void", version, ...applied,
      removed_from: removedFrom.map(u => ({ exam: u.examTitle, course: u.courseTitle })), draw_short: drawShort })
  }

  const updates: Record<string, unknown> = {}

  // ── Things that never change a mark ─────────────────────────────────────
  if (body.difficulty !== undefined) {
    if (!DIFFICULTIES.includes(body.difficulty)) return NextResponse.json({ error: "Difficulty must be easy, medium or hard" }, { status: 400 })
    updates.difficulty = body.difficulty
  }
  if (body.tags !== undefined) updates.tags = cleanTags(body.tags)
  if (body.topic !== undefined) updates.topic = typeof body.topic === "string" && body.topic.trim() ? body.topic.trim().slice(0, 120) : null
  if (body.module_id !== undefined) updates.module_id = typeof body.module_id === "string" && UUID_RE.test(body.module_id) ? body.module_id : null
  if (body.set_id !== undefined) {
    if (typeof body.set_id !== "string" || !UUID_RE.test(body.set_id)) return NextResponse.json({ error: "Invalid set" }, { status: 400 })
    updates.set_id = body.set_id
  }
  // Changing difficulty or set can starve an exam that draws on them.
  if ((updates.difficulty !== undefined && updates.difficulty !== q.difficulty) || (updates.set_id !== undefined && updates.set_id !== q.set_id)) {
    const blockers = await archiveBlockers([id])
    const drawOnly = blockers.filter(b => !b.includes("fixed question"))
    if (drawOnly.length) return NextResponse.json({ error: `Moving it would break an exam: ${drawOnly.join("; ")}` }, { status: 409 })
  }
  if (typeof body.archived === "boolean") {
    if (body.archived) {
      const blockers = await archiveBlockers([id])
      if (blockers.length) return NextResponse.json({ error: blockers.join(". ") }, { status: 409 })
    }
    updates.archived_at = body.archived ? new Date().toISOString() : null
  }

  // ── The question itself ─────────────────────────────────────────────────
  let decision: { action: string; version: number; report?: unknown } | null = null
  if (body.question !== undefined) {
    const v = validateQuestion(body.question)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const targetVersion = Number.isInteger(body.version) ? body.version : q.version
    const contents = await versionContents([id])
    const current = contents.get(`${id}|${targetVersion}`)
    if (!current) return NextResponse.json({ error: "That version doesn't exist" }, { status: 404 })
    const before = validateQuestion({ ...current.payload, type: q.type })
    const kind = classifyEdit(before.ok ? before.payload : current.payload, v.payload)

    if (kind.changed) {
      const answered = await isAnswered(q)

      if (!answered) {
        // Nobody has had it yet: nothing to protect.
        updates.payload = v.payload
        updates.type = v.payload.type
        await db.from("lms_bank_question_history").insert({
          question_id: id, version: q.version, change: "correct", payload: v.payload, note: note ?? "Edited before anyone answered it", affected: 0, created_by: g.session.id,
        })
        decision = { action: "edited", version: q.version }
      } else {
        const mode = body.mode
        if (mode !== "correct" && mode !== "update")
          return NextResponse.json({
            needs_decision: true, allowed: kind.allowed, reason: kind.reason,
            affects_marks: kind.affectsMarks, rubric_changed: kind.rubricChanged,
            error: "Students have already answered this question — say whether this is a correction or an update",
          }, { status: 409 })
        if (!kind.allowed.includes(mode))
          return NextResponse.json({ error: kind.reason ?? "That can only be an update", allowed: kind.allowed }, { status: 400 })

        if (mode === "update") {
          if (targetVersion !== q.version)
            return NextResponse.json({ error: "Only the current version can be updated" }, { status: 400 })
          if (preview) return NextResponse.json({ preview: true, action: "update", version: q.version + 1, checked: 0, changed: 0, flips: [] })
          updates.payload = v.payload
          updates.type = v.payload.type
          updates.version = q.version + 1
          await db.from("lms_bank_question_history").insert({
            question_id: id, version: q.version + 1, change: "update", payload: v.payload, note, created_by: g.session.id,
          })
          decision = { action: "update", version: q.version + 1 }
        } else {
          // A correction changes results in every program — admins only.
          if (!g.scope.isAdmin)
            return NextResponse.json({ error: "Only an admin can correct a question students have answered — it changes their results" }, { status: 403 })
          const overrides = new Map([[`${id}|${targetVersion}`, { payload: v.payload, voided: current.voided }]])
          const rubricChangedFor = kind.rubricChanged ? new Set([id]) : undefined
          const pv = await runCorrections({ questionId: id }, { apply: false, includeFinished, overrides, rubricChangedFor })
          if (preview) return NextResponse.json({ preview: true, action: "correct", version: targetVersion, ...pv })

          await db.from("lms_bank_question_history").insert({
            question_id: id, version: targetVersion, change: "correct", payload: v.payload, note, affected: pv.checked, created_by: g.session.id,
          })
          if (targetVersion === q.version) { updates.payload = v.payload; updates.type = v.payload.type }
          const applied = await runCorrections({ questionId: id }, { apply: true, includeFinished, actorId: g.session.id, rubricChangedFor })
          await auditLog(actor, "lms.bank.question.correct", "lms_bank_question", id, null,
            { version: targetVersion, checked: applied.checked, changed: applied.changed, include_finished: includeFinished })
          decision = { action: "correct", version: targetVersion, report: applied }
        }
      }
    }
  }

  if (!Object.keys(updates).length && !decision) return NextResponse.json({ error: "Nothing to change" }, { status: 400 })
  if (Object.keys(updates).length) {
    updates.updated_by = g.session.id
    updates.updated_at = new Date().toISOString()
    const { error } = await db.from("lms_bank_questions").update(updates).eq("id", id)
    if (error) return NextResponse.json({ error: "Could not save the question" }, { status: 500 })
  }

  // Exams holding it as a fixed question keep their inline mirror current.
  for (const u of await examsUsing({ questionIds: [id] })) if (u.how === "fixed") await mirrorInlineQuestions(u.moduleId)

  const { data: fresh } = await db.from("lms_bank_questions").select(BANK_COLUMNS).eq("id", id).single()
  return NextResponse.json({ ok: true, question: fresh, ...(decision ?? {}) })
}
