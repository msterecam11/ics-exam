"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"

/**
 * Auto-triggers window.print() when ?autoprint=1 is in the URL.
 * Drop this into any print page to enable one-click PDF saving.
 */
export default function PrintTrigger() {
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get("autoprint") === "1") {
      // Small delay to ensure fonts/images are fully loaded
      const t = setTimeout(() => window.print(), 800)
      return () => clearTimeout(t)
    }
  }, [searchParams])

  return null
}
