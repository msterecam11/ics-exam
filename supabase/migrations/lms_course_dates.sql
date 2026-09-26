-- Dates for a course inside a program (Structure): when it opens and when it
-- is due. Copied onto each enrolment so access checks stay simple; a
-- participant's extension is kept apart so changing the course dates never
-- undoes it. Additive only.
alter table lms_program_items add column if not exists opens_on date;
alter table lms_program_items add column if not exists due_on date;
alter table lms_enrollments add column if not exists opens_on date;
alter table lms_enrollments add column if not exists due_on date;
alter table lms_enrollments add column if not exists due_override date;
