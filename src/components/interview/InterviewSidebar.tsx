"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import Image from "next/image"
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  UserCheck,
  Settings,
  ChevronRight,
  LayoutGrid,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

const adminNav = [
  { href: "/interview",           label: "Dashboard",  icon: LayoutDashboard },
  { href: "/interview/configs",   label: "Configs",    icon: ClipboardList   },
  { href: "/interview/groups",    label: "Groups",     icon: Users           },
  { href: "/interview/assessors", label: "Assessors",  icon: UserCheck       },
  { href: "/interview/settings",  label: "Settings",   icon: Settings        },
]

const assessorNav = [
  { href: "/interview/score", label: "My Scoring", icon: ClipboardList },
]

interface Props {
  user: { name?: string | null; email?: string | null; role?: string }
  inSheet?: boolean
}

export default function InterviewSidebar({ user, inSheet = false }: Props) {
  const pathname = usePathname()
  const isAssessor = user.role === "assessor"
  const navItems = isAssessor ? assessorNav : adminNav

  return (
    <aside className={`${inSheet ? "flex" : "hidden md:flex"} flex-col w-64 bg-[#1B4F8A] text-white shrink-0`}>

      {/* Logo + system label */}
      <div className="flex flex-col items-center justify-center px-6 py-5 border-b border-white/10 gap-1">
        <Image
          src="/logo/logo-white.png"
          alt="ICS Aviation"
          width={150}
          height={42}
          className="object-contain"
          priority
        />
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/50 mt-1">
          Panel Interview
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/interview/score" && pathname.startsWith(href + "/"))
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

      {/* Back to Hub */}
      <div className="px-3 pb-2">
        <Link
          href="/hub"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LayoutGrid className="h-4 w-4 shrink-0" />
          <span>Back to Hub</span>
        </Link>
      </div>

      {/* User info */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold shrink-0">
            {user.name?.[0]?.toUpperCase() ?? "A"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <Badge
              variant="secondary"
              className="text-xs bg-white/10 text-white/80 border-0 capitalize px-1.5 py-0"
            >
              {user.role ?? "assessor"}
            </Badge>
          </div>
        </div>
      </div>
    </aside>
  )
}
