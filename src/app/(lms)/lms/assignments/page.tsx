import { redirect } from "next/navigation"

// Assignments are part of each course (module-level assignments on the course
// page), so the separate list was removed from the portal. Old links and
// bookmarks land on My Courses.
export default function AssignmentsPage() {
  redirect("/lms/courses")
}
