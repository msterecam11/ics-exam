"use client"

import { signOut } from "next-auth/react"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogOut, Menu, Search, Globe, Bell } from "lucide-react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import StudioSidebar from "./StudioSidebar"

const pageTitles: Record<string, string> = {
  "/studio/courses":  "Courses",
  "/studio/create":   "Create a Course",
  "/studio/themes":   "Themes",
  "/studio/library":  "Reference Library",
  "/studio/settings": "Settings",
  "/studio":          "Dashboard",
}

interface Props {
  user: { name?: string | null; email?: string | null; role?: string }
}

export default function StudioHeader({ user }: Props) {
  const pathname = usePathname()
  const title =
    Object.entries(pageTitles)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([path]) => pathname.startsWith(path))?.[1] ?? "ICS Studio"

  const initials = (user.name ?? "A").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()

  return (
    <header className="flex items-center gap-4 shrink-0"
      style={{ height: 64, background: "#fff", borderBottom: "1.5px solid var(--s-line)", padding: "0 24px" }}>

      <Sheet>
        <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" />}>
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="p-0 border-0" style={{ width: 248 }}>
          <div className="studio h-full"><StudioSidebar user={user} inSheet /></div>
        </SheetContent>
      </Sheet>

      <div className="min-w-0">
        <p className="s-meta" style={{ fontSize: 11.5 }}>Workspace</p>
        <p className="s-h2 truncate" style={{ fontSize: 16 }}>{title}</p>
      </div>

      <div className="flex-1" />

      {/* Search */}
      <div className="relative hidden lg:block" style={{ width: 330 }}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--s-muted)" }} />
        <input className="s-input" placeholder="Search courses, modules…" style={{ paddingLeft: 34, borderRadius: 8 }} />
      </div>

      <button className="s-btn s-btn-ghost hidden sm:inline-flex" style={{ padding: "8px 12px" }}>
        <Globe className="h-3.5 w-3.5" /> English
      </button>

      <button className="s-btn s-btn-ghost relative" style={{ padding: 8 }} aria-label="Notifications">
        <Bell className="h-4 w-4" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger render={<button className="shrink-0" aria-label="Account" />}>
          <span className="flex items-center justify-center rounded-full"
            style={{ width: 34, height: 34, background: "var(--s-primary)", color: "#fff", fontSize: 12, fontWeight: 800 }}>
            {initials}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <div className="px-3 py-2">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
            className="gap-2 text-red-600 focus:text-red-600 cursor-pointer">
            <LogOut className="h-4 w-4" /> Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
