import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { buildCourseReport } from "@/lib/lms-course-report"
import Groq from "groq-sdk"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY_LMS ?? process.env.GROQ_API_KEY ?? "placeholder" })

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

type Params = { params: Promise<{ studentId: string; courseId: string }> }

// GET — return the stored expert assessment
export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { studentId, courseId } = await params
  const { data } = await db
    .from("lms_report_assessments")
    .select("assessment, generated_at")
    .eq("student_id", studentId).eq("course_id", courseId)
    .maybeSingle()

  return NextResponse.json(data ?? null)
}

// POST — generate (or regenerate) the expert assessment from the real report metrics
export async function POST(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { allowed, retryAfterSeconds } = await rateLimit(`ai:${session.user.id}`, 10, 3600)
  if (!allowed) {
    const { res429 } = await import("@/lib/apiUtils")
    return res429(retryAfterSeconds)
  }

  const { studentId, courseId } = await params
  const report = await buildCourseReport(studentId, courseId)
  if (!report) return NextResponse.json({ error: "Report data not found" }, { status: 404 })

  // Compact, grounded metrics — the model only narrates these numbers
  const moduleLines = report.modules
    .map(m => `- ${m.title}: ${m.score ?? "—"}% (${m.status}); topics: ${m.topics.slice(0, 4).join(", ")}`)
    .join("\n")
  const examLine = report.exam
    ? `Final exam: ${report.exam.pct ?? "—"}% — ${report.exam.passed ? "passed" : "not passed"} (${report.exam.attempts}/${report.exam.maxAttempts} attempts)`
    : "Final exam: not attempted"
  const weak = report.topicMastery.filter(t => t.level === "weak").map(t => t.topic).slice(0, 5)
  const strong = report.topicMastery.filter(t => t.level === "strong").map(t => t.topic).slice(0, 5)

  const prompt = `You are an aviation training assessor writing a concise expert assessment of a learner's course performance. Use ONLY the data below — do not invent facts or numbers.

LEARNER: ${report.student.name}${report.student.job_title ? ` (${report.student.job_title})` : ""}
COURSE: ${report.course.title}
OVERALL SCORE: ${report.overall.score ?? "—"}% · COMPLETION: ${report.overall.completionPct}%
MODULES:
${moduleLines}
${examLine}
STRONGER TOPICS: ${strong.join(", ") || "—"}
WEAKER TOPICS: ${weak.join(", ") || "—"}

Respond ONLY with valid JSON (no markdown):
{"narrative":"3-4 sentences summarising performance, what they do well, where they struggle, and a recommended next step — refer to the real numbers above","strengths":["2-4 short strength phrases"],"development":["2-4 short development-area phrases"]}`

  let raw = ""
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    })
    raw = completion.choices[0]?.message?.content?.trim() ?? ""
  } catch (err: any) {
    const isQuota = err?.status === 429 || err?.status === 413 || /rate|quota|too large/i.test(err?.message ?? "")
    if (isQuota) return NextResponse.json({ error: "AI quota reached. Please wait a few minutes and try again." }, { status: 429 })
    return NextResponse.json({ error: "AI service unavailable. Please try again." }, { status: 503 })
  }

  let parsed: any
  try {
    const s = raw.indexOf("{"), e = raw.lastIndexOf("}")
    parsed = JSON.parse(raw.slice(s, e + 1))
  } catch {
    return NextResponse.json({ error: "AI returned an invalid response" }, { status: 500 })
  }

  const assessment = {
    narrative: String(parsed.narrative ?? ""),
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String).slice(0, 4) : [],
    development: Array.isArray(parsed.development) ? parsed.development.map(String).slice(0, 4) : [],
  }

  const { data, error } = await db
    .from("lms_report_assessments")
    .upsert(
      { student_id: studentId, course_id: courseId, assessment, generated_by: session.user.id, generated_at: new Date().toISOString() },
      { onConflict: "student_id,course_id" }
    )
    .select("assessment, generated_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
