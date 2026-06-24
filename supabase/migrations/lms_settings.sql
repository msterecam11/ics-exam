-- ═══════════════════════════════════════════════════════════════════════════
-- LMS Settings — admin_users enhancements
-- Run in Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Add is_active flag (soft-deactivate users without deleting)
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_login_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS department     TEXT,
  ADD COLUMN IF NOT EXISTS phone          TEXT,
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until   TIMESTAMPTZ;

-- Extend role constraint to include 'assessor' (safe to run even if already applied)
ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE admin_users
  ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('admin', 'instructor', 'assessor'));
