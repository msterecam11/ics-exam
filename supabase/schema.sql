-- ICS Aviation Exam Platform — Database Schema
-- Standard PostgreSQL — no Supabase-specific extensions required
-- Run this in your Supabase SQL editor or any PostgreSQL instance

-- ─────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────
-- ADMIN USERS
-- ─────────────────────────────────────────
CREATE TABLE admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'instructor' CHECK (role IN ('admin', 'instructor')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- GROUPS
-- ─────────────────────────────────────────
CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  created_by  UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- COURSES
-- ─────────────────────────────────────────
CREATE TABLE courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_by  UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- EXAMS
-- ─────────────────────────────────────────
CREATE TABLE exams (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  password         TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  passing_score    NUMERIC(5,2) NOT NULL DEFAULT 60 CHECK (passing_score BETWEEN 0 AND 100),
  show_results     TEXT NOT NULL DEFAULT 'admin_release' CHECK (show_results IN ('immediate', 'admin_release')),
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  language         TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ar', 'both')),
  created_by       UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- EXAM CUSTOM FIELDS (for candidate registration)
-- ─────────────────────────────────────────
CREATE TABLE exam_custom_fields (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  field_type  TEXT NOT NULL DEFAULT 'text' CHECK (field_type IN ('text', 'textarea', 'number')),
  required    BOOLEAN NOT NULL DEFAULT true,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────
-- QUESTIONS
-- ─────────────────────────────────────────
CREATE TABLE questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id         UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('mcq_single', 'mcq_multi', 'ordering', 'matching', 'open_ended')),
  text            TEXT NOT NULL,
  score           NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (score >= 0),
  order_index     INTEGER NOT NULL DEFAULT 0,
  -- For open-ended: guide the AI on what a correct answer looks like
  ai_scoring_guide TEXT
);

-- ─────────────────────────────────────────
-- CHOICES (MCQ single + multi)
-- ─────────────────────────────────────────
CREATE TABLE choices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  is_correct  BOOLEAN NOT NULL DEFAULT false,
  score       NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (score >= 0),
  order_index INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────
-- MATCHING PAIRS
-- ─────────────────────────────────────────
CREATE TABLE matching_pairs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  left_item   TEXT NOT NULL,
  right_item  TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────
-- ORDERING ITEMS
-- ─────────────────────────────────────────
CREATE TABLE ordering_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id      UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  text             TEXT NOT NULL,
  correct_position INTEGER NOT NULL,
  order_index      INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────
-- CANDIDATES
-- ─────────────────────────────────────────
CREATE TABLE candidates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id              UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  full_name            TEXT NOT NULL,
  email                TEXT NOT NULL,
  job_title            TEXT NOT NULL,
  years_of_experience  INTEGER NOT NULL,
  company              TEXT NOT NULL,
  -- Stores values for exam_custom_fields as {field_id: value}
  custom_field_values  JSONB NOT NULL DEFAULT '{}',
  started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at         TIMESTAMPTZ,
  total_score          NUMERIC(5,2),
  passed               BOOLEAN,
  results_released     BOOLEAN NOT NULL DEFAULT false
);

-- ─────────────────────────────────────────
-- CANDIDATE ANSWERS
-- ─────────────────────────────────────────
CREATE TABLE candidate_answers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  -- For open-ended: plain text
  answer_text     TEXT,
  -- For MCQ/ordering/matching: structured JSON
  -- mcq_single:  {"choice_id": "uuid"}
  -- mcq_multi:   {"choice_ids": ["uuid", ...]}
  -- ordering:    {"order": ["uuid", "uuid", ...]}
  -- matching:    {"pairs": [{"left_id": "uuid", "right_id": "uuid"}, ...]}
  answer_json     JSONB,
  score_achieved  NUMERIC(6,2),
  ai_justification TEXT,
  UNIQUE(candidate_id, question_id)
);

-- ─────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────
CREATE INDEX idx_courses_group ON courses(group_id);
CREATE INDEX idx_exams_course ON exams(course_id);
CREATE INDEX idx_exams_status ON exams(status);
CREATE INDEX idx_questions_exam ON questions(exam_id);
CREATE INDEX idx_choices_question ON choices(question_id);
CREATE INDEX idx_matching_question ON matching_pairs(question_id);
CREATE INDEX idx_ordering_question ON ordering_items(question_id);
CREATE INDEX idx_candidates_exam ON candidates(exam_id);
CREATE INDEX idx_candidates_email ON candidates(email);
CREATE INDEX idx_answers_candidate ON candidate_answers(candidate_id);
CREATE INDEX idx_answers_question ON candidate_answers(question_id);

-- ─────────────────────────────────────────
-- SEED: Default admin user
-- Password: Admin@ICS2024  (change immediately after first login)
-- bcrypt hash of "Admin@ICS2024"
-- ─────────────────────────────────────────
INSERT INTO admin_users (email, name, password_hash, role)
VALUES (
  'admin@ics-aviation.com',
  'ICS Admin',
  '$2b$12$WV1mQLn9Q/SjhqZw6rSGkOR0hI75qyY73Ngil5nQfQK5.gEf1s7su',
  'admin'
);
