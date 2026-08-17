-- ═══════════════════════════════════════════════════════════════════════════
-- Personalized exam invites
-- ───────────────────────────────────────────────────────────────────────────
-- Today a candidate is only known once they submit the shared-password
-- registration form. This adds a second path: an admin pre-fills one
-- person's info and gets a unique link (token = the credential, no shared
-- password needed) that opens straight into a prefilled, still-editable
-- version of that same form. Purely additive — the existing password+form
-- flow is untouched, this is a new table and new routes only.
-- Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS exam_invites (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id              UUID        NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  token                TEXT        NOT NULL UNIQUE,
  full_name            TEXT        NOT NULL,
  email                TEXT        NOT NULL,
  job_title            TEXT,
  years_of_experience  INTEGER,
  company              TEXT,
  custom_field_values  JSONB       NOT NULL DEFAULT '{}',
  status               TEXT        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'opened', 'completed', 'revoked')),
  candidate_id         UUID        REFERENCES candidates(id) ON DELETE SET NULL,
  created_by           UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  sent_at              TIMESTAMPTZ,
  opened_at            TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_invites_exam ON exam_invites(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_invites_token ON exam_invites(token);
