-- ═══════════════════════════════════════════════════════════════════════════
-- Exam sections
-- ───────────────────────────────────────────────────────────────────────────
-- Optional named groupings within an exam (title + description), e.g. an
-- exam like "PICA-01: Regulatory Framework, PICA Governance, Certification
-- & GACA Oversight" can group its questions into those three parts.
--
-- Deliberately exam-only, not question-bank-eligible: a section belongs to
-- ONE exam, but a bank question is meant to be reusable across MANY
-- different exams — it can't simultaneously belong to one exam's section
-- structure and another's. Bank questions already have `topic` for their
-- own categorization; that stays separate. Enforced at the application
-- layer (QuestionBuilder never shows the Section control in bank mode),
-- not the database, same pattern as the exam-only "must sum to 100" score
-- rule already isn't enforced in SQL either.
--
-- Purely additive: every existing question gets section_id = null and
-- renders exactly as before. Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS exam_sections (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     UUID        NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  order_index INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_sections_exam ON exam_sections(exam_id);

ALTER TABLE questions ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES exam_sections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_questions_section ON questions(section_id);
