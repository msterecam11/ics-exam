"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import Image from "next/image"
import { signOut } from "next-auth/react"
import {
  LogOut,
  LayoutDashboard,
  BookOpen,
  Users,
  GraduationCap,
  BarChart3,
  ChevronRight,
  LayoutGrid,
  FolderOpen,
  CalendarDays,
  HelpCircle,
  Settings,
  Route,
  TrendingUp,
  Building2,
  Briefcase,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { navVisible, type NavNeeds } from "@/lib/staff-roles"

// `needs` decides who sees each entry (IR-3). See navVisible in staff-roles.
const navItems: { href: string; label: string; icon: any; exact?: boolean; needs?: NavNeeds }[] = [
  { href: "/lms-admin",          label: "Dashboard",  icon: LayoutDashboard, exact: true, needs: "staff" },
  { href: "/lms-admin/courses",  label: "Courses",    icon: BookOpen, needs: "author_courses" },
  { href: "/lms-admin/programs", label: "Program Manager", icon: Briefcase, needs: "staff" },
  { href: "/lms-admin/students",  label: "Students",        icon: Users, needs: "manage_students" },
  { href: "/lms-admin/companies", label: "Companies",       icon: Building2 },
  { href: "/lms-admin/progress",  label: "Student Progress", icon: TrendingUp },
  { href: "/lms-admin/cohorts",        label: "Cohorts",        icon: GraduationCap },
  { href: "/lms-admin/learning-paths", label: "Learning Paths", icon: Route },
  { href: "/lms-admin/sessions",       label: "Live Sessions",  icon: CalendarDays, needs: "staff" },
  { href: "/lms-admin/questions", label: "Question Bank",   icon: HelpCircle, needs: "author_courses" },
  { href: "/lms-admin/reports",   label: "Reports",         icon: BarChart3, needs: "staff" },
  { href: "/lms-admin/library",   label: "Library",         icon: FolderOpen, needs: "author_courses" },
  { href: "/lms-admin/settings",  label: "Settings",        icon: Settings   },
]

interface Props {
  user: { name?: string | null; email?: string | null; role?: string }
  /** The instructor's extra permissions, read server-side in the layout. */
  permissions?: Record<string, boolean> | null
  inSheet?: boolean
}

export default function LmsAdminSidebar({ user, permissions, inSheet = false }: Props) {
  const pathname = usePathname()
  const items = navItems.filter(i => navVisible(i.needs, user.role, permissions))

  return (
    <aside className={`${inSheet ? "flex h-full" : "hidden md:flex"} flex-col w-64 bg-[#1B4F8A] text-white shrink-0`}>
      {/* Logo */}
      <div className="flex items-center justify-center px-6 py-5 border-b border-white/10">
        <div className="text-center">
          <Image
            src="/logo/logo-white.png"
            alt="ICS Aviation"
            width={130}
            height={36}
            className="object-contain mx-auto"
            priority
          />
          <p className="text-white/50 text-[10px] mt-1 font-medium tracking-widest uppercase">
            Learning Portal
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className={`${inSheet ? "" : "flex-1"} px-3 py-4 space-y-0.5 overflow-y-auto`}>
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : (pathname === href || pathname.startsWith(href + "/"))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-white/15 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="h-3 w-3 opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* Back to Hub — instructors only have the LMS */}
      {user.role !== "instructor" && <div className="px-3 pb-2">
        <Link
          href="/hub"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LayoutGrid className="h-4 w-4 shrink-0" />
          <span>Back to Hub</span>
        </Link>
      </div>}

      {/* User info */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
            {user.name?.[0]?.toUpperCase() ?? "A"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <Badge
              variant="secondary"
              className="text-xs bg-white/10 text-white/80 border-0 capitalize px-1.5 py-0"
            >
              {user.role ?? "instructor"}
            </Badge>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/auth/login" })} title="Sign out" aria-label="Sign out"
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
