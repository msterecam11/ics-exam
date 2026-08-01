// Server-boot hook (Next.js instrumentation convention) — starts the
// Course Generator's in-process job worker exactly once per server
// instance. Runs only in the Node runtime (never edge/client bundles).

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCourseGenWorker } = await import("@/lib/course-gen/worker")
    startCourseGenWorker()
  }
}
