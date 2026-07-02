import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import ContentPlayer from "./ContentPlayer"

export default async function ContentPage({
  params,
}: {
  params: Promise<{ id: string; contentId: string }>
}) {
  const { id: courseId, contentId } = await params
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  // Verify enrollment
  const { data: enrollment } = await db
    .from("lms_enrollments")
    .select("id, status")
    .eq("student_id", student.id)
    .eq("course_id", courseId)
    .single()

  if (!enrollment) redirect(`/lms/courses/${courseId}`)

  // Fetch content item with its module
  const { data: item } = await db
    .from("lms_content_items")
    .select(`
      id, title, type, content, order_index, download_allowed, is_mandatory, completion_rule,
      lms_modules!inner(id, course_id, title)
    `)
    .eq("id", contentId)
    .single()

  if (!item) notFound()

  // Verify content belongs to this course
  const mod = (item as any).lms_modules
  if (mod?.course_id !== courseId) notFound()

  // Fetch existing progress (for resume)
  const { data: progress } = await db
    .from("lms_progress")
    .select("status, position, time_spent")
    .eq("student_id", student.id)
    .eq("content_item_id", contentId)
    .single()

  // Fetch course title
  const { data: course } = await db
    .from("lms_courses")
    .select("title")
    .eq("id", courseId)
    .single()

  // Fetch next content item in module (for auto-advance)
  const { data: nextItem } = await db
    .from("lms_content_items")
    .select("id, title, type")
    .eq("module_id", mod.id)
    .gt("order_index", (item as any).order_index ?? 0)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle()

  return (
    <ContentPlayer
      courseId={courseId}
      courseTitle={course?.title ?? ""}
      item={item as any}
      moduleTitle={mod?.title ?? ""}
      studentId={student.id}
      studentName={student.name}
      resumePosition={(progress as any)?.position ?? null}
      resumeStatus={(progress as any)?.status ?? null}
      nextItem={(nextItem as any) ?? null}
    />
  )
}
