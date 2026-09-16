import { redirect } from "next/navigation"
import SessionExpiredGuard from "@/components/lms/SessionExpiredGuard"
import { getStudentSession } from "@/lib/lms-auth"

export default async function LmsPlayerLayout({ children }: { children: React.ReactNode }) {
  // Player pages check the session themselves (and send an unauthenticated
  // visitor to login), so only the forced password change is handled here —
  // otherwise a flagged student could skip it by opening a course player URL.
  const student = await getStudentSession()
  if (student?.mustChangePassword) redirect("/lms/change-password")

  return (
    <>
      <SessionExpiredGuard loginUrl="/lms/login" reason="For security, your learning session has timed out." />
      {children}
    </>
  )
}
