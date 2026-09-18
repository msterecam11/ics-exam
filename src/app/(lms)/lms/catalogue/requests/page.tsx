import { getStudentSession } from "@/lib/lms-auth"
import { redirect } from "next/navigation"
import MyCourseRequests from "@/components/lms/MyCourseRequests"

export const dynamic = "force-dynamic"

// SP-16 — what they've asked for, and what came of it.
export default async function MyRequestsPage() {
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")
  return <div className="p-4 sm:p-6"><MyCourseRequests /></div>
}
