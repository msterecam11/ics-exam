import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import HubPortal from "@/components/hub/HubPortal"

export const metadata = {
  title: "ICS Hub — Platform Portal",
}

export default async function HubPage() {
  const session = await auth()
  if (!session) redirect("/auth/login")

  const user = session.user
  const name = user?.name ?? "Admin"
  const email = user?.email ?? ""
  const initial = name[0]?.toUpperCase() ?? "A"

  return <HubPortal userName={name} userEmail={email} userInitial={initial} userRole={user?.role ?? ""} />
}
