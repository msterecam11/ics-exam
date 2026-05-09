export type EntityTerm = "Group" | "Organization"
export type ContentTerm = "Course" | "Path"

/**
 * Returns a t() function that performs case-aware replacement of
 * "Group/group/Groups/groups" and "Course/course/Courses/courses"
 * throughout any string — static labels, AI narrative text, etc.
 *
 * Only replaces when the chosen term differs from the default.
 */
export function makeT(entity: EntityTerm, content: ContentTerm) {
  return function t(text: string): string {
    if (!text) return ""
    let s = text

    if (entity === "Organization") {
      s = s
        .replace(/\bGroups\b/g, "Organizations")
        .replace(/\bgroups\b/g, "organizations")
        .replace(/\bGroup\b/g, "Organization")
        .replace(/\bgroup\b/g, "organization")
    }

    if (content === "Path") {
      s = s
        .replace(/\bCourses\b/g, "Paths")
        .replace(/\bcourses\b/g, "paths")
        .replace(/\bCourse\b/g, "Path")
        .replace(/\bcourse\b/g, "path")
    }

    return s
  }
}
