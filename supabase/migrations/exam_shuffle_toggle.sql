-- ═══════════════════════════════════════════════════════════════════════════
-- Per-exam shuffle toggle
-- ───────────────────────────────────────────────────────────────────────────
-- Question order and MCQ/ordering option order have always been shuffled
-- unconditionally (take/page.tsx client-side + questions/route.ts server-side).
-- This makes it a per-exam admin setting instead. Defaulting both to true
-- preserves existing behavior for every exam already in the system — nothing
-- changes until an admin explicitly turns one off for a given exam.
-- Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE exams ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS shuffle_options   BOOLEAN NOT NULL DEFAULT true;
