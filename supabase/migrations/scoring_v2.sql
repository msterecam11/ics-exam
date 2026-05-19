-- Migration: Scoring v2
-- Run this in Supabase SQL editor

-- 1. Rename notes → evidence in scores, allow decimal values
ALTER TABLE scores RENAME COLUMN notes TO evidence;
ALTER TABLE scores ALTER COLUMN value TYPE NUMERIC(4,2);

-- 2. Qualitative analysis + confirmation per candidate per assessor
CREATE TABLE IF NOT EXISTS candidate_assessments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id   UUID        NOT NULL REFERENCES interview_candidates(id) ON DELETE CASCADE,
  assessor_id    UUID        NOT NULL REFERENCES admin_users(id)           ON DELETE CASCADE,
  group_id       UUID        NOT NULL REFERENCES assessment_groups(id)     ON DELETE CASCADE,
  remarks        TEXT,
  gap_analysis   TEXT,
  recommendation TEXT,
  confirmed      BOOLEAN     NOT NULL DEFAULT false,
  confirmed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(candidate_id, assessor_id)
);
