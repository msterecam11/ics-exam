-- Multi-bank exams — additive only, no changes to any existing column.
--
-- exams.question_bank_id / bank_draw_config (single-bank legacy) are left
-- exactly as they are. This new table lets an exam draw from more than one
-- bank; every downstream consumer (question fetch, submit scoring,
-- recalculateExamScores, reports) detects "bank-drawn" from the presence of
-- rows in candidate_exam_questions per candidate, not from this table or the
-- legacy column — so it works uniformly for 0, 1, or N linked banks.

CREATE TABLE exam_question_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_bank_id UUID NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
  draw_config JSONB, -- {total?: number, by_topic?: Record<string, number>}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, question_bank_id)
);

CREATE INDEX idx_exam_question_banks_exam ON exam_question_banks(exam_id);
CREATE INDEX idx_exam_question_banks_bank ON exam_question_banks(question_bank_id);
