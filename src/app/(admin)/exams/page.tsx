"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Loader2, FileText, Clock, Users, Settings } from "lucide-react"
import { toast } from "sonner"
import { formatDuration, cn } from "@/lib/utils"
import type { Course } from "@/types"

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700 border-0",
  active: "bg-emerald-100 text-emerald-700 border-0",
  closed: "bg-slate-100 text-slate-600 border-0",
}

function ExamsContent() {
  const searchParams = useSearchParams()
  const filterCourse = searchParams.get("course")

  const [exams, setExams] = useState<any[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: "", description: "", course_id: filterCourse ?? "",
    duration_minutes: 60, passing_score: 60,
    show_results: "admin_release", language: "en",
  })

  async function load() {
    const [examsRes, coursesRes] = await Promise.all([
      fetch("/api/exams" + (filterCourse ? `?course_id=${filterCourse}` : "")),
      fetch("/api/courses"),
    ])
    setExams(await examsRes.json())
    setCourses(await coursesRes.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [filterCourse])

  function set(key: string, val: unknown) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  async function handleCreate() {
    if (!form.title.trim() || !form.course_id) return
    setSaving(true)
    const res = await fetch("/api/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) {
      toast.success("Exam created")
      setDialogOpen(false)
      setForm({ title: "", description: "", course_id: filterCourse ?? "", duration_minutes: 60, passing_score: 60, show_results: "admin_release", language: "en" })
      load()
    } else {
      const err = await res.json()
      toast.error(err.error ?? "Failed to create exam")
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Exams</h2>
          <p className="text-muted-foreground text-sm">Create and manage your exams</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2" />
            }
          >
            <Plus className="h-4 w-4" /> New Exam
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create New Exam</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Course *</Label>
                <Select value={form.course_id} onValueChange={(v) => set("course_id", v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                  <SelectContent>
                    {courses.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.groups?.name} → {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Exam Title *</Label>
                <Input placeholder="e.g. Final Assessment — Aircraft Systems" value={form.title} onChange={(e) => set("title", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea placeholder="Optional..." rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Duration (minutes)</Label>
                  <Input type="number" min={5} value={form.duration_minutes} onChange={(e) => set("duration_minutes", Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Passing Score (%)</Label>
                  <Input type="number" min={0} max={100} value={form.passing_score} onChange={(e) => set("passing_score", Number(e.target.value))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Results Visibility</Label>
                  <Select value={form.show_results} onValueChange={(v) => set("show_results", v ?? "admin_release")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">Immediate</SelectItem>
                      <SelectItem value="admin_release">Admin Release</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select value={form.language} onValueChange={(v) => set("language", v ?? "en")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ar">Arabic</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleCreate}
                  disabled={saving || !form.title.trim() || !form.course_id}
                  className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Exam"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#1B4F8A]" /></div>
      ) : exams.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No exams yet. Create your first exam.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {exams.map((exam) => (
            <Card key={exam.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4 px-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm truncate">{exam.title}</h3>
                      <Badge className={STATUS_STYLES[exam.status] ?? ""} variant="secondary">
                        {exam.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {exam.courses?.groups?.name} → {exam.courses?.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(exam.duration_minutes)}</span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{exam.candidates?.length ?? 0}</span>
                    <Link
                      href={`/exams/${exam.id}`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 ml-auto sm:ml-0")}
                    >
                      <Settings className="h-3.5 w-3.5" /> Manage
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ExamsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#1B4F8A]" /></div>}>
      <ExamsContent />
    </Suspense>
  )
}
