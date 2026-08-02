import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import StudioSidebar from "@/components/course-gen/StudioSidebar"
import StudioHeader from "@/components/course-gen/StudioHeader"
import "@/components/course-gen/studio.css"

export default async function CourseGenLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/auth/login")

  // Only admins and instructors may access the Course Generator
  const allowed = ["admin", "instructor"]
  if (!allowed.includes(session.user.role ?? "")) redirect("/hub")

  // .studio scopes the design system so it can never leak into the exam,
  // interview, or LMS systems sharing this app.
  return (
    <div className="studio flex h-screen overflow-hidden">
      <StudioSidebar user={session.user} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <StudioHeader user={session.user} />
        <main className="flex-1 overflow-y-auto" style={{ padding: "26px 30px" }}>
          {children}
        </main>
      </div>
    </div>
  )
}
