import { NextResponse } from "next/server"

// ── Body parsing ──────────────────────────────────────────────────────────────

const MAX_BODY_BYTES = 50_000 // 50 KB — sufficient for any ordinary API payload in this app

// 5 MB — bulk CSV/GIFT question imports (a several-hundred-question bank
// can legitimately run a few hundred KB); pass to parseBody's maxBytes.
export const IMPORT_BODY_BYTES = 5_000_000

/**
 * Safely parse a JSON request body, rejecting oversized payloads.
 * Throws on invalid JSON or body too large.
 * maxBytes overrides the default 50 KB cap — used by bulk CSV/GIFT import
 * routes, which can legitimately carry a few hundred KB of question text.
 */
export async function parseBody(req: Request, maxBytes: number = MAX_BODY_BYTES): Promise<unknown> {
  const contentLength = req.headers.get("content-length")
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    throw new BodyTooLargeError()
  }
  const text = await req.text()
  if (Buffer.byteLength(text, "utf-8") > maxBytes) {
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
