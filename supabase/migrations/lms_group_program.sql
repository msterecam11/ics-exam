-- A group scheduled for one client program (private to it). NULL = an open
-- date shown in the catalogue for individuals. Additive.
alter table lms_course_groups add column if not exists program_id uuid references lms_programs(id) on delete set null;
create index if not exists idx_lms_course_groups_program on lms_course_groups(program_id);
