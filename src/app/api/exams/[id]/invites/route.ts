import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { sendGraphMailAs } from "@/lib/ms-graph"

const FROM_EMAIL = process.env.LMS_EMAIL ?? "lms@ics-aviation.com"

function buildInviteEmail(opts: {
  fullName: string; examTitle: string; courseName?: string; duration: number; link: string
}) {
  return `
    <div style="font-family:Arial,sans-serif;color:#333;line-height:1.6">
      <p>Hi ${opts.fullName},</p>
      <p>You've been invited to take the <strong>${opts.examTitle}</strong>
         exam${opts.courseName ? ` (${opts.courseName})` : ""}.</p>
      <p>This link is personal to you — your details are already filled in, just
         review them and start when you're ready. Duration: ${opts.duration} minutes.</p>
      <p><a href="${opts.link}"
            style="background:#1B4F8A;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">
         Open Your Exam</a></p>
      <p style="color:#888;font-size:13px">This link only works for you — please don't forward it.</p>
    </div>`
}

async function sendInvite(invite: any, exam: any) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const link = `${appUrl}/exam/${exam.id}/invite/${invite.token}`
  await sendGraphMailAs({
    fromEmail: FROM_EMAIL,
    toEmail: invite.email,
    toName: invite.full_name,
    subject: `You're invited: ${exam.title}`,
    html: buildInviteEmail({
      fullName: invite.full_name,
      examTitle: exam.title,
      courseName: exam.courses?.name,
      duration: exam.duration_minutes,
      link,
    }),
  })
}

// Admin: list invites for an exam
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: exam_id } = await params
  const { data, error } = await db
    .from("exam_invites")
    .select("*")
    .eq("exam_id", exam_id)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Admin: create a personalized invite and email it
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: exam_id } = await params
  const body = await req.json()
  const { full_name, email, job_title, years_of_experience, company, custom_field_values } = body

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!full_name || typeof full_name !== "string" || full_name.trim().length === 0 || full_name.length > 200)
    return NextResponse.json({ error: "full_name is required (max 200 chars)" }, { status: 400 })
  if (!email || !emailRe.test(email))
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 })

  const { data: exam } = await db
    .from("exams")
    .select("id, title, duration_minutes, status, courses(name)")
    .eq("id", exam_id)
    .single()
  if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 })

  const token = randomBytes(24).toString("hex")

  const { data: invite, error } = await db
    .from("exam_invites")
    .insert({
      exam_id,
      token,
      full_name: full_name.trim(),
      email: email.trim().toLowerCase(),
      job_title: job_title?.trim() || null,
      years_of_experience: years_of_experience !== undefined && years_of_experience !== ""
        ? Number(years_of_experience) : null,
      company: company?.trim() || null,
      custom_field_values: custom_field_values ?? {},
      created_by: session.user.id ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await sendInvite(invite, exam)
    await db.from("exam_invites").update({ sent_at: new Date().toISOString() }).eq("id", invite.id)
  } catch (err) {
    console.error("[exam invite] send failed:", err)
    return NextResponse.json(
      { ...invite, warning: "Invite created but the email failed to send — copy the link manually." },
      { status: 201 }
    )
  }

  return NextResponse.json({ ...invite, sent_at: new Date().toISOString() }, { status: 201 })
}
