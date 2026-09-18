export const maxDuration = 60

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import Groq from "groq-sdk"
import { isUuid, loadClientReport, scopedAssessment } from "@/lib/lms-report-scope"
import { guardStaff } from "@/lib/staff-access"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY_LMS ?? process.env.GROQ_API_KEY ?? "placeholder" })
const clientAssessmentKey =(companyId: string) => `client:${companyId}`
type Params = { params: Promise<{ companyId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const { companyId } = await params
  if (!isUuid(companyId)) return NextResponse.json(null)
  return NextResponse.json(await scopedAssessment(clientAssessmentKey(companyId)))
}

// POST — AI summary of everything delivered to one client, from the report's numbers only.
export async function POST(_req: Request, { params }: Params) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const { allowed, retryAfterSeconds } = await rateLimit(`ai:${g.session.id}`, 10, 3600)
  if (!allowed) return res429(retryAfterSeconds)

  const { companyId } = await params
  if (!isUuid(companyId)) return NextResponse.json({ error: "Client not found" }, { status: 404 })
  const cached = await loadClientReport(companyId)
  if (!cached) return NextResponse.json({ error: "Client not found" }, { status: 404 })
  const r = cached.data
  if (r.totals.trained < 3) return NextResponse.json({ error: "An expert summary needs at least 3 trained people" }, { status: 400 })

  const pct = (v: number | null) => (v === null ? "n/a" : `${v}%`)
  const t = r.totals
  const programLines = r.programs.map(p =>
    `  - ${p.name} (${p.status}, ${p.start_date ?? "?"} to ${p.end_date ?? "?"}): ${p.students} students, completion ${pct(p.completionRate)}, pass rate ${pct(p.passRate)}, avg score ${pct(p.avgScore)}, avg progress ${pct(p.avgProgress)}, certificates ${p.certificates}`).join("\n")
  // Same rule as the report: fewer than 3 answers are never summarised.
  const fb = r.feedback
  const fbOk = fb.responses >= 3
  const fbLine = !fb.responses ? "no feedback yet"
    : !fbOk ? "fewer than 3 responses — not reported"
    : `${fb.responses} responses; ${fb.ratings.map(x => `${x.label} ${x.avg}/5`).join(", ")}${fb.recommend ? `; would recommend ${fb.recommend.yesPct}%` : ""}`
  const improve = fbOk ? fb.comments.filter(c => c.kind === "improve").slice(0, 8).map(c => `  - ${c.text.replace(/\s+/g, " ").slice(0, 160)}`).join("\n") : ""

  const prompt = `You are an expert aviation training consultant at ICS Aviation writing a CLIENT-LEVEL summary of all training delivered to one company, for that company's management and for ICS account management. Base every statement strictly on the data below. Never name individuals.

CLIENT: ${r.company.name}${r.company.sector ? ` (${r.company.sector})` : ""}
PROGRAMS: ${t.programs} delivered · ${t.activePrograms} running · ${t.completedPrograms} completed
PEOPLE: ${t.trained} trained · ${t.enrollments} course enrollments
RESULTS: completion ${pct(t.completionRate)} · pass rate ${pct(t.passRate)} (${t.passed}/${t.sat} sat) · avg best score ${pct(t.avgScore)} · certificates ${t.certificates} · ${t.atRisk} currently needing support

PER PROGRAM (oldest to newest where dated):
${programLines || "  (none)"}

FEEDBACK: ${fbLine}
${improve ? `WHAT LEARNERS SAID TO IMPROVE:\n${improve}` : ""}

Guidance: compare programs over time when there is more than one (improving or declining); name the programs behind each strength or weakness; recommendations should be concrete next steps for the client's training plan (follow-up, refresher, next program, support for unfinished learners).

Return ONLY valid JSON (no markdown):
{
  "executive_summary": "3-4 sentences on the overall value delivered and the headline pattern",
  "strengths": ["specific strength grounded in a program/metric", "..."],
  "improvements": ["specific weak area naming the program and its number", "..."],
  "recommendations": ["concrete next step for the client's training plan", "..."]
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
    scope_key: clientAssessmentKey(companyId), kind: "client", company_id: companyId,
    assessment, generated_by: g.session.id, generated_at,
  }, { onConflict: "scope_key" })
  if (error) return NextResponse.json({ error: "Could not save the summary" }, { status: 500 })
  return NextResponse.json({ assessment, generated_at })
}
