-- ════════════════════════════════════════════════════════════════════════════
-- Undo of 02_swap.sql — puts the old one-per-student rules back.
--
-- Rules only, no row is changed. Works as long as no student has taken a
-- course twice yet; if a retake already exists the checks stop it (nothing
-- changes) — at that point the old rules can't hold without deleting a
-- student's record, which this script never does.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if exists (select 1 from lms_enrollments            group by student_id, course_id          having count(*) > 1) then raise exception 'STOP: a student has two enrollments in one course (retake exists)'; end if;
  if exists (select 1 from lms_package_progress       group by student_id, package_id         having count(*) > 1) then raise exception 'STOP: duplicate package progress'; end if;
  if exists (select 1 from lms_module_attempts        group by module_id, student_id, attempt_no having count(*) > 1) then raise exception 'STOP: duplicate exam attempt number'; end if;
  if exists (select 1 from lms_progress               group by student_id, content_item_id    having count(*) > 1) then raise exception 'STOP: duplicate content progress'; end if;
  if exists (select 1 from lms_assignment_submissions group by content_item_id, student_id    having count(*) > 1) then raise exception 'STOP: duplicate assignment'; end if;
  if exists (select 1 from lms_feedback               group by student_id, course_id          having count(*) > 1) then raise exception 'STOP: duplicate feedback'; end if;
  if exists (select 1 from lms_report_assessments     group by student_id, course_id          having count(*) > 1) then raise exception 'STOP: duplicate expert report'; end if;
  if exists (select 1 from lms_certificates           group by student_id, course_id          having count(*) > 1 and bool_or(course_id is not null)) then raise exception 'STOP: duplicate certificate'; end if;
  if exists (select 1 from lms_exam_sessions where submitted_at is null group by student_id, module_id having count(*) > 1) then raise exception 'STOP: two open exam sessions'; end if;
end $$;

alter table lms_certificates drop constraint if exists lms_certificates_course_needs_enrollment;
alter table lms_package_progress       alter column enrollment_id drop not null;
alter table lms_module_attempts        alter column enrollment_id drop not null;
alter table lms_exam_sessions          alter column enrollment_id drop not null;
alter table lms_progress               alter column enrollment_id drop not null;
alter table lms_assignment_submissions alter column enrollment_id drop not null;
alter table lms_feedback               alter column enrollment_id drop not null;

drop index if exists lms_enrollments_one_active;

alter table lms_enrollments            add constraint lms_enrollments_student_id_course_id_key unique (student_id, course_id);
alter table lms_package_progress       add constraint lms_package_progress_student_id_package_id_key unique (student_id, package_id);
alter table lms_module_attempts        add constraint lms_module_attempts_module_id_student_id_attempt_no_key unique (module_id, student_id, attempt_no);
alter table lms_progress               add constraint lms_progress_student_id_content_item_id_key unique (student_id, content_item_id);
alter table lms_assignment_submissions add constraint lms_assignment_submissions_content_item_id_student_id_key unique (content_item_id, student_id);
alter table lms_feedback               add constraint lms_feedback_student_id_course_id_key unique (student_id, course_id);
alter table lms_report_assessments     add constraint lms_report_assessments_student_id_course_id_key unique (student_id, course_id);
alter table lms_certificates           add constraint lms_certificates_student_id_course_id_key unique (student_id, course_id);
create unique index lms_certificates_course_unique on lms_certificates (student_id, course_id) where type = 'course' and course_id is not null;
create unique index lms_exam_sessions_one_open on lms_exam_sessions (student_id, module_id) where submitted_at is null;

commit;
