"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, LayoutGrid, Rows3 } from "lucide-react"
import { CourseGallery, CourseTable } from "@/components/course-gen/CourseCards"

export default function StudioCoursesPage() {
  const [courses, setCourses] = useState<any[] | null>(null)
  const [view, setView] = useState<"gallery" | "table">("table")
  const [q, setQ] = useState("")

  useEffect(() => {
    fetch("/api/course-gen/courses")
      .then(r => r.json())
      .then(d => setCourses(d.courses ?? []))
      .catch(() => setCourses([]))
  }, [])

  if (courses === null) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: 400 }}>
        <div className="s-spin" style={{ width: 48, height: 48, borderRadius: "50%", border: "4px solid var(--s-line)", borderTopColor: "var(--s-primary)" }} />
      </div>
    )
  }

  const filtered = q.trim()
    ? courses.filter(c =>
        c.title?.toLowerCase().includes(q.toLowerCase()) ||
        c.regulatory_framework?.toLowerCase().includes(q.toLowerCase()))
    : courses

  return (
    <div className="s-fade" style={{ maxWidth: 1240, margin: "0 auto" }}>
      <div className="flex items-start gap-4 flex-wrap" style={{ marginBottom: 22 }}>
        <div className="flex-1 min-w-0">
          <h1 className="s-h1">Courses</h1>
          <p className="s-body" style={{ marginTop: 4 }}>All generated and in-progress courses</p>
        </div>
        <input className="s-input" placeholder="Filter…" value={q} onChange={e => setQ(e.target.value)}
          style={{ width: 200, borderRadius: 8 }} />
        <div className="s-seg">
          <button data-active={view === "gallery"} onClick={() => setView("gallery")}>
            <span className="flex items-center gap-1.5"><LayoutGrid className="h-3.5 w-3.5" /> Gallery</span>
          </button>
          <button data-active={view === "table"} onClick={() => setView("table")}>
            <span className="flex items-center gap-1.5"><Rows3 className="h-3.5 w-3.5" /> Table</span>
          </button>
        </div>
        <Link href="/studio/create" className="s-btn s-btn-primary">
          <Plus className="h-4 w-4" /> New Course
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="s-card" style={{ padding: "48px 30px", textAlign: "center", borderStyle: "dashed", borderColor: "#A9CFF0" }}>
          <p className="s-body">{q ? "No courses match that filter." : "No courses yet — create one from the button above."}</p>
        </div>
      ) : view === "gallery" ? <CourseGallery courses={filtered} /> : <CourseTable courses={filtered} />}
    </div>
  )
}
