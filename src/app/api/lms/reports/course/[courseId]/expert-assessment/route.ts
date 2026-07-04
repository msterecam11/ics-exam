import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import Groq from "groq-sdk"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY_LMS ?? process.env.GROQ_API_KEY ?? "placeholder" })

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

type Params = { params: Promise<{ courseId: string }> }

// GET — stored course-level (cohort) expert assessment
export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { courseId } = await params
  const { data } = await db.from("lms_course_assessments")
    .select("assessment, generated_at").eq("course_id", courseId).maybeSingle()
  return NextResponse.json(data ?? null)
}

// POST — generate the cohort expert assessment from real course metrics
export async function POST(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { allowed, retryAfterSeconds } = await rateLimit(`ai:${session.user.id}`, 10, 3600)
  if (!allowed) {
    const { res429 } = await import("@/lib/apiUtils")
    return res429(retryAfterSeconds)
  }

  const { courseId } = await params

  // ── Gather cohort metrics ──────────────────────────────────────
  const [{ data: course }, { data: enrollments }, { data: modules }] = await Promise.all([
    db.from("lms_courses").select("title").eq("id", courseId).single(),
    db.from("lms_enrollments").select("student_id, status, progress_pct, time_spent_s").eq("course_id", courseId),
    db.from("lms_modules").select("id, title, module_type, order_index").eq("course_id", courseId).order("order_index"),
  ])
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 })

  const enr = (enrollments ?? []) as any[]
  const total = enr.length
  if (total === 0) return NextResponse.json({ error: "No students enrolled" }, { status: 400 })

  const studentIds = enr.map(e => e.student_id)
  const completed  = enr.filter(e => e.status === "completed").length
  const avgProgress = Math.round(enr.reduce((s, e) => s + (e.progress_pct ?? 0), 0) / total)
  const avgTimeMin  = Math.round(enr.reduce((s, e) => s + (e.time_spent_s ?? 0), 0) / total / 60)

  const examMod = (modules ?? []).find((m: any) => m.module_type === "final_exam")
  const { data: attempts } = examMod
    ? await db.from("lms_module_attempts").select("student_id, score, max_score, passed")
        .eq("module_id", examMod.id).in("student_id", studentIds)
    : { data: [] }
  const bestByStudent: Record<string, any> = {}
  for (const a of (attempts ?? []) as any[]) {
    const cur = bestByStudent[a.student_id]
    if (!cur || (a.score ?? 0) > (cur.score ?? 0)) bestByStudent[a.student_id] = a
  }
  const examPass = Object.values(bestByStudent).filter((a: any) => a.passed).length
  const examAttempted = Object.keys(bestByStudent).length

  // Per-module cohort completion (package modules)
  const pkgModIds = (modules ?? []).filter((m: any) => m.module_type === "package").map((m: any) => m.id)
  const { data: pkgRows } = pkgModIds.length
    ? await db.from("lms_packages").select("id, module_id").in("module_id", pkgModIds) : { data: [] }
  const pkgIds = (pkgRows ?? []).map((p: any) => p.id)
  const [{ data: pkgItems }, { data: pkgProg }] = await Promise.all([
    pkgIds.length ? db.from("lms_package_items").select("package_id").in("package_id", pkgIds) : Promise.resolve({ data: [] }),
    pkgIds.length ? db.from("lms_package_progress").select("package_id, student_id, completed_items, status").in("package_id", pkgIds).in("student_id", studentIds) : Promise.resolve({ data: [] }),
  ])
  const totalByPkg: Record<string, number> = {}
  for (const it of (pkgItems ?? []) as any[]) totalByPkg[it.package_id] = (totalByPkg[it.package_id] ?? 0) + 1
  const pkgIdByMod = new Map((pkgRows ?? []).map((p: any) => [p.module_id, p.id]))
  const progByKey: Record<string, any> = {}
  for (const pp of (pkgProg ?? []) as any[]) progByKey[`${pp.package_id}:${pp.student_id}`] = pp

  const moduleLines = (modules ?? []).map((m: any) => {
    if (m.module_type === "package") {
      const pid = pkgIdByMod.get(m.id); const t = pid ? (totalByPkg[pid] ?? 0) : 0
      let sum = 0
      for (const sid of studentIds) {
        const pp = pid ? progByKey[`${pid}:${sid}`] : null
        const done = pp?.status === "passed" || pp?.status === "completed"
        const comp = Array.isArray(pp?.completed_items) ? pp.completed_items.length : 0
        sum += done ? 100 : t > 0 ? Math.min(100, Math.round((comp / t) * 100)) : 0
      }
      return `  - ${m.title}: ${Math.round(sum / total)}% avg completion`
    }
    if (m.module_type === "final_exam") return `  - ${m.title} (FINAL EXAM): ${examPass}/${total} passed, ${examAttempted} attempted`
    return `  - ${m.title} (${m.module_type})`
  }).join("\n")

  const prompt = `You are an expert aviation training analyst at ICS Aviation. Analyze how this COHORT performed in a course and return a JSON report for the instructor. Base every statement strictly on the data — do not invent facts.

COURSE: ${course.title}
COHORT: ${total} students · ${completed} completed (${Math.round(completed / total * 100)}%) · avg progress ${avgProgress}% · avg time ${avgTimeMin} min/student
FINAL EXAM: ${examMod ? `${examPass}/${total} passed (${examAttempted} attempted)` : "none"}
PER-MODULE COHORT PERFORMANCE:
${moduleLines}

Focus on GROUP patterns, not individuals: which modules the cohort mastered vs struggled with, overall readiness, and what the instructor should do next. If a module has low average completion or the exam pass rate is low, treat that as a cohort weakness worth addressing in teaching.

Return ONLY valid JSON (no markdown):
{
  "executive_summary": "2-4 sentences on overall cohort performance and readiness",
  "strengths": ["cohort strength grounded in the data", "..."],
  "improvements": ["cohort weak area with the module/metric that shows it", "..."],
  "recommendations": ["concrete action for the instructor", "..."],
  "at_risk_patterns": "1-2 sentences on the common pattern among struggling students (or 'None significant.')"
}`

  let raw = ""
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1200,
    })
    raw = completion.choices[0]?.message?.content?.trim() ?? ""
  } catch (err: any) {
    const isQuota = err?.status === 429 || err?.status === 413 || /rate|quota|too large/i.test(err?.message ?? "")
    if (isQuota) return NextResponse.json({ error: "AI quota reached. Please wait a few minutes and try again." }, { status: 429 })
    return NextResponse.json({ error: "AI service unavailable. Please try again." }, { status: 503 })
  }

  let parsed: any
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    const m = cleaned.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(m ? m[0] : cleaned)
  } catch {
    return NextResponse.json({ error: "AI returned an invalid response" }, { status: 500 })
  }

  const assessment = {
    executive_summary: String(parsed.executive_summary ?? ""),
    strengths:         Array.isArray(parsed.strengths)       ? parsed.strengths.map(String).slice(0, 6)       : [],
    improvements:      Array.isArray(parsed.improvements)    ? parsed.improvements.map(String).slice(0, 6)    : [],
    recommendations:   Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String).slice(0, 6) : [],
    at_risk_patterns:  String(parsed.at_risk_patterns ?? ""),
  }

  await db.from("lms_course_assessments").upsert({
    course_id:    courseId,
    assessment,
    generated_by: session.user.id,
    generated_at: new Date().toISOString(),
  }, { onConflict: "course_id" })

  return NextResponse.json({ assessment, generated_at: new Date().toISOString() })
}
