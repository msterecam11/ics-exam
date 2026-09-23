-- Per group: which items the instructor has opened or locked.
-- { "<module_id>": { "open": true|false, "by": "<admin id>", "at": "<iso>" } }
-- Missing entry: final exam locked, assignments open.
alter table lms_course_groups add column if not exists item_access jsonb not null default '{}'::jsonb;
