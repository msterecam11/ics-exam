import { db } from "@/lib/db"

// ── Report cache (RP-18) ──────────────────────────────────────────────────
//
// Building a report reads every enrollment, attempt and progress row in scope.
// The result is stored with a signature — a fingerprint of all the data behind
// it, computed in one database call (lms_report_signature). A report is only
// rebuilt when the signature changed, or when someone presses Refresh.
//
// Bump REPORT_BUILD_VERSION whenever a builder's output changes shape, so old
// cached copies aren't served.

export const REPORT_BUILD_VERSION = 6

export type ReportScope = { programId?: string | null; courseId?: string | null; companyId?: string | null }
export type Cached<T> = { data: T; builtAt: string; fromCache: boolean }

export async function reportSignature(scope: ReportScope): Promise<string> {
  const { data, error } = await db.rpc("lms_report_signature", {
    p_program: scope.programId ?? null,
    p_course: scope.courseId ?? null,
    p_company: scope.companyId ?? null,
  })
  if (error) throw new Error("Could not check report freshness")
  return `v${REPORT_BUILD_VERSION}:${String(data)}`
}

export async function cachedReport<T>(
  cacheKey: string,
  kind: string,
  scope: ReportScope,
  build: () => Promise<T | null>,
  opts: { refresh?: boolean } = {},
): Promise<Cached<T> | null> {
  const signature = await reportSignature(scope)

  if (!opts.refresh) {
    const { data: row } = await db.from("lms_report_cache").select("signature, data, built_at").eq("cache_key", cacheKey).maybeSingle()
    if (row && (row as any).signature === signature) {
      return { data: (row as any).data as T, builtAt: (row as any).built_at, fromCache: true }
    }
  }

  const data = await build()
  if (data === null) return null
  const builtAt = new Date().toISOString()
  // A failed cache write never fails the report itself.
  await db.from("lms_report_cache").upsert({ cache_key: cacheKey, kind, signature, data: data as any, built_at: builtAt }, { onConflict: "cache_key" })
  return { data, builtAt, fromCache: false }
}

/** Page through a select beyond PostgREST's 1000-row response limit. */
export async function selectAll<T = any>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>, size = 1000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) throw new Error(error.message ?? "Query failed")
    out.push(...(data ?? []))
    if (!data || data.length < size) break
  }
  return out
}
