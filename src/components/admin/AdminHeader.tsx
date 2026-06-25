"use client"

import { signOut } from "next-auth/react"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { LogOut, User, Menu } from "lucide-react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import AdminSidebar from "./AdminSidebar"

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/groups": "Groups",
  "/courses": "Courses",
  "/exams": "Exams",
  "/reports": "Reports",
  "/profile": "My Profile",
}

interface Props {
  user: { name?: string | null; email?: string | null; role?: string }
}

export default function AdminHeader({ user }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const title =
    Object.entries(pageTitles).find(([path]) => pathname.startsWith(path))?.[1] ?? "ICS Admin"

  return (
    <header className="h-14 border-b bg-white flex items-center justify-between px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-3">
        {/* Mobile menu */}
        <Sheet>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" className="md:hidden" />
            }
          >
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 bg-[#1B4F8A] border-0">
            <AdminSidebar user={user} inSheet />
          </SheetContent>
        </Sheet>
        <h1 className="text-base font-semibold text-[#1B4F8A]">{title}</h1>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" className="rounded-full" />
          }
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-[#1B4F8A] text-white text-xs font-bold">
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
          <DropdownMenuItem onClick={() => router.push("/profile")} className="gap-2 cursor-pointer">
            <User className="h-4 w-4" /> Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
            className="gap-2 text-red-600 focus:text-red-600"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
