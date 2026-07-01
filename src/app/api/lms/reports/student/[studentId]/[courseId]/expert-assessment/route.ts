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
export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { allowed, retryAfterSeconds } = await rateLimit(`ai:${session.user.id}`, 10, 3600)
  if (!allowed) {
    const { res429 } = await import("@/lib/apiUtils")
    return res429(retryAfterSeconds)
  }

  const body = await req.json().catch(() => ({}))
  const includeSecurity = !!body.includeSecurity
  const { studentId, courseId } = await params
  const report = await buildCourseReport(studentId, courseId)
  if (!report) return NextResponse.json({ error: "Report data not found" }, { status: 404 })

  // Grounded per-module metrics — the model writes an analysis per module (like the exam's per-section analysis)
  const moduleLines = report.modules
    .map(m => {
      const cw = m.items.length > 0 && m.score !== null ? `coursework ${m.score}%` : "coursework completed (not graded)"
      const ex = m.examSection ? `exam ${m.examSection.pct}% (${m.examSection.correct}/${m.examSection.questions.length} correct)` : "no exam questions"
      return `  - ${m.title}: mastery ${m.masteryScore ?? "—"}% [${cw}; ${ex}]; topics: ${m.topics.slice(0, 5).join(", ")}`
    })
    .join("\n")
  const examLine = report.exam
    ? `Final exam overall: ${report.exam.pct ?? "—"}% — ${report.exam.passed ? "passed" : "not passed"} (${report.exam.attempts}/${report.exam.maxAttempts} attempts)`
    : "Final exam: not attempted"

  const moduleSkeleton = report.modules
    .map(m => `"${m.title}": {"summary":"one sentence assessing this module (mastery ${m.masteryScore ?? "—"}%)","strengths":["specific strength, or note none if the exam score is low"],"weaknesses":["specific weakness grounded in the exam score"],"development":["one concrete action to improve this module"]}`)
    .join(",\n    ")

  const prompt = `You are an expert aviation training analyst at ICS Aviation. Analyze this learner's course performance and return a detailed JSON report. Use ONLY the data below — base every insight strictly on these numbers, do not invent facts.

IMPORTANT: The FINAL EXAM is the true measure of whether the learner mastered the material. "Coursework completed" only means they went through the content — it is NOT evidence of mastery. If a learner completed the coursework but scored poorly on a module's exam questions, that is a SIGNIFICANT WEAKNESS, not a strength. Base strengths and weaknesses primarily on the exam scores.

LEARNER: ${report.student.name}${report.student.job_title ? ` (${report.student.job_title})` : ""}
COURSE: ${report.course.title}
OVERALL MASTERY: ${report.overall.score ?? "—"}% · COMPLETION: ${report.overall.completionPct}%
${examLine}
MODULE PERFORMANCE (mastery is exam-weighted):
${moduleLines}

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "executive_summary": "2-3 professional sentences summarising overall performance, the result, and tone",
  "module_analyses": {
    ${moduleSkeleton}
  },
  "strengths": ["overall strength 1", "overall strength 2"],
  "improvements": ["overall weak area 1 with context", "overall weak area 2"],
  "recommendations": [
    {"area": "module or topic name", "score": ${report.modules[0]?.masteryScore ?? 0}, "action": "specific actionable step"},
    {"area": "module or topic name", "score": ${report.modules[1]?.masteryScore ?? 0}, "action": "specific actionable step"}
  ]
}

Be specific, professional, and constructive.`

  let raw = ""
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 2200,
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

  const assessment: any = {
    executive_summary: String(parsed.executive_summary ?? parsed.narrative ?? ""),
    module_analyses: (parsed.module_analyses && typeof parsed.module_analyses === "object") ? parsed.module_analyses : {},
    strengths:    Array.isArray(parsed.strengths)       ? parsed.strengths.map(String).slice(0, 5)    : [],
    improvements: Array.isArray(parsed.improvements)    ? parsed.improvements.map(String).slice(0, 5) : [],
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.slice(0, 5).map((r: any) => ({ area: String(r.area ?? ""), score: typeof r.score === "number" ? r.score : null, action: String(r.action ?? "") }))
      : [],
  }

  // Optional security / integrity analysis (from the exam attempt's captured events)
  if (includeSecurity && report.security) {
    const s = report.security
    const secPrompt = `You are a forensic exam integrity analyst at ICS Aviation. Analyze the behavioral events recorded during ${report.student.name}'s final exam for the course "${report.course.title}".

Exam result: ${report.exam?.pct ?? "—"}% (${report.exam?.passed ? "passed" : "not passed"})
Behavioral events recorded:
- Tab switches (left the exam window): ${s.tabs}
- Fullscreen exits: ${s.fs}
- Right-click attempts: ${s.rightClicks}
- Copy/cut/paste attempts: ${s.copyAttempts}

Write a professional 3-4 sentence behavioral assessment describing the pattern objectively, correlating it with the result where relevant, and stating the overall integrity risk. Return ONLY valid JSON:
{"risk_level":"${s.riskLevel}","behavioral_assessment":"your 3-4 sentence assessment"}`
    try {
      const secCompletion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: secPrompt }],
        temperature: 0.4, max_tokens: 400,
      })
      const secRaw = secCompletion.choices[0]?.message?.content?.trim() ?? ""
      const secM = secRaw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").match(/\{[\s\S]*\}/)
      const parsedSec = JSON.parse(secM ? secM[0] : secRaw)
      assessment.security_analysis = {
        risk_level: s.riskLevel,
        tabs: s.tabs, fs: s.fs, right_clicks: s.rightClicks, copy_paste: s.copyAttempts,
        behavioral_assessment: String(parsedSec.behavioral_assessment ?? ""),
      }
    } catch { /* security analysis is optional — skip on failure */ }
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
