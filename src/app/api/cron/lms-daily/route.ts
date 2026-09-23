/**
 * GET /api/cron/lms-daily  — EM-20
 *
 * The one scheduled job the LMS needs. A single daily run evaluates every dated
 * email rule (EM-2, 3, 4, 5, 9, 10 and the weekly EM-13) and sends what is due.
 * (The older course-reminders and session-reminders endpoints were removed:
 * the first ignored each program's email settings.)
 *
 * Render cron job (Render dashboard → Cron Jobs → New Cron Job):
 *   Command : curl -fsS -H "x-cron-secret: $CRON_SECRET" https://<your-app>.onrender.com/api/cron/lms-daily
 *   Schedule: 0 6 * * *          (06:00 UTC daily)
 *
 * Query parameters:
 *   ?dry=1        report who would be emailed and why, without sending or logging
 *   ?rule=<code>  run one rule only (e.g. ?rule=deadline)
 *
 * Secured by CRON_SECRET (x-cron-secret header), or a signed-in admin for the
 * "Run now" and "Preview" buttons in LMS Settings → Emails.
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { runDailyEmails } from "@/lib/lms-email-jobs"
import { RULE_BY_CODE } from "@/lib/lms-email-rules"

export const maxDuration = 300
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = req.headers.get("x-cron-secret")
  const validSecret = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET

  let byAdmin = false
  if (!validSecret) {
    const session = await auth().catch(() => null)
    byAdmin = session?.user.role === "admin"
    if (!byAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = url.searchParams.get("dry") === "1"
  const only = url.searchParams.get("rule")
  if (only && !RULE_BY_CODE[only]) return NextResponse.json({ error: `Unknown rule "${only}"` }, { status: 400 })

  // A real run may only be started by the schedule or by an admin — an
  // instructor pressing Preview gets the dry run and nothing else.
  if (!dryRun && !validSecret) {
    const session = await auth().catch(() => null)
    if (session?.user.role !== "admin")
      return NextResponse.json({ error: "Only an admin can send; add ?dry=1 to preview" }, { status: 403 })
  }

  try {
    const report = await runDailyEmails({ dryRun, only })
    return NextResponse.json(report)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Run failed" }, { status: 500 })
  }
}
