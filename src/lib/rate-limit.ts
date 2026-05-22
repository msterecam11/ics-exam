/**
 * In-memory sliding-window rate limiter.
 *
 * Suitable for single-instance Next.js deployments (e.g. a single VPS / container).
 * If you scale to multiple instances, swap the store for Upstash Redis.
 *
 * Usage:
 *   const result = rateLimit(req, "confirm", 10, 10 * 60 * 1000)
 *   if (!result.ok) return rateLimitResponse(result)
 */

import { NextRequest, NextResponse } from "next/server"

interface Window {
  hits: number[]      // timestamps (ms) of each hit within the window
  cleanedAt: number   // last time we pruned old hits (for O(1) cleanup trigger)
}

// Global store — lives in Node.js module scope, survives across requests
const store = new Map<string, Window>()

/** Prune entries that haven't been touched in 2× the longest possible window. */
const MAX_IDLE_MS = 30 * 60 * 1000 // 30 min

function pruneStore() {
  const cutoff = Date.now() - MAX_IDLE_MS
  for (const [key, w] of store) {
    if (w.cleanedAt < cutoff) store.delete(key)
  }
}

// Prune the store every 5 minutes to prevent unbounded growth
let lastPrune = 0
function maybeSchedulePrune() {
  const now = Date.now()
  if (now - lastPrune > 5 * 60 * 1000) {
    lastPrune = now
    pruneStore()
  }
}

/** Extract the best available client IP from a Next.js request. */
function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  )
}

export interface RateLimitResult {
  ok:         boolean
  limit:      number
  remaining:  number
  resetAt:    number   // Unix ms when the oldest hit in the window expires
}

/**
 * Check rate limit for a request.
 *
 * @param req       The incoming NextRequest
 * @param key       A short identifier for this endpoint (e.g. "confirm")
 * @param limit     Max number of hits allowed within the window
 * @param windowMs  Window size in milliseconds
 */
export function rateLimit(
  req: NextRequest,
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  maybeSchedulePrune()

  const ip      = getIp(req)
  const storeKey = `${ip}:${key}`
  const now     = Date.now()
  const cutoff  = now - windowMs

  let w = store.get(storeKey)
  if (!w) {
    w = { hits: [], cleanedAt: now }
    store.set(storeKey, w)
  }

  // Drop hits outside the window (sliding window)
  w.hits = w.hits.filter(t => t > cutoff)
  w.cleanedAt = now

  const remaining = Math.max(0, limit - w.hits.length)
  const resetAt   = w.hits.length > 0 ? w.hits[0] + windowMs : now + windowMs

  if (w.hits.length >= limit) {
    return { ok: false, limit, remaining: 0, resetAt }
  }

  w.hits.push(now)
  return { ok: true, limit, remaining: remaining - 1, resetAt }
}

/** Build a 429 Too Many Requests response with standard headers. */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000)
  return NextResponse.json(
    { error: "Too many requests — please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After":       String(retryAfter),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Reset": String(result.resetAt),
      },
    },
  )
}
