"use client"

import { useInactivityLogout } from "@/hooks/useInactivityLogout"

/**
 * Drop this anywhere inside the admin layout to enable auto-logout
 * after 30 minutes of inactivity. Renders nothing visible.
 */
export default function InactivityGuard() {
  useInactivityLogout()
  return null
}
