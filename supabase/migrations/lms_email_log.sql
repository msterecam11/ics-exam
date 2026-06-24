-- ═══════════════════════════════════════════════════════════════════════════
-- LMS Email Log — track sent notifications
-- Run in Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lms_email_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT        NOT NULL,   -- 'enrollment' | 'session_reminder' | 'completion'
  to_email    TEXT        NOT NULL,
  subject     TEXT        NOT NULL,
  student_id  UUID        REFERENCES lms_students(id) ON DELETE SET NULL,
  course_id   UUID        REFERENCES lms_courses(id) ON DELETE SET NULL,
  session_id  UUID        REFERENCES lms_sessions(id) ON DELETE SET NULL,
  status      TEXT        NOT NULL DEFAULT 'sent',  -- 'sent' | 'failed'
  error       TEXT,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_email_log_type      ON lms_email_log(type);
CREATE INDEX IF NOT EXISTS idx_lms_email_log_student   ON lms_email_log(student_id);
CREATE INDEX IF NOT EXISTS idx_lms_email_log_session   ON lms_email_log(session_id);
