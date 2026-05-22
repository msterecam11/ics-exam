-- ═══════════════════════════════════════════════════════════════════════════
-- M4: Hash exam passwords
-- ───────────────────────────────────────────────────────────────────────────
-- Adds a password_hash column to exams. Existing plaintext passwords are
-- migrated lazily by the application on first verify (bcrypt cannot run in SQL).
-- New passwords are always stored as bcrypt hashes.
-- Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE exams ADD COLUMN IF NOT EXISTS password_hash TEXT;
