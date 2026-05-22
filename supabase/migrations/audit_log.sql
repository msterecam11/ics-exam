-- ═══════════════════════════════════════════════════════════════════════════
-- L3: Audit log table
-- ───────────────────────────────────────────────────────────────────────────
-- Immutable record of sensitive admin actions. Rows are never updated or
-- deleted — the table is append-only.
-- Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Who did it
  actor_id     UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  actor_name   TEXT        NOT NULL,
  actor_role   TEXT        NOT NULL,
  -- What happened
  action       TEXT        NOT NULL,  -- e.g. 'exam.delete', 'results.release', 'group.reset'
  entity_type  TEXT        NOT NULL,  -- e.g. 'exam', 'group', 'candidate'
  entity_id    TEXT,                  -- UUID of affected row
  entity_name  TEXT,                  -- Human-readable label for the UI
  -- Extra context (flexible)
  metadata     JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_actor      ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action     ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity     ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Admins can read audit logs, no one can update or delete them
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (true);
-- No INSERT/UPDATE/DELETE policies for authenticated users —
-- all writes go through service_role (server-side only).
