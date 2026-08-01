"use client"

import { signOut } from "next-auth/react"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { LogOut, Menu } from "lucide-react"
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

  return (
    <header className="h-14 border-b bg-white flex items-center justify-between px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-3">
        <Sheet>
          <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" />}>
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 bg-[#0A2E4E] border-0">
            <StudioSidebar user={user} inSheet />
          </SheetContent>
        </Sheet>
        <h1 className="text-base font-semibold text-[#0A2E4E]">{title}</h1>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" />}>
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-[#0C72C6] text-white text-xs font-bold">
              {user.name?.[0]?.toUpperCase() ?? "A"}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-3 py-2">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
            className="gap-2 text-red-600 focus:text-red-600 cursor-pointer"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
