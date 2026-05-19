import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/auth/login")

  // Assessors belong in the interview panel only — never the hub
  if (session.user.role === "assessor") redirect("/interview")

  return <>{children}</>
}
