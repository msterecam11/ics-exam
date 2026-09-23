// Step 11 — exams built from the question bank.
//
// The rules this file enforces (docs/question-bank-exams.md):
//   1. Questions live only in the bank. An exam is a list of sections that
//      reference them: FIXED (these questions) or DRAW (n from a set).
//   2. Every question has versions. Every paper records the exact version, text,
//      options, key, points, rubric, module and topic it was given.
//   3. Grading, reports and Recalculate read only the paper.
//   4. A CORRECTION rewrites the content of a version and reaches every paper
//      that holds it. An UPDATE starts a new version and never touches a past
//      paper. A VOID removes a broken question from everyone's total.
//
// Exams that still keep their questions inline (lms_modules.exam_sections is
// null) keep working exactly as before until they are moved into the bank.

import { db } from "@/lib/db"
import { scoreObjectiveQuestion, type ExamQuestion } from "@/lib/lms-exam-scoring"

// ── Shapes ───────────────────────────────────────────────────────────────────

export type Difficulty = "easy" | "medium" | "hard"
export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"]

export interface ExamSection {
  id: string
  title: string
  kind: "fixed" | "draw"
  /** The course module this section tests. Required for a draw section. */
  module_id: string | null
  // fixed
  question_ids?: string[]
  // draw
  set_id?: string | null
  count?: number
  difficulty?: Difficulty | null
  points_each?: number
}

/** One question as it sits on a student's paper. */
export interface PaperQuestion extends ExamQuestion {
  text?: string
  rubric?: string
  max_words?: number
  explanation?: string
  bank_id?: string
  version?: number
  section_id?: string
  /** Set when a draw section fixed the points; kept through corrections. */
  section_points?: number
  module_id?: string | null
  topic?: string | null
  voided?: boolean
}

export interface BankQuestion {
  id: string
  set_id: string
  type: string
  difficulty: Difficulty
  tags: string[]
  topic: string | null
  module_id: string | null
  version: number
  payload: any
  legacy_id: string | null
  legacy_exam_id: string | null
  archived_at: string | null
}

export const BANK_COLUMNS =
  "id, set_id, type, difficulty, tags, topic, module_id, version, payload, legacy_id, legacy_exam_id, archived_at"

const newId = () => crypto.randomUUID()

// "Does this paper hold a question like this?" — JSON containment on a jsonb
// column. It MUST be passed as a JSON string: given a plain array, the database
// client formats it as a Postgres array literal ({…}), the filter silently
// never matches, and a question students have answered looks unanswered.
const holds = (items: Record<string, unknown>[]) => JSON.stringify(items)

export function examSections(module: { exam_sections?: unknown }): ExamSection[] | null {
  return Array.isArray(module.exam_sections) ? (module.exam_sections as ExamSection[]) : null
}

/** The id a question carries on a paper: the old inline id if it had one. */
export const paperIdOf = (q: Pick<BankQuestion, "id" | "legacy_id">) => q.legacy_id ?? q.id

// ── Building a paper at Begin Exam ───────────────────────────────────────────

function toPaperQuestion(q: BankQuestion, section: ExamSection, pointsOverride?: number): PaperQuestion {
  const p = q.payload ?? {}
  return {
    ...p,
    id: paperIdOf(q),
    type: q.type as ExamQuestion["type"],
    points: pointsOverride ?? Number(p.points ?? 1),
    ...(pointsOverride !== undefined ? { section_points: pointsOverride } : {}),
    bank_id: q.id,
    version: q.version,
    section_id: section.id,
    module_id: section.module_id ?? q.module_id ?? null,
    topic: q.topic ?? null,
  }
}

function pickRandom<T>(arr: T[], n: number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}

/** Bank ids this student has already had on a paper for this exam, newest last. */
async function seenBy(studentId: string, moduleId: string): Promise<Map<string, string>> {
  const seen = new Map<string, string>()
  const [{ data: attempts }, { data: sessions }] = await Promise.all([
    db.from("lms_module_attempts").select("paper, submitted_at").eq("student_id", studentId).eq("module_id", moduleId),
    db.from("lms_exam_sessions").select("paper, started_at").eq("student_id", studentId).eq("module_id", moduleId),
  ])
  const rows = [
    ...(attempts ?? []).map((a: any) => ({ paper: a.paper, at: a.submitted_at })),
    ...(sessions ?? []).map((s: any) => ({ paper: s.paper, at: s.started_at })),
  ]
  for (const r of rows) {
    for (const q of Array.isArray(r.paper) ? r.paper : []) {
      if (q?.bank_id) {
        const prev = seen.get(q.bank_id)
        if (!prev || (r.at && r.at > prev)) seen.set(q.bank_id, r.at ?? "")
      }
    }
  }
  return seen
}

export type PaperResult = { ok: true; paper: PaperQuestion[] } | { ok: false; error: string }

/**
 * The frozen paper for one student. Fixed sections in order; draw sections pick
 * at random, never repeat a question on the same paper, and prefer questions
 * this student hasn't seen before (falling back to the ones seen longest ago).
 */
export async function buildPaper(module: { id: string; exam_sections?: unknown }, studentId: string): Promise<PaperResult> {
  const sections = examSections(module)
  if (!sections) return { ok: false, error: "This exam hasn't been moved into the question bank" }
  if (!sections.length) return { ok: false, error: "This exam has no questions yet" }

  const fixedIds = sections.flatMap(s => s.kind === "fixed" ? (s.question_ids ?? []) : [])
  const setIds = [...new Set(sections.filter(s => s.kind === "draw" && s.set_id).map(s => s.set_id!))]

  const [fixedRes, poolRes] = await Promise.all([
    fixedIds.length ? db.from("lms_bank_questions").select(BANK_COLUMNS).in("id", fixedIds) : Promise.resolve({ data: [] }),
    setIds.length
      ? db.from("lms_bank_questions").select(BANK_COLUMNS).in("set_id", setIds).is("archived_at", null)
      : Promise.resolve({ data: [] }),
  ])
  const fixedById = new Map(((fixedRes.data ?? []) as BankQuestion[]).map(q => [q.id, q]))
  const pool = (poolRes.data ?? []) as BankQuestion[]

  const used = new Set<string>(fixedIds)
  const seen = setIds.length ? await seenBy(studentId, module.id) : new Map<string, string>()
  const paper: PaperQuestion[] = []

  for (const s of sections) {
    if (s.kind === "fixed") {
      for (const id of s.question_ids ?? []) {
        const q = fixedById.get(id)
        if (!q || q.archived_at) return { ok: false, error: "A question in this exam is no longer available" }
        paper.push(toPaperQuestion(q, s))
      }
      continue
    }

    const want = Number(s.count ?? 0)
    const candidates = pool.filter(q =>
      q.set_id === s.set_id && !used.has(q.id) && (!s.difficulty || q.difficulty === s.difficulty))
    if (candidates.length < want)
      return { ok: false, error: `"${s.title}" needs ${want - candidates.length} more question${want - candidates.length === 1 ? "" : "s"} in its set` }

    // Fresh questions first; if there aren't enough, the ones seen longest ago.
    const fresh = candidates.filter(q => !seen.has(q.id))
    let picked = pickRandom(fresh, want)
    if (picked.length < want) {
      const stale = candidates.filter(q => seen.has(q.id))
        .sort((a, b) => (seen.get(a.id) ?? "").localeCompare(seen.get(b.id) ?? ""))
      picked = [...picked, ...stale.slice(0, want - picked.length)]
    }
    for (const q of picked) {
      used.add(q.id)
      paper.push(toPaperQuestion(q, s, Number(s.points_each ?? q.payload?.points ?? 1)))
    }
  }
  return { ok: true, paper }
}

// ── Publish check ────────────────────────────────────────────────────────────

export interface ExamCheck {
  ok: boolean
  problems: string[]
  warnings: string[]
  questionsPerPaper: number
  pointsPerPaper: number
}

export async function checkExam(module: { id: string; exam_sections?: unknown }): Promise<ExamCheck> {
  const sections = examSections(module) ?? []
  const problems: string[] = []
  const warnings: string[] = []
  if (!sections.length) problems.push("The exam has no sections")

  const fixedIds = sections.flatMap(s => s.kind === "fixed" ? (s.question_ids ?? []) : [])
  const dupes = fixedIds.filter((id, i) => fixedIds.indexOf(id) !== i)
  if (dupes.length) problems.push("The same question appears twice in the fixed sections")

  const setIds = [...new Set(sections.filter(s => s.kind === "draw" && s.set_id).map(s => s.set_id!))]
  const [fixedRes, poolRes, setsRes] = await Promise.all([
    fixedIds.length ? db.from("lms_bank_questions").select("id, payload, archived_at").in("id", fixedIds) : Promise.resolve({ data: [] }),
    setIds.length ? db.from("lms_bank_questions").select("id, set_id, difficulty").in("set_id", setIds).is("archived_at", null) : Promise.resolve({ data: [] }),
    setIds.length ? db.from("lms_question_sets").select("id, name, archived_at").in("id", setIds) : Promise.resolve({ data: [] }),
  ])
  const fixedById = new Map((fixedRes.data ?? []).map((q: any) => [q.id, q]))
  const setById = new Map((setsRes.data ?? []).map((s: any) => [s.id, s]))
  const fixedSet = new Set(fixedIds)

  let questions = 0, points = 0
  for (const s of sections) {
    const label = `"${s.title || "Untitled section"}"`
    if (s.kind === "fixed") {
      const ids = s.question_ids ?? []
      if (!ids.length) problems.push(`${label} has no questions`)
      for (const id of ids) {
        const q = fixedById.get(id)
        if (!q) { problems.push(`${label} refers to a question that no longer exists`); continue }
        if (q.archived_at) problems.push(`${label} holds an archived question — take it out or restore it`)
        questions++
        points += Number(q.payload?.points ?? 1)
      }
      continue
    }
    // draw
    if (!s.set_id || !setById.has(s.set_id)) { problems.push(`${label} doesn't have a question set`); continue }
    if (setById.get(s.set_id).archived_at) problems.push(`${label} draws from an archived set`)
    if (!s.module_id) problems.push(`${label} must say which course module it tests`)
    const want = Number(s.count ?? 0)
    const each = Number(s.points_each ?? 0)
    if (!Number.isInteger(want) || want < 1) problems.push(`${label} must draw at least one question`)
    if (!(each > 0)) problems.push(`${label} needs points per question`)
    const available = (poolRes.data ?? []).filter((q: any) =>
      q.set_id === s.set_id && !fixedSet.has(q.id) && (!s.difficulty || q.difficulty === s.difficulty)).length
    if (available < want)
      problems.push(`${label} needs ${want - available} more${s.difficulty ? ` ${s.difficulty}` : ""} question${want - available === 1 ? "" : "s"} in its set`)
    else if (available < want * 2)
      warnings.push(`${label}: the set is small, so a retake may repeat questions the student has seen`)
    questions += want
    points += want * each
  }

  // Two draw sections sharing a set compete for the same questions.
  const bySet = new Map<string, number>()
  for (const s of sections) if (s.kind === "draw" && s.set_id)
    bySet.set(`${s.set_id}|${s.difficulty ?? ""}`, (bySet.get(`${s.set_id}|${s.difficulty ?? ""}`) ?? 0) + Number(s.count ?? 0))
  for (const [k, total] of bySet) {
    const [setId, diff] = k.split("|")
    const available = (poolRes.data ?? []).filter((q: any) => q.set_id === setId && !fixedSet.has(q.id) && (!diff || q.difficulty === diff)).length
    if (total > available && !problems.some(p => p.includes("more")))
      problems.push(`Sections drawing from the same set need ${total} questions between them, but it has ${available}`)
  }

  return { ok: problems.length === 0, problems, warnings, questionsPerPaper: questions, pointsPerPaper: points }
}

// ── What kind of edit is this? ───────────────────────────────────────────────

export interface EditKind {
  changed: boolean
  /** What the admin may choose. Structural changes can only be updates. */
  allowed: ("correct" | "update")[]
  reason: string | null
  /** A correction would change marks (key, points or partial credit). */
  affectsMarks: boolean
  rubricChanged: boolean
}

const ids = (arr: any[] | undefined) => (arr ?? []).map(x => x.id).sort().join("|")

export function classifyEdit(before: any, after: any): EditKind {
  const same = JSON.stringify(before) === JSON.stringify(after)
  if (same) return { changed: false, allowed: [], reason: null, affectsMarks: false, rubricChanged: false }

  if (before?.type !== after?.type)
    return { changed: true, allowed: ["update"], reason: "The question type changed — past answers were given in a different format", affectsMarks: true, rubricChanged: false }
  if (ids(before?.options) !== ids(after?.options))
    return { changed: true, allowed: ["update"], reason: "Answer options were added or removed — past students saw a different set", affectsMarks: true, rubricChanged: false }
  if (ids(before?.items) !== ids(after?.items))
    return { changed: true, allowed: ["update"], reason: "Items were added or removed", affectsMarks: true, rubricChanged: false }
  if (ids(before?.pairs) !== ids(after?.pairs))
    return { changed: true, allowed: ["update"], reason: "Pairs were added or removed", affectsMarks: true, rubricChanged: false }

  const key = (q: any) => JSON.stringify({
    points: Number(q?.points ?? 1),
    partial: !!q?.partialCredit,
    options: (q?.options ?? []).map((o: any) => [o.id, !!o.correct]),
    items: (q?.items ?? []).map((i: any) => i.id),          // ordering: the order IS the key
    pairs: (q?.pairs ?? []).map((p: any) => [p.id, p.right]),
  })
  const affectsMarks = key(before) !== key(after)
  const rubricChanged = (before?.rubric ?? "") !== (after?.rubric ?? "")
  return { changed: true, allowed: ["correct", "update"], reason: null, affectsMarks, rubricChanged }
}

// ── Versions ─────────────────────────────────────────────────────────────────

export interface VersionContent { payload: any; voided: boolean }

/** The latest content of each (question, version) pair asked for. */
export async function versionContents(questionIds: string[]): Promise<Map<string, VersionContent>> {
  const out = new Map<string, VersionContent>()
  if (!questionIds.length) return out
  const { data } = await db
    .from("lms_bank_question_history")
    .select("question_id, version, change, payload, created_at")
    .in("question_id", questionIds)
    .order("created_at", { ascending: true })
  for (const h of (data ?? []) as any[]) {
    const k = `${h.question_id}|${h.version}`
    const cur = out.get(k) ?? { payload: h.payload, voided: false }
    if (h.change === "void") cur.voided = true
    else cur.payload = h.payload
    out.set(k, cur)
  }
  return out
}

// ── The correction engine (shared by Recalculate and by saving a correction) ─

export interface PaperScope {
  /** Every paper of this exam. */
  moduleId?: string
  /** Every paper, in any exam, that holds this bank question. */
  questionId?: string
}

export interface Flip {
  attempt_id: string
  student_id: string
  enrollment_id: string | null
  program: { id: string; name: string; status: string } | null
  before: { score: number; maxScore: number; passed: boolean }
  after: { score: number; maxScore: number; passed: boolean }
}

export interface CorrectionReport {
  checked: number
  changed: number
  flips: Flip[]
  /** Papers in completed or archived programs, left alone unless included. */
  finished: { attempts: number; programs: { id: string; name: string; status: string }[] }
  openPapers: number
  remarks: number
  certificateReviews: number
}

interface AttemptRow {
  id: string; student_id: string; module_id: string; course_id: string; enrollment_id: string | null
  score: number; max_score: number; passed: boolean
  answers: any; ai_feedback: any; paper: any
  program: { id: string; name: string; status: string } | null
}

async function loadAttempts(scope: PaperScope): Promise<AttemptRow[]> {
  const cols = "id, student_id, module_id, course_id, enrollment_id, score, max_score, passed, answers, ai_feedback, paper, lms_enrollments(program_id, lms_programs(id, name, status))"
  let rows: any[] = []
  if (scope.moduleId) {
    const { data } = await db.from("lms_module_attempts").select(cols).eq("module_id", scope.moduleId)
    rows = data ?? []
  } else if (scope.questionId) {
    const { data: q } = await db.from("lms_bank_questions").select("id, legacy_id, legacy_exam_id").eq("id", scope.questionId).single()
    const { data: byBank } = await db.from("lms_module_attempts").select(cols).contains("paper", holds([{ bank_id: scope.questionId }]))
    rows = byBank ?? []
    // Papers frozen before the question moved into the bank carry only its old id.
    if ((q as any)?.legacy_id && (q as any)?.legacy_exam_id) {
      const { data: byLegacy } = await db.from("lms_module_attempts").select(cols)
        .eq("module_id", (q as any).legacy_exam_id).contains("paper", holds([{ id: (q as any).legacy_id }]))
      const have = new Set(rows.map(r => r.id))
      for (const r of byLegacy ?? []) if (!have.has(r.id)) rows.push(r)
    }
  }
  return rows.map(r => ({
    ...r,
    program: r.lms_enrollments?.lms_programs
      ? { id: r.lms_enrollments.lms_programs.id, name: r.lms_enrollments.lms_programs.name, status: r.lms_enrollments.lms_programs.status }
      : null,
  }))
}

/**
 * Re-resolves every question on a paper to the current content of the version
 * it was given. Questions added to the exam since are not added; questions
 * removed since stay. An UPDATE (a new version) can never reach an old paper,
 * because the paper's version number stays the same.
 */
async function resolvePapers(papers: { moduleId: string; paper: PaperQuestion[] }[], overrides?: Map<string, VersionContent>) {
  const bankIds = new Set<string>()
  const legacyByModule = new Map<string, Set<string>>()
  for (const { moduleId, paper } of papers) for (const q of paper) {
    if (q.bank_id) bankIds.add(q.bank_id)
    else {
      const s = legacyByModule.get(moduleId) ?? new Set<string>()
      s.add(q.id); legacyByModule.set(moduleId, s)
    }
  }

  // Legacy items → the bank question they became, if their exam has moved.
  const legacyToBank = new Map<string, string>()
  for (const [moduleId, legacyIds] of legacyByModule) {
    const { data } = await db.from("lms_bank_questions").select("id, legacy_id")
      .eq("legacy_exam_id", moduleId).in("legacy_id", [...legacyIds])
    for (const r of (data ?? []) as any[]) { legacyToBank.set(`${moduleId}|${r.legacy_id}`, r.id); bankIds.add(r.id) }
  }
  const contents = await versionContents([...bankIds])
  // A preview marks papers with content that hasn't been saved yet.
  for (const [k, v] of overrides ?? []) contents.set(k, v)

  return (moduleId: string, q: PaperQuestion): PaperQuestion => {
    const bankId = q.bank_id ?? legacyToBank.get(`${moduleId}|${q.id}`)
    if (!bankId) return q                                   // exam not in the bank yet: nothing to resolve
    const version = q.version ?? 1                          // legacy papers hold version 1
    const c = contents.get(`${bankId}|${version}`)
    if (!c) return q
    return {
      ...c.payload,
      id: q.id,
      type: q.type,
      points: q.section_points ?? Number(c.payload?.points ?? q.points ?? 1),
      ...(q.section_points !== undefined ? { section_points: q.section_points } : {}),
      bank_id: bankId,
      version,
      section_id: q.section_id,
      module_id: q.module_id ?? null,
      topic: q.topic ?? null,
      ...(c.voided ? { voided: true } : {}),
    }
  }
}

/** Score a paper: voided questions count for nobody. */
export function scorePaper(paper: PaperQuestion[], answers: any, aiScores: Record<string, { score: number }> | undefined) {
  let max = 0, earned = 0
  for (const q of paper) {
    if (q.voided) continue
    max += Number(q.points ?? 0)
    if (q.type === "open_ended") earned += Math.min(Number(aiScores?.[q.id]?.score ?? 0), Number(q.points ?? 0))
    else earned += scoreObjectiveQuestion(q, (answers ?? {})[q.id])
  }
  return { score: earned, maxScore: max, pct: max > 0 ? Math.round((earned / max) * 100) : 0 }
}

async function passMarkFor(courseId: string, programId: string | null) {
  if (programId) {
    const { data } = await db.from("lms_program_course_rules").select("pass_mark").eq("program_id", programId).eq("course_id", courseId).maybeSingle()
    if ((data as any)?.pass_mark != null) return Number((data as any).pass_mark)
  }
  const { data: c } = await db.from("lms_courses").select("final_exam_pass_mark").eq("id", courseId).maybeSingle()
  return Number((c as any)?.final_exam_pass_mark ?? 70)
}

/**
 * Re-marks the papers in scope against the current content of the versions
 * they hold. With `apply: false` nothing is written — that's the preview the
 * admin sees before confirming.
 */
export async function runCorrections(scope: PaperScope, opts: {
  apply: boolean
  includeFinished?: boolean
  actorId?: string | null
  /** Rubrics changed on these bank questions: flag their open-ended answers. */
  rubricChangedFor?: Set<string>
  /** "What if" content, keyed `${bankId}|${version}`, for a preview. */
  overrides?: Map<string, VersionContent>
}): Promise<CorrectionReport> {
  const attempts = await loadAttempts(scope)

  // Exams not yet moved into the bank keep today's behaviour: each question a
  // student had takes its current inline version, and an attempt from before
  // frozen papers is marked against the whole current exam.
  const moduleIds = [...new Set(attempts.map(a => a.module_id))]
  const { data: mods } = moduleIds.length
    ? await db.from("lms_modules").select("id, questions, exam_sections").in("id", moduleIds)
    : { data: [] as any[] }
  const inlineOf = new Map<string, Map<string, PaperQuestion>>()
  for (const m of (mods ?? []) as any[])
    if (!examSections(m)) inlineOf.set(m.id, new Map(((m.questions ?? []) as PaperQuestion[]).map(q => [q.id, q])))
  const paperOf = (a: AttemptRow): PaperQuestion[] =>
    Array.isArray(a.paper) ? a.paper : inlineOf.has(a.module_id) ? [...inlineOf.get(a.module_id)!.values()] : []

  const bankResolver = await resolvePapers(attempts.map(a => ({ moduleId: a.module_id, paper: paperOf(a) })), opts.overrides)
  const resolver = (moduleId: string, q: PaperQuestion): PaperQuestion => {
    const inline = inlineOf.get(moduleId)
    return inline ? (inline.get(q.id) ?? q) : bankResolver(moduleId, q)
  }

  const report: CorrectionReport = {
    checked: 0, changed: 0, flips: [],
    finished: { attempts: 0, programs: [] }, openPapers: 0, remarks: 0, certificateReviews: 0,
  }
  const finishedPrograms = new Map<string, { id: string; name: string; status: string }>()
  const passMarks = new Map<string, number>()
  const newlyPassed: AttemptRow[] = []

  for (const a of attempts) {
    const finished = !!a.program && ["completed", "archived"].includes(a.program.status)
    if (finished) {
      finishedPrograms.set(a.program!.id, a.program!)
      report.finished.attempts++
      if (!opts.includeFinished) continue
    }
    const oldPaper = paperOf(a)
    if (!oldPaper.length) continue
    report.checked++

    const newPaper = oldPaper.map(q => resolver(a.module_id, q))
    const aiScores = a.ai_feedback?.open_ended_scores as Record<string, { score: number }> | undefined
    const { score, maxScore, pct } = scorePaper(newPaper, a.answers, aiScores)

    const pmKey = `${a.course_id}|${a.program?.id ?? ""}`
    if (!passMarks.has(pmKey)) passMarks.set(pmKey, await passMarkFor(a.course_id, a.program?.id ?? null))
    const passed = !a.ai_feedback?.time_limit_exceeded && pct >= passMarks.get(pmKey)!

    const before = { score: Number(a.score), maxScore: Number(a.max_score), passed: !!a.passed }
    const after = { score, maxScore, passed }
    const resultChanged = before.score !== after.score || before.maxScore !== after.maxScore || before.passed !== after.passed
    const paperChanged = JSON.stringify(newPaper) !== JSON.stringify(oldPaper)

    // Open-ended answers marked under a rubric that has since been corrected:
    // their mark stays until a person confirms a new one.
    const toRemark = newPaper.filter(q => q.type === "open_ended" && !q.voided && q.bank_id && opts.rubricChangedFor?.has(q.bank_id))
    report.remarks += toRemark.length

    if (resultChanged) {
      report.changed++
      report.flips.push({ attempt_id: a.id, student_id: a.student_id, enrollment_id: a.enrollment_id, program: a.program, before, after })
    }

    if (!opts.apply) continue
    if (resultChanged || paperChanged)
      await db.from("lms_module_attempts").update({ score, max_score: maxScore, passed, paper: newPaper }).eq("id", a.id)

    // One open review per answer: the unique index turns a repeat into a no-op.
    for (const q of toRemark)
      await db.from("lms_exam_reviews").insert({
        kind: "remark", attempt_id: a.id, student_id: a.student_id, course_id: a.course_id, module_id: a.module_id,
        question_id: q.id, created_by: opts.actorId ?? null,
        details: { bank_id: q.bank_id, version: q.version, current_score: aiScores?.[q.id]?.score ?? 0, points: q.points },
      })

    if (before.passed && !after.passed) {
      // Never take a certificate back automatically — a person decides.
      let certQ = db.from("lms_certificates").select("id, verification_code")
        .eq("student_id", a.student_id).eq("course_id", a.course_id).is("revoked_at", null)
      certQ = a.enrollment_id ? certQ.eq("enrollment_id", a.enrollment_id) : certQ.is("enrollment_id", null)
      const { data: cert } = await certQ.limit(1).maybeSingle()
      if (cert) {
        report.certificateReviews++
        await db.from("lms_exam_reviews").insert({
          kind: "certificate", attempt_id: a.id, student_id: a.student_id, course_id: a.course_id, module_id: a.module_id,
          created_by: opts.actorId ?? null,
          details: { certificate_id: (cert as any).id, code: (cert as any).verification_code, before, after },
        })
      }
    }
    if (!before.passed && after.passed) newlyPassed.push(a)
  }

  // Exams still in progress get the corrected paper too, so they are graded
  // correctly when submitted.
  if (scope.moduleId || scope.questionId) {
    let q = db.from("lms_exam_sessions").select("id, module_id, paper").is("submitted_at", null)
    q = scope.moduleId ? q.eq("module_id", scope.moduleId) : q.contains("paper", holds([{ bank_id: scope.questionId }]))
    const { data: open } = await q
    for (const s of (open ?? []) as any[]) {
      const oldPaper: PaperQuestion[] = Array.isArray(s.paper) ? s.paper : []
      const newPaper = oldPaper.map(x => resolver(s.module_id, x))
      if (JSON.stringify(newPaper) === JSON.stringify(oldPaper)) continue
      report.openPapers++
      if (opts.apply) await db.from("lms_exam_sessions").update({ paper: newPaper }).eq("id", s.id)
    }
  }

  report.finished.programs = [...finishedPrograms.values()]

  if (opts.apply && newlyPassed.length) {
    const { checkCourseCompletion } = await import("@/lib/lms-completion")
    for (const a of newlyPassed)
      await checkCourseCompletion(a.student_id, a.course_id, a.enrollment_id ?? undefined)
  }
  return report
}

/** Whether any student has had this question on a paper (finished or not). */
export async function isAnswered(q: Pick<BankQuestion, "id" | "legacy_id" | "legacy_exam_id">): Promise<boolean> {
  const { count } = await db.from("lms_module_attempts").select("id", { count: "exact", head: true }).contains("paper", holds([{ bank_id: q.id }]))
  if ((count ?? 0) > 0) return true
  const { count: open } = await db.from("lms_exam_sessions").select("id", { count: "exact", head: true }).contains("paper", holds([{ bank_id: q.id }]))
  if ((open ?? 0) > 0) return true
  if (q.legacy_id && q.legacy_exam_id) {
    // Legacy papers carry the old id, and (after the move) every attempt of
    // that exam has a paper — so any attempt of the exam counts.
    const { count: legacy } = await db.from("lms_module_attempts").select("id", { count: "exact", head: true })
      .eq("module_id", q.legacy_exam_id).contains("paper", holds([{ id: q.legacy_id }]))
    if ((legacy ?? 0) > 0) return true
  }
  return false
}

// ── Keeping the old inline list in step (until the deploy-day switch) ────────

/**
 * The code running before the redeploy reads lms_modules.questions. For an
 * exam made only of fixed sections, keep that list equal to the bank's current
 * versions, so both code paths agree about the questions on offer.
 */
export async function mirrorInlineQuestions(moduleId: string) {
  const { data: m } = await db.from("lms_modules").select("exam_sections").eq("id", moduleId).single()
  const sections = examSections(m as any)
  if (!sections) return
  const ids = sections.flatMap(s => s.kind === "fixed" ? (s.question_ids ?? []) : [])
  if (!ids.length) { await db.from("lms_modules").update({ questions: [] }).eq("id", moduleId); return }
  const { data } = await db.from("lms_bank_questions").select(BANK_COLUMNS).in("id", ids)
  const byId = new Map(((data ?? []) as BankQuestion[]).map(q => [q.id, q]))
  const inline = ids.map(id => byId.get(id)).filter(Boolean).map(q => ({ ...q!.payload, id: paperIdOf(q!), type: q!.type }))
  await db.from("lms_modules").update({ questions: inline }).eq("id", moduleId)
}

// ── Moving an exam's inline questions into the bank ──────────────────────────

export interface MoveResult { ok: boolean; error?: string; setId?: string; questions?: number; papersSaved?: number }

/**
 * One-way, idempotent. Creates a set for the exam, one bank question per inline
 * question (keeping its id as legacy_id and its module/topic from Expert
 * Analyze), makes the exam a single fixed section of them, and saves a paper
 * for every past attempt and open session that doesn't have one — built from
 * the questions they were graded on.
 */
export async function moveExamIntoBank(moduleId: string, actorId: string | null): Promise<MoveResult> {
  const { data: m } = await db.from("lms_modules")
    .select("id, title, course_id, module_type, questions, exam_sections, lms_courses(title)")
    .eq("id", moduleId).single()
  if (!m) return { ok: false, error: "Exam not found" }
  const mod = m as any
  if (mod.module_type !== "final_exam") return { ok: false, error: "Not a final exam" }
  if (examSections(mod)) return { ok: true, questions: 0, papersSaved: 0 }   // already moved

  const inline: any[] = Array.isArray(mod.questions) ? mod.questions : []

  // Module and topic per question, as Expert Analyze recorded them.
  const { data: analysis } = await db.from("lms_module_analysis").select("analysis").eq("module_id", moduleId).maybeSingle()
  const a: any = (analysis as any)?.analysis ?? {}
  const moduleOf = new Map<string, string>()
  for (const s of Array.isArray(a.sections) ? a.sections : [])
    for (const qid of s.question_ids ?? []) if (s.module_id) moduleOf.set(qid, s.module_id)
  const topicOf: Record<string, string> = a.question_topics ?? {}

  // 1. Every past attempt and open session gets its paper first, so nothing is
  //    ever re-marked against content it wasn't given.
  let papersSaved = 0
  const stamp = (q: any) => ({ ...q, version: 1, module_id: moduleOf.get(q.id) ?? null, topic: topicOf[q.id] ?? null })
  const inlinePaper = inline.map(stamp)
  const { data: bare } = await db.from("lms_module_attempts").select("id").eq("module_id", moduleId).is("paper", null)
  for (const r of (bare ?? []) as any[]) {
    await db.from("lms_module_attempts").update({ paper: inlinePaper }).eq("id", r.id).is("paper", null)
    papersSaved++
  }
  const { data: bareOpen } = await db.from("lms_exam_sessions").select("id").eq("module_id", moduleId).is("paper", null)
  for (const r of (bareOpen ?? []) as any[]) {
    await db.from("lms_exam_sessions").update({ paper: inlinePaper }).eq("id", r.id).is("paper", null)
    papersSaved++
  }

  // 2. The set and its questions.
  const courseTitle = mod.lms_courses?.title ?? "Course"
  const { data: set, error: setErr } = await db.from("lms_question_sets").insert({
    name: `${courseTitle} — ${mod.title || "Final exam"}`,
    description: "Moved in from the course's final exam",
    course_id: mod.course_id, source_exam_id: moduleId, created_by: actorId,
  }).select("id").single()
  if (setErr || !set) return { ok: false, error: "Could not create the question set" }

  // Stored in the one checked format. A question that doesn't pass the check
  // (say, an empty option left in by accident) is kept exactly as it was
  // rather than altered or dropped — the exam must not lose anything.
  const normalise = (q: any) => {
    const v = validateQuestion(q)
    if (v.ok) return v.payload
    const { id, ...rest } = q
    void id
    return rest
  }
  const rows = inline.map(q => ({
    set_id: (set as any).id,
    type: q.type,
    difficulty: "medium",
    tags: [] as string[],
    topic: topicOf[q.id] ?? null,
    module_id: moduleOf.get(q.id) ?? null,
    version: 1,
    payload: normalise(q),
    legacy_id: String(q.id),
    legacy_exam_id: moduleId,
    created_by: actorId,
  }))
  const { data: made, error: qErr } = rows.length
    ? await db.from("lms_bank_questions").insert(rows).select("id, legacy_id, payload")
    : { data: [], error: null }
  if (qErr) {
    await db.from("lms_question_sets").delete().eq("id", (set as any).id)
    return { ok: false, error: "Could not create the bank questions" }
  }
  const byLegacy = new Map(((made ?? []) as any[]).map(q => [q.legacy_id, q]))
  if (made?.length)
    await db.from("lms_bank_question_history").insert((made as any[]).map(q => ({
      question_id: q.id, version: 1, change: "create", payload: q.payload, note: "Moved in from the exam", created_by: actorId,
    })))

  // 3. The exam becomes one fixed section, in the same order.
  const section: ExamSection = {
    id: newId(), title: "Questions", kind: "fixed", module_id: null,
    question_ids: inline.map(q => byLegacy.get(String(q.id))?.id).filter(Boolean),
  }
  await db.from("lms_modules").update({ exam_sections: [section] }).eq("id", moduleId)
  return { ok: true, setId: (set as any).id, questions: rows.length, papersSaved }
}

// ── Where is a question or a set used? ───────────────────────────────────────

export interface ExamUse {
  moduleId: string
  examTitle: string
  courseId: string
  courseTitle: string
  sectionTitle: string
  how: "fixed" | "draw"
  /** draw: the set it picks from */
  setId?: string
}

/** Every exam section that holds these questions or draws from these sets. */
export async function examsUsing(opts: { questionIds?: string[]; setIds?: string[] }): Promise<ExamUse[]> {
  const { data } = await db.from("lms_modules")
    .select("id, title, course_id, exam_sections, lms_courses(title)")
    .eq("module_type", "final_exam").not("exam_sections", "is", null)
  const qs = new Set(opts.questionIds ?? [])
  const ss = new Set(opts.setIds ?? [])
  const out: ExamUse[] = []
  for (const m of (data ?? []) as any[]) {
    for (const s of examSections(m) ?? []) {
      const base = { moduleId: m.id, examTitle: m.title, courseId: m.course_id, courseTitle: m.lms_courses?.title ?? "", sectionTitle: s.title }
      if (s.kind === "fixed" && (s.question_ids ?? []).some(id => qs.has(id))) out.push({ ...base, how: "fixed" })
      if (s.kind === "draw" && s.set_id && ss.has(s.set_id)) out.push({ ...base, how: "draw", setId: s.set_id })
    }
  }
  return out
}

/**
 * Would taking these questions out of circulation leave any exam unable to
 * build a paper? Returns the reasons, or an empty list when it's safe.
 */
export async function archiveBlockers(questionIds: string[]): Promise<string[]> {
  if (!questionIds.length) return []
  const { data: qs } = await db.from("lms_bank_questions").select("id, set_id, difficulty").in("id", questionIds)
  const setIds = [...new Set((qs ?? []).map((q: any) => q.set_id))]
  const reasons: string[] = []

  for (const u of await examsUsing({ questionIds }))
    if (u.how === "fixed") reasons.push(`It's a fixed question in "${u.examTitle}" (${u.courseTitle}) — take it out of that exam first`)

  const drawing = (await examsUsing({ setIds })).filter(u => u.how === "draw")
  const checked = new Set<string>()
  for (const u of drawing) {
    if (checked.has(u.moduleId)) continue
    checked.add(u.moduleId)
    const { data: m } = await db.from("lms_modules").select("id, exam_sections").eq("id", u.moduleId).single()
    const sections = examSections(m as any) ?? []
    const fixed = new Set(sections.flatMap(s => s.kind === "fixed" ? (s.question_ids ?? []) : []))
    for (const s of sections.filter(s => s.kind === "draw" && setIds.includes(s.set_id ?? ""))) {
      const { data: pool } = await db.from("lms_bank_questions").select("id, difficulty")
        .eq("set_id", s.set_id!).is("archived_at", null)
      const left = (pool ?? []).filter((q: any) =>
        !questionIds.includes(q.id) && !fixed.has(q.id) && (!s.difficulty || q.difficulty === s.difficulty)).length
      if (left < Number(s.count ?? 0))
        reasons.push(`"${u.examTitle}" draws ${s.count}${s.difficulty ? ` ${s.difficulty}` : ""} from this set and would be left with ${left}`)
    }
  }
  return reasons
}


// ── One question format, checked the same way everywhere ─────────────────────

export const QUESTION_TYPES = ["mcq_single", "mcq_multiple", "ordering", "match_pair", "open_ended"] as const

/**
 * Checks a question and returns it cleaned to the exam format the player and
 * the scorer read. Anything not named here is dropped, so a stray field can
 * never reach a paper.
 */
export function validateQuestion(raw: any): { ok: true; payload: any } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "No question given" }
  const type = raw.type
  if (!QUESTION_TYPES.includes(type)) return { ok: false, error: "Unknown question type" }
  const text = typeof raw.text === "string" ? raw.text.trim() : ""
  if (!text) return { ok: false, error: "The question needs its text" }
  const points = Number(raw.points)
  if (!Number.isFinite(points) || points <= 0 || points > 100) return { ok: false, error: "Points must be between 0 and 100" }

  const out: any = { type, text, points }
  if (typeof raw.explanation === "string" && raw.explanation.trim()) out.explanation = raw.explanation.trim()
  const uniq = (arr: any[]) => new Set(arr.map(x => x.id)).size === arr.length

  if (type === "mcq_single" || type === "mcq_multiple") {
    const options = (Array.isArray(raw.options) ? raw.options : [])
      .map((o: any) => ({ id: String(o?.id ?? ""), text: String(o?.text ?? "").trim(), correct: !!o?.correct }))
    if (options.length < 2) return { ok: false, error: "Give at least two answer options" }
    if (options.some((o: any) => !o.id || !o.text)) return { ok: false, error: "Every option needs text" }
    if (!uniq(options)) return { ok: false, error: "Two options share an id" }
    const right = options.filter((o: any) => o.correct).length
    if (type === "mcq_single" && right !== 1) return { ok: false, error: "Mark exactly one correct option" }
    if (type === "mcq_multiple" && right < 1) return { ok: false, error: "Mark at least one correct option" }
    out.options = options
    if (type === "mcq_multiple" && raw.partialCredit) out.partialCredit = true
  }
  if (type === "ordering") {
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .map((i: any) => ({ id: String(i?.id ?? ""), text: String(i?.text ?? "").trim() }))
    if (items.length < 2) return { ok: false, error: "Give at least two items to order" }
    if (items.some((i: any) => !i.id || !i.text)) return { ok: false, error: "Every item needs text" }
    if (!uniq(items)) return { ok: false, error: "Two items share an id" }
    out.items = items
  }
  if (type === "match_pair") {
    const pairs = (Array.isArray(raw.pairs) ? raw.pairs : [])
      .map((p: any) => ({ id: String(p?.id ?? ""), left: String(p?.left ?? "").trim(), right: String(p?.right ?? "").trim() }))
    if (pairs.length < 2) return { ok: false, error: "Give at least two pairs" }
    if (pairs.some((p: any) => !p.id || !p.left || !p.right)) return { ok: false, error: "Every pair needs both sides" }
    if (!uniq(pairs)) return { ok: false, error: "Two pairs share an id" }
    out.pairs = pairs
  }
  if (type === "open_ended") {
    if (typeof raw.rubric === "string") out.rubric = raw.rubric.trim()
    const mw = Number(raw.max_words)
    if (Number.isFinite(mw) && mw > 0) out.max_words = Math.min(Math.round(mw), 5000)
  }
  return { ok: true, payload: out }
}
