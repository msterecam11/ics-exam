import { getStudentSession } from "@/lib/lms-auth"
import { redirect } from "next/navigation"
import CatalogueBrowser from "@/components/lms/CatalogueBrowser"

export const dynamic = "force-dynamic"

// SP-14 — logged-in students only (CV-8). A public catalogue and self sign-up
// come later, with payments.
export default async function CataloguePage() {
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")
  return <div className="p-4 sm:p-6"><CatalogueBrowser /></div>
}
