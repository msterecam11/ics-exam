-- ================================================================
-- LMS Module Architecture — Full Migration
-- Run in Supabase SQL Editor (safe to run multiple times)
-- ================================================================


-- ── 1. EXTEND EXISTING lms_library_files ────────────────────────
-- Table already exists from lms_library.sql — just add missing columns
-- Existing columns kept as-is: id, folder_id, name, original_name,
-- mime_type, size_bytes, storage_path, public_url, is_external,
-- description, created_by, created_at, updated_at

ALTER TABLE lms_library_files
  ADD COLUMN IF NOT EXISTS file_type   TEXT    DEFAULT 'other'
    CHECK (file_type IN ('mp4','mp3','pdf','ppt','pptx','docx','image','other')),
  ADD COLUMN IF NOT EXISTS duration_s  INTEGER,   -- audio / video
  ADD COLUMN IF NOT EXISTS page_count  INTEGER,   -- PDF / PPT
  ADD COLUMN IF NOT EXISTS tags        TEXT[]  DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_library_type    ON lms_library_files(file_type);
CREATE INDEX IF NOT EXISTS idx_library_created ON lms_library_files(created_at DESC);


-- ── 2. MODULE TYPE + CONTENT COLUMNS ────────────────────────────
-- Each module now has a type; content stored directly on the module

ALTER TABLE lms_modules

  -- ── Type ──────────────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS module_type TEXT NOT NULL DEFAULT 'content'
    CHECK (module_type IN (
      -- HubCraft
      'hubcraft',
      -- Standard Content
      'content', 'web', 'video', 'presentation', 'document',
      -- Learning Activities
      'quiz', 'progress_test', 'test', 'final_exam', 'assignment'
    )),

  -- ── HubCraft + Content ─────────────────────────────────────────
  -- TipTap document stored as JSON
  ADD COLUMN IF NOT EXISTS content_body          JSONB,

  -- ── Web Content ───────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS web_url               TEXT,

  -- ── File-based (video / presentation / document) ─────────────
  ADD COLUMN IF NOT EXISTS library_file_id       UUID
    REFERENCES lms_library_files(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS downloadable          BOOLEAN     DEFAULT false,

  -- ── Learning Activities (quiz / test / exam) ──────────────────
  --
  -- questions JSONB — array of question objects:
  -- [
  --   {
  --     "id":       "uuid",
  --     "type":     "mcq_single" | "mcq_multiple" | "ordering" | "match_pair" | "open_ended",
  --     "text":     "Question text",
  --     "image":    "url (optional)",
  --     "points":   10,
  --     -- MCQ Single / Multiple:
  --     "choices":  [{ "id":"a", "text":"...", "correct": true }, ...],
  --     -- Ordering:
  --     "items":    [{ "id":"a", "text":"...", "order": 1 }, ...],
  --     -- Match the Pair:
  --     "pairs":    [{ "id":"a", "left":"...", "right":"..." }, ...],
  --     -- Open Ended:
  --     "rubric":   "What a good answer should contain...",
  --     -- All types:
  --     "explanation": "Shown after answer (optional)"
  --   }
  -- ]
  ADD COLUMN IF NOT EXISTS questions             JSONB       DEFAULT '[]'::jsonb,

  -- activity_settings JSONB:
  -- {
  --   "pass_mark":         70,          (percentage)
  --   "max_attempts":      3,
  --   "timer_minutes":     60,          (null = no timer)
  --   "shuffle_questions": true,
  --   "shuffle_choices":   true,
  --   "show_results":      "immediately" | "after_deadline" | "never"
  -- }
  ADD COLUMN IF NOT EXISTS activity_settings     JSONB       DEFAULT '{}'::jsonb,

  -- ── Assignment ────────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS assignment_brief_html TEXT,

  -- assignment_rubric JSONB — array of criteria:
  -- [
  --   { "id": "uuid", "criterion": "Identifies root cause", "points": 20 },
  --   { "id": "uuid", "criterion": "Proposes mitigation",   "points": 30 }
  -- ]
  ADD COLUMN IF NOT EXISTS assignment_rubric     JSONB       DEFAULT '[]'::jsonb,

  -- accepted submission types: ['file'], ['text'], ['file','text']
  ADD COLUMN IF NOT EXISTS assignment_submission_types TEXT[] DEFAULT ARRAY['file'],
  ADD COLUMN IF NOT EXISTS assignment_due_date   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assignment_max_attempts INTEGER   DEFAULT 1,

  -- ── Completion Settings ────────────────────────────────────────
  -- method: 'button' | 'time' | 'check'
  ADD COLUMN IF NOT EXISTS completion_method     TEXT        DEFAULT 'button'
    CHECK (completion_method IN ('button', 'time', 'check')),

  -- for 'time': how many minutes must the student spend
  ADD COLUMN IF NOT EXISTS completion_time_minutes INTEGER,

  -- for 'check': 1-5 inline questions (same structure as questions[])
  ADD COLUMN IF NOT EXISTS completion_check      JSONB       DEFAULT '[]'::jsonb,

  -- ── Access Control ────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS is_mandatory          BOOLEAN     DEFAULT true,
  ADD COLUMN IF NOT EXISTS lock_until_previous   BOOLEAN     DEFAULT false,
  ADD COLUMN IF NOT EXISTS available_from        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS available_until       TIMESTAMPTZ,

  -- ── Display ───────────────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS show_in_progress      BOOLEAN     DEFAULT true;


-- ── 3. MODULE ATTEMPTS ──────────────────────────────────────────
-- Tracks every student attempt on a quiz / test / exam / progress test

CREATE TABLE IF NOT EXISTS lms_module_attempts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id     UUID        NOT NULL REFERENCES lms_modules(id)  ON DELETE CASCADE,
  student_id    UUID        NOT NULL REFERENCES lms_students(id) ON DELETE CASCADE,
  course_id     UUID        NOT NULL REFERENCES lms_courses(id)  ON DELETE CASCADE,
  attempt_no    INTEGER     NOT NULL DEFAULT 1,
  status        TEXT        NOT NULL DEFAULT 'in_progress'
                CHECK (status IN ('in_progress', 'submitted', 'graded')),
  score         NUMERIC(5,2),
  max_score     NUMERIC(5,2),
  passed        BOOLEAN,

  -- answers JSONB — per question:
  -- [
  --   {
  --     "question_id": "uuid",
  --     "type":        "mcq_single",
  --     "answer":      "a",              (or ["a","b"] for multiple, [2,0,1] for ordering)
  --     "correct":     true,
  --     "points_earned": 10,
  --     "ai_feedback": "..." (open_ended only)
  --   }
  -- ]
  answers       JSONB       DEFAULT '[]'::jsonb,

  -- ai_feedback for open-ended questions (keyed by question_id)
  ai_feedback   JSONB,

  time_spent_s  INTEGER,                               -- actual time spent
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  submitted_at  TIMESTAMPTZ,
  graded_at     TIMESTAMPTZ,

  UNIQUE (module_id, student_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_attempts_module  ON lms_module_attempts(module_id);
CREATE INDEX IF NOT EXISTS idx_attempts_student ON lms_module_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_course  ON lms_module_attempts(course_id);


-- ── 4. ASSIGNMENT SUBMISSIONS (module-based) ────────────────────
-- If the old lms_assignment_submissions exists (content_item_id based),
-- we extend it; otherwise create fresh.

-- 4a. Create if not exists (new schema)
CREATE TABLE IF NOT EXISTS lms_assignment_submissions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id         UUID        REFERENCES lms_modules(id)  ON DELETE CASCADE,
  student_id        UUID        NOT NULL REFERENCES lms_students(id) ON DELETE CASCADE,
  course_id         UUID        NOT NULL REFERENCES lms_courses(id)  ON DELETE CASCADE,
  text_response     TEXT,
  file_url          TEXT,
  file_name         TEXT,
  file_size         BIGINT,
  file_mime         TEXT,
  status            TEXT        NOT NULL DEFAULT 'submitted',
  score             NUMERIC(5,2),
  max_score         NUMERIC(5,2),
  ai_score          NUMERIC(5,2),
  -- ai_feedback JSONB — per criterion:
  -- [
  --   {
  --     "criterion":   "Identifies root cause",
  --     "points_max":  20,
  --     "points_got":  17,
  --     "comment":     "Well identified, missing one contributing factor"
  --   }
  -- ]
  ai_feedback       JSONB,
  instructor_score  NUMERIC(5,2),
  instructor_note   TEXT,
  graded_by         UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  graded_at         TIMESTAMPTZ,
  submitted_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 4b. If table already existed (content_item_id version), add new columns safely
ALTER TABLE lms_assignment_submissions
  ADD COLUMN IF NOT EXISTS module_id        UUID        REFERENCES lms_modules(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS file_mime        TEXT,
  ADD COLUMN IF NOT EXISTS ai_score         NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS ai_feedback      JSONB,
  ADD COLUMN IF NOT EXISTS instructor_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS instructor_note  TEXT;

-- Update status constraint to include ai_evaluated
ALTER TABLE lms_assignment_submissions
  DROP CONSTRAINT IF EXISTS lms_assignment_submissions_status_check;
ALTER TABLE lms_assignment_submissions
  ADD CONSTRAINT lms_assignment_submissions_status_check
  CHECK (status IN ('submitted', 'ai_evaluated', 'graded', 'returned'));

CREATE INDEX IF NOT EXISTS idx_asgn_sub_module  ON lms_assignment_submissions(module_id);
CREATE INDEX IF NOT EXISTS idx_asgn_sub_student ON lms_assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_asgn_sub_course  ON lms_assignment_submissions(course_id);


-- ── 5. ALSO RUN THESE IF NOT DONE YET ───────────────────────────
-- (safe — all use IF NOT EXISTS / IF NOT EXISTS)

ALTER TABLE lms_courses ADD COLUMN IF NOT EXISTS course_code  TEXT;
ALTER TABLE lms_courses ADD COLUMN IF NOT EXISTS category     TEXT;
ALTER TABLE lms_courses ADD COLUMN IF NOT EXISTS tags         TEXT[];
ALTER TABLE lms_courses ADD COLUMN IF NOT EXISTS overview_html TEXT;
