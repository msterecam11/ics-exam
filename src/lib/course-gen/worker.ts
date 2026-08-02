// Course Generator — in-process job worker.
//
// cg_generation_jobs IS the queue. This loop runs inside the same Next.js
// server process (started once from src/instrumentation.ts on boot — Render
// runs a persistent Node container, not serverless, so this is safe and
// costs nothing extra). API routes only ever enqueue; all LLM/browser work
// happens here, one step at a time, each step persisted before the next —
// which is what makes generation resumable across restarts/deploys.

import { db } from "@/lib/db"
import { handleOutlineJob } from "./jobs/outline"
import { handleOrchestratorTick } from "./jobs/orchestrator"
import { handlePdfExportJob } from "./jobs/pdfExport"
import { notifyCourseReady } from "./notify"

const POLL_MS = 3000

declare global {
  // Survives HMR in dev and double-registration — one loop per process, ever.
  var __cgWorkerStarted: boolean | undefined
}

export function startCourseGenWorker() {
  if (globalThis.__cgWorkerStarted) return
  globalThis.__cgWorkerStarted = true

  // Fire and forget — the loop owns its own lifecycle.
  void (async () => {
    await recoverInterruptedJobs()
    console.log("[course-gen] worker loop started")
    // Deliberate sequential loop: at most one job step in flight at a time.
    // On 512MB/0.5CPU this is a feature — browser steps especially must
    // never run concurrently.
    for (;;) {
      try {
        const worked = await claimAndRunOneJob()
        if (!worked) await sleep(POLL_MS)
      } catch (err) {
        console.error("[course-gen] worker tick failed:", err)
        await sleep(POLL_MS)
      }
    }
  })()
}

// A restart mid-job leaves 'running' rows behind. Every completed step
// already persisted its output, so re-queueing simply re-runs the one
// interrupted step — nothing is lost.
async function recoverInterruptedJobs() {
  const { data } = await db
    .from("cg_generation_jobs")
    .update({ status: "queued", current_step: "Recovered after restart — re-queued" })
    .eq("status", "running")
    .select("id")
  if (data?.length) console.log(`[course-gen] recovered ${data.length} interrupted job(s)`)
}

async function claimAndRunOneJob(): Promise<boolean> {
  const { data: next } = await db
    .from("cg_generation_jobs")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!next) return false

  // Optimistic claim — only proceeds if still queued (guards against a
  // second process, e.g. dev + prod pointing at one DB).
  const { data: claimed } = await db
    .from("cg_generation_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", next.id)
    .eq("status", "queued")
    .select("*")
    .maybeSingle()
  if (!claimed) return true // someone else took it; loop again immediately

  await runJob(claimed)
  return true
}

async function runJob(job: any) {
  try {
    switch (job.job_type) {
      case "outline": {
        await setStep(job.id, "Reading brief and reference materials…", 10)
        const outline = await handleOutlineJob(job)
        await completeJob(job.id, outline)
        await db.from("cg_courses")
          .update({ status: "outline_review", updated_at: new Date().toISOString() })
          .eq("id", job.course_id)
        break
      }

      case "orchestrator": {
        // One slide per tick, then re-queue itself with an advanced cursor:
        // slide-level progress, slide-level restart recovery, and the worker
        // never blocks for hours on a single row.
        const tick = await handleOrchestratorTick(job)
        // Keep a short rolling activity log on the job so the UI can show
        // what actually happened, not just a percentage.
        const log: string[] = [...((job.input?.log as string[]) ?? []), tick.step].slice(-40)
        if (tick.done) {
          await completeJob(job.id, { cursor: tick.cursor, log })
          await notifyCourseReady(job.course_id)
        } else {
          await db.from("cg_generation_jobs").update({
            status: "queued",
            current_step: tick.step,
            progress_pct: tick.progress,
            input: { ...job.input, cursor: tick.cursor, log },
            started_at: null,
          }).eq("id", job.id)
        }
        break
      }

      case "pdf_export": {
        // Heaviest browser work in the system — the single-job-at-a-time
        // loop is what keeps it from colliding with QA screenshots.
        await setStep(job.id, "Preparing export…", 5)
        const out = await handlePdfExportJob(job)
        await completeJob(job.id, out)
        break
      }

      default:
        throw new Error(`No handler for job_type "${job.job_type}" yet`)
    }
  } catch (err: any) {
    console.error(`[course-gen] job ${job.id} (${job.job_type}) failed:`, err)
    await db.from("cg_generation_jobs").update({
      status: "failed",
      error: String(err?.message ?? err),
      completed_at: new Date().toISOString(),
      attempts: (job.attempts ?? 0) + 1,
    }).eq("id", job.id)
    if (job.course_id && ["outline", "orchestrator"].includes(job.job_type)) {
      await db.from("cg_courses")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", job.course_id)
    }
  }
}

async function setStep(jobId: string, step: string, pct: number) {
  await db.from("cg_generation_jobs")
    .update({ current_step: step, progress_pct: pct })
    .eq("id", jobId)
}

async function completeJob(jobId: string, output: unknown) {
  await db.from("cg_generation_jobs").update({
    status: "done",
    output,
    progress_pct: 100,
    current_step: null,
    completed_at: new Date().toISOString(),
  }).eq("id", jobId)
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}
