"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"

export default function DeleteExamButton({ examId, examTitle }: { examId: string; examTitle: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm(`Delete "${examTitle}"?\n\nThis will permanently delete the exam, all its questions, and all candidate submissions. This cannot be undone.`)) return

    setDeleting(true)
    const res = await fetch(`/api/exams/${examId}`, { method: "DELETE" })
    setDeleting(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? "Failed to delete exam")
      return
    }

    toast.success(`"${examTitle}" deleted`)
    router.push("/exams")
    router.refresh()
  }

  return (
    <Button
      variant="outline"
      onClick={handleDelete}
      disabled={deleting}
      className="border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 hover:border-red-300 gap-2"
    >
      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      Delete
    </Button>
  )
}
