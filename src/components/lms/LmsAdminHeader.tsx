"use client"

import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu } from "lucide-react"
import LmsAdminSidebar from "./LmsAdminSidebar"

const pageTitles: Record<string, string> = {
  "/lms-admin":               "Dashboard",
  "/lms-admin/courses":       "Courses",
  "/lms-admin/programs":      "Program Manager",
  "/lms-admin/companies":     "Companies",
  "/lms-admin/providers":     "Service Providers",
  "/lms-admin/certificates":  "Certificates",
  "/lms-admin/students":      "Students",
  "/lms-admin/progress":      "Student Progress",
  "/lms-admin/cohorts":       "Cohorts",
  "/lms-admin/learning-paths":"Learning Paths",
  "/lms-admin/sessions":      "Live Sessions",
  "/lms-admin/questions":     "Question Bank",
  "/lms-admin/reports":       "Reports",
  "/lms-admin/library":       "Library",
  "/lms-admin/settings":      "Settings",
}

interface Props {
  user: { name?: string | null; email?: string | null; role?: string }
  /** Passed through to the mobile sidebar so it shows the same menu (IR-3). */
  permissions?: Record<string, boolean> | null
}

export default function LmsAdminHeader({ user, permissions }: Props) {
  const pathname = usePathname()
  const title = Object.entries(pageTitles)
    .filter(([p]) => pathname === p || pathname.startsWith(p + "/"))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? "LMS Admin"

  return (
    <header className="h-14 border-b bg-white flex items-center justify-between px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-3">
        <Sheet>
          <SheetTrigger
            render={<Button variant="ghost" size="icon" className="md:hidden" />}
          >
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 bg-[#1B4F8A] border-0">
            <LmsAdminSidebar user={user} permissions={permissions} inSheet />
          </SheetContent>
        </Sheet>
        <h1 className="text-base font-semibold text-[#1B4F8A]">{title}</h1>
      </div>
    </header>
  )
}
