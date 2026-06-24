import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import Groq from "groq-sdk"

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY_LMS ?? process.env.GROQ_API_KEY ?? "placeholder",
})

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// POST /api/lms/grade-assignment-ai
// Body: { attempt_id, module_id }
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { attempt_id, module_id } = body
  if (!attempt_id || !module_id)
    return NextResponse.json({ error: "attempt_id and module_id required" }, { status: 400 })

  // Fetch the attempt
  const { data: attempt, error: attErr } = await db
    .from("lms_module_attempts")
    .select("id, status, answers, student_id")
    .eq("id", attempt_id)
    .single()

  if (attErr || !attempt)
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 })

  if (attempt.status !== "submitted")
    return NextResponse.json({ error: "Attempt is not in submitted state" }, { status: 409 })

  // Fetch the module (brief + rubric + settings)
  const { data: mod, error: modErr } = await db
    .from("lms_modules")
    .select("id, title, assignment_brief_html, assignment_rubric, activity_settings")
    .eq("id", module_id)
    .single()

  if (modErr || !mod)
    return NextResponse.json({ error: "Module not found" }, { status: 404 })

  const rubric = (mod.assignment_rubric ?? []) as {
    id: string; title: string; description: string | null; maxScore: number
  }[]
  const passMark = ((mod.activity_settings as any)?.pass_mark ?? 70) as number
  const answers  = (attempt.answers ?? {}) as {
    text_content?: string; file_url?: string; file_name?: string
  }

  // Build submission content string
  let submissionText = ""

  if (answers.text_content) {
    submissionText = answers.text_content
  } else if (answers.file_url) {
    // Attempt to fetch file as text (works for plain text; PDFs/DOCX will be unreadable binary)
    try {
      const fileRes = await fetch(answers.file_url)
      const contentType = fileRes.headers.get("content-type") ?? ""
      if (contentType.includes("text")) {
        submissionText = await fileRes.text()
      } else {
        // Binary file — note the filename for context but can't read content
        submissionText = `[File submitted: ${answers.file_name ?? "file"}. Content could not be extracted automatically — AI will grade based on the assignment context only.]`
      }
    } catch {
      submissionText = `[File submitted: ${answers.file_name ?? "file"}. Could not retrieve file content.]`
    }
  }

  if (!submissionText.trim())
    return NextResponse.json({ error: "No submission content to grade" }, { status: 422 })

  // Strip HTML from brief for cleaner prompt
  const briefText = (mod.assignment_brief_html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  // Build rubric section
  const rubricSection = rubric.length > 0
    ? rubric.map(r =>
        `- ${r.title} (max ${r.maxScore} pts)${r.description ? `: ${r.description}` : ""}`
      ).join("\n")
    : "No rubric defined — evaluate overall quality and assign a score out of 100."

  const totalPossible = rubric.length > 0
    ? rubric.reduce((s, r) => s + r.maxScore, 0)
    : 100

  const rubricJsonFormat = rubric.length > 0
    ? rubric.map(r => `{"id":"${r.id}","title":"${r.title}","max":${r.maxScore},"score":<number 0-${r.maxScore}>,"comment":"<one sentence>"}`).join(",\n  ")
    : `{"id":"overall","title":"Overall","max":100,"score":<number 0-100>,"comment":"<one sentence>"}`

  const prompt = `You are an aviation training evaluator grading a student assignment.

ASSIGNMENT: ${mod.title}
BRIEF: ${briefText || "No brief provided."}

RUBRIC (total ${totalPossible} pts):
${rubricSection}

STUDENT SUBMISSION:
${submissionText.slice(0, 6000)}

Grade each rubric criterion fairly and objectively. Respond ONLY with valid JSON in this exact format:
{
  "criteria": [
    ${rubricJsonFormat}
  ],
  "total_score": <sum of all scores>,
  "max_score": ${totalPossible},
  "overall_feedback": "<2-3 sentence summary for the student>",
  "passed": <true if total_score / max_score * 100 >= ${passMark}, else false>
}`

  let result: {
    criteria: { id: string; title: string; max: number; score: number; comment: string }[]
    total_score: number
    max_score: number
    overall_feedback: string
    passed: boolean
  }

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 1024,
    })

    const raw = completion.choices[0]?.message?.content ?? ""
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error("No JSON in response")
    result = JSON.parse(jsonMatch[0])
  } catch (err: any) {
    return NextResponse.json(
      { error: `AI grading failed: ${err?.message ?? "parse error"}` },
      { status: 500 }
    )
  }

  // Determine if auto-release
  const manualRelease = (mod.activity_settings as any)?.manual_release ?? true
  const newStatus     = manualRelease ? "graded" : "released"

  // Save the grade back to the attempt
  const { data: updated, error: updateErr } = await db
    .from("lms_module_attempts")
    .update({
      score:       result.total_score,
      max_score:   result.max_score,
      passed:      result.passed,
      status:      newStatus,
      ai_feedback: {
        overall_comment: result.overall_feedback,
        criteria:        result.criteria,
        graded_by:       "ai",
      },
    })
    .eq("id", attempt_id)
    .select("id, score, max_score, passed, status, ai_feedback")
    .single()

  if (updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json(updated)
}
