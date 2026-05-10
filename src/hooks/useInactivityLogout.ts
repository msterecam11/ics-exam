"use client"

import { useEffect, useRef } from "react"
import { signOut } from "next-auth/react"

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Auto-logs out the admin after 30 minutes of inactivity.
 * Resets the timer on any mouse move, keypress, click, or scroll.
 */
export function useInactivityLogout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        signOut({ callbackUrl: "/auth/login?reason=inactivity" })
      }, INACTIVITY_TIMEOUT_MS)
    }

    const events = ["mousemove", "mousedown", "keypress", "touchstart", "scroll", "click"]
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }))

    // Start the timer immediately on mount
    resetTimer()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      events.forEach((e) => window.removeEventListener(e, resetTimer))
    }
  }, [])
}
