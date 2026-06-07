"use client"

import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function LmsLogoutButton() {
  async function logout() {
    await fetch("/api/lms/auth", { method: "DELETE" })
    window.location.href = "/lms/login"
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-white/70 hover:text-white hover:bg-white/10 h-9 w-9"
      onClick={logout}
    >
      <LogOut className="h-4 w-4" />
    </Button>
  )
}
