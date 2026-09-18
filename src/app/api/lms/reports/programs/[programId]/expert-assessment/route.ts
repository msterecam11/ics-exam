export const maxDuration = 60

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import Groq from "groq-sdk"
import { isUuid, loadProgramReport, scopedAssessment } from "@/lib/lms-report-scope"
import { guardStaff, canSeeProgram } from "@/lib/staff-access"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY_LMS ?? process.env.GROQ_API_KEY ?? "placeholder" })
const keyOf = (programId: string, trackId: string | null) => `program:${programId}:${trackId ?? "-"}`

type Params = { params: Promise<{ programId: string }> }
const trackOf = (req: Request) => { const t = new URL(req.url).searchParams.get("track"); return isUuid(t) ? t : null }

export async function GET(req: Request, { params }: Params) {
  const g = await guardStaff({})
  if (!g.ok) return g.res
  const { programId } = await params
  if (!canSeeProgram(g.scope, programId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!isUuid(programId)) return NextResponse.json(null)
  return NextResponse.json(await scopedAssessment(keyOf(programId, trackOf(req))))
}

// POST — AI expert summary of a whole program (or one track), from the report's numbers only.
export async function POST(req: Request, { params }: Params) {
  const g = await guardStaff({})
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, role: g.session.role } } as any
  const { allowed, retryAfterSeconds } = await rateLimit(`ai:${session.user.id}`, 10, 3600)
  if (!allowed) return res429(retryAfterSeconds)

  const { programId } = await params

  if (!canSeeProgram(g.scope, programId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!isUuid(programId)) return NextResponse.json({ error: "Program not found" }, { status: 404 })
  const trackId = trackOf(req)
  const cached = await loadProgramReport(programId, trackId)
  if (!cached) return NextResponse.json({ error: "Program not found" }, { status: 404 })
  const r = cached.data
  if (r.stats.members === 0) return NextResponse.json({ error: "No students in this program yet" }, { status: 400 })

  const s = r.stats
  const pct = (v: number | null) => (v === null ? "n/a" : `${v}%`)
  const courseLines = r.courses.map(c => `  - ${c.title}: ${c.enrolled} enrolled, completion ${pct(c.completionRate)}, pass rate ${pct(c.passRate)} (${c.passed}/${c.sat} sat), avg best score ${pct(c.avgScore)}, avg progress ${pct(c.avgProgress)}, avg time ${Math.round(c.avgTimeS / 60)} min${c.feedbackAvg !== null ? `, feedback ${c.feedbackAvg}/5 (${c.feedbackResponses})` : ""}`).join("\n")
  const trackLines = r.trackComparison.map(t => `  - ${t.name}: ${t.students} students, avg progress ${pct(t.avgProgress)}, completion ${pct(t.completionRate)}, pass rate ${pct(t.passRate)}, avg score ${pct(t.avgScore)}`).join("\n")
  const riskCounts = new Map<string, number>()
  for (const a of r.atRisk) for (const x of a.reasons) { const k = x.reason.replace(/\d+/g, "N"); riskCounts.set(k, (riskCounts.get(k) ?? 0) + 1) }
  const fb = r.feedback
  const fbLine = fb.responses ? `${fb.responses} responses (${pct(fb.responseRate)} response rate); ${fb.ratings.map(x => `${x.label} ${x.avg}/5`).join(", ")}${fb.recommend ? `; would recommend ${fb.recommend.yesPct}%` : ""}` : "no feedback yet"
  const improve = fb.comments.filter(c => c.kind === "improve").slice(0, 8).map(c => `  - ${c.text.replace(/\s+/g, " ").slice(0, 160)}`).join("\n")

  const prompt = `You are an expert aviation training analyst at ICS Aviation writing a PROGRAM-LEVEL summary for the training manager. Base every statement strictly on the data below. Focus on group patterns, never name individuals.

PROGRAM: ${r.program.name}${r.program.company ? ` for ${r.program.company.name}` : ""}${r.scope.trackName ? ` — track ${r.scope.trackName}` : ""}
DATES: ${r.program.start_date ?? "?"} to ${r.program.end_date ?? "?"} · status ${r.program.status}
STUDENTS: ${s.members} enrolled, ${s.active} active, ${s.completedMembers} finished all courses, ${s.withdrawn} withdrawn
RESULTS: completion ${pct(s.completionRate)} · pass rate ${pct(s.passRate)} (${s.passed}/${s.sat} sat) · avg best score ${pct(s.avgScore)} · avg progress ${pct(s.avgProgress)} · certificates ${s.certificates}
ENGAGEMENT: avg time ${Math.round(s.avgTimeS / 60)} min per student · attendance ${pct(s.attendancePct)} · ${s.dueSoon} unfinished and due within 14 days · ${s.overdue} unfinished past the end date

COURSES:
${courseLines || "  (none)"}
${trackLines ? `\nTRACKS:\n${trackLines}\n` : ""}
STUDENTS NEEDING SUPPORT: ${s.atRisk}${[...riskCounts].map(([k, n]) => `\n  - ${k}: ${n}`).join("")}

FEEDBACK: ${fbLine}
${improve ? `WHAT STUDENTS SAID TO IMPROVE:\n${improve}` : ""}

Return ONLY valid JSON (no markdown):
{
  "executive_summary": "3-4 sentences on how the program is going overall and the headline pattern",
  "strengths": ["specific strength grounded in a course/track/metric", "..."],
  "improvements": ["specific weak area naming the course/track and its number", "..."],
  "recommendations": ["specific action for the training manager: which course/track to support, deadline follow-up, reteach, pacing", "..."]
}
Never leave an array empty.`

  let raw = ""
  try {
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b", reasoning_effort: "low",
      messages: [{ role: "user", content: prompt }], temperature: 0.3, max_tokens: 2500,
    })
    raw = completion.choices[0]?.message?.content?.trim() ?? ""
  } catch (err: any) {
    const quota = err?.status === 429 || err?.status === 413 || /rate|quota|too large/i.test(err?.message ?? "")
    return NextResponse.json({ error: quota ? "AI quota reached. Please wait a few minutes and try again." : "AI service unavailable. Please try again." }, { status: quota ? 429 : 503 })
  }
  let parsed: any
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    const m = cleaned.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(m ? m[0] : cleaned)
  } catch { return NextResponse.json({ error: "AI returned an invalid response" }, { status: 500 }) }

  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 6) : [])
  const assessment = { executive_summary: String(parsed.executive_summary ?? ""), strengths: list(parsed.strengths), improvements: list(parsed.improvements), recommendations: list(parsed.recommendations) }
  const generated_at = new Date().toISOString()
  const { error } = await db.from("lms_scoped_assessments").upsert({
    scope_key: keyOf(programId, trackId), kind: "program", program_id: programId, track_id: trackId,
    assessment, generated_by: session.user.id, generated_at,
  }, { onConflict: "scope_key" })
  if (error) return NextResponse.json({ error: "Could not save the summary" }, { status: 500 })
  return NextResponse.json({ assessment, generated_at })
}
