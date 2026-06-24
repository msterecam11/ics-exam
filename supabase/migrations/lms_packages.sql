-- ================================================================
-- LMS Packages — Content Package Module System
-- Run in Supabase SQL Editor (safe to run multiple times)
-- ================================================================


-- ── 1. Add 'package' to lms_modules module_type CHECK ───────────
-- Drop and recreate the constraint to add the new type
ALTER TABLE lms_modules
  DROP CONSTRAINT IF EXISTS lms_modules_module_type_check;

ALTER TABLE lms_modules
  ADD CONSTRAINT lms_modules_module_type_check
  CHECK (module_type IN (
    'hubcraft',
    'content', 'web', 'video', 'presentation', 'document',
    'quiz', 'progress_test', 'test', 'final_exam', 'assignment',
    'package'
  ));


-- ── 2. lms_packages — one per package module ────────────────────
CREATE TABLE IF NOT EXISTS lms_packages (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id            UUID        REFERENCES lms_modules(id) ON DELETE CASCADE,
  course_id            UUID        NOT NULL REFERENCES lms_courses(id) ON DELETE CASCADE,
  title                TEXT        NOT NULL DEFAULT '',
  description          TEXT,
  pass_mark            INT         NOT NULL DEFAULT 70,
  certificate_on_pass  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_packages_module  ON lms_packages(module_id);
CREATE INDEX IF NOT EXISTS idx_lms_packages_course  ON lms_packages(course_id);

ALTER TABLE lms_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins full access" ON lms_packages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ── 3. lms_package_blocks — ordered content blocks ──────────────
-- config shape per type:
--   slides : { file_id, file_type, page_from, page_to, annotations, audio_url, auto_advance }
--   video  : { file_id, must_watch_pct, allow_skip, subtitles_url }
--   quiz   : { questions, pass_mark, max_attempts, show_correct, required_to_proceed }
--   exam   : { questions, time_limit_minutes, pass_mark, max_attempts, anti_cheat }

CREATE TABLE IF NOT EXISTS lms_package_blocks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id   UUID        NOT NULL REFERENCES lms_packages(id) ON DELETE CASCADE,
  order_index  INT         NOT NULL DEFAULT 0,
  type         TEXT        NOT NULL CHECK (type IN ('slides','video','quiz','exam')),
  title        TEXT,
  config       JSONB       NOT NULL DEFAULT '{}',
  required     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_package_blocks_package ON lms_package_blocks(package_id);
CREATE INDEX IF NOT EXISTS idx_lms_package_blocks_order   ON lms_package_blocks(package_id, order_index);

ALTER TABLE lms_package_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins full access" ON lms_package_blocks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ── 4. lms_package_progress — per-student progress ──────────────
CREATE TABLE IF NOT EXISTS lms_package_progress (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id        UUID        NOT NULL REFERENCES lms_packages(id) ON DELETE CASCADE,
  module_id         UUID        REFERENCES lms_modules(id) ON DELETE SET NULL,
  course_id         UUID        REFERENCES lms_courses(id) ON DELETE SET NULL,
  current_block_id  UUID        REFERENCES lms_package_blocks(id) ON DELETE SET NULL,
  completed_blocks  UUID[]      NOT NULL DEFAULT '{}',
  block_scores      JSONB       NOT NULL DEFAULT '{}',
  -- block_scores shape: { [block_id]: { score, max, pct, attempts, passed } }
  status            TEXT        NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress','passed','failed')),
  score             INT,        -- overall rolled-up score pct
  time_spent        INT         NOT NULL DEFAULT 0, -- seconds
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, package_id)
);

CREATE INDEX IF NOT EXISTS idx_lms_pkg_progress_student ON lms_package_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_lms_pkg_progress_package ON lms_package_progress(package_id);
CREATE INDEX IF NOT EXISTS idx_lms_pkg_progress_course  ON lms_package_progress(course_id);

ALTER TABLE lms_package_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins full access" ON lms_package_progress
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
