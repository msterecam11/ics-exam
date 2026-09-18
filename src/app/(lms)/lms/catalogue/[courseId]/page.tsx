import { getStudentSession } from "@/lib/lms-auth"
import { redirect } from "next/navigation"
import CatalogueCourseView from "@/components/lms/CatalogueCourseView"

export const dynamic = "force-dynamic"

export default async function CatalogueCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")
  const { courseId } = await params
  return <div className="p-4 sm:p-6"><CatalogueCourseView courseId={courseId} /></div>
}
