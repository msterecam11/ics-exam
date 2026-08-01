import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import StudioSidebar from "@/components/course-gen/StudioSidebar"
import StudioHeader from "@/components/course-gen/StudioHeader"

export default async function CourseGenLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/auth/login")

  // Only admins and instructors may access the Course Generator
  const allowed = ["admin", "instructor"]
  if (!allowed.includes(session.user.role ?? "")) redirect("/hub")

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <StudioSidebar user={session.user} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <StudioHeader user={session.user} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
