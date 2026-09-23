-- Assignment results are "released" to the participant, but the status check
-- never allowed that value, so every release (manual or the AI's automatic
-- one) failed. Additive: widens the allowed values, no rows change.
alter table lms_module_attempts drop constraint if exists lms_module_attempts_status_check;
alter table lms_module_attempts add constraint lms_module_attempts_status_check
  check (status = any (array['in_progress', 'submitted', 'graded', 'released']));
