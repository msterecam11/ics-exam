"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import Image from "next/image"
import { useEffect, useState } from "react"
import { LayoutDashboard, BookOpen, Palette, Library, Settings, Plus } from "lucide-react"

const navItems = [
  { href: "/studio",          label: "Dashboard",         icon: LayoutDashboard, exact: true },
  { href: "/studio/courses",  label: "Courses",           icon: BookOpen, counter: true },
  { href: "/studio/themes",   label: "Themes",            icon: Palette },
  { href: "/studio/library",  label: "Reference Library", icon: Library },
  { href: "/studio/settings", label: "Settings",          icon: Settings },
]

interface Props {
  user: { name?: string | null; email?: string | null; role?: string }
  inSheet?: boolean
}

export default function StudioSidebar({ user, inSheet = false }: Props) {
  const pathname = usePathname()
  const [courseCount, setCourseCount] = useState<number | null>(null)

  useEffect(() => {
    fetch("/api/course-gen/courses")
      .then(r => r.json())
      .then(d => setCourseCount(d.courses?.length ?? 0))
      .catch(() => {})
  }, [pathname])

  const initials = (user.name ?? "A")
    .split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()

  return (
    <aside className={`s-nav ${inSheet ? "flex h-full" : "hidden md:flex"}`}>
      {/* Brand */}
      <div className="flex items-center gap-3" style={{ padding: "22px 20px 18px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <Image src="/course-gen/theme-1/logos/ics-icon-white.png" alt="ICS Aviation" width={30} height={30}
          className="object-contain shrink-0" priority />
        <div className="min-w-0">
          <p style={{ fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: ".2px" }}>ICS Studio</p>
          <p style={{ fontSize: 11, color: "var(--s-navy-muted)", fontWeight: 500 }}>Course Generator</p>
        </div>
      </div>

      {/* New Course */}
      <div style={{ padding: "16px 12px 6px" }}>
        <Link href="/studio/create" className="s-btn s-btn-primary w-full">
          <Plus className="h-4 w-4" /> New Course
        </Link>
      </div>

      {/* Nav */}
      <nav style={{ padding: "6px 12px", display: "flex", flexDirection: "column", gap: 2, flex: inSheet ? undefined : 1 }}>
        {navItems.map(({ href, label, icon: Icon, exact, counter }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/")
          return (
            <Link key={href} href={href} className="s-nav-item" data-active={active}>
              <Icon className="h-4 w-4 shrink-0" style={{ opacity: active ? 1 : .75 }} />
              <span className="flex-1">{label}</span>
              {counter && courseCount !== null && <span className="s-nav-badge">{courseCount}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Pipeline status — real: reflects whether generation can actually run */}
      <PipelineNote />

      {/* User */}
      <div className="flex items-center gap-3" style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
        <div className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 32, height: 32, background: "var(--s-cyan)", color: "var(--s-cyan-ink)", fontSize: 12, fontWeight: 800 }}>
          {initials}
        </div>
        <div className="min-w-0">
          <p style={{ fontSize: 12.5, fontWeight: 700, color: "#fff" }} className="truncate">{user.name}</p>
          <p style={{ fontSize: 11, color: "var(--s-navy-muted)" }} className="capitalize truncate">
            {user.role === "instructor" ? "Instructional Designer" : user.role ?? "admin"}
          </p>
        </div>
      </div>
    </aside>
  )
}

/** Honest status: says "configure a key" rather than claiming agents are
 *  ready when generation would 503 on the first request. */
function PipelineNote() {
  const [state, setState] = useState<{ ready: boolean; note: string } | null>(null)

  useEffect(() => {
    fetch("/api/course-gen/status")
      .then(r => r.json())
      .then(d => setState({
        ready: !!d.ai_configured,
        note: d.ai_configured
          ? `${d.agents} agents ready · ${d.queued ?? 0} queued`
          : "Add ANTHROPIC_API_KEY to enable",
      }))
      .catch(() => setState({ ready: false, note: "Status unavailable" }))
  }, [])

  return (
    <div className="s-nav-note">
      <div className="flex items-center gap-2">
        <span className={state?.ready ? "s-pulse" : ""}
          style={{ width: 7, height: 7, borderRadius: "50%", background: state?.ready ? "#3FD68C" : "#F2C14E", flexShrink: 0 }} />
        <p style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>
          {state?.ready ? "Pipeline online" : "Pipeline idle"}
        </p>
      </div>
      <p style={{ fontSize: 11.5, color: "#BFE3F5", lineHeight: 1.4, marginTop: 4 }}>
        {state?.note ?? "Checking…"}
      </p>
    </div>
  )
}
