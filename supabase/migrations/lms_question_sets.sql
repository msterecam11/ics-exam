-- ═══════════════════════════════════════════════════════════════════════════
-- LMS Question Sets — run in Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lms_question_sets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  topic       TEXT,
  created_by  UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link questions to a set (nullable — existing questions stay unset)
ALTER TABLE lms_questions
  ADD COLUMN IF NOT EXISTS set_id UUID REFERENCES lms_question_sets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lms_questions_set ON lms_questions(set_id);
