import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import InterviewSidebar from "@/components/interview/InterviewSidebar"
import InterviewHeader from "@/components/interview/InterviewHeader"

export default async function InterviewLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/auth/login")

  // Only admins, instructors, and assessors may access the interview system
  const allowed = ["admin", "instructor", "assessor"]
  if (!allowed.includes(session.user.role ?? "")) redirect("/hub")

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <InterviewSidebar user={session.user} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <InterviewHeader user={session.user} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
