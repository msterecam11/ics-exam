-- Extend role check to include viewer
ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE admin_users
  ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('admin', 'instructor', 'assessor', 'viewer'));

-- viewer_access — resource-level read access per system
CREATE TABLE IF NOT EXISTS viewer_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  system      TEXT NOT NULL,
  resource_id UUID NOT NULL,
  label       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES admin_users(id),
  UNIQUE (user_id, system, resource_id)
);

-- Indexes for fast per-user lookups
CREATE INDEX IF NOT EXISTS idx_viewer_access_user_id ON viewer_access(user_id);
CREATE INDEX IF NOT EXISTS idx_viewer_access_system  ON viewer_access(system);
