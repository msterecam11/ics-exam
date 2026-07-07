-- Question Bank feature — purely additive schema.
-- Every existing row already satisfies the new constraints (exam_id set,
-- new columns null), so no existing exam/question/candidate is affected.
-- Verified after applying: all existing questions/exams/exam_analyses rows
-- remain exam-owned with the new columns null.

-- ── question_banks ──────────────────────────────────────────────
CREATE TABLE question_banks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  created_by  UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── questions: allow bank ownership ─────────────────────────────
ALTER TABLE questions ALTER COLUMN exam_id DROP NOT NULL;
ALTER TABLE questions ADD COLUMN question_bank_id UUID REFERENCES question_banks(id) ON DELETE CASCADE;
ALTER TABLE questions ADD COLUMN topic TEXT;
ALTER TABLE questions ADD CONSTRAINT questions_owner_check CHECK (
  (exam_id IS NOT NULL AND question_bank_id IS NULL) OR
  (exam_id IS NULL AND question_bank_id IS NOT NULL)
);
CREATE INDEX idx_questions_bank ON questions(question_bank_id);

-- ── exams: optional link to a bank + draw config ────────────────
ALTER TABLE exams ADD COLUMN question_bank_id UUID REFERENCES question_banks(id) ON DELETE SET NULL;
ALTER TABLE exams ADD COLUMN bank_draw_config JSONB;

-- ── candidate_exam_questions: frozen per-candidate draw snapshot ─
CREATE TABLE candidate_exam_questions (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID    NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  question_id  UUID    NOT NULL REFERENCES questions(id)  ON DELETE CASCADE,
  order_index  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (candidate_id, question_id)
);
CREATE INDEX idx_candidate_exam_questions_candidate ON candidate_exam_questions(candidate_id);

-- ── exam_analyses: allow bank ownership (same pattern as questions) ─
ALTER TABLE exam_analyses ALTER COLUMN exam_id DROP NOT NULL;
ALTER TABLE exam_analyses ADD COLUMN question_bank_id UUID REFERENCES question_banks(id) ON DELETE CASCADE;
ALTER TABLE exam_analyses ADD CONSTRAINT exam_analyses_owner_check CHECK (
  (exam_id IS NOT NULL AND question_bank_id IS NULL) OR
  (exam_id IS NULL AND question_bank_id IS NOT NULL)
);
ALTER TABLE exam_analyses ADD CONSTRAINT exam_analyses_bank_id_key UNIQUE (question_bank_id);
