import { redirect } from "next/navigation"

export default function LmsAdminRoot() {
  redirect("/lms-admin/courses")
}
