import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { buildGroupReport } from "@/lib/lms-group-report"
import Groq from "groq-sdk"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY_LMS ?? process.env.GROQ_API_KEY ?? "placeholder" })

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

type Params = { params: Promise<{ courseId: string }> }

export const maxDuration = 60

// GET — stored course-level (cohort) expert assessment
export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { courseId } = await params
  const { data } = await db.from("lms_course_assessments")
    .select("assessment, generated_at").eq("course_id", courseId).maybeSingle()
  return NextResponse.json(data ?? null)
}

// POST — generate the cohort expert assessment from REAL mastery metrics
export async function POST(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { allowed, retryAfterSeconds } = await rateLimit(`ai:${session.user.id}`, 10, 3600)
  if (!allowed) {
    const { res429 } = await import("@/lib/apiUtils")
    return res429(retryAfterSeconds)
  }

  const { courseId } = await params
  const report = await buildGroupReport(courseId)
  if (!report) return NextResponse.json({ error: "Course not found" }, { status: 404 })
  if (report.stats.enrolled === 0) return NextResponse.json({ error: "No students enrolled" }, { status: 400 })

  const s = report.stats
  const dist = report.distribution.map(d => `${d.label}: ${d.count}`).join(", ")
  const moduleLines = report.moduleStats
    .map(m => `  - ${m.title}: cohort avg mastery ${m.avgMastery ?? "—"}% (${m.strong} strong, ${m.weak} weak of ${m.assessed} assessed)`)
    .join("\n")
  const weakTopics = [...report.topicHeatmap].sort((a, b) => a.avgPct - b.avgPct).slice(0, 10)
    .map(t => `  - ${t.topic} (${t.module}): cohort avg ${t.avgPct}%`).join("\n")
  const hardQ = report.itemAnalysis.hardest.slice(0, 8)
    .map(q => `  - [${q.avgPct}% avg, ${q.correctPct}% full marks] ${q.text.replace(/\s+/g, " ").slice(0, 120)}`).join("\n")

  const prompt = `You are an expert aviation training analyst at ICS Aviation writing a COHORT report for the instructor. Base every statement strictly on the data below — do not invent facts. Focus on GROUP patterns, never individuals.

COURSE: ${report.course.title}
COHORT: ${s.enrolled} students · ${s.completed} completed (${s.completionRate}%) · avg mastery ${s.avgMastery ?? "—"}% · avg time ${Math.round(s.avgTimeS / 60)} min/student
FINAL EXAM: ${s.examExists ? `${s.examPassed}/${s.enrolled} passed (pass rate ${s.examPassRate}%)` : "none"}
MASTERY DISTRIBUTION (students per band): ${dist}

PER-MODULE COHORT MASTERY (exam-weighted — the real measure, NOT completion):
${moduleLines || "  (no modules assessed)"}

WEAKEST TOPICS ACROSS THE COHORT:
${weakTopics || "  (topics not analyzed — run Expert Analyze)"}

HARDEST EXAM QUESTIONS (lowest cohort score):
${hardQ || "  (no exam)"}

STUDENTS FLAGGED AT-RISK: ${report.atRisk.length}

Guidance:
- Mastery is the truth — a module with high completion but low mastery is a COHORT WEAKNESS, say so.
- Recommendations must be specific and actionable for TEACHING: name the exact topics/modules to reteach (from the weakest topics), the exam questions worth reviewing (a class-wide miss can mean a teaching gap OR a flawed question — flag both possibilities), pacing changes, and whether a remedial session is warranted.
- If the mastery distribution is bimodal (a strong group and a lost group), call that out — it changes the intervention.
- NEVER leave any array empty. If the cohort did well, still give at least one strength, one improvement (even minor), and one recommendation to extend/consolidate.

Return ONLY valid JSON (no markdown):
{
  "executive_summary": "3-4 sentences on overall cohort performance, readiness, and the headline pattern",
  "strengths": ["cohort strength grounded in a specific module/topic/metric", "..."],
  "improvements": ["cohort weak area naming the specific module/topic and its score", "..."],
  "recommendations": ["specific teaching action — reteach X, review question Y, re-pace Z, remedial session for the weak group", "..."],
  "at_risk_patterns": "1-2 sentences on the common pattern among the struggling students, or 'No significant at-risk pattern.'"
}`

  let raw = ""
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: Math.min(4000, 1600 + report.moduleStats.length * 120),
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
