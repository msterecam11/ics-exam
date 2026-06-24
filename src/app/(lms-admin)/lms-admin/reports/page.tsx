import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { BarChart3, MessageSquare, ChevronRight } from "lucide-react"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

export default async function LmsReportsPage() {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) redirect("/auth/login")

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold">Reports</h2>
        <p className="text-muted-foreground text-sm">Choose a report type to get started</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/lms-admin/reports/progress" className="group block">
          <div className="bg-white border border-border rounded-2xl p-6 hover:shadow-md hover:border-[#1B4F8A]/30 transition-all flex flex-col gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#1B4F8A]/10 flex items-center justify-center">
              <BarChart3 className="h-6 w-6 text-[#1B4F8A]" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-800">Progress Reports</p>
              <p className="text-sm text-muted-foreground mt-1">
                Browse by course → student to view and download detailed progress reports
              </p>
            </div>
            <div className="flex items-center text-xs font-medium text-[#1B4F8A] gap-1">
              View reports <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </div>
        </Link>

        <Link href="/lms-admin/reports/feedback" className="group block">
          <div className="bg-white border border-border rounded-2xl p-6 hover:shadow-md hover:border-[#1B4F8A]/30 transition-all flex flex-col gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <MessageSquare className="h-6 w-6 text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-800">Course Feedback</p>
              <p className="text-sm text-muted-foreground mt-1">
                View student feedback and ratings for each course
              </p>
            </div>
            <div className="flex items-center text-xs font-medium text-amber-600 gap-1">
              View feedback <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
