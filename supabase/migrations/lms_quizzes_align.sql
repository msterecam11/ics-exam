-- ═══════════════════════════════════════════════════════════════════════════
-- Align lms_quizzes columns to match the API field names
-- Run in Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Add columns the API already uses (idempotent)
ALTER TABLE lms_quizzes
  ADD COLUMN IF NOT EXISTS description       TEXT,
  ADD COLUMN IF NOT EXISTS pass_score        INT     NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS time_limit_minutes INT,
  ADD COLUMN IF NOT EXISTS shuffle_questions  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_answers_after BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by        UUID    REFERENCES admin_users(id) ON DELETE SET NULL;

-- Make course_id nullable so a quiz can exist before being attached
ALTER TABLE lms_quizzes ALTER COLUMN course_id DROP NOT NULL;
