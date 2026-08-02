-- Course Generator — Reference Library (the Reference Agent's store).
--
-- A document is uploaded ONCE to a global library, scanned once (split into
-- sections, each labelled independently by a cheap model), and then any number
-- of courses can draw on it. Retrieval reads cg_document_sections; the raw PDF
-- is never re-read at generation time.
--
-- Additive only: existing cg_* tables and the per-course cg_reference_materials
-- uploads keep working untouched.

-- ── Documents ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cg_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  file_url        TEXT NOT NULL,
  storage_path    TEXT,
  mime_type       TEXT,
  size_bytes      BIGINT,

  -- Catalogue fields — what an admin needs to tell two editions apart.
  authority       TEXT,                       -- GACA, GCAA, ICAO, IATA…
  doc_reference   TEXT,                       -- "GACAR Part 139", "Annex 17"
  edition         TEXT,
  language        TEXT NOT NULL DEFAULT 'en',
  page_count      INTEGER,

  -- Does the PDF carry a real text layer, or does it need OCR?
  text_status     TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (text_status IN ('unknown','text_layer','needs_ocr','partial')),
  ocr_pages       INTEGER NOT NULL DEFAULT 0,

  scan_status     TEXT NOT NULL DEFAULT 'uploaded'
                    CHECK (scan_status IN ('uploaded','queued','scanning','ready','failed')),
  scan_progress   INTEGER NOT NULL DEFAULT 0,  -- 0-100
  scan_step       TEXT,
  scan_error      TEXT,

  section_count   INTEGER NOT NULL DEFAULT 0,
  summary         JSONB,                       -- { overview, top_topics[], requirement_count }
  extracted_text  TEXT,

  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cg_documents_scan_status_idx ON cg_documents(scan_status);

-- ── Sections — the retrievable unit ─────────────────────────────────────────
-- clause/heading/pages are extracted by CODE (regex): models corrupt clause
-- numbers, and a wrong clause number in a compliance course is worse than none.
-- summary/topics/entities/requirement are what the labelling model adds.
CREATE TABLE IF NOT EXISTS cg_document_sections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES cg_documents(id) ON DELETE CASCADE,
  order_index  INTEGER NOT NULL DEFAULT 0,

  clause       TEXT,
  heading      TEXT,
  page_from    INTEGER,
  page_to      INTEGER,
  content      TEXT NOT NULL,
  char_count   INTEGER NOT NULL DEFAULT 0,

  summary      TEXT,
  topics       TEXT[] NOT NULL DEFAULT '{}',
  entities     TEXT[] NOT NULL DEFAULT '{}',
  requirement  BOOLEAN NOT NULL DEFAULT false,
  labelled     BOOLEAN NOT NULL DEFAULT false,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cg_doc_sections_doc_idx      ON cg_document_sections(document_id, order_index);
CREATE INDEX IF NOT EXISTS cg_doc_sections_unlabelled_idx ON cg_document_sections(document_id) WHERE NOT labelled;
CREATE INDEX IF NOT EXISTS cg_doc_sections_clause_idx    ON cg_document_sections(clause);
CREATE INDEX IF NOT EXISTS cg_doc_sections_topics_idx    ON cg_document_sections USING GIN (topics);
CREATE INDEX IF NOT EXISTS cg_doc_sections_fts_idx       ON cg_document_sections
  USING GIN (to_tsvector('english', coalesce(heading,'') || ' ' || coalesce(summary,'') || ' ' || content));

-- ── Which documents a course draws on (optional per course) ─────────────────
CREATE TABLE IF NOT EXISTS cg_course_documents (
  course_id   UUID NOT NULL REFERENCES cg_courses(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES cg_documents(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, document_id)
);

CREATE INDEX IF NOT EXISTS cg_course_documents_doc_idx ON cg_course_documents(document_id);

-- ── Job queue: the scan is just another job type ────────────────────────────
ALTER TABLE cg_generation_jobs ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES cg_documents(id) ON DELETE CASCADE;

DO $$
BEGIN
  ALTER TABLE cg_generation_jobs DROP CONSTRAINT IF EXISTS cg_generation_jobs_job_type_check;
  ALTER TABLE cg_generation_jobs ADD CONSTRAINT cg_generation_jobs_job_type_check
    CHECK (job_type IN ('orchestrator','outline','slide_content','media','compile','qa','chat_edit','pdf_export','doc_scan'));
END $$;

-- ── RLS (service-role client is used server-side; permissive policy) ────────
ALTER TABLE cg_documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cg_document_sections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cg_course_documents   ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cg_documents' AND policyname='cg_documents_all') THEN
    CREATE POLICY cg_documents_all ON cg_documents FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cg_document_sections' AND policyname='cg_document_sections_all') THEN
    CREATE POLICY cg_document_sections_all ON cg_document_sections FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cg_course_documents' AND policyname='cg_course_documents_all') THEN
    CREATE POLICY cg_course_documents_all ON cg_course_documents FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
