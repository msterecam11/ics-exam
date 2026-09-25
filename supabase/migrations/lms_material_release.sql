-- "Hidden until released": a file stays hidden until a trainer releases it —
-- for one group (lms_course_groups.released_files) or for everyone
-- (lms_materials.released_at). Additive: widens the allowed values.
alter table lms_materials drop constraint if exists lms_materials_available_from_check;
alter table lms_materials add constraint lms_materials_available_from_check
  check (available_from = any (array['enrolment', 'start', 'completion', 'release']));
alter table lms_materials add column if not exists released_at timestamptz;
alter table lms_course_groups add column if not exists released_files jsonb not null default '{}'::jsonb;
