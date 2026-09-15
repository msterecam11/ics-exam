import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || isNaN(minutes)) return "—"
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function formatScore(score: number | null): string {
  if (score === null) return "—"
  return `${score.toFixed(1)}%`
}

// Minutes a candidate spent on an exam, start to submit, capped at the exam's
// time limit when given — a learner can't actively spend more than the
// allotted time; any excess is idle/away time before an auto-submit on
// return. Returns null when either timestamp is missing (in-progress sitting).
export function timeSpentMinutes(
  startedAt: string | null | undefined,
  submittedAt: string | null | undefined,
  durationMinutes?: number | null
): number | null {
  if (!startedAt || !submittedAt) return null
  let mins = Math.round((new Date(submittedAt).getTime() - new Date(startedAt).getTime()) / 60000)
  if (durationMinutes) mins = Math.min(mins, durationMinutes)
  return mins < 0 ? null : mins
}

// Same, formatted as "1h 17m" / "45m" / "—".
export function formatMinutes(mins: number | null): string {
  if (mins === null || mins < 0) return "—"
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

// Convenience: elapsed time between two timestamps, formatted.
export function formatTimeSpent(
  startedAt: string | null | undefined,
  submittedAt: string | null | undefined,
  durationMinutes?: number | null
): string {
  return formatMinutes(timeSpentMinutes(startedAt, submittedAt, durationMinutes))
}

export function generateExamUrl(examId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  return `${base}/exam/${examId}`
}

/**
 * Cryptographically secure random string.
 *
 * Uses Web Crypto (globalThis.crypto), which exists in both Node 18+ and every
 * browser — so the one helper serves API routes and client components alike,
 * with no node:crypto import leaking into a client bundle.
 *
 * Rejection sampling: bytes at or above the largest whole multiple of the
 * alphabet length are discarded instead of folded with %, which would make the
 * first few symbols of the alphabet slightly likelier than the rest.
 */
export function randomString(length: number, alphabet: string): string {
  const max = 256 - (256 % alphabet.length)
  let out = ""
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2)
    globalThis.crypto.getRandomValues(bytes)
    for (const b of bytes) {
      if (b < max) {
        out += alphabet[b % alphabet.length]
        if (out.length === length) break
      }
    }
  }
  return out
}

// Was Math.random, which is a predictable PRNG: enough observed output from one
// stream reveals its internal state and therefore every other value it produced.
// This generates the exam access password, so that property is not acceptable.
// Alphabet and default length are unchanged — existing passwords keep working
// and newly generated ones look exactly the same.
export function generatePassword(length = 6): string {
  return randomString(length, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
}

export function getScoreColor(score: number, passing: number): string {
  if (score >= passing) return "text-green-600"
  if (score >= passing * 0.7) return "text-amber-500"
  return "text-red-500"
}

export function getScoreBg(score: number, passing: number): string {
  if (score >= passing) return "bg-green-50 border-green-200"
  if (score >= passing * 0.7) return "bg-amber-50 border-amber-200"
  return "bg-red-50 border-red-200"
}
