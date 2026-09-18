/**
 * GET /api/cron/session-reminders  — kept for any existing schedule.
 *
 * This used to hold its own copy of the reminder logic and looked for sessions
 * whose date equalled "tomorrow" in UTC. A session_date is a plain date with no
 * timezone, so on a server running behind or ahead of the institute's clock it
 * asked for the wrong day and sent nothing — which is one reason no reminder
 * ever went out.
 *
 * It now delegates to the EM-10 rule inside the daily job, which decides from
 * each session's actual start time and each program's own "hours before"
 * setting. That makes this endpoint and /api/cron/lms-daily agree, and puts the
 * program switches and the email log behind both.
 *
 * Prefer the single daily job for new schedules:
 *   curl -H "x-cron-secret: $CRON_SECRET" https://<app>.onrender.com/api/cron/lms-daily
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { runDailyEmails } from "@/lib/lms-email-jobs"

export const maxDuration = 120
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const secret = req.headers.get("x-cron-secret")
  const validSecret = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET
  if (!validSecret) {
    const session = await auth().catch(() => null)
    if (session?.user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = new URL(req.url).searchParams.get("dry") === "1"

  try {
    const report = await runDailyEmails({ only: "class_reminder", dryRun })
    const c = report.counts.class_reminder ?? { sent: 0, skipped: 0, failed: 0 }
    const sessions = new Set(report.results.map(r => r.subject)).size
    return NextResponse.json({
      ok: true, sent: c.sent, skipped: c.skipped, failed: c.failed, sessions,
      dryRun, testMode: report.testMode,
      ...(report.results.length === 0 ? { reason: "No sessions due for a reminder" } : {}),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Run failed" }, { status: 500 })
  }
}
