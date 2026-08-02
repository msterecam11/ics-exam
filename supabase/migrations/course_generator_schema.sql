-- Course Generator ("ICS Studio") — additive schema. cg_ prefix throughout
-- (`courses` and `lms_courses` are taken by the exam and LMS systems).
-- Idempotent, RLS pattern matching the rest of the repo.

-- ── Themes ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cg_themes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  parent_theme_id  UUID        REFERENCES cg_themes(id) ON DELETE SET NULL,
  is_main          BOOLEAN     NOT NULL DEFAULT FALSE,
  tokens           JSONB       NOT NULL DEFAULT '{}',
  layout_templates JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Courses ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cg_courses (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title                   TEXT        NOT NULL,
  overview                TEXT,
  target_audience         TEXT,
  objectives              JSONB       NOT NULL DEFAULT '[]',
  regulatory_framework    TEXT,
  language                TEXT        NOT NULL DEFAULT 'en' CHECK (language IN ('en','ar','both')),
  tone                    TEXT,
  day_count               INT,
  theme_id                UUID        REFERENCES cg_themes(id) ON DELETE SET NULL,
  partner_name            TEXT,
  partner_logo_light_url  TEXT,       -- light/white variant, for dark slides
  partner_logo_dark_url   TEXT,       -- dark variant, for light slides
  include_assessment      BOOLEAN     NOT NULL DEFAULT TRUE,
  prerequisites           TEXT,
  status                  TEXT        NOT NULL DEFAULT 'draft'
                          CHECK (status IN (
                            'draft','generating_outline','outline_review',
                            'generating_slides','ready','failed','published'
                          )),
  generation_input        JSONB       NOT NULL DEFAULT '{}',
  created_by              UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cg_courses_status ON cg_courses(status);
CREATE INDEX IF NOT EXISTS idx_cg_courses_created_by ON cg_courses(created_by);

-- ── Reference materials ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cg_reference_materials (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      UUID        NOT NULL REFERENCES cg_courses(id) ON DELETE CASCADE,
  file_name      TEXT        NOT NULL,
  file_url       TEXT        NOT NULL,
  storage_path   TEXT,
  extracted_text TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cg_refs_course ON cg_reference_materials(course_id);

-- ── Modules ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cg_modules (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id          UUID        NOT NULL REFERENCES cg_courses(id) ON DELETE CASCADE,
  day_number         INT,
  order_index        INT         NOT NULL DEFAULT 0,
  title              TEXT        NOT NULL,
  description        TEXT,
  is_module_zero     BOOLEAN     NOT NULL DEFAULT FALSE,
  target_slide_count INT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cg_modules_course ON cg_modules(course_id, order_index);

-- ── Pages (canvas slides) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cg_pages (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id          UUID        NOT NULL REFERENCES cg_modules(id) ON DELETE CASCADE,
  order_index        INT         NOT NULL DEFAULT 0,
  layout_kind        TEXT        NOT NULL DEFAULT 'content_white',
  background         JSONB       NOT NULL DEFAULT '{}',
  -- Baked absolute elements (the editor's representation)
  elements           JSONB       NOT NULL DEFAULT '[]',
  -- Semantic content the slide was generated from (chat-agent context)
  source_content     JSONB,
  -- Structural blueprint the compiler baked (regeneration input)
  blueprint          JSONB,
  manually_diverged  BOOLEAN     NOT NULL DEFAULT FALSE,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cg_pages_module ON cg_pages(module_id, order_index);

-- Factual QA verdict: { checked, pass, claims[], fabricated_citations[], feedback }.
-- `checked:false` means the slide could not be verified — a real state, and not
-- the same as passing. Added after the table shipped.
ALTER TABLE cg_pages ADD COLUMN IF NOT EXISTS fact_check JSONB;

-- ── Generation jobs (this table IS the queue) ───────────────────────────────
CREATE TABLE IF NOT EXISTS cg_generation_jobs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     UUID        REFERENCES cg_courses(id) ON DELETE CASCADE,
  module_id     UUID        REFERENCES cg_modules(id) ON DELETE CASCADE,
  parent_job_id UUID        REFERENCES cg_generation_jobs(id) ON DELETE CASCADE,
  job_type      TEXT        NOT NULL CHECK (job_type IN (
                  'orchestrator','outline','slide_content','media','compile',
                  'qa','chat_edit','pdf_export'
                )),
  status        TEXT        NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','running','done','failed')),
  progress_pct  INT         NOT NULL DEFAULT 0,
  current_step  TEXT,
  attempts      INT         NOT NULL DEFAULT 0,
  input         JSONB       NOT NULL DEFAULT '{}',
  output        JSONB,
  error         TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cg_jobs_queue ON cg_generation_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_cg_jobs_course ON cg_generation_jobs(course_id);

-- ── Exports ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cg_exports (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  UUID        NOT NULL REFERENCES cg_courses(id) ON DELETE CASCADE,
  module_id  UUID        REFERENCES cg_modules(id) ON DELETE CASCADE, -- null = whole course
  format     TEXT        NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf')),
  status     TEXT        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  file_url   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS (service-role access via API routes, matching repo pattern) ─────────
ALTER TABLE cg_themes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE cg_courses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cg_reference_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE cg_modules             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cg_pages               ENABLE ROW LEVEL SECURITY;
ALTER TABLE cg_generation_jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cg_exports             ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins full access" ON cg_themes              USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins full access" ON cg_courses             USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins full access" ON cg_reference_materials USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins full access" ON cg_modules             USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins full access" ON cg_pages               USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins full access" ON cg_generation_jobs     USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins full access" ON cg_exports             USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
