"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Plus, Sparkles, LayoutGrid, Rows3 } from "lucide-react"
import { CourseGallery, CourseTable } from "@/components/course-gen/CourseCards"

export default function StudioDashboard() {
  const [courses, setCourses] = useState<any[] | null>(null)
  const [view, setView] = useState<"gallery" | "table">("gallery")

  useEffect(() => {
    let alive = true
    async function load() {
      const d = await fetch("/api/course-gen/courses").then(r => r.json()).catch(() => ({ courses: [] }))
      if (alive) setCourses(d.courses ?? [])
    }
    load()
    // Keep the workspace live while anything is generating.
    const t = setInterval(load, 6000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const stats = useMemo(() => {
    const list = courses ?? []
    const monthAgo = Date.now() - 30 * 864e5
    const weekAgo = Date.now() - 7 * 864e5
    return {
      active: list.length,
      newThisMonth: list.filter(c => new Date(c.created_at).getTime() > monthAgo).length,
      slides: list.reduce((s, c) => s + (c.slide_count ?? 0), 0),
      slidesThisWeek: list.filter(c => new Date(c.updated_at).getTime() > weekAgo)
        .reduce((s, c) => s + (c.slide_count ?? 0), 0),
      inReview: list.filter(c => c.status === "outline_review").length,
      generating: list.filter(c => ["generating_outline", "generating_slides"].includes(c.status)).length,
      ready: list.filter(c => ["ready", "published"].includes(c.status)).length,
    }
  }, [courses])

  if (courses === null) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: 440 }}>
        <div className="s-spin" style={{ width: 56, height: 56, borderRadius: "50%", border: "4px solid var(--s-line)", borderTopColor: "var(--s-primary)" }} />
        <p className="s-h2" style={{ marginTop: 22 }}>Loading workspace</p>
      </div>
    )
  }

  return (
    <div className="s-fade" style={{ maxWidth: 1240, margin: "0 auto" }}>
      {/* Heading */}
      <div className="flex items-start gap-4 flex-wrap" style={{ marginBottom: 24 }}>
        <div className="flex-1 min-w-0">
          <h1 className="s-h1">Course Workspace</h1>
          <p className="s-body" style={{ marginTop: 4 }}>Generate, review and edit ICS-styled training courses</p>
        </div>
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

      {/* Stats */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", marginBottom: 24 }}>
        <Stat label="Active courses" value={stats.active}
          delta={stats.newThisMonth ? `+${stats.newThisMonth} this month` : undefined} />
        <Stat label="Slides generated" value={stats.slides.toLocaleString()}
          delta={stats.slidesThisWeek ? `+${stats.slidesThisWeek} this week` : undefined} />
        <Stat label="Generating" value={stats.generating}
          sub={stats.generating ? "in the pipeline now" : "pipeline idle"} />
        <Stat label="In review" value={stats.inReview}
          sub={stats.inReview ? "awaiting outline approval" : "nothing waiting"} />
      </div>

      {/* Courses */}
      {courses.length === 0 ? (
        <div className="s-card flex flex-col items-center text-center"
          style={{ padding: "56px 30px", borderStyle: "dashed", borderColor: "#A9CFF0" }}>
          <Sparkles className="h-8 w-8" style={{ color: "var(--s-primary)" }} />
          <p className="s-h2" style={{ marginTop: 16 }}>No courses yet</p>
          <p className="s-body" style={{ marginTop: 6, maxWidth: 420 }}>
            Fill one brief — the pipeline drafts an outline for your review, then builds every slide.
          </p>
          <Link href="/studio/create" className="s-btn s-btn-primary" style={{ marginTop: 18 }}>
            <Plus className="h-4 w-4" /> Create your first course
          </Link>
        </div>
      ) : view === "gallery" ? <CourseGallery courses={courses} /> : <CourseTable courses={courses} />}
    </div>
  )
}

function Stat({ label, value, delta, sub }: { label: string; value: number | string; delta?: string; sub?: string }) {
  return (
    <div className="s-card" style={{ padding: "16px 18px" }}>
      <p className="s-meta" style={{ fontSize: 12.5 }}>{label}</p>
      <p style={{ fontSize: 30, fontWeight: 800, color: "var(--s-ink)", lineHeight: 1.15, marginTop: 4 }}>{value}</p>
      {delta && <p style={{ fontSize: 11.5, color: "#1F7A44", fontWeight: 700, marginTop: 4 }}>{delta}</p>}
      {!delta && sub && <p className="s-meta" style={{ fontSize: 11.5, marginTop: 4 }}>{sub}</p>}
    </div>
  )
}
