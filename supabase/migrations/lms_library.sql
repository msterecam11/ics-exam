-- ═══════════════════════════════════════════════════════════════════════════
-- LMS Library — folders + files
-- Run in Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Folder tree (self-referencing, unlimited nesting)
CREATE TABLE IF NOT EXISTS lms_library_folders (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  parent_id  UUID        REFERENCES lms_library_folders(id) ON DELETE CASCADE,
  color      TEXT,                        -- optional icon colour hex
  created_by UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_library_folders_parent ON lms_library_folders(parent_id);

-- Files (uploaded to Supabase Storage OR external link)
CREATE TABLE IF NOT EXISTS lms_library_files (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id     UUID        REFERENCES lms_library_folders(id) ON DELETE SET NULL,
  name          TEXT        NOT NULL,          -- display name
  original_name TEXT        NOT NULL,          -- original filename
  mime_type     TEXT        NOT NULL DEFAULT '',
  size_bytes    BIGINT      NOT NULL DEFAULT 0,
  storage_path  TEXT,                          -- null for external links
  public_url    TEXT        NOT NULL,          -- always present
  is_external   BOOLEAN     NOT NULL DEFAULT FALSE,
  description   TEXT,
  created_by    UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_library_files_folder ON lms_library_files(folder_id);

-- ── Supabase Storage bucket  ─────────────────────────────────────────────────
-- Run this too (or create the bucket via the Supabase dashboard):
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('lms-library', 'lms-library', true)
-- ON CONFLICT DO NOTHING;
