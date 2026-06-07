import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import LmsAdminSidebar from "@/components/lms/LmsAdminSidebar"

export default async function LmsAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/auth/login")
  if (session.user.role === "assessor") redirect("/interview")

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <LmsAdminSidebar user={session.user} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
