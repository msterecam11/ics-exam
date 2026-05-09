"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

const statusLabels = { draft: "Draft", active: "Active", closed: "Closed" }

export default function ExamStatusToggle({
  examId,
  currentStatus,
}: {
  examId: string
  currentStatus: string
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function changeStatus(status: string) {
    if (status === currentStatus) return
    setLoading(true)
    const res = await fetch(`/api/exams/${examId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success(`Status changed to ${statusLabels[status as keyof typeof statusLabels]}`)
      router.refresh()
    } else {
      toast.error("Failed to update status")
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className="gap-2" disabled={loading} />
        }
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Change Status <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {Object.entries(statusLabels).map(([val, label]) => (
          <DropdownMenuItem
            key={val}
            onClick={() => changeStatus(val)}
            className={currentStatus === val ? "font-semibold" : ""}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
