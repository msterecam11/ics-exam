import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { sendGraphMailAs } from "@/lib/ms-graph"

const FROM_EMAIL = process.env.LMS_EMAIL ?? "lms@ics-aviation.com"

export async function POST(_: Request, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: exam_id, inviteId } = await params

  const [{ data: invite }, { data: exam }] = await Promise.all([
    db.from("exam_invites").select("*").eq("id", inviteId).single(),
    db.from("exams").select("id, title, duration_minutes, courses(name)").eq("id", exam_id).single(),
  ])
  if (!invite || !exam) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (invite.status === "completed")
    return NextResponse.json({ error: "This invite has already been completed" }, { status: 400 })
  if (invite.status === "revoked")
    return NextResponse.json({ error: "This invite was revoked" }, { status: 400 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const link = `${appUrl}/exam/${exam.id}/invite/${invite.token}`

  try {
    await sendGraphMailAs({
      fromEmail: FROM_EMAIL,
      toEmail: invite.email,
      toName: invite.full_name,
      subject: `Reminder — you're invited: ${exam.title}`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#333;line-height:1.6">
          <p>Hi ${invite.full_name},</p>
          <p>Reminder — you're invited to take the <strong>${exam.title}</strong>
             exam${(exam.courses as any)?.name ? ` (${(exam.courses as any).name})` : ""}.</p>
          <p><a href="${link}"
                style="background:#1B4F8A;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">
             Open Your Exam</a></p>
          <p style="color:#888;font-size:13px">This link only works for you — please don't forward it.</p>
        </div>`,
    })
  } catch (err) {
    console.error("[exam invite] resend failed:", err)
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 })
  }

  const { data, error } = await db
    .from("exam_invites")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", inviteId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
