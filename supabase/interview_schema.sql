-- ═══════════════════════════════════════════════════════════════════════════
-- ICS Hub — Panel Interview System Schema
-- Run this in the Supabase SQL editor AFTER the main schema.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extend admin_users to allow 'assessor' role
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE admin_users
  DROP CONSTRAINT IF EXISTS admin_users_role_check;

ALTER TABLE admin_users
  ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('admin', 'instructor', 'assessor'));

-- Track login lockout on assessors too (columns already exist from exam schema)
-- No changes needed — failed_attempts and locked_until are already on admin_users


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Role Tracks  (global, admin-managed)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE role_tracks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  order_index INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ICS Aviation default tracks
INSERT INTO role_tracks (name, order_index) VALUES
  ('Operations',                      0),
  ('Safety',                          1),
  ('Maintenance',                     2),
  ('Rescue & Fire Fighting Services', 3);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Assessment Configs  (reusable competency framework templates)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE assessment_configs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT        NOT NULL,
  description        TEXT,
  -- assessor_weights: { "<assessor_id>": { "<pillar_id>": <weight> } }
  assessor_weights   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- verdict_thresholds: [{ "key": "ready", "label": "Ready", "min": 4, "max": 5 }]
  verdict_thresholds JSONB       NOT NULL DEFAULT '[
    {"key":"ready",       "label":"Ready",            "min":4,   "max":5   },
    {"key":"conditional", "label":"Conditional",      "min":3,   "max":3.99},
    {"key":"dev",         "label":"Needs Development","min":1,   "max":2.99}
  ]'::jsonb,
  created_by         UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Pillars  (major competency areas within a config)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE pillars (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id            UUID        NOT NULL REFERENCES assessment_configs(id) ON DELETE CASCADE,
  name                 TEXT        NOT NULL,
  weight               NUMERIC     NOT NULL DEFAULT 1 CHECK (weight > 0),
  order_index          INTEGER     NOT NULL DEFAULT 0,
  -- empty array = applies to ALL tracks
  -- non-empty = only applies to candidates with those track ids
  applicable_track_ids UUID[]      NOT NULL DEFAULT '{}'
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Competencies  (specific skills scored by assessors)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE competencies (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  pillar_id   UUID    NOT NULL REFERENCES pillars(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  weight      NUMERIC NOT NULL DEFAULT 1 CHECK (weight > 0),
  order_index INTEGER NOT NULL DEFAULT 0
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Assessment Groups  (a specific cohort session / interview event)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE assessment_groups (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id       UUID        NOT NULL REFERENCES assessment_configs(id),
  name            TEXT        NOT NULL,
  location        TEXT,
  scheduled_date  DATE,
  status          TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','active','complete','published')),
  -- Frozen copy of config + pillars + competencies taken at draft→active transition.
  -- All score calculations use this snapshot, never the live config.
  config_snapshot JSONB,
  -- When true: INSERT/UPDATE on scores is blocked for this group.
  -- Set to true when status moves to 'complete' or 'published'.
  locked          BOOLEAN     NOT NULL DEFAULT false,
  created_by      UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Interview Candidates  (people being assessed in a group)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE interview_candidates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         UUID        NOT NULL REFERENCES assessment_groups(id) ON DELETE CASCADE,
  full_name        TEXT        NOT NULL,
  position         TEXT,
  track_id         UUID        REFERENCES role_tracks(id) ON DELETE SET NULL,
  years_experience NUMERIC,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Group Assessors  (assessors assigned to a group)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE group_assessors (
  group_id    UUID NOT NULL REFERENCES assessment_groups(id) ON DELETE CASCADE,
  assessor_id UUID NOT NULL REFERENCES admin_users(id)       ON DELETE CASCADE,
  PRIMARY KEY (group_id, assessor_id)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Scores  (one row per assessor × candidate × competency)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE scores (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID        NOT NULL REFERENCES interview_candidates(id) ON DELETE CASCADE,
  assessor_id   UUID        NOT NULL REFERENCES admin_users(id)          ON DELETE CASCADE,
  competency_id UUID        NOT NULL REFERENCES competencies(id)         ON DELETE CASCADE,
  value         NUMERIC     NOT NULL CHECK (value >= 1 AND value <= 5),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, assessor_id, competency_id)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Indexes for common query patterns
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_pillars_config_id         ON pillars(config_id);
CREATE INDEX idx_competencies_pillar_id    ON competencies(pillar_id);
CREATE INDEX idx_assessment_groups_config  ON assessment_groups(config_id);
CREATE INDEX idx_assessment_groups_status  ON assessment_groups(status);
CREATE INDEX idx_interview_candidates_group ON interview_candidates(group_id);
CREATE INDEX idx_interview_candidates_track ON interview_candidates(track_id);
CREATE INDEX idx_group_assessors_group     ON group_assessors(group_id);
CREATE INDEX idx_group_assessors_assessor  ON group_assessors(assessor_id);
CREATE INDEX idx_scores_candidate          ON scores(candidate_id);
CREATE INDEX idx_scores_assessor           ON scores(assessor_id);
CREATE INDEX idx_scores_competency         ON scores(competency_id);
