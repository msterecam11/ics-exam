import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import LmsAdminSidebar from "@/components/lms/LmsAdminSidebar"
import LmsAdminHeader from "@/components/lms/LmsAdminHeader"
import SessionExpiredGuard from "@/components/lms/SessionExpiredGuard"

export default async function LmsAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/auth/login")
  if (session.user.role === "assessor") redirect("/interview")

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <SessionExpiredGuard loginUrl="/auth/login" reason="For security, you're signed out after 8 hours." />
      <LmsAdminSidebar user={session.user} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <LmsAdminHeader user={session.user} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
