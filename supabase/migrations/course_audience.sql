-- Catalogue: one line saying who a course is for, shown above "What you'll learn".
-- Additive and nullable, so the deployed build is unaffected until it ships.
alter table lms_courses add column if not exists audience text;
