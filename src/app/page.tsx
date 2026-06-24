import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"

export default async function RootPage() {
  const session = await auth()
  if (session) {
    if (session.user.role === "assessor") redirect("/interview")
    if (session.user.role === "viewer") redirect("/viewer")
    redirect("/hub")
  }
  redirect("/auth/login")
}
