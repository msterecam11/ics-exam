import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"

export default async function RootPage() {
  const session = await auth()
  if (session) {
    // Assessors have no business in the Hub — send them straight to their panel
    if (session.user.role === "assessor") redirect("/interview")
    redirect("/hub")
  }
  redirect("/auth/login")
}
