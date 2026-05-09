import { NextResponse } from "next/server"

// ── Body parsing ──────────────────────────────────────────────────────────────

const MAX_BODY_BYTES = 50_000 // 50 KB — sufficient for any API payload in this app

/**
 * Safely parse a JSON request body, rejecting oversized payloads.
 * Throws on invalid JSON or body too large.
 */
export async function parseBody(req: Request): Promise<unknown> {
  const contentLength = req.headers.get("content-length")
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    throw new BodyTooLargeError()
  }
  const text = await req.text()
  if (Buffer.byteLength(text, "utf-8") > MAX_BODY_BYTES) {
    throw new BodyTooLargeError()
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new InvalidJsonError()
  }
}

export class BodyTooLargeError extends Error {
  constructor() { super("Request body too large") }
}
export class InvalidJsonError extends Error {
  constructor() { super("Invalid JSON") }
}

// ── Standard error responses ──────────────────────────────────────────────────

export function res429(retryAfterSeconds?: number) {
  const headers: Record<string, string> = {}
  if (retryAfterSeconds) headers["Retry-After"] = String(retryAfterSeconds)
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers }
  )
}

export function res413() {
  return NextResponse.json({ error: "Request too large." }, { status: 413 })
}

export function res400(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

// ── IP extraction ─────────────────────────────────────────────────────────────

/**
 * Extract the real client IP from request headers.
 * Works behind Vercel, Cloudflare, Nginx, or any proxy that sets x-forwarded-for.
 */
export function getIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  )
}
