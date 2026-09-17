import { NextResponse } from "next/server"
import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { checkCourseCompletion, syncEnrollmentProgress } from "@/lib/lms-completion"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import { getCurrentEnrollment, getCourseLock } from "@/lib/lms-enrollment"
import { scoreOpenEndedAnswer } from "@/lib/ai-scoring"
import {
  isScoredItemType, scoreQuestions, itemMaxAttempts, itemPassMark,
  type PkgQuestion, type PkgItemScore,
} from "@/lib/lms-package-scoring"

// GET /api/lms/packages/[id]/progress
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  // Progress of the student's CURRENT enrollment in the package's course.
  const { data: pkg } = await db.from("lms_packages").select("course_id").eq("id", id).maybeSingle()
  const enrollment = await getCurrentEnrollment(student.id, (pkg as any)?.course_id)
  if (!enrollment || enrollment.access === "none") return NextResponse.json(null)

  const { data, error } = await db
    .from("lms_package_progress")
    .select(`
      id, student_id, package_id, module_id, course_id,
      current_item_index, completed_items, item_scores,
      status, score, time_spent, started_at, completed_at, updated_at
    `)
    .eq("enrollment_id", enrollment.id)
    .eq("package_id", id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? null)
}

// POST /api/lms/packages/[id]/progress
// Body: {
//   module_id?, course_id?,
//   current_item_index?,      — exact position in the timeline
//   completed_item_id?,       — id of an item of this package just completed
//   item_answers?,            — required for quiz/exam items: the answers, graded here
//   time_spent?,              — seconds to add to total
// }
// Response: the progress row, plus item_result for a graded quiz/exam item.
// The package status/score are computed by the server.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Generous — this endpoint also receives frequent time-tracking beacons
  // during normal use, this is just a script-abuse backstop.
  const { allowed, retryAfterSeconds } = await rateLimit(`lms-pkg-progress:${student.id}`, 60, 60)
  if (!allowed) return res429(retryAfterSeconds)

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  // item_score / status / overall_score may still be sent by an open tab running
  // the previous player; they are ignored — scores and the package result are
  // decided here (see below).
  const {
    current_item_index,
    completed_item_id,
    item_answers,
    time_spent,
  } = body

  // module_id and course_id used to be taken from the request body and written
  // through. The package itself records both, so derive them instead of trusting
  // the caller: a client-supplied course_id meant a student could file package
  // progress under a course they were never enrolled in — and course reports
  // aggregate lms_package_progress BY course_id, so that silently corrupts the
  // reporting for whichever course was named. Deriving also removes any chance
  // of module/course drifting apart.
  const { data: pkg } = await db
    .from("lms_packages")
    .select("id, module_id, course_id, pass_mark")
    .eq("id", id)
    .single()

  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 })

  const module_id = (pkg as any).module_id
  const course_id = (pkg as any).course_id

  // And the student has to be enrolled in the course that owns it — progress is
  // recorded under that enrollment (a retake in another program starts fresh).
  const enrollment = await getCurrentEnrollment(student.id, course_id)
  if (!enrollment || enrollment.access === "none")
    return NextResponse.json({ error: enrollment?.accessNote ?? "Not enrolled in this course" }, { status: 403 })
  if (enrollment.access === "read_only") {
    // Review after a program ended: nothing is recorded. Time beacons from the
    // open player are accepted as no-ops so the page doesn't show errors.
    if (completed_item_id === undefined && item_answers === undefined) return NextResponse.json(null)
    return NextResponse.json({ error: enrollment.accessNote ?? "This course is review-only" }, { status: 403 })
  }
  // Program not started yet / an earlier course still open (sequential courses).
  const lock = await getCourseLock(enrollment)
  if (lock.locked) {
    if (completed_item_id === undefined && item_answers === undefined) return NextResponse.json(null)
    return NextResponse.json({ error: lock.reason }, { status: 403 })
  }

  const [{ data: existing }, { data: pkgItems, error: itemsErr }] = await Promise.all([
    db.from("lms_package_progress")
      .select("id, completed_items, item_scores, time_spent, status")
      .eq("enrollment_id", enrollment.id)
      .eq("package_id", id)
      .maybeSingle(),
    db.from("lms_package_items").select("id, type, config, required").eq("package_id", id),
  ])
  if (itemsErr) return NextResponse.json({ error: "Could not load the package" }, { status: 500 })
  const items = (pkgItems ?? []) as { id: string; type: string; config: any; required: boolean | null }[]
  const itemById = new Map(items.map(i => [i.id, i]))

  const prevCompleted: string[] = existing?.completed_items ?? []
  const prevScores: Record<string, any> = existing?.item_scores ?? {}
  let newCompleted = prevCompleted
  let newScores = prevScores
  let itemResult: Record<string, unknown> | undefined

  if (completed_item_id !== undefined && completed_item_id !== null) {
    // The id must be an item of THIS package. Any string used to be appended to
    // completed_items (and any score stored under it), inflating progress.
    const item = itemById.get(String(completed_item_id))
    if (!item) return NextResponse.json({ error: "Item not found in this package" }, { status: 400 })

    if (isScoredItemType(item.type) && item_answers === undefined && prevScores[item.id]) {
      // Already graded (e.g. the player's "Complete" button on a finished last
      // item) — nothing to grade, just make sure it's marked complete.
      newCompleted = Array.from(new Set([...prevCompleted, item.id]))
    } else if (isScoredItemType(item.type)) {
      // Quiz / Knowledge Test: graded HERE from the submitted answers. A score
      // posted by the browser is never accepted.
      if (!item_answers || typeof item_answers !== "object" || Array.isArray(item_answers))
        return NextResponse.json({ error: "Answers are required to submit this item" }, { status: 400 })

      const prev = prevScores[item.id] as PkgItemScore | undefined
      const attemptsUsed = prev ? (prev.attempts ?? 1) : 0
      const maxAttempts  = itemMaxAttempts(item)
      // A quiz always passes, so once submitted it is done; an exam may be
      // retried only while not passed and attempts remain (as the player offers).
      if (prev && (item.type !== "exam" || prev.passed || attemptsUsed >= maxAttempts))
        return NextResponse.json({ error: "This item has already been submitted" }, { status: 409 })

      const questions: PkgQuestion[] = Array.isArray(item.config?.questions) ? item.config.questions : []
      const openEnded = questions.filter(q => q.type === "open_ended")
      if (openEnded.length) {
        const rl = await rateLimit(`lms-pkg-grade:${student.id}`, 20, 600)
        if (!rl.allowed) return res429(rl.retryAfterSeconds)
      }
      const ai: Record<string, { score: number; justification: string }> = {}
      await Promise.all(openEnded.map(async q => {
        const ans = (item_answers as Record<string, any>)[q.id]
        if (typeof ans !== "string" || !ans.trim()) { ai[q.id] = { score: 0, justification: "No answer provided." }; return }
        try {
          const r = await scoreOpenEndedAnswer(
            q.text,
            q.model_answer?.trim() || "Evaluate the answer for accuracy, completeness, and relevance to the question.",
            ans.slice(0, 5000),
            Number(q.points) || 1
          )
          ai[q.id] = { score: Math.max(0, Math.min(Number(r.score) || 0, Number(q.points) || 0)), justification: r.justification }
        } catch {
          // The browser used to award FULL points when AI scoring failed.
          ai[q.id] = { score: 0, justification: "AI scoring unavailable." }
        }
      }))

      const base   = scoreQuestions(questions, item_answers)
      const score  = base.score + Object.values(ai).reduce((s, v) => s + v.score, 0)
      const pct    = base.max > 0 ? Math.round((score / base.max) * 100) : 0
      const passed = item.type === "exam" ? pct >= itemPassMark(item, Number((pkg as any).pass_mark ?? 70)) : true
      const graded: PkgItemScore = { score, max: base.max, pct, passed, attempts: attemptsUsed + 1, ...(openEnded.length ? { ai } : {}) }

      newScores    = { ...prevScores, [item.id]: graded }
      newCompleted = Array.from(new Set([...prevCompleted, item.id]))
      itemResult   = {
        ...graded,
        max_attempts: maxAttempts,
        answers:      item_answers,
        // Full questions (with the key) only now that it has been graded.
        questions:    (item.config?.show_correct ?? true) ? questions : undefined,
      }
    } else {
      newCompleted = Array.from(new Set([...prevCompleted, item.id]))
    }
  }

  // Accumulate time. The increment is client-reported seconds and this endpoint
  // accepts up to 60 beacons a minute, so an unbounded value (or a negative one)
  // accumulates straight into the "Learning time" shown on the student
  // dashboard, the admin roster and the course reports. Bound each increment to
  // an hour — far more than any single beacon legitimately carries, since these
  // fire continuously during playback.
  const rawIncrement = Number(time_spent)
  const increment = Number.isFinite(rawIncrement)
    ? Math.min(Math.max(Math.round(rawIncrement), 0), 3600)
    : 0
  const newTime = (existing?.time_spent ?? 0) + increment

  // ── Package result, decided by the server ─────────────────────────────
  // The package is finished once every required item is completed. Its result
  // then follows the same rule the player shows the student: every Knowledge
  // Test passed → "passed"; score = average of the scored items (100 when the
  // package has none).
  //
  // The previous version waited for the browser to claim a terminal status and
  // then recomputed pass/fail from the stored item scores against the package
  // pass mark. A package of slides and practice activities has no stored
  // scores, so that recomputation always produced 0% → "failed" for a student
  // who had finished everything — and "failed" packages count as not done for
  // course progress and for the lock on the next module.
  const completedSet = new Set(newCompleted)
  const allRequiredDone = items.length > 0 && items.every(i => i.required === false || completedSet.has(i.id))
  let finalStatus: string | undefined = existing ? undefined : "in_progress"
  let finalScore: number | undefined
  if (allRequiredDone) {
    const scored = items.filter(i => isScoredItemType(i.type))
    finalScore  = scored.length
      ? Math.round(scored.reduce((s, i) => s + (Number(newScores[i.id]?.pct) || 0), 0) / scored.length)
      : 100
    finalStatus = scored.every(i => i.type !== "exam" || newScores[i.id]?.passed === true) ? "passed" : "failed"
  }
  const isTerminal = finalStatus === "passed" || finalStatus === "failed"
  const becameTerminal = isTerminal && existing?.status !== finalStatus

  const upsertRow = {
    student_id:      student.id,
    enrollment_id:   enrollment.id,
    package_id:      id,
    ...(module_id  && { module_id }),
    ...(course_id  && { course_id }),
    ...(current_item_index !== undefined && { current_item_index }),
    completed_items: newCompleted,
    item_scores:     newScores,
    time_spent:      newTime,
    ...(finalStatus && { status: finalStatus }),
    ...(finalScore !== undefined && { score: finalScore }),
    ...(becameTerminal && { completed_at: new Date().toISOString() }),
    updated_at:      new Date().toISOString(),
  }

  // One progress row per enrollment + package. Update the existing row or
  // insert a new one (rather than upsert on a unique key, so this works for a
  // retake enrollment alongside the earlier enrollment's row).
  const { data, error } = existing
    ? await db.from("lms_package_progress").update(upsertRow).eq("id", existing.id).select().single()
    : await db.from("lms_package_progress").insert(upsertRow).select().single()

  if (error) return NextResponse.json({ error: "Could not save progress" }, { status: 500 })

  // Keep the stored course progress current: refresh on every item
  // completion (so the admin roster/dashboard climb live as the student
  // works), and when the package result changes. (Not on every time beacon of
  // an already-finished package — those now carry a recomputed status too.)
  if (course_id && (becameTerminal || completed_item_id)) {
    await syncEnrollmentProgress(student.id, course_id, enrollment.id)
  } else if (course_id && increment > 0) {
    // Time-only beacon — refresh just the enrollment time (recomputed from
    // source) so the dashboard/roster stay live without the full progress calc.
    const [pkgT, attT] = await Promise.all([
      db.from("lms_package_progress").select("time_spent").eq("enrollment_id", enrollment.id),
      db.from("lms_module_attempts").select("time_spent_s").eq("enrollment_id", enrollment.id),
    ])
    const total = (pkgT.data ?? []).reduce((s: number, p: any) => s + (p.time_spent ?? 0), 0)
                + (attT.data ?? []).reduce((s: number, a: any) => s + (a.time_spent_s ?? 0), 0)
    await db.from("lms_enrollments").update({ time_spent_s: total }).eq("id", enrollment.id)
  }
  if (becameTerminal && course_id && finalStatus === "passed") {
    await checkCourseCompletion(student.id, course_id, enrollment.id)
  }

  return NextResponse.json(itemResult ? { ...data, item_result: itemResult } : data)
}
