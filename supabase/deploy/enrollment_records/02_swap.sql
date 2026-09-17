-- ════════════════════════════════════════════════════════════════════════════
-- Enrollment-based records — final switch (retakes)
--
-- RUN ONLY ON DEPLOY DAY, AFTER the new code is live on Render.
-- The previously deployed code saves progress/attempts/certificates using the
-- old "one per student per course/package" rules below; removing them while
-- that code is live would make its saves fail.
--
-- What it does — rules only, no row is inserted, changed or deleted:
--   1. Removes the old one-per-student rules, so a student can take the same
--      course again in a later program (each run keeps its own records).
--   2. Keeps "only ONE ACTIVE enrollment per student per course".
--   3. Makes enrollment_id required where every row already has one.
--
-- Safety: runs in one transaction. The checks at the top stop it (and nothing
-- changes) if the data isn't in the expected shape. Before: 01_row_counts.sql.
-- After: 01_row_counts.sql again (must match). Undo: 03_undo.sql.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  -- The replacement per-enrollment rules must already exist.
  if to_regclass('public.lms_package_progress_enrollment_package_key')  is null
  or to_regclass('public.lms_module_attempts_enrollment_attempt_key')   is null
  or to_regclass('public.lms_progress_enrollment_item_key')             is null
  or to_regclass('public.lms_assignment_submissions_enrollment_item_key') is null
  or to_regclass('public.lms_feedback_enrollment_key')                  is null
  or to_regclass('public.lms_report_assessments_enrollment_key')        is null
  or to_regclass('public.lms_certificates_course_per_enrollment')       is null
  or to_regclass('public.lms_exam_sessions_one_open_per_enrollment')    is null then
    raise exception 'STOP: a per-enrollment rule is missing — nothing was changed';
  end if;

  -- Every record that will require an enrollment already has one.
  if exists (select 1 from lms_package_progress       where enrollment_id is null) then raise exception 'STOP: package progress without enrollment'; end if;
  if exists (select 1 from lms_module_attempts        where enrollment_id is null) then raise exception 'STOP: exam attempt without enrollment'; end if;
  if exists (select 1 from lms_exam_sessions          where enrollment_id is null) then raise exception 'STOP: exam session without enrollment'; end if;
  if exists (select 1 from lms_progress               where enrollment_id is null) then raise exception 'STOP: content progress without enrollment'; end if;
  if exists (select 1 from lms_assignment_submissions where enrollment_id is null) then raise exception 'STOP: assignment without enrollment'; end if;
  if exists (select 1 from lms_feedback               where enrollment_id is null) then raise exception 'STOP: feedback without enrollment'; end if;
  if exists (select 1 from lms_certificates where type = 'course' and enrollment_id is null) then raise exception 'STOP: course certificate without enrollment'; end if;

  -- The new "one active enrollment" rule must hold for existing data.
  if exists (select 1 from lms_enrollments where status = 'active' group by student_id, course_id having count(*) > 1) then
    raise exception 'STOP: a student has two active enrollments in one course';
  end if;
end $$;

-- 1. Old one-per-student rules
alter table lms_enrollments            drop constraint lms_enrollments_student_id_course_id_key;
alter table lms_package_progress       drop constraint lms_package_progress_student_id_package_id_key;
alter table lms_module_attempts        drop constraint lms_module_attempts_module_id_student_id_attempt_no_key;
alter table lms_progress               drop constraint lms_progress_student_id_content_item_id_key;
alter table lms_assignment_submissions drop constraint lms_assignment_submissions_content_item_id_student_id_key;
alter table lms_feedback               drop constraint lms_feedback_student_id_course_id_key;
alter table lms_report_assessments     drop constraint lms_report_assessments_student_id_course_id_key;
alter table lms_certificates           drop constraint lms_certificates_student_id_course_id_key;
drop index lms_certificates_course_unique;
drop index lms_exam_sessions_one_open;

-- 2. One ACTIVE enrollment per student per course (history rows allowed)
create unique index lms_enrollments_one_active on lms_enrollments (student_id, course_id) where status = 'active';

-- 3. enrollment_id required from now on
alter table lms_package_progress       alter column enrollment_id set not null;
alter table lms_module_attempts        alter column enrollment_id set not null;
alter table lms_exam_sessions          alter column enrollment_id set not null;
alter table lms_progress               alter column enrollment_id set not null;
alter table lms_assignment_submissions alter column enrollment_id set not null;
alter table lms_feedback               alter column enrollment_id set not null;
alter table lms_certificates add constraint lms_certificates_course_needs_enrollment
  check (type <> 'course' or enrollment_id is not null);

-- Deliberately NOT required:
--   lms_report_assessments — 2 older expert reports belong to students whose
--     enrollment was later removed; they are kept exactly as they are.
--   lms_attendance — keeps its (session_id, student_id) rule; a session belongs
--     to one program, so that rule is still right.

commit;
