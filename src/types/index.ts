export type Role = "admin" | "instructor" | "assessor" | "viewer"

export interface AdminUser {
  id: string
  email: string
  name: string
  role: Role
  is_active?: boolean
  department?: string | null
  phone?: string | null
  created_at: string
}

export interface ViewerAccess {
  id: string
  user_id: string
  system: string
  resource_type: string
  resource_id: string
  label: string | null
  permissions: Record<string, boolean>
  created_at: string
  created_by: string | null
}

// Exam permissions: scores | results | reports
// Interview permissions: progress | scores | verdicts | reports
export type ExamPermission      = "scores" | "results" | "reports"
export type InterviewPermission = "progress" | "scores" | "verdicts" | "reports"

export interface Group {
  id: string
  name: string
  description: string | null
  created_at: string
  courses?: Course[]
  manual_report_logos?: string[]
}

export interface Course {
  id: string
  group_id: string
  name: string
  description: string | null
  created_at: string
  group?: Group
  exams?: Exam[]
}

export type QuestionType =
  | "mcq_single"
  | "mcq_multi"
  | "ordering"
  | "matching"
  | "open_ended"

export type ResultVisibility = "immediate" | "admin_release"
export type ExamStatus = "draft" | "active" | "closed"

export interface Exam {
  id: string
  course_id: string
  title: string
  description: string | null
  password: string
  duration_minutes: number
  passing_score: number
  show_results: ResultVisibility
  status: ExamStatus
  language: "en" | "ar" | "both"
  created_by: string
  created_at: string
  course?: Course
  questions?: Question[]
  custom_fields?: ExamCustomField[]
  _count?: { candidates: number }
}

export interface ExamCustomField {
  id: string
  exam_id: string
  label: string
  field_type: "text" | "textarea" | "number"
  required: boolean
  order_index: number
}

export interface Question {
  id: string
  exam_id: string
  type: QuestionType
  text: string
  score: number
  order_index: number
  ai_scoring_guide: string | null
  choices?: Choice[]
  matching_pairs?: MatchingPair[]
  ordering_items?: OrderingItem[]
}

export interface Choice {
  id: string
  question_id: string
  text: string
  is_correct: boolean
  score: number
  order_index: number
}

export interface MatchingPair {
  id: string
  question_id: string
  left_item: string
  right_item: string
  order_index: number
}

export interface OrderingItem {
  id: string
  question_id: string
  text: string
  correct_position: number
  order_index: number
}

export interface Candidate {
  id: string
  exam_id: string
  full_name: string
  email: string
  job_title: string
  years_of_experience: number
  company: string
  custom_field_values: Record<string, string>
  started_at: string
  submitted_at: string | null
  total_score: number | null
  passed: boolean | null
  results_released: boolean
  exam?: Exam
  answers?: CandidateAnswer[]
}

export interface CandidateAnswer {
  id: string
  candidate_id: string
  question_id: string
  answer_text: string | null
  answer_json: unknown | null
  score_achieved: number | null
  ai_justification: string | null
  question?: Question
}

export interface ExamSession {
  candidateId: string
  examId: string
  startedAt: string
  answers: Record<string, unknown>
}
