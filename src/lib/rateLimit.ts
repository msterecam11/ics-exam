import { db } from "@/lib/db"

export interface RateLimitResult {
  allowed          : boolean
  remaining        : number
  retryAfterSeconds?: number
}

/**
 * Sliding-window rate limiter backed by Supabase.
 * Platform-portable — works on Vercel, VPS, Docker, anywhere.
 *
 * Requires table in Supabase:
 *   CREATE TABLE rate_limits (
 *     id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *     key          TEXT NOT NULL,
 *     window_start TIMESTAMPTZ NOT NULL DEFAULT now()
 *   );
 *   CREATE INDEX idx_rate_limits_key    ON rate_limits(key);
 *   CREATE INDEX idx_rate_limits_window ON rate_limits(window_start);
 */
export async function rateLimit(
  key           : string,
  limit         : number,
  windowSeconds : number
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString()

  // 1. Delete expired entries for this key (sliding window cleanup)
  await db
    .from("rate_limits")
    .delete()
    .eq("key", key)
    .lt("window_start", windowStart)

  // 2. Count requests in current window
  const { count } = await db
    .from("rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("key", key)
    .gte("window_start", windowStart)

  const current = count ?? 0

  if (current >= limit) {
    // Calculate when the oldest entry expires so client knows when to retry
    const { data: oldest } = await db
      .from("rate_limits")
      .select("window_start")
      .eq("key", key)
      .gte("window_start", windowStart)
      .order("window_start", { ascending: true })
      .limit(1)
      .single()

    const retryAt = oldest
      ? new Date(oldest.window_start).getTime() + windowSeconds * 1000
      : Date.now() + windowSeconds * 1000

    return {
      allowed          : false,
      remaining        : 0,
      retryAfterSeconds: Math.max(1, Math.ceil((retryAt - Date.now()) / 1000)),
    }
  }

  // 3. Record this request
  await db.from("rate_limits").insert({ key })

  return { allowed: true, remaining: limit - current - 1 }
}
