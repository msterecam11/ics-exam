-- ═══════════════════════════════════════════════════════════════════════════
-- LMS Cohorts — student groups for bulk enrollment
-- Run in Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lms_cohorts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  created_by  UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lms_cohort_members (
  cohort_id  UUID NOT NULL REFERENCES lms_cohorts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES lms_students(id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by   UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  PRIMARY KEY (cohort_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_lms_cohort_members_cohort   ON lms_cohort_members(cohort_id);
CREATE INDEX IF NOT EXISTS idx_lms_cohort_members_student  ON lms_cohort_members(student_id);
