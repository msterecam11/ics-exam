-- ============================================================
-- ICS HUB — LMS Database Schema
-- Migration 001 — Full LMS tables
-- Standard PostgreSQL — no Supabase-specific functions
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enum types ────────────────────────────────────────────────
CREATE TYPE lms_delivery_mode   AS ENUM ('online', 'onsite', 'hybrid');
CREATE TYPE lms_content_type    AS ENUM ('video','ppt','pdf','text','image','link','steps','quiz','assignment');
CREATE TYPE lms_course_status   AS ENUM ('draft','published','archived');
CREATE TYPE lms_attend_status   AS ENUM ('present','late','absent','excused');
CREATE TYPE lms_progress_status AS ENUM ('not_started','in_progress','completed');
CREATE TYPE lms_quiz_type       AS ENUM ('module_quiz','progress_test','final_exam');
CREATE TYPE lms_difficulty      AS ENUM ('easy','medium','hard');
CREATE TYPE lms_question_type   AS ENUM ('mcq_single','mcq_multi','ordering','matching','open_ended');
CREATE TYPE lms_enroll_status   AS ENUM ('active','completed','dropped');
CREATE TYPE lms_invite_type     AS ENUM ('global','path','course');
CREATE TYPE lms_submit_status   AS ENUM ('submitted','graded');
CREATE TYPE lms_language        AS ENUM ('en','ar','both');

-- ─────────────────────────────────────────────────────────────
-- STUDENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_students (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  email             TEXT        NOT NULL UNIQUE,
  password_hash     TEXT        NOT NULL,
  job_title         TEXT,
  company           TEXT,
  department        TEXT,
  language          lms_language NOT NULL DEFAULT 'en',
  avatar_url        TEXT,
  qr_code           TEXT        NOT NULL UNIQUE DEFAULT gen_random_uuid()::TEXT,
  failed_attempts   INT         NOT NULL DEFAULT 0,
  locked_until      TIMESTAMPTZ,
  last_login        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lms_students_email ON lms_students(email);
CREATE INDEX idx_lms_students_qr    ON lms_students(qr_code);

-- ─────────────────────────────────────────────────────────────
-- LEARNING PATHS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_paths (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT         NOT NULL,
  description   TEXT,
  thumbnail_url TEXT,
  language      lms_language NOT NULL DEFAULT 'en',
  delivery_mode lms_delivery_mode NOT NULL DEFAULT 'online',
  start_date    DATE,
  end_date      DATE,
  created_by    UUID         REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- COURSES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_courses (
  id                          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  title                       TEXT              NOT NULL,
  description                 TEXT,
  thumbnail_url               TEXT,
  language                    lms_language      NOT NULL DEFAULT 'en',
  delivery_mode               lms_delivery_mode NOT NULL DEFAULT 'online',
  status                      lms_course_status NOT NULL DEFAULT 'draft',
  -- completion rules
  progress_enforcement        BOOLEAN           NOT NULL DEFAULT TRUE,
  progress_test_every_x       INT,              -- trigger progress test every X modules (null = disabled)
  min_attendance_pct          INT               NOT NULL DEFAULT 80,
  -- certificate
  certificate_enabled         BOOLEAN           NOT NULL DEFAULT TRUE,
  certificate_auto_release    BOOLEAN           NOT NULL DEFAULT FALSE,
  -- feedback
  feedback_enabled            BOOLEAN           NOT NULL DEFAULT TRUE,
  feedback_mandatory          BOOLEAN           NOT NULL DEFAULT FALSE,
  -- availability
  start_date                  DATE,
  end_date                    DATE,
  capacity                    INT,              -- null = unlimited
  -- drip content
  drip_days                   INT,              -- release next module X days after prev (null = disabled)
  -- final exam pass mark
  final_exam_pass_mark        INT               NOT NULL DEFAULT 70,
  created_by                  UUID              REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- Course ↔ Instructors (many-to-many)
CREATE TABLE lms_course_instructors (
  course_id     UUID  NOT NULL REFERENCES lms_courses(id) ON DELETE CASCADE,
  instructor_id UUID  NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, instructor_id)
);

-- Course ↔ Learning Paths (ordered)
CREATE TABLE lms_path_courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id     UUID NOT NULL REFERENCES lms_paths(id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES lms_courses(id) ON DELETE CASCADE,
  order_index INT  NOT NULL DEFAULT 0,
  UNIQUE (path_id, course_id)
);

-- ─────────────────────────────────────────────────────────────
-- COHORTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_cohorts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID        REFERENCES lms_courses(id) ON DELETE CASCADE,
  path_id     UUID        REFERENCES lms_paths(id)   ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  start_date  DATE,
  end_date    DATE,
  deadline    DATE,
  created_by  UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lms_cohort_students (
  cohort_id  UUID NOT NULL REFERENCES lms_cohorts(id)  ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES lms_students(id) ON DELETE CASCADE,
  PRIMARY KEY (cohort_id, student_id)
);

-- ─────────────────────────────────────────────────────────────
-- ENROLLMENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_enrollments (
  id           UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID              NOT NULL REFERENCES lms_students(id) ON DELETE CASCADE,
  course_id    UUID              NOT NULL REFERENCES lms_courses(id)  ON DELETE CASCADE,
  cohort_id    UUID              REFERENCES lms_cohorts(id) ON DELETE SET NULL,
  enrolled_by  UUID              REFERENCES admin_users(id) ON DELETE SET NULL,
  status       lms_enroll_status NOT NULL DEFAULT 'active',
  enrolled_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (student_id, course_id)
);

CREATE INDEX idx_lms_enrollments_student ON lms_enrollments(student_id);
CREATE INDEX idx_lms_enrollments_course  ON lms_enrollments(course_id);

-- Path enrollments
CREATE TABLE lms_path_enrollments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id      UUID        NOT NULL REFERENCES lms_paths(id)    ON DELETE CASCADE,
  student_id   UUID        NOT NULL REFERENCES lms_students(id) ON DELETE CASCADE,
  enrolled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (path_id, student_id)
);

-- ─────────────────────────────────────────────────────────────
-- MODULES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_modules (
  id                    UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id             UUID              NOT NULL REFERENCES lms_courses(id) ON DELETE CASCADE,
  title                 TEXT              NOT NULL,
  description           TEXT,
  order_index           INT               NOT NULL DEFAULT 0,
  delivery_type         lms_delivery_mode NOT NULL DEFAULT 'online',
  estimated_duration    INT,              -- minutes
  prerequisite_module_id UUID             REFERENCES lms_modules(id) ON DELETE SET NULL,
  min_attendance_pct    INT,              -- override course setting (null = use course default)
  created_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lms_modules_course ON lms_modules(course_id, order_index);

-- ─────────────────────────────────────────────────────────────
-- CONTENT ITEMS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_content_items (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id        UUID             NOT NULL REFERENCES lms_modules(id) ON DELETE CASCADE,
  type             lms_content_type NOT NULL,
  title            TEXT             NOT NULL,
  order_index      INT              NOT NULL DEFAULT 0,
  -- content payload (type-specific JSON):
  -- video:      { url, duration_seconds, chapters: [{label, second}] }
  -- ppt:        { url, slide_count }
  -- pdf:        { url, page_count }
  -- text:       { html_en, html_ar }
  -- image:      { url, caption }
  -- link:       { url, open_in_tab }
  -- steps:      { steps: [{title, body, image_url}] }
  -- quiz:       { quiz_id }
  -- assignment: { assignment_id }
  content          JSONB            NOT NULL DEFAULT '{}',
  -- protection
  download_allowed BOOLEAN          NOT NULL DEFAULT FALSE,
  -- completion rule
  -- { type: 'scroll'|'time'|'slides'|'pages'|'click'|'quiz'|'submit', threshold: number }
  completion_rule  JSONB            NOT NULL DEFAULT '{"type":"click"}',
  is_mandatory     BOOLEAN          NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lms_content_module ON lms_content_items(module_id, order_index);

-- ─────────────────────────────────────────────────────────────
-- SESSIONS (on-site physical sessions)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_sessions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id        UUID        NOT NULL REFERENCES lms_modules(id)  ON DELETE CASCADE,
  course_id        UUID        NOT NULL REFERENCES lms_courses(id)  ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  session_date     DATE        NOT NULL,
  start_time       TIME        NOT NULL,
  duration_minutes INT         NOT NULL DEFAULT 60,
  location         TEXT,
  recording_url    TEXT,       -- Teams recording link added after
  materials        JSONB       NOT NULL DEFAULT '[]', -- [{label, url}]
  late_threshold   INT         NOT NULL DEFAULT 15,   -- minutes after start = late
  notes            TEXT,
  closed_at        TIMESTAMPTZ,                       -- null = still accepting scans
  created_by       UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lms_sessions_module ON lms_sessions(module_id);
CREATE INDEX idx_lms_sessions_date   ON lms_sessions(session_date);

-- ─────────────────────────────────────────────────────────────
-- ATTENDANCE
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_attendance (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID              NOT NULL REFERENCES lms_sessions(id)  ON DELETE CASCADE,
  student_id      UUID              NOT NULL REFERENCES lms_students(id)  ON DELETE CASCADE,
  status          lms_attend_status NOT NULL DEFAULT 'absent',
  scanned_at      TIMESTAMPTZ,
  manual_override BOOLEAN           NOT NULL DEFAULT FALSE,
  override_by     UUID              REFERENCES admin_users(id) ON DELETE SET NULL,
  excuse_note     TEXT,
  UNIQUE (session_id, student_id)
);

CREATE INDEX idx_lms_attendance_session ON lms_attendance(session_id);
CREATE INDEX idx_lms_attendance_student ON lms_attendance(student_id);

-- ─────────────────────────────────────────────────────────────
-- PROGRESS (per student, per content item)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_progress (
  id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID                NOT NULL REFERENCES lms_students(id)      ON DELETE CASCADE,
  content_item_id UUID                NOT NULL REFERENCES lms_content_items(id) ON DELETE CASCADE,
  module_id       UUID                NOT NULL REFERENCES lms_modules(id)       ON DELETE CASCADE,
  course_id       UUID                NOT NULL REFERENCES lms_courses(id)       ON DELETE CASCADE,
  status          lms_progress_status NOT NULL DEFAULT 'not_started',
  -- resume position (type-specific):
  -- { slide: 66 }  for PPT
  -- { page: 12 }   for PDF
  -- { second: 847 } for video
  -- { scroll: 0.73 } for text (0–1)
  position        JSONB               NOT NULL DEFAULT '{}',
  time_spent      INT                 NOT NULL DEFAULT 0,  -- seconds
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, content_item_id)
);

CREATE INDEX idx_lms_progress_student ON lms_progress(student_id, course_id);

-- ─────────────────────────────────────────────────────────────
-- QUESTION BANK
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_questions (
  id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  text_en           TEXT              NOT NULL,
  text_ar           TEXT,
  type              lms_question_type NOT NULL,
  difficulty        lms_difficulty    NOT NULL DEFAULT 'medium',
  tags              TEXT[]            NOT NULL DEFAULT '{}',
  score             NUMERIC(6,2)      NOT NULL DEFAULT 1,
  explanation_en    TEXT,             -- shown after answer
  explanation_ar    TEXT,
  ai_grading_prompt TEXT,             -- for open_ended
  created_by        UUID              REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lms_questions_type ON lms_questions(type);
CREATE INDEX idx_lms_questions_tags ON lms_questions USING GIN(tags);

-- Question choices (MCQ)
CREATE TABLE lms_question_choices (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID    NOT NULL REFERENCES lms_questions(id) ON DELETE CASCADE,
  text_en     TEXT    NOT NULL,
  text_ar     TEXT,
  is_correct  BOOLEAN NOT NULL DEFAULT FALSE,
  order_index INT     NOT NULL DEFAULT 0
);

-- Ordering items
CREATE TABLE lms_question_ordering (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id      UUID NOT NULL REFERENCES lms_questions(id) ON DELETE CASCADE,
  text_en          TEXT NOT NULL,
  text_ar          TEXT,
  correct_position INT  NOT NULL,
  order_index      INT  NOT NULL DEFAULT 0
);

-- Matching pairs
CREATE TABLE lms_question_matching (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES lms_questions(id) ON DELETE CASCADE,
  left_en     TEXT NOT NULL,
  left_ar     TEXT,
  right_en    TEXT NOT NULL,
  right_ar    TEXT,
  order_index INT  NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────
-- QUIZZES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_quizzes (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id           UUID          NOT NULL REFERENCES lms_courses(id) ON DELETE CASCADE,
  content_item_id     UUID          REFERENCES lms_content_items(id) ON DELETE SET NULL,
  type                lms_quiz_type NOT NULL DEFAULT 'module_quiz',
  title               TEXT          NOT NULL,
  pass_mark           INT           NOT NULL DEFAULT 70,  -- percentage
  max_attempts        INT,          -- null = unlimited
  retry_cooldown_min  INT           NOT NULL DEFAULT 0,   -- 0 = immediate retry
  show_answers        BOOLEAN       NOT NULL DEFAULT TRUE,
  randomise_questions BOOLEAN       NOT NULL DEFAULT FALSE,
  randomise_choices   BOOLEAN       NOT NULL DEFAULT FALSE,
  time_limit_min      INT,          -- null = no limit
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Quiz ↔ Questions
CREATE TABLE lms_quiz_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id     UUID NOT NULL REFERENCES lms_quizzes(id)   ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES lms_questions(id) ON DELETE CASCADE,
  order_index INT  NOT NULL DEFAULT 0,
  UNIQUE (quiz_id, question_id)
);

-- Quiz attempts
CREATE TABLE lms_quiz_attempts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id      UUID        NOT NULL REFERENCES lms_quizzes(id)   ON DELETE CASCADE,
  student_id   UUID        NOT NULL REFERENCES lms_students(id)  ON DELETE CASCADE,
  score        NUMERIC(5,2),
  passed       BOOLEAN,
  answers      JSONB       NOT NULL DEFAULT '{}', -- { question_id: answer_data }
  ai_scores    JSONB       NOT NULL DEFAULT '{}', -- { question_id: { score, justification } }
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  attempt_num  INT         NOT NULL DEFAULT 1
);

CREATE INDEX idx_lms_attempts_quiz_student ON lms_quiz_attempts(quiz_id, student_id);

-- ─────────────────────────────────────────────────────────────
-- ASSIGNMENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_assignments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id   UUID        NOT NULL REFERENCES lms_content_items(id) ON DELETE CASCADE,
  course_id         UUID        NOT NULL REFERENCES lms_courses(id)       ON DELETE CASCADE,
  instructions_en   TEXT,
  instructions_ar   TEXT,
  due_date          TIMESTAMPTZ,
  max_file_size_mb  INT         NOT NULL DEFAULT 10,
  allowed_types     TEXT[]      NOT NULL DEFAULT '{pdf,doc,docx,jpg,png,zip}',
  allow_resubmit    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lms_submissions (
  id             UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  UUID              NOT NULL REFERENCES lms_assignments(id) ON DELETE CASCADE,
  student_id     UUID              NOT NULL REFERENCES lms_students(id)    ON DELETE CASCADE,
  file_url       TEXT              NOT NULL,
  file_name      TEXT              NOT NULL,
  submitted_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  status         lms_submit_status NOT NULL DEFAULT 'submitted',
  grade          NUMERIC(5,2),
  feedback       TEXT,
  graded_by      UUID              REFERENCES admin_users(id) ON DELETE SET NULL,
  graded_at      TIMESTAMPTZ
);

CREATE INDEX idx_lms_submissions_assignment ON lms_submissions(assignment_id);
CREATE INDEX idx_lms_submissions_student    ON lms_submissions(student_id);

-- ─────────────────────────────────────────────────────────────
-- CERTIFICATES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_certificate_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID        NOT NULL REFERENCES lms_courses(id) ON DELETE CASCADE UNIQUE,
  config      JSONB       NOT NULL DEFAULT '{}', -- colours, logo, signature, layout
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lms_certificates (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID        NOT NULL REFERENCES lms_students(id) ON DELETE CASCADE,
  course_id         UUID        NOT NULL REFERENCES lms_courses(id)  ON DELETE CASCADE,
  final_score       NUMERIC(5,2),
  attendance_pct    NUMERIC(5,2),
  verification_code TEXT        NOT NULL UNIQUE DEFAULT upper(substring(gen_random_uuid()::TEXT FROM 1 FOR 8)),
  pdf_url           TEXT,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at       TIMESTAMPTZ,
  released_by       UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  revoked_at        TIMESTAMPTZ,
  UNIQUE (student_id, course_id)
);

CREATE INDEX idx_lms_certs_verify ON lms_certificates(verification_code);

-- ─────────────────────────────────────────────────────────────
-- COURSE FEEDBACK
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_feedback (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID        NOT NULL REFERENCES lms_students(id) ON DELETE CASCADE,
  course_id         UUID        NOT NULL REFERENCES lms_courses(id)  ON DELETE CASCADE,
  rating_overall    INT         CHECK (rating_overall    BETWEEN 1 AND 5),
  rating_content    INT         CHECK (rating_content    BETWEEN 1 AND 5),
  rating_instructor INT         CHECK (rating_instructor BETWEEN 1 AND 5),
  rating_pace       INT         CHECK (rating_pace       BETWEEN 1 AND 5),
  rating_materials  INT         CHECK (rating_materials  BETWEEN 1 AND 5),
  comments          TEXT,
  is_anonymous      BOOLEAN     NOT NULL DEFAULT FALSE,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, course_id)
);

-- ─────────────────────────────────────────────────────────────
-- INVITE CODES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_invite_codes (
  id           UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT            NOT NULL UNIQUE,
  type         lms_invite_type NOT NULL DEFAULT 'course',
  reference_id UUID,           -- course_id or path_id
  max_uses     INT,            -- null = unlimited
  uses_count   INT             NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ,
  created_by   UUID            REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID        NOT NULL REFERENCES lms_students(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,  -- 'enrolled','module_unlocked','certificate_ready', etc.
  title      TEXT        NOT NULL,
  body       TEXT,
  read       BOOLEAN     NOT NULL DEFAULT FALSE,
  link       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lms_notif_student ON lms_notifications(student_id, read, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- ANNOUNCEMENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_announcements (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID        NOT NULL REFERENCES lms_courses(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  send_email  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by  UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- STUDENT NOTES (per content item)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_notes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID        NOT NULL REFERENCES lms_students(id)      ON DELETE CASCADE,
  content_item_id UUID        NOT NULL REFERENCES lms_content_items(id) ON DELETE CASCADE,
  course_id       UUID        NOT NULL REFERENCES lms_courses(id)       ON DELETE CASCADE,
  body            TEXT        NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, content_item_id)
);

-- ─────────────────────────────────────────────────────────────
-- CSV IMPORT LOG
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_import_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by  UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  filename     TEXT        NOT NULL,
  total        INT         NOT NULL DEFAULT 0,
  success      INT         NOT NULL DEFAULT 0,
  errors       INT         NOT NULL DEFAULT 0,
  results      JSONB       NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- STUDENT SESSIONS (auth tokens)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE lms_student_sessions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID        NOT NULL REFERENCES lms_students(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lms_student_sessions_token  ON lms_student_sessions(token_hash);
CREATE INDEX idx_lms_student_sessions_expiry ON lms_student_sessions(expires_at);
