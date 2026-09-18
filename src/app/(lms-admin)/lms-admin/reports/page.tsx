import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Building2, FolderKanban, BookOpen, MessageSquare, ChevronRight } from "lucide-react"
import { isMgr } from "@/lib/staff-roles"

// Reports home (RP-1): by client, by program, by course; plus feedback.
export default async function LmsReportsPage() {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) redirect("/auth/login")

  const cards = [
    { href: "/lms-admin/reports/clients", icon: Building2, tint: "bg-indigo-50 text-indigo-600", title: "By client", text: "Everything delivered to one company: programs, people trained, results, certificates and feedback.", cta: "Choose a client" },
    { href: "/lms-admin/reports/programs", icon: FolderKanban, tint: "bg-[#1B4F8A]/10 text-[#1B4F8A]", title: "By program", text: "One program or one track: students, course results, deadlines, students needing support, feedback.", cta: "Choose a program" },
    { href: "/lms-admin/reports/progress", icon: BookOpen, tint: "bg-emerald-50 text-emerald-600", title: "By course", text: "Course quality across every run, comparison between programs, and individual student reports.", cta: "Choose a course" },
    { href: "/lms-admin/reports/feedback", icon: MessageSquare, tint: "bg-amber-50 text-amber-500", title: "Feedback", text: "Course feedback and program surveys, by program and course.", cta: "View feedback" },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold">Reports</h2>
        <p className="text-muted-foreground text-sm">Start from a client, a program or a course.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map(c => {
          const Icon = c.icon
          return (
            <Link key={c.href} href={c.href} className="group block">
              <div className="bg-white border border-border rounded-2xl p-6 h-full hover:shadow-md hover:border-[#1B4F8A]/30 transition-all flex flex-col gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${c.tint}`}><Icon className="h-6 w-6" /></div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">{c.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">{c.text}</p>
                </div>
                <div className="flex items-center text-xs font-medium text-[#1B4F8A] gap-1">{c.cta} <ChevronRight className="h-3.5 w-3.5" /></div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
