"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { FolderInput, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface Props {
  examId: string
  currentCourseId: string
}

export default function MoveExamButton({ examId, currentCourseId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [courses, setCourses] = useState<any[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState(currentCourseId)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch("/api/courses")
      .then(r => r.json())
      .then(data => {
        setCourses(data ?? [])
        setLoading(false)
      })
  }, [open])

  async function handleSave() {
    if (selectedCourseId === currentCourseId) { setOpen(false); return }
    setSaving(true)
    const res = await fetch(`/api/exams/${examId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_id: selectedCourseId }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success("Exam moved successfully")
      setOpen(false)
      router.refresh()
    } else {
      const err = await res.json()
      toast.error(err.error ?? "Failed to move exam")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="gap-2" />}>
        <FolderInput className="h-4 w-4" /> Move to Course
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move Exam to a Different Course</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Candidates, scores, QR codes, and passwords are unaffected — only the course grouping changes.
        </p>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-[#1B4F8A]" />
          </div>
        ) : (
          <div className="space-y-4 mt-1">
            <Select value={selectedCourseId} onValueChange={v => { if (v) setSelectedCourseId(v) }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="text-muted-foreground">{c.groups?.name} →</span>{" "}
                    {c.name}
                    {c.id === currentCourseId && (
                      <span className="ml-2 text-xs text-muted-foreground">(current)</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={saving || selectedCourseId === currentCourseId}
                className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Move Exam"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
