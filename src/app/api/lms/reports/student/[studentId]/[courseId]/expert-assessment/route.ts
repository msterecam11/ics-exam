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

  // Grounded per-module metrics — the model writes an analysis per module (like the exam's per-section analysis).
  // We include the ACTUAL per-question exam results + practice scores so the AI reasons from real evidence,
  // not just a single module percentage (which can't tell factual recall from application ability).
  const moduleLines = report.modules
    .map(m => {
      const cw = m.items.length > 0 && m.score !== null ? `graded coursework ${m.score}%` : "coursework not graded"
      const practice = m.activities.length
        ? "practice: " + m.activities.map(a => `${a.type.replace(/_/g, " ")} ${a.avgPct != null ? a.avgPct + "%" : "×" + a.count}`).join(", ")
        : ""
      const ex = m.examSection
        ? `exam ${m.examSection.pct}% (${m.examSection.correct}/${m.examSection.questions.length} full marks)`
        : "no exam questions mapped to this module"
      const qLines = m.examSection
        ? "\n      Exam questions (score/points):\n      " +
          m.examSection.questions
            .map(q => `• [${q.scoreAchieved}/${q.points}] ${(q.text ?? "").replace(/\s+/g, " ").slice(0, 100)}`)
            .join("\n      ")
        : ""
      return `  - ${m.title}: mastery ${m.masteryScore ?? "—"}% [${ex}; ${cw}${practice ? "; " + practice : ""}]; topics: ${m.topics.slice(0, 6).join(", ")}${qLines}`
    })
    .join("\n")
  const examLine = report.exam
    ? `Final exam overall: ${report.exam.pct ?? "—"}% — ${report.exam.passed ? "passed" : "not passed"} (${report.exam.attempts}/${report.exam.maxAttempts} attempts)`
    : "Final exam: not attempted"

  // Extra grounded signals — improvement across attempts and standing vs the cohort.
  const traj = report.examTrajectory
  const trajectoryLine = traj.length > 1
    ? `Exam attempt trajectory: ${traj.map(a => `${a.pct}%`).join(" → ")} (${(traj[traj.length - 1].pct - traj[0].pct) >= 0 ? "improved" : "declined"} ${Math.abs(traj[traj.length - 1].pct - traj[0].pct)} pts across ${traj.length} attempts)`
    : ""
  const cohortLine = report.cohort
    ? `Cohort standing: rank #${report.cohort.rank} of ${report.cohort.total}, class average ${report.cohort.classAvg}%`
    : ""

  const moduleSkeleton = report.modules
    .map(m => `"${m.title}": {"summary":"one sentence citing what the learner got right vs wrong in this module","strengths":["a SPECIFIC topic or skill the learner answered CORRECTLY (a full-mark question) — always list the genuine correct areas; only leave empty if they scored zero on essentially every question"],"weaknesses":["a SPECIFIC topic or skill the learner got WRONG (a zero-mark question)"],"development":["one concrete action targeting a specific missed question or skill"]}`)
    .join(",\n    ")

  const prompt = `You are an expert aviation training analyst at ICS Aviation. Analyze this learner's course performance and return a detailed JSON report. Use ONLY the data below — base every insight strictly on these numbers, do not invent facts.

IMPORTANT: The FINAL EXAM is the true measure of whether the learner mastered the material. "Coursework completed" only means they went through the content — it is NOT evidence of mastery. If a learner completed the coursework but scored poorly on a module's exam questions, that is a SIGNIFICANT WEAKNESS, not a strength. Base strengths and weaknesses primarily on the exam scores.

CRITICAL — reason from the ACTUAL per-question results listed under each module, not just the module percentage:
- If the learner got FULL marks on the factual/multiple-choice questions of a topic but ZERO on its scenario/open-ended questions, they KNOW THE FACTS but CANNOT APPLY THEM — say exactly that; do NOT call the topic a knowledge gap.
- Do NOT list a topic as a weakness if the learner answered its questions correctly. Name weaknesses using the SPECIFIC questions/skills that were missed.
- A module can be part strength, part weakness — reflect that nuance rather than labelling the whole module good or bad.

LEARNER: ${report.student.name}${report.student.job_title ? ` (${report.student.job_title})` : ""}
COURSE: ${report.course.title}
OVERALL MASTERY: ${report.overall.score ?? "—"}% · COMPLETION: ${report.overall.completionPct}%
${examLine}
${trajectoryLine ? trajectoryLine + "\n" : ""}${cohortLine ? cohortLine + "\n" : ""}MODULE PERFORMANCE (mastery is exam-weighted):
${moduleLines}

Where relevant, reference the learner's improvement across attempts and their standing relative to the cohort — but only if that data appears above.

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

Be specific, professional, and constructive. Each recommendation must target a DIFFERENT module or topic and must not repeat the same phrasing — reference the concrete topics listed above rather than generic advice like "review key concepts". Strengths must be genuine: if the exam scores are uniformly low, say so honestly rather than inventing strengths.`

  let raw = ""
  try {
    const completion = await groq.chat.completions.create({
      // 70b gives far sharper, less repetitive analysis than 8b-instant; a report
      // is a single on-demand call (rate-limited per user), so free-tier throughput
      // is fine. If the free-tier limit is hit, the catch below returns a friendly 429.
      model: "llama-3.3-70b-versatile",
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
        model: "llama-3.3-70b-versatile",
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
