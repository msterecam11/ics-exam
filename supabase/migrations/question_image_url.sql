-- ═══════════════════════════════════════════════════════════════════════════
-- Question figures
-- ───────────────────────────────────────────────────────────────────────────
-- Optional image attached to a question, shown to the candidate alongside
-- the question text — same field for every question type (mcq_single,
-- mcq_multi, ordering, matching, open_ended), since it's a property of the
-- question itself, not of any one type's answer structure. Applies equally
-- to exam-owned and question-bank-owned questions (same `questions` table).
-- Purely additive — every existing question gets image_url = null and
-- renders exactly as before.
-- Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url TEXT;
