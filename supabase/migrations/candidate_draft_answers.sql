-- ═══════════════════════════════════════════════════════════════════════════
-- Candidate answer autosave
-- ───────────────────────────────────────────────────────────────────────────
-- Answers were only ever written to the DB in the single final Submit
-- request — a frozen tab, a closed browser, or a crash mid-exam meant total
-- loss with nothing to recover, and no visibility for an admin into what a
-- candidate had actually done. This is a separate column from the real,
-- scored submission (candidates.custom_field_values etc are untouched) —
-- draft_answers is purely a resilience/visibility layer, never read by
-- scoring, only by the take page (to resume) and an admin (to inspect).
-- Purely additive. Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS draft_answers JSONB;
