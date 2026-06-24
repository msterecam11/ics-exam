import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import ViewerSecurityWrapper from "@/components/viewer/ViewerSecurityWrapper"

export default async function ViewerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/auth/login")

  const role = session.user.role
  if (role !== "viewer" && role !== "admin") redirect("/hub")

  return (
    <ViewerSecurityWrapper>
      {children}
    </ViewerSecurityWrapper>
  )
}
