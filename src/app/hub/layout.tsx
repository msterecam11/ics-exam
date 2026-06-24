import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/auth/login")

  if (session.user.role === "assessor") redirect("/interview")
  if (session.user.role === "viewer") redirect("/viewer")

  return <>{children}</>
}
