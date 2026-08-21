-- ═══════════════════════════════════════════════════════════════════════════
-- Flag-for-review autosave
-- ───────────────────────────────────────────────────────────────────────────
-- Same gap as draft_answers, one layer up: flags were only ever kept in that
-- one browser's sessionStorage, never backed up server-side — so the resume
-- flow (candidate_draft_answers.sql) correctly restored answers on a fresh
-- browser/device but silently dropped flags, since there was nowhere for
-- them to come back from. Purely additive. Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS flagged_questions JSONB;
