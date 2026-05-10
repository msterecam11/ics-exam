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
