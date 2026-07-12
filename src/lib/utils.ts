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

export function generatePassword(length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from({ length }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("")
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
