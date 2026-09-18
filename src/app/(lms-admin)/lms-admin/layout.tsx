import { auth } from "@/lib/auth"
import { staffScope } from "@/lib/staff-access"
import { redirect } from "next/navigation"
import LmsAdminSidebar from "@/components/lms/LmsAdminSidebar"
import LmsAdminHeader from "@/components/lms/LmsAdminHeader"
import SessionExpiredGuard from "@/components/lms/SessionExpiredGuard"

export default async function LmsAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/auth/login")
  if (session.user.role === "assessor") redirect("/interview")
  if (session.user.role === "viewer") redirect("/viewer")

  // IR-3 — the menu an instructor sees depends on the extras ticked on their
  // account, so nobody is offered a screen that would then refuse them.
  const scope = session.user.role === "instructor"
    ? await staffScope({ id: session.user.id, role: session.user.role })
    : null

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <SessionExpiredGuard loginUrl="/auth/login" reason="For security, you're signed out after 8 hours." />
      <LmsAdminSidebar user={session.user} permissions={scope?.permissions ?? null} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <LmsAdminHeader user={session.user} permissions={scope?.permissions ?? null} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
