"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { Course, Group } from "@/types"
import Link from "next/link"
import { cn } from "@/lib/utils"

function CoursesContent() {
  const searchParams = useSearchParams()
  const filterGroupId = searchParams.get("group")

  const [courses, setCourses] = useState<Course[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [groupId, setGroupId] = useState(filterGroupId ?? "")
  const [saving, setSaving] = useState(false)

  async function load() {
    const [coursesRes, groupsRes] = await Promise.all([
      fetch("/api/courses" + (filterGroupId ? `?group_id=${filterGroupId}` : "")),
      fetch("/api/groups"),
    ])
    setCourses(await coursesRes.json())
    setGroups(await groupsRes.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [filterGroupId])

  function openCreate() {
    setEditing(null)
    setName("")
    setDescription("")
    setGroupId(filterGroupId ?? "")
    setDialogOpen(true)
  }

  function openEdit(course: Course) {
    setEditing(course)
    setName(course.name)
    setDescription(course.description ?? "")
    setGroupId(course.group_id)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!name.trim() || !groupId) return
    setSaving(true)

    const url = editing ? `/api/courses/${editing.id}` : "/api/courses"
    const method = editing ? "PUT" : "POST"
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, group_id: groupId }),
    })

    setSaving(false)
    if (res.ok) {
      toast.success(editing ? "Course updated" : "Course created")
      setDialogOpen(false)
      load()
    } else {
      const err = await res.json()
      toast.error(err.error ?? "Something went wrong")
    }
  }

  async function handleDelete(id: string, courseName: string) {
    if (!confirm(`Delete "${courseName}"? All exams inside will be deleted.`)) return
    const res = await fetch(`/api/courses/${id}`, { method: "DELETE" })
    if (res.ok) { toast.success("Course deleted"); load() }
    else toast.error("Failed to delete")
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Courses</h2>
          <p className="text-muted-foreground text-sm">Manage courses within your groups</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button onClick={openCreate} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2" />
            }
          >
            <Plus className="h-4 w-4" /> New Course
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Course" : "Create Course"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Group *</Label>
                <Select value={groupId} onValueChange={(v) => setGroupId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Course Name *</Label>
                <Input
                  placeholder="e.g. Aircraft Systems"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Optional description..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || !name.trim() || !groupId}
                  className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Save Changes" : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#1B4F8A]" />
        </div>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No courses yet. Create your first course.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courses.map((course: any) => (
            <Card key={course.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{course.name}</CardTitle>
                    <Badge variant="outline" className="text-xs mt-1 text-[#4B7EC8] border-[#4B7EC8]/30">
                      {course.groups?.name}
                    </Badge>
                    {course.description && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{course.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(course)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-600"
                      onClick={() => handleDelete(course.id, course.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-xs">
                    {course.exams?.length ?? 0} exam{course.exams?.length !== 1 ? "s" : ""}
                  </Badge>
                  <Link
                    href={`/exams?course=${course.id}`}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs text-[#4B7EC8]")}
                  >
                    View Exams →
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CoursesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#1B4F8A]" /></div>}>
      <CoursesContent />
    </Suspense>
  )
}
