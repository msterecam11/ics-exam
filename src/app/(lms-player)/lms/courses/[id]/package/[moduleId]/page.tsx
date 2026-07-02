import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import PackagePlayer, { type PackagePlayerProps } from "@/components/lms/PackagePlayer"
import { type PackageItem } from "@/components/lms/PackageEditor"

export default async function PackagePlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; moduleId: string }>
  searchParams: Promise<{ review?: string }>
}) {
  const { id: courseId, moduleId } = await params
  const { review } = await searchParams
  const isReview = review === "true"

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

  // Verify module belongs to course and is package type
  const { data: module } = await db
    .from("lms_modules")
    .select("id, title, module_type, course_id")
    .eq("id", moduleId)
    .single()

  if (!module || module.course_id !== courseId || module.module_type !== "package") notFound()

  // Fetch course
  const { data: course } = await db
    .from("lms_courses")
    .select("title")
    .eq("id", courseId)
    .single()

  // Fetch package + items
  const { data: pkg } = await db
    .from("lms_packages")
    .select(`
      id, title, pass_mark, free_navigation,
      lms_package_items (
        id, order_index, type, title, config, required
      )
    `)
    .eq("module_id", moduleId)
    .maybeSingle()

  if (!pkg) notFound()

  const items: PackageItem[] = ((pkg as any).lms_package_items ?? [])
    .sort((a: any, b: any) => a.order_index - b.order_index)
    .map((item: any): PackageItem => ({
      id:          item.id,
      type:        item.type,
      title:       item.title ?? item.type,
      required:    item.required ?? true,
      order_index: item.order_index,
      config:      item.config ?? {},
    }))

  // Fetch student progress
  const { data: progress } = await db
    .from("lms_package_progress")
    .select("current_item_index, completed_items, item_scores, status, score")
    .eq("student_id", student.id)
    .eq("package_id", pkg.id)
    .maybeSingle()

  const props: PackagePlayerProps = {
    packageId:    pkg.id,
    moduleId,
    courseId,
    studentId:    student.id,
    studentName:  student.name ?? student.email ?? "Student",
    courseTitle:  course?.title ?? "",
    packageTitle:    module.title,
    passMark:        (pkg as any).pass_mark ?? 70,
    freeNavigation:  isReview || ((pkg as any).free_navigation ?? false),
    previewMode:     isReview,
    items,
    initialProgress: progress
      ? {
          current_item_index: (progress as any).current_item_index ?? 0,
          completed_items:    (progress as any).completed_items ?? [],
          item_scores:        (progress as any).item_scores ?? {},
          status:             (progress as any).status ?? "in_progress",
        }
      : null,
  }

  return <PackagePlayer {...props} />
}
