"use client"

import { useState } from "react"
import { Eye, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

// Support tool: opens the student portal in a new tab, seen exactly as this
// student sees it. The session is read-only (nothing is saved in their name)
// and lasts 2 hours. See /api/lms/admin/preview-as.
export default function ViewAsStudentButton({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [busy, setBusy] = useState(false)

  async function open() {
    setBusy(true)
    const res = await fetch("/api/lms/admin/preview-as", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: studentId }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast.error(data.error ?? "Could not open the student view"); return }
    toast.success(`Opening the portal as ${studentName} — read-only, nothing is saved`)
    window.open(data.redirect_to ?? "/lms/dashboard", "_blank")
  }

  return (
    <Button size="sm" variant="outline" onClick={open} disabled={busy}
      title="See the portal exactly as this student does (read-only, 2 hours)"
      className="gap-1.5 h-8 text-xs border-amber-200 text-amber-700 hover:bg-amber-50 shrink-0">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
      View as student
    </Button>
  )
}
