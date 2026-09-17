export type ProgramStatus = "draft" | "active" | "completed" | "archived"
export type ProgramStructure = "course" | "path" | "tracks"

export const PROGRAM_STATUS_STYLE: Record<ProgramStatus, string> = {
  draft:     "bg-slate-100 text-slate-600",
  active:    "bg-emerald-100 text-emerald-700",
  completed: "bg-blue-100 text-blue-700",
  archived:  "bg-zinc-100 text-zinc-500",
}

export type ProgramDetail = {
  program: {
    id: string; name: string; status: ProgramStatus; structure: ProgramStructure
    company_id: string | null; is_individual: boolean; reference: string | null; description: string | null
    start_date: string | null; end_date: string | null; capacity: number | null
    after_end_access: "read_only" | "full" | "locked"
    certificate_enabled: boolean; certificate_auto_release: boolean
    feedback_enabled: boolean; feedback_mandatory: boolean; feedback_anonymous: boolean; progress_enforcement: boolean
    duplicated_from: string | null; created_at: string
    lms_companies: { id: string; name: string; code: string; logo_url: string | null } | null
  }
  tracks: { id: string; name: string; order_index: number }[]
  items: {
    id: string; track_id: string | null; course_id: string | null; path_id: string | null; order_index: number
    lms_courses: { id: string; title: string; status: string } | null
    lms_learning_paths: { id: string; title: string } | null
  }[]
  path_courses: { path_id: string; order_index: number; lms_courses: { id: string; title: string } | null }[]
  rules: { course_id: string; pass_mark: number; max_attempts: number; lms_courses: { id: string; title: string } | null }[]
  instructors: { id: string; name: string; email: string; role: string }[]
  members: {
    id: string; student_id: string; track_id: string | null; status: "active" | "withdrawn" | "completed"
    end_date_override: string | null; added_at: string; withdrawn_at: string | null
    lms_students: { id: string; name: string; email: string; company: string | null; job_title: string | null; employee_number: string | null } | null
    enrollments: { id: string; course_id: string; status: string; progress_pct: number | null; completed_at: string | null }[]
    course_count: number; completed_count: number; progress_pct: number
  }[]
}

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"

export async function postJson(url: string, method: string, body: unknown): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}
