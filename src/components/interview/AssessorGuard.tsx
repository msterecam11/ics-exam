"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"

/**
 * Client-side guard that redirects assessors away from admin-only routes.
 * Assessors may only access:
 *   /interview             — their dashboard (shows assigned groups)
 *   /interview/score/:id   — the scoring interface for a group
 */
export default function AssessorGuard({ role }: { role?: string }) {
  const pathname = usePathname()
  const router   = useRouter()

  useEffect(() => {
    if (role !== "assessor") return
    const allowed =
      pathname === "/interview" ||
      pathname.startsWith("/interview/score/")
    if (!allowed) router.replace("/interview")
  }, [pathname, role, router])

  return null
}
