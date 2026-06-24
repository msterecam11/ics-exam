-- Assignment submissions table
CREATE TABLE IF NOT EXISTS lms_assignment_submissions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id  UUID        NOT NULL REFERENCES lms_content_items(id) ON DELETE CASCADE,
  student_id       UUID        NOT NULL REFERENCES lms_students(id) ON DELETE CASCADE,
  course_id        UUID        NOT NULL REFERENCES lms_courses(id) ON DELETE CASCADE,
  text_response    TEXT,
  file_url         TEXT,
  file_name        TEXT,
  file_size        INTEGER,
  status           TEXT        NOT NULL DEFAULT 'submitted'
                   CHECK (status IN ('submitted','graded','returned')),
  score            NUMERIC(5,2),
  max_score        NUMERIC(5,2),
  feedback         TEXT,
  graded_by        UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  graded_at        TIMESTAMPTZ,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(content_item_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_asgn_sub_content ON lms_assignment_submissions(content_item_id);
CREATE INDEX IF NOT EXISTS idx_asgn_sub_student  ON lms_assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_asgn_sub_course   ON lms_assignment_submissions(course_id);
