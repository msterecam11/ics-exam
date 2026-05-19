import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import AdminSidebar from "@/components/admin/AdminSidebar"
import AdminHeader from "@/components/admin/AdminHeader"
import InactivityGuard from "@/components/admin/InactivityGuard"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/auth/login")

  // Assessors have no access to the exam admin panel
  if (session.user.role === "assessor") redirect("/interview")

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <InactivityGuard />
      <AdminSidebar user={session.user} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <AdminHeader user={session.user} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
