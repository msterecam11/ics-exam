-- "Preview as student" logs staff in AS the student. Marking those sessions
-- lets the portal show everything while refusing to record anything, so a
-- preview can never submit an exam, save progress or change the account in
-- the real student's name. Additive: older code ignores the column.
alter table lms_student_sessions
  add column if not exists is_preview boolean not null default false;
