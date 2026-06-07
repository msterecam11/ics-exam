import { getStudentSession } from "@/lib/lms-auth"
import { redirect } from "next/navigation"

export default async function LmsLayout({ children }: { children: React.ReactNode }) {
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")
  return <>{children}</>
}
