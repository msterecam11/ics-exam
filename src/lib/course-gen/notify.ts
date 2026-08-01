// Completion notification — a big course legitimately takes hours, so the
// designer is expected to walk away. Reuses the existing MS Graph mailer.

import { db } from "@/lib/db"
import { sendGraphMailAs } from "@/lib/ms-graph"

const FROM = process.env.LMS_EMAIL ?? "lms@ics-aviation.com"

export async function notifyCourseReady(courseId: string) {
  try {
    const { data: course } = await db
      .from("cg_courses")
      .select("id, title, created_by, cg_modules(id, cg_pages(id))")
      .eq("id", courseId)
      .single()
    if (!course?.created_by) return

    const { data: user } = await db
      .from("admin_users").select("email, name").eq("id", course.created_by).single()
    if (!user?.email) return

    const modules = (course as any).cg_modules ?? []
    const slides = modules.reduce((s: number, m: any) => s + (m.cg_pages?.length ?? 0), 0)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""

    await sendGraphMailAs({
      fromEmail: FROM,
      toEmail: user.email,
      subject: `Course ready: ${course.title}`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#333;line-height:1.6">
          <p>Hi ${user.name ?? "there"},</p>
          <p>Your course <strong>${course.title}</strong> has finished generating —
             ${modules.length} module${modules.length === 1 ? "" : "s"}, ${slides} slides.</p>
          <p><a href="${appUrl}/studio/courses/${course.id}"
                style="background:#0C72C6;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">
             Open in ICS Studio</a></p>
          <p style="color:#888;font-size:13px">Review each module in the canvas editor before exporting.</p>
        </div>`,
    })
  } catch (err) {
    // Never fail a completed generation because an email bounced.
    console.error("[course-gen] completion email failed:", err)
  }
}
