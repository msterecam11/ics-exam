"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import {
  LayoutDashboard, BookOpen, Calendar, ClipboardList,
  Award, UserCircle, LogOut, Bell,
} from "lucide-react"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/lms/dashboard",    label: "Dashboard",      icon: LayoutDashboard, badge: null },
  { href: "/lms/courses",      label: "My Courses",     icon: BookOpen,        badge: null },
  { href: "/lms/schedule",     label: "My Schedule",    icon: Calendar,        badge: "sessions" },
  { href: "/lms/assignments",  label: "My Assignments", icon: ClipboardList,   badge: "assignments" },
  { href: "/lms/certificates", label: "Certificates",   icon: Award,           badge: null },
  { href: "/lms/profile",      label: "My Profile",     icon: UserCircle,      badge: null },
] as const

interface Props {
  children: React.ReactNode
  student: { name: string; email: string }
  upcomingSessions?: number
  pendingAssignments?: number
}

export default function LmsStudentShell({
  children,
  student,
  upcomingSessions = 0,
  pendingAssignments = 0,
}: Props) {
  const pathname = usePathname()

  const badges: Record<string, number> = {
    sessions:    upcomingSessions,
    assignments: pendingAssignments,
  }

  const initials = student.name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0] ?? "")
    .join("")
    .toUpperCase()

  const activeItem = NAV.find(n =>
    pathname === n.href ||
    (n.href !== "/lms/dashboard" && pathname.startsWith(n.href))
  )

  async function logout() {
    await fetch("/api/lms/auth", { method: "DELETE" })
    window.location.href = "/lms/login"
  }

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="w-[220px] flex-shrink-0 bg-[#1B4F8A] flex flex-col overflow-hidden">

        {/* Brand */}
        <div className="px-4 pt-4 pb-3 border-b border-white/10">
          <Image
            src="/logo/logo-white.png"
            alt="ICS Aviation"
            width={110}
            height={30}
            className="object-contain"
          />
          <p className="text-white/40 text-[10px] mt-1 font-medium tracking-wide">
            Learning Portal
          </p>
        </div>

        {/* Student identity */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-[11px] font-medium truncate leading-tight">{student.name}</p>
            <p className="text-white/45 text-[10px] truncate leading-tight">{student.email}</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(item => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/lms/dashboard" && pathname.startsWith(item.href))
            const count = item.badge ? (badges[item.badge] ?? 0) : 0
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] transition-all",
                  isActive
                    ? "bg-white/20 text-white font-medium"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span className="flex-1 truncate">{item.label}</span>
                {count > 0 && (
                  <span className="bg-white/25 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none flex-shrink-0">
                    {count}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Sign out */}
        <div className="px-2 py-3 border-t border-white/10">
          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="h-12 bg-white border-b border-slate-200 flex items-center px-6 flex-shrink-0 gap-4">
          <span className="text-sm font-semibold text-slate-800 flex-1 truncate">
            {activeItem?.label ?? "ICS Learning Portal"}
          </span>
          <button
            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </button>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  )
}
