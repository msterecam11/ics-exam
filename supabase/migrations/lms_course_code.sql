-- Add course_code field to lms_courses
ALTER TABLE lms_courses ADD COLUMN IF NOT EXISTS course_code TEXT;
ALTER TABLE lms_courses ADD COLUMN IF NOT EXISTS category   TEXT;
ALTER TABLE lms_courses ADD COLUMN IF NOT EXISTS tags       TEXT[];
