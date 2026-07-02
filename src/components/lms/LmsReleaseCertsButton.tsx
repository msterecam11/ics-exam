"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Award, Loader2 } from "lucide-react"
import { toast } from "sonner"

export default function LmsReleaseCertsButton({ courseId }: { courseId: string }) {
  const [loading, setLoading] = useState(false)
  async function release() {
    setLoading(true)
    try {
      const res = await fetch("/api/lms/certificates/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course_id: courseId }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed"); return }
      toast.success(data.released > 0 ? `${data.released} certificate${data.released !== 1 ? "s" : ""} released` : "No certificates pending release")
    } catch { toast.error("Failed to release certificates") }
    finally { setLoading(false) }
  }
  return (
    <Button size="sm" variant="outline" className="gap-1.5" onClick={release} disabled={loading} title="Release held certificates to students">
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Award className="h-3.5 w-3.5" />} Release certificates
    </Button>
  )
}
